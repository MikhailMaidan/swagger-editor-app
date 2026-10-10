import YAML from "yaml";
import {
  describeTransformChanges,
  escapeTransformPointer,
  parseTransformValue,
  readTransformSource,
  TransformError,
  type JsonValue,
  type TransformSource,
} from "./api-transform";
import { createComponentRegistryReport } from "./component-registry";
import { extractEndpoints, type SchemaFormat } from "./openapi";
import {
  createComparableEndpoint,
  createSchemaChangeReport,
} from "./schema-change";
import { getByteSize } from "./text-encoding";

export const MAX_MERGE_SOURCE_BYTES = 2 * 1024 * 1024;
export const MAX_MERGE_PROJECT_BYTES = 8 * 1024 * 1024;
export const MAX_MERGE_CONFLICTS = 500;
export const MAX_MERGE_CUSTOM_BYTES = 64 * 1024;
export type MergeSide = "base" | "ours" | "theirs";
export type MergeSlot =
  { present: false } | { present: true; value: JsonValue };
export type MergeConflictKind =
  "value" | "add-add" | "delete-edit" | "type" | "array" | "array-order";
export type MergeConflict = {
  id: string;
  location: string;
  kind: MergeConflictKind;
  base: MergeSlot;
  ours: MergeSlot;
  theirs: MergeSlot;
};
export type MergeResolution = {
  id: string;
  choice: MergeSide | "custom";
  custom?: string;
};
export type MergeProject = {
  kind: "rsswag-openapi-merge-project";
  version: 1;
  name: string;
  inputs: Record<MergeSide, string>;
  keyedArrays: boolean;
  resolutions: MergeResolution[];
};
export type MergeReview = {
  added: number;
  removed: number;
  modified: number;
  breaking: number;
  brokenReferences: number;
  externalReferences: number;
  references: {
    pointer: string;
    reference: string;
    status: "broken" | "external";
  }[];
  referencesTruncated: boolean;
};
export type MergePlan = {
  sources: Record<MergeSide, TransformSource>;
  conflicts: MergeConflict[];
  resolutions: MergeResolution[];
  resolvedCount: number;
  automaticDecisions: number;
  keyedArrayCount: number;
  atomicArrayCount: number;
  issue?: "result" | "limit";
  document: JsonValue | null;
  candidateText: string;
  changes: { path: string; kind: "added" | "removed" | "changed" }[];
  changesTruncated: boolean;
  review: MergeReview | null;
};
export type MergeErrorCode =
  "source" | "limit" | "resolution" | "custom" | "project" | "result";
export class MergeError extends Error {
  constructor(
    public code: MergeErrorCode,
    public side?: MergeSide,
  ) {
    super(code);
  }
}
const obj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const slot = (v: JsonValue | undefined): MergeSlot =>
  v === undefined ? { present: false } : { present: true, value: v };
const own = (v: Record<string, unknown>, key: string) =>
  Object.hasOwn(v, key) ? (v[key] as JsonValue) : undefined;
const sides: MergeSide[] = ["base", "ours", "theirs"];
function equalValue(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equalValue(v, b[i]));
  if (obj(a) && obj(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every(
        (k) =>
          Object.hasOwn(b, k) &&
          equalValue(a[k] as JsonValue, b[k] as JsonValue),
      )
    );
  }
  return false;
}
function equal(a: MergeSlot, b: MergeSlot) {
  return (
    a.present === b.present &&
    (!a.present || !b.present || equalValue(a.value, b.value))
  );
}
function valueType(s: MergeSlot) {
  if (!s.present) return "missing";
  if (s.value === null) return "null";
  if (Array.isArray(s.value)) return "array";
  return typeof s.value;
}
const location = (parts: string[]) =>
  parts.map((p) => `/${escapeTransformPointer(p)}`).join("");
function checkedResolutions(input: unknown): MergeResolution[] {
  if (!Array.isArray(input) || input.length > MAX_MERGE_CONFLICTS)
    throw new MergeError("resolution");
  const ids = new Set<string>();
  return input.map((raw) => {
    if (
      !obj(raw) ||
      typeof raw.id !== "string" ||
      raw.id.length > 8192 ||
      ids.has(raw.id) ||
      typeof raw.choice !== "string" ||
      !["base", "ours", "theirs", "custom"].includes(String(raw.choice))
    )
      throw new MergeError("resolution");
    ids.add(raw.id);
    if (raw.choice === "custom") {
      if (
        typeof raw.custom !== "string" ||
        getByteSize(raw.custom) > MAX_MERGE_CUSTOM_BYTES
      )
        throw new MergeError("custom");
      try {
        parseTransformValue(raw.custom);
      } catch {
        throw new MergeError("custom");
      }
      return { id: raw.id, choice: "custom", custom: raw.custom };
    }
    return { id: raw.id, choice: raw.choice as MergeSide };
  });
}
export function parseMergeCustom(input: string) {
  if (getByteSize(input) > MAX_MERGE_CUSTOM_BYTES)
    throw new MergeError("custom");
  try {
    return parseTransformValue(input);
  } catch {
    throw new MergeError("custom");
  }
}
export function readMergeSource(input: string, side?: MergeSide) {
  try {
    return readTransformSource(input);
  } catch (error) {
    throw new MergeError(
      error instanceof TransformError && error.code === "limit"
        ? "limit"
        : "source",
      side,
    );
  }
}
function keyedKind(parts: string[]): "parameter" | "tag" | "server" | null {
  const field = parts.at(-1);
  if (parts.length === 1)
    return field === "tags" ? "tag" : field === "servers" ? "server" : null;
  const pathItem = parts[0] === "paths" || parts[0] === "webhooks";
  const reusable = parts[0] === "components" && parts[1] === "pathItems";
  const start = pathItem ? 2 : reusable ? 3 : 0;
  if (!start) return null;
  if (
    parts.length !== start + 1 &&
    !(
      parts.length === start + 2 &&
      [
        "get",
        "put",
        "post",
        "delete",
        "options",
        "head",
        "patch",
        "trace",
      ].includes(parts[start])
    )
  )
    return null;
  return field === "parameters"
    ? "parameter"
    : field === "servers"
      ? "server"
      : null;
}
function keyedItems(
  value: JsonValue[],
  kind: NonNullable<ReturnType<typeof keyedKind>>,
) {
  if (value.length > 1000) return null;
  const map = new Map<string, JsonValue>();
  for (const item of value) {
    if (!obj(item) || Object.hasOwn(item, "$ref")) return null;
    const fields =
      kind === "parameter"
        ? [item.in, item.name]
        : kind === "tag"
          ? [item.name]
          : [item.url];
    if (fields.some((v) => typeof v !== "string" || !v || v.length > 2048))
      return null;
    const id = JSON.stringify(fields);
    if (map.has(id)) return null;
    map.set(id, item as JsonValue);
  }
  return map;
}
export function mergeOpenApi(
  inputs: Record<MergeSide, string>,
  options: { keyedArrays?: boolean; resolutions?: MergeResolution[] } = {},
): MergePlan {
  const sources = {
    base: readMergeSource(inputs.base, "base"),
    ours: readMergeSource(inputs.ours, "ours"),
    theirs: readMergeSource(inputs.theirs, "theirs"),
  };
  const resolutions = checkedResolutions(options.resolutions ?? []),
    choices = new Map(resolutions.map((r) => [r.id, r]));
  const conflicts: MergeConflict[] = [],
    used = new Set<string>();
  let automaticDecisions = 0,
    keyedArrayCount = 0,
    atomicArrayCount = 0,
    steps = 0;
  function conflict(
    b: MergeSlot,
    o: MergeSlot,
    t: MergeSlot,
    parts: string[],
    kind: MergeConflictKind,
  ): MergeSlot {
    if (conflicts.length >= MAX_MERGE_CONFLICTS) throw new MergeError("limit");
    const id = location(parts);
    if (id.length > 8192) throw new MergeError("limit");
    const item: MergeConflict = {
      id,
      location: id,
      kind,
      base: b,
      ours: o,
      theirs: t,
    };
    conflicts.push(item);
    const chosen = choices.get(id);
    if (!chosen) return o;
    used.add(id);
    if (chosen.choice === "custom") {
      if (kind === "array-order") throw new MergeError("resolution");
      return { present: true, value: parseMergeCustom(chosen.custom!) };
    }
    return item[chosen.choice];
  }
  function auto(result: MergeSlot, b: MergeSlot) {
    if (!equal(result, b)) automaticDecisions++;
    return result;
  }
  function keyed(
    b: MergeSlot,
    o: JsonValue[],
    t: JsonValue[],
    parts: string[],
    kind: NonNullable<ReturnType<typeof keyedKind>>,
  ): MergeSlot | null {
    const bm = keyedItems(
        b.present && Array.isArray(b.value) ? b.value : [],
        kind,
      ),
      om = keyedItems(o, kind),
      tm = keyedItems(t, kind);
    if (!bm || !om || !tm) return null;
    keyedArrayCount++;
    const keys = [...new Set([...bm.keys(), ...om.keys(), ...tm.keys()])],
      merged = new Map<string, MergeSlot>();
    const firstItemConflicts = conflicts.length;
    for (const id of keys)
      merged.set(
        id,
        walk(slot(bm.get(id)), slot(om.get(id)), slot(tm.get(id)), [
          ...parts,
          `@item:${id}`,
        ]),
      );
    const common = [...bm.keys()].filter((k) => om.has(k) && tm.has(k)),
      commonSet = new Set(common);
    const bo = [...bm.keys()].filter((k) => commonSet.has(k)),
      oo = [...om.keys()].filter((k) => commonSet.has(k)),
      to = [...tm.keys()].filter((k) => commonSet.has(k));
    const oc = !equalValue(bo, oo),
      tc = !equalValue(bo, to);
    // The first server is the default target, including when a branch inserts a new server.
    const firstO = kind === "server" && [...om.keys()][0] !== [...bm.keys()][0],
      firstT = kind === "server" && [...tm.keys()][0] !== [...bm.keys()][0];
    const defaultDeletionConflict =
      kind === "server" &&
      [...om.keys()][0] !== [...tm.keys()][0] &&
      conflicts
        .slice(firstItemConflicts)
        .some(
          (c) =>
            c.kind === "delete-edit" &&
            c.id === location([...parts, `@item:${[...bm.keys()][0]}`]),
        );
    let primary = [...om.keys()];
    if (
      (oc && tc && !equalValue(oo, to)) ||
      (firstO && firstT && [...om.keys()][0] !== [...tm.keys()][0]) ||
      defaultDeletionConflict
    ) {
      const ordered = conflict(
        slot([...bm.keys()]),
        slot([...om.keys()]),
        slot([...tm.keys()]),
        [...parts, "@order"],
        "array-order",
      );
      primary = ordered.present ? (ordered.value as string[]) : [];
    } else if ((tc && !oc) || (firstT && !firstO)) primary = [...tm.keys()];
    const order = [
      ...new Set([...primary, ...om.keys(), ...tm.keys(), ...bm.keys()]),
    ];
    const result: JsonValue[] = [];
    for (const id of order) {
      const item = merged.get(id);
      if (item?.present) result.push(item.value);
    }
    return { present: true, value: result };
  }
  function walk(
    b: MergeSlot,
    o: MergeSlot,
    t: MergeSlot,
    parts: string[],
  ): MergeSlot {
    if (++steps > 150000 || parts.length > 70) throw new MergeError("limit");
    if (equal(o, t)) return auto(o, b);
    if (equal(b, o)) return auto(t, b);
    if (equal(b, t)) return auto(o, b);
    if (
      o.present &&
      t.present &&
      obj(o.value) &&
      obj(t.value) &&
      (!b.present || obj(b.value))
    ) {
      const base = b.present ? (b.value as Record<string, unknown>) : {};
      const entries: [string, JsonValue][] = [];
      for (const key of new Set([
        ...Object.keys(base),
        ...Object.keys(o.value),
        ...Object.keys(t.value),
      ])) {
        const result = walk(
          slot(own(base, key)),
          slot(own(o.value, key)),
          slot(own(t.value, key)),
          [...parts, key],
        );
        if (result.present) entries.push([key, result.value]);
      }
      return { present: true, value: Object.fromEntries(entries) };
    }
    if (
      o.present &&
      t.present &&
      Array.isArray(o.value) &&
      Array.isArray(t.value) &&
      (!b.present || Array.isArray(b.value))
    ) {
      const kind = options.keyedArrays !== false ? keyedKind(parts) : null;
      if (kind) {
        const result = keyed(b, o.value, t.value, parts, kind);
        if (result) return result;
      }
      atomicArrayCount++;
      return conflict(b, o, t, parts, "array");
    }
    return conflict(
      b,
      o,
      t,
      parts,
      !o.present || !t.present
        ? "delete-edit"
        : !b.present
          ? "add-add"
          : valueType(o) !== valueType(t) || valueType(b) !== valueType(o)
            ? "type"
            : "value",
    );
  }
  const merged = walk(
    slot(sources.base.document),
    slot(sources.ours.document),
    slot(sources.theirs.document),
    [],
  );
  if (resolutions.some((r) => !used.has(r.id)))
    throw new MergeError("resolution");
  let document: JsonValue | null = null,
    candidateText = "",
    issue: MergePlan["issue"],
    changes: MergePlan["changes"] = [],
    changesTruncated = false,
    review: MergeReview | null = null;
  if (conflicts.length === used.size && merged.present) {
    candidateText = JSON.stringify(merged.value, null, 2) + "\n";
    try {
      const compact = JSON.stringify(merged.value);
      if (getByteSize(compact) > MAX_MERGE_SOURCE_BYTES)
        throw new MergeError("limit");
      const checked = readMergeSource(compact);
      document = checked.document;
      const delta = describeTransformChanges(sources.base.document, document);
      changes = delta.changes.map((c) => ({ path: c.path, kind: c.kind }));
      changesTruncated = delta.truncated;
      const endpoints = extractEndpoints(document as Record<string, unknown>),
        baseline = extractEndpoints(
          sources.base.document as Record<string, unknown>,
        );
      const impact = createSchemaChangeReport(
        baseline.map(createComparableEndpoint),
        endpoints,
      );
      const registry = createComponentRegistryReport(
          document as Record<string, unknown>,
        ),
        references = registry.references.filter((r) => r.status !== "resolved");
      review = {
        added: impact.addedCount,
        removed: impact.removedCount,
        modified: impact.modifiedCount,
        breaking: impact.breakingCount,
        brokenReferences: registry.brokenReferenceCount,
        externalReferences: registry.externalReferenceCount,
        references: references.slice(0, 200).map((r) => ({
          pointer: r.sourcePointer,
          reference: r.reference,
          status: r.status as "broken" | "external",
        })),
        referencesTruncated: references.length > 200,
      };
    } catch (error) {
      issue =
        error instanceof MergeError && error.code === "limit"
          ? "limit"
          : "result";
      document = null;
    }
  }
  return {
    sources,
    conflicts,
    resolutions,
    resolvedCount: used.size,
    automaticDecisions,
    keyedArrayCount,
    atomicArrayCount,
    ...(issue ? { issue } : {}),
    document,
    candidateText,
    changes,
    changesTruncated,
    review,
  };
}
export function serializeMergedApi(plan: MergePlan, format: SchemaFormat) {
  if (
    plan.document === null ||
    plan.issue ||
    plan.resolvedCount !== plan.conflicts.length
  )
    throw new MergeError("result");
  let text =
    format === "yaml"
      ? YAML.stringify(plan.document, { aliasDuplicateObjects: false })
      : JSON.stringify(plan.document, null, 2) + "\n";
  if (format === "json" && getByteSize(text) > MAX_MERGE_SOURCE_BYTES)
    text = JSON.stringify(plan.document);
  if (getByteSize(text) > MAX_MERGE_SOURCE_BYTES) throw new MergeError("limit");
  return text;
}
export function emptyMergeProject(): MergeProject {
  return {
    kind: "rsswag-openapi-merge-project",
    version: 1,
    name: "OpenAPI merge",
    inputs: { base: "", ours: "", theirs: "" },
    keyedArrays: true,
    resolutions: [],
  };
}
export function parseMergeProject(text: string): {
  project: MergeProject;
  plan: MergePlan;
} {
  if (getByteSize(text) > MAX_MERGE_PROJECT_BYTES)
    throw new MergeError("limit");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new MergeError("project");
  }
  if (
    !obj(value) ||
    value.kind !== "rsswag-openapi-merge-project" ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 120 ||
    !obj(value.inputs) ||
    typeof value.keyedArrays !== "boolean"
  )
    throw new MergeError("project");
  const inputs: Record<MergeSide, string> = { base: "", ours: "", theirs: "" };
  for (const side of sides) {
    const source = value.inputs[side];
    if (typeof source !== "string") throw new MergeError("project");
    inputs[side] = source;
  }
  const resolutions = checkedResolutions(value.resolutions),
    plan = mergeOpenApi(inputs, {
      keyedArrays: value.keyedArrays,
      resolutions,
    });
  return {
    project: {
      kind: "rsswag-openapi-merge-project",
      version: 1,
      name: value.name,
      inputs,
      keyedArrays: value.keyedArrays,
      resolutions,
    },
    plan,
  };
}
export function serializeMergeProject(project: MergeProject) {
  const text = JSON.stringify(project, null, 2) + "\n";
  parseMergeProject(text);
  return text;
}
export function mergeReport(plan: MergePlan, name: string) {
  return {
    kind: "rsswag-openapi-merge-report",
    version: 1,
    name,
    sources: Object.fromEntries(
      sides.map((side) => [
        side,
        { title: plan.sources[side].title, format: plan.sources[side].format },
      ]),
    ),
    ready: plan.document !== null && !plan.issue,
    issue: plan.issue ?? null,
    automaticDecisions: plan.automaticDecisions,
    keyedArrayCount: plan.keyedArrayCount,
    atomicArrayCount: plan.atomicArrayCount,
    conflictCount: plan.conflicts.length,
    resolvedCount: plan.resolvedCount,
    conflicts: plan.conflicts.map((c) => ({
      location: c.location,
      kind: c.kind,
      resolution: plan.resolutions.find((r) => r.id === c.id)?.choice ?? null,
    })),
    changes: plan.changes,
    changesTruncated: plan.changesTruncated,
    review: plan.review,
  };
}
export function mergeReportMarkdown(plan: MergePlan, name: string) {
  const safe = (text: string) => text.replace(/[\r\n|`<>]/g, " ");
  const lines = [
    `# ${safe(name)}`,
    "",
    `Ready: ${plan.document !== null && !plan.issue}`,
    `Conflicts resolved: ${plan.resolvedCount}/${plan.conflicts.length}`,
    `Automatic decisions: ${plan.automaticDecisions}`,
    "",
    "| Location | Conflict | Resolution |",
    "| --- | --- | --- |",
  ];
  for (const c of plan.conflicts)
    lines.push(
      `| ${safe(c.location || "/")} | ${c.kind} | ${plan.resolutions.find((r) => r.id === c.id)?.choice ?? "unresolved"} |`,
    );
  if (plan.review)
    lines.push(
      "",
      "## Contract review",
      "",
      `Added operations: ${plan.review.added}`,
      `Removed operations: ${plan.review.removed}`,
      `Modified operations: ${plan.review.modified}`,
      `Potentially breaking operations: ${plan.review.breaking}`,
      `Broken references: ${plan.review.brokenReferences}`,
      `External references: ${plan.review.externalReferences}`,
    );
  lines.push(
    "",
    "This structural merge and advisory review do not certify full contract compatibility.",
    "",
  );
  return lines.join("\n");
}
