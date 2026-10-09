import YAML from "yaml";
import {
  parseTransformPointer,
  parseTransformValue,
  readTransformSource,
  escapeTransformPointer,
  type JsonValue,
} from "./api-transform";
import { parseOpenApiSchema, type SchemaFormat } from "./openapi";
import { getByteSize } from "./text-encoding";

export const MAX_REDACTION_BYTES = 2 * 1024 * 1024;
export const MAX_REDACTION_SOURCE_BYTES = 1024 * 1024;
export const MAX_REDACTION_SOURCES = 8;
export const MAX_REDACTION_RULES = 50;
export type RedactionKind = "openapi" | "har" | "json";
export type RedactionAction = "mask" | "pseudonymize" | "remove" | "replace";
export type RedactionCategory =
  | "credential"
  | "email"
  | "phone"
  | "name"
  | "address"
  | "ip"
  | "identifier"
  | "custom";
export type RedactionOptions = {
  secrets: boolean;
  personal: boolean;
  action: "mask" | "pseudonymize";
  dropOpaqueBodies: boolean;
};
export type RedactionRule = {
  key: string;
  name: string;
  enabled: boolean;
  selector: string;
  action: RedactionAction;
  replacement?: JsonValue;
};
export type RedactionSource = {
  key: string;
  name: string;
  kind: RedactionKind;
  text: string;
};
export type RedactionProject = {
  kind: "rsswag-data-redaction";
  version: 1;
  name: string;
  options: RedactionOptions;
  rules: RedactionRule[];
  sources: RedactionSource[];
};
export type RedactionFinding = {
  source: string;
  pointer: string;
  payloadPointer?: string;
  category: RedactionCategory;
  action: RedactionAction;
  rule: string | null;
  valueType: string;
};
export type RedactionDiagnostic = {
  source: string;
  pointer: string;
  severity: "review" | "error";
  code:
    | "extension"
    | "constraint-values"
    | "external-example"
    | "opaque-body"
    | "url-unparsed"
    | "url-template"
    | "invalid-openapi"
    | "custom-structure"
    | "external-reference";
};
export type RedactedFile = {
  key: string;
  name: string;
  kind: RedactionKind;
  format: SchemaFormat;
  text: string;
  changes: number;
  canExport: boolean;
};
export type RedactionResult = {
  files: RedactedFile[];
  findings: RedactionFinding[];
  diagnostics: RedactionDiagnostic[];
  changeCount: number;
  diagnosticCount: number;
  categoryCounts: Record<RedactionCategory, number>;
};
export type RedactionErrorCode =
  "json" | "source" | "project" | "rule" | "limit" | "root";
export class RedactionError extends Error {
  constructor(public code: RedactionErrorCode) {
    super(code);
  }
}
type Obj = Record<string, JsonValue>;
const obj = (v: unknown): v is Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v: unknown, key: string): JsonValue | undefined =>
  obj(v) && Object.hasOwn(v, key) ? v[key] : undefined;
const key = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(v);
const named = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 120;
const pointer = (parts: string[]) =>
  parts.length ? `/${parts.map(escapeTransformPointer).join("/")}` : "";
const same = (a: JsonValue, b: JsonValue) =>
  JSON.stringify(a) === JSON.stringify(b);
const omitted = Symbol("omitted");
const kinds = ["openapi", "har", "json"];
export function parseRedactionValue(text: string): JsonValue {
  if (getByteSize(text) > MAX_REDACTION_BYTES)
    throw new RedactionError("limit");
  try {
    return parseTransformValue(text);
  } catch (error) {
    throw new RedactionError(
      obj(error) && error.code === "limit" ? "limit" : "json",
    );
  }
}
export function readRedactionSource(text: string, requested?: RedactionKind) {
  if (getByteSize(text) > MAX_REDACTION_SOURCE_BYTES)
    throw new RedactionError("limit");
  let document: JsonValue,
    format: SchemaFormat = "json";
  try {
    if (requested === "openapi") {
      const source = readTransformSource(text);
      document = source.document;
      format = source.format;
    } else {
      try {
        document = parseRedactionValue(text);
      } catch (error) {
        if (requested) throw error;
        const source = readTransformSource(text);
        document = source.document;
        format = source.format;
      }
    }
  } catch (error) {
    throw error instanceof RedactionError
      ? error
      : new RedactionError(
          obj(error) && error.code === "limit" ? "limit" : "source",
        );
  }
  const kind =
    requested ??
    (obj(document) &&
    (typeof document.openapi === "string" || document.swagger === "2.0")
      ? "openapi"
      : obj(document) &&
          obj(document.log) &&
          Array.isArray(document.log.entries)
        ? "har"
        : "json");
  if (
    kind === "openapi" &&
    (!obj(document) ||
      typeof document.openapi !== "string" ||
      !/^3\.[01]\./.test(document.openapi) ||
      !parseOpenApiSchema(JSON.stringify(document)).ok)
  )
    throw new RedactionError("source");
  if (
    kind === "har" &&
    (!obj(document) ||
      !obj(document.log) ||
      !Array.isArray(document.log.entries) ||
      document.log.entries.length > 1000)
  )
    throw new RedactionError("source");
  return { kind, document, format };
}
export function emptyRedactionProject(): RedactionProject {
  return {
    kind: "rsswag-data-redaction",
    version: 1,
    name: "Sharing API artifacts",
    options: {
      secrets: true,
      personal: false,
      action: "mask",
      dropOpaqueBodies: false,
    },
    rules: [],
    sources: [],
  };
}
export function validateRedactionProject(input: unknown): RedactionProject {
  const value = parseRedactionValue(JSON.stringify(input));
  if (
    !obj(value) ||
    value.kind !== "rsswag-data-redaction" ||
    value.version !== 1 ||
    !named(value.name) ||
    !obj(value.options) ||
    typeof value.options.secrets !== "boolean" ||
    typeof value.options.personal !== "boolean" ||
    typeof value.options.dropOpaqueBodies !== "boolean" ||
    typeof value.options.action !== "string" ||
    !["mask", "pseudonymize"].includes(value.options.action) ||
    !Array.isArray(value.rules) ||
    !Array.isArray(value.sources)
  )
    throw new RedactionError("project");
  if (
    value.sources.length > MAX_REDACTION_SOURCES ||
    value.rules.length > MAX_REDACTION_RULES
  )
    throw new RedactionError("limit");
  const ruleKeys = new Set<string>(),
    sourceKeys = new Set<string>();
  for (const rule of value.rules) {
    if (
      !obj(rule) ||
      !key(rule.key) ||
      ruleKeys.has(rule.key) ||
      !named(rule.name) ||
      typeof rule.enabled !== "boolean" ||
      typeof rule.selector !== "string" ||
      rule.selector.length > 1024 ||
      typeof rule.action !== "string" ||
      !["mask", "pseudonymize", "remove", "replace"].includes(rule.action) ||
      (rule.action === "replace" && !Object.hasOwn(rule, "replacement"))
    )
      throw new RedactionError("rule");
    try {
      parseTransformPointer(rule.selector);
    } catch {
      throw new RedactionError("rule");
    }
    ruleKeys.add(rule.key);
  }
  for (const source of value.sources) {
    if (
      !obj(source) ||
      !key(source.key) ||
      sourceKeys.has(source.key) ||
      !named(source.name) ||
      typeof source.text !== "string" ||
      typeof source.kind !== "string" ||
      !kinds.includes(source.kind)
    )
      throw new RedactionError("source");
    readRedactionSource(source.text, source.kind as RedactionKind);
    sourceKeys.add(source.key);
  }
  return value as unknown as RedactionProject;
}
export function parseRedactionProject(text: string) {
  return validateRedactionProject(parseRedactionValue(text));
}
export function serializeRedactionProject(project: RedactionProject) {
  const text =
    JSON.stringify(validateRedactionProject(project), null, 2) + "\n";
  if (getByteSize(text) > MAX_REDACTION_BYTES)
    throw new RedactionError("limit");
  return text;
}
export function addRedactionSources(
  project: RedactionProject,
  inputs: { name: string; text: string; kind?: RedactionKind }[],
) {
  const sources = [...project.sources];
  for (const input of inputs) {
    let n = 1;
    while (sources.some((s) => s.key === `source-${n}`)) n++;
    sources.push({
      key: `source-${n}`,
      name: input.name.slice(0, 120),
      text: input.text,
      kind: readRedactionSource(input.text, input.kind).kind,
    });
  }
  return validateRedactionProject({ ...project, sources });
}
function categoryFor(
  name: string,
  options: RedactionOptions,
): RedactionCategory | null {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    options.secrets &&
    /^(?:authorization|proxyauthorization|cookie|setcookie|password|passwd|passphrase|secret|secretkey|clientsecret|apikey|xapikey|token|authtoken|xauthtoken|bearertoken|jwt|accesstoken|refreshtoken|idtoken|credentials|credential|accesskey|accesskeyid|secretaccesskey|session|sessionid|csrf|csrftoken|xcsrftoken|xcsrftoken|xsrf|xsrftoken|xxsrftoken|privatekey|connectionstring|signature|sig|xamzcredential|xamzsignature|xamzsecuritytoken)$/.test(
      normalized,
    )
  )
    return "credential";
  if (!options.personal) return null;
  if (
    /^(?:email|emailaddress|customeremail|useremail|contactemail)$/.test(
      normalized,
    )
  )
    return "email";
  if (/^(?:phone|phonenumber|mobile|mobilenumber|telephone)$/.test(normalized))
    return "phone";
  if (
    /^(?:name|fullname|firstname|lastname|displayname|username)$/.test(
      normalized,
    )
  )
    return "name";
  if (/^(?:address|street|streetaddress|postalcode|zipcode)$/.test(normalized))
    return "address";
  if (/^(?:ip|ipaddress|clientip|remoteaddress)$/.test(normalized)) return "ip";
  if (/^(?:id|userid|customerid|accountid|personid)$/.test(normalized))
    return "identifier";
  return null;
}
type Plan = {
  data: Set<string>;
  targets: Map<string, RedactionCategory>;
  urls: Set<string>;
  bodies: Map<string, "json" | "opaque">;
};
function planSource(
  document: JsonValue,
  kind: RedactionKind,
  options: RedactionOptions,
  diagnostic: (parts: string[], code: RedactionDiagnostic["code"]) => void,
): Plan {
  const plan: Plan = {
    data: new Set(),
    targets: new Map(),
    urls: new Set(),
    bodies: new Map(),
  };
  function target(parts: string[], name: string, forced?: RedactionCategory) {
    const category = forced ?? categoryFor(name, options);
    if (category) plan.targets.set(pointer(parts), category);
  }
  function sample(parts: string[], name: string) {
    plan.data.add(pointer(parts));
    target(parts, name);
  }
  if (kind === "json") {
    plan.data.add("");
    return plan;
  }
  if (kind === "har") {
    const entries = own(own(document, "log"), "entries") as JsonValue[];
    entries.forEach((entry, index) => {
      const base = ["log", "entries", String(index)];
      for (const side of ["request", "response"]) {
        const node = own(entry, side);
        if (!obj(node)) continue;
        if (side === "request" && typeof node.url === "string")
          plan.urls.add(pointer([...base, side, "url"]));
        if (
          side === "response" &&
          typeof node.redirectURL === "string" &&
          node.redirectURL
        )
          plan.urls.add(pointer([...base, side, "redirectURL"]));
        for (const listName of ["headers", "queryString", "cookies"]) {
          const list = own(node, listName);
          if (Array.isArray(list))
            list.forEach((row, i) => {
              if (
                obj(row) &&
                typeof row.name === "string" &&
                Object.hasOwn(row, "value")
              )
                target(
                  [...base, side, listName, String(i), "value"],
                  row.name,
                  listName === "cookies" && options.secrets
                    ? "credential"
                    : undefined,
                );
            });
          if (Array.isArray(list))
            list.forEach((row, i) => {
              if (
                obj(row) &&
                typeof row.value === "string" &&
                /^https?:\/\//i.test(row.value)
              )
                plan.urls.add(
                  pointer([...base, side, listName, String(i), "value"]),
                );
            });
        }
        const container = side === "request" ? "postData" : "content";
        const content = own(node, container);
        if (!obj(content)) continue;
        if (Array.isArray(content.params))
          content.params.forEach((row, i) => {
            if (
              obj(row) &&
              typeof row.name === "string" &&
              Object.hasOwn(row, "value")
            )
              target(
                [...base, side, container, "params", String(i), "value"],
                row.name,
              );
          });
        if (typeof content.text === "string" && content.text.length) {
          const bodyParts = [...base, side, container, "text"];
          let body: "json" | "opaque" = "opaque";
          if (
            content.encoding === undefined &&
            getByteSize(content.text) <= 256 * 1024
          )
            try {
              parseRedactionValue(content.text);
              body = "json";
            } catch {
              /* Reviewed or explicitly omitted. */
            }
          plan.bodies.set(pointer(bodyParts), body);
          if (body === "opaque") diagnostic(bodyParts, "opaque-body");
        }
      }
    });
    return plan;
  }
  let steps = 0;
  function structural(value: JsonValue, parts: string[], context: string) {
    if (parts.reduce((n, p) => n + p.length + 1, 0) > 4096)
      throw new RedactionError("limit");
    if (++steps > 50000) throw new RedactionError("limit");
    if (Array.isArray(value)) {
      value.forEach((child, i) =>
        structural(child, [...parts, String(i)], context),
      );
      return;
    }
    if (!obj(value)) return;
    const name = typeof value.name === "string" ? value.name : context;
    for (const [field, child] of Object.entries(value)) {
      const at = [...parts, field];
      if (
        field === "$ref" &&
        typeof child === "string" &&
        /^https?:\/\//i.test(child)
      ) {
        diagnostic(at, "external-reference");
        continue;
      }
      if (field.startsWith("x-")) {
        diagnostic(at, "extension");
        continue;
      }
      if (
        [
          "properties",
          "headers",
          "responses",
          "schemas",
          "parameters",
          "requestBodies",
          "securitySchemes",
          "links",
          "callbacks",
          "pathItems",
          "webhooks",
          "encoding",
          "$defs",
          "definitions",
          "patternProperties",
        ].includes(field) &&
        obj(child)
      ) {
        for (const [childName, schema] of Object.entries(child))
          structural(schema, [...at, childName], childName);
        continue;
      }
      if (["default", "enum", "const"].includes(field)) {
        if (categoryFor(name, options)) diagnostic(at, "constraint-values");
        continue;
      }
      if (field === "example") {
        sample(at, name);
        continue;
      }
      if (field === "examples") {
        if (Array.isArray(child))
          child.forEach((_, i) => sample([...at, String(i)], name));
        else if (obj(child))
          for (const [exampleName, example] of Object.entries(child)) {
            if (obj(example) && Object.hasOwn(example, "value"))
              sample([...at, exampleName, "value"], name);
            else if (
              obj(example) &&
              (example.externalValue !== undefined ||
                example.$ref !== undefined)
            )
              diagnostic([...at, exampleName], "external-example");
          }
        continue;
      }
      if (field === "servers" && Array.isArray(child))
        child.forEach((server, i) => {
          if (obj(server) && typeof server.url === "string")
            plan.urls.add(pointer([...at, String(i), "url"]));
        });
      if (
        field === "externalDocs" &&
        obj(child) &&
        typeof child.url === "string"
      )
        plan.urls.add(pointer([...at, "url"]));
      structural(child, at, name);
    }
  }
  structural(document, [], "");
  return plan;
}
/** Consistent aliases are shared across all sources in a preview; this never mutates originals. */
export function redactData(projectInput: RedactionProject): RedactionResult {
  const project = validateRedactionProject(projectInput);
  const rules = project.rules
    .filter((r) => r.enabled)
    .map((rule) => ({ rule, parts: parseTransformPointer(rule.selector) }));
  const findings: RedactionFinding[] = [],
    diagnostics: RedactionDiagnostic[] = [];
  const categoryCounts = Object.fromEntries(
    [
      "credential",
      "email",
      "phone",
      "name",
      "address",
      "ip",
      "identifier",
      "custom",
    ].map((k) => [k, 0]),
  ) as Record<RedactionCategory, number>;
  const aliases = new Map<string, number>(),
    counters = new Map<string, number>();
  let changeCount = 0,
    diagnosticCount = 0,
    nodes = 0,
    matches = 0,
    totalOutput = 0;
  function mask(
    value: JsonValue,
    category: RedactionCategory,
    action: "mask" | "pseudonymize",
    group: string,
  ): JsonValue {
    if (++nodes > 200000) throw new RedactionError("limit");
    if (Array.isArray(value))
      return value.map((v) => mask(v, category, action, group));
    if (obj(value))
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          mask(v, category, action, group),
        ]),
      );
    if (value === null) return null;
    if (action === "mask")
      return typeof value === "string"
        ? "[redacted]"
        : typeof value === "number"
          ? 0
          : false;
    const numericId =
      category === "identifier" &&
      (typeof value === "number" ||
        (typeof value === "string" &&
          /^-?(0|[1-9]\d*)(?:\.\d+)?$/.test(value)));
    const identity = JSON.stringify([
      group,
      numericId ? "numeric-id" : typeof value,
      numericId ? String(value) : value,
    ]);
    let index = (counters.get(group) ?? 0) + 1;
    const candidate = (n: number): JsonValue =>
      typeof value === "number"
        ? 1000000 + n
        : numericId
          ? String(1000000 + n)
          : typeof value === "boolean"
            ? !value
            : category === "email"
              ? `person-${n}@example.invalid`
              : category === "phone"
                ? `000-000-${String(n).padStart(4, "0")}`
                : category === "name"
                  ? `Person ${n}`
                  : category === "ip"
                    ? `10.${Math.floor(n / 65536) % 256}.${Math.floor(n / 256) % 256}.${n % 256}`
                    : category === "identifier"
                      ? `record-${n}`
                      : `redacted-${n}`;
    if (aliases.has(identity)) return candidate(aliases.get(identity)!);
    let replacement = candidate(index);
    if (replacement === value) replacement = candidate(++index);
    counters.set(group, index);
    aliases.set(identity, index);
    return replacement;
  }
  function selectorMatches(pattern: string[], parts: string[]) {
    const cache = new Map<string, boolean>();
    function at(p: number, i: number): boolean {
      if (++matches > 1000000) throw new RedactionError("limit");
      const key = `${p}:${i}`;
      if (cache.has(key)) return cache.get(key)!;
      const yes =
        p === pattern.length
          ? i === parts.length
          : pattern[p] === "**"
            ? at(p + 1, i) || (i < parts.length && at(p, i + 1))
            : i < parts.length &&
              (pattern[p] === "*" || pattern[p] === parts[i]) &&
              at(p + 1, i + 1);
      cache.set(key, yes);
      return yes;
    }
    return at(0, 0);
  }
  const files = project.sources.map((source) => {
    const parsed = readRedactionSource(source.text, source.kind);
    let changes = 0;
    const seenDiagnostics = new Set<string>();
    function diagnostic(
      parts: string[],
      code: RedactionDiagnostic["code"],
      severity: RedactionDiagnostic["severity"] = "review",
    ) {
      const signature = JSON.stringify([parts, code]);
      if (seenDiagnostics.has(signature)) return;
      seenDiagnostics.add(signature);
      diagnosticCount++;
      diagnostics.push({
        source: source.key,
        pointer: pointer(parts),
        code,
        severity,
      });
      diagnostics.sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
      );
      if (diagnostics.length > 100) diagnostics.pop();
    }
    const plan = planSource(
      parsed.document,
      source.kind,
      project.options,
      diagnostic,
    );
    function finding(
      parts: string[],
      category: RedactionCategory,
      action: RedactionAction,
      rule: string | null,
      value: JsonValue,
      payload?: { outer: string[]; inner: string[] },
    ) {
      changeCount++;
      changes++;
      categoryCounts[category]++;
      if (findings.length < 500)
        findings.push({
          source: source.key,
          pointer: pointer(payload?.outer ?? parts),
          ...(payload ? { payloadPointer: pointer(payload.inner) } : {}),
          category,
          action,
          rule,
          valueType:
            value === null
              ? "null"
              : Array.isArray(value)
                ? "array"
                : typeof value,
        });
    }
    function changed(
      value: JsonValue,
      replacement: JsonValue | typeof omitted,
      parts: string[],
      category: RedactionCategory,
      action: RedactionAction,
      rule: string | null,
      payload?: { outer: string[]; inner: string[] },
    ) {
      if (replacement === omitted || !same(value, replacement))
        finding(parts, category, action, rule, value, payload);
      return replacement;
    }
    function url(
      value: string,
      parts: string[],
      payload?: { outer: string[]; inner: string[] },
      depth = 0,
    ): string {
      if (value.length > 16384 || depth > 3) {
        diagnostic(payload?.outer ?? parts, "url-unparsed");
        return value;
      }
      if (/[{}]/.test(value)) {
        diagnostic(payload?.outer ?? parts, "url-template");
        return value;
      }
      let address: URL;
      const relative = value.startsWith("/");
      try {
        address = new URL(
          value,
          relative ? "https://redaction.invalid" : undefined,
        );
        if (!["http:", "https:"].includes(address.protocol)) throw new Error();
      } catch {
        diagnostic(payload?.outer ?? parts, "url-unparsed");
        return value;
      }
      const query = [...address.searchParams.entries()];
      if (query.length > 1000) {
        diagnostic(payload?.outer ?? parts, "url-unparsed");
        return value;
      }
      let altered = false;
      if (project.options.secrets && (address.username || address.password)) {
        address.username = "";
        address.password = "";
        finding(parts, "credential", "remove", null, value, payload);
        altered = true;
      }
      if (
        query.some(
          ([name, entry]) =>
            categoryFor(name, project.options) || /^https?:\/\//i.test(entry),
        )
      ) {
        address.search = "";
        for (const [name, entry] of query) {
          const category = categoryFor(name, project.options);
          const next = category
            ? (mask(
                entry,
                category,
                project.options.action,
                category,
              ) as string)
            : /^https?:\/\//i.test(entry)
              ? url(entry, parts, payload, depth + 1)
              : entry;
          address.searchParams.append(name, next);
          if (next !== entry) {
            if (category)
              finding(
                parts,
                category,
                project.options.action,
                null,
                entry,
                payload,
              );
            altered = true;
          }
        }
      }
      if (
        project.options.secrets &&
        address.hash &&
        [...new URLSearchParams(address.hash.slice(1)).keys()].some((name) =>
          categoryFor(name, project.options),
        )
      ) {
        address.hash = "";
        finding(parts, "credential", "remove", null, value, payload);
        altered = true;
      }
      if (!altered) return value;
      if (relative)
        return (
          (value.startsWith("//") ? "//" + address.host : "") +
          address.pathname +
          address.search +
          address.hash
        );
      return address.toString();
    }
    function walk(
      value: JsonValue,
      parts: string[],
      inData: boolean,
      payload?: { outer: string[]; inner: string[] },
    ): JsonValue | typeof omitted {
      if (++nodes > 200000) throw new RedactionError("limit");
      if (parts.reduce((n, p) => n + p.length + 1, 0) > 4096)
        throw new RedactionError("limit");
      const path = pointer(parts);
      const data = inData || plan.data.has(path);
      const manual = rules.find(({ parts: pattern }) =>
        selectorMatches(pattern, parts),
      )?.rule;
      if (manual) {
        if (source.kind === "openapi" && !data && !plan.urls.has(path))
          diagnostic(parts, "custom-structure");
        const replacement =
          manual.action === "remove"
            ? omitted
            : manual.action === "replace"
              ? manual.replacement!
              : mask(value, "custom", manual.action, `rule:${manual.key}`);
        return changed(
          value,
          replacement,
          parts,
          "custom",
          manual.action,
          manual.key,
          payload,
        );
      }
      const category =
        plan.targets.get(path) ??
        (data ? categoryFor(parts.at(-1) ?? "", project.options) : null);
      if (category)
        return changed(
          value,
          mask(value, category, project.options.action, category),
          parts,
          category,
          project.options.action,
          null,
          payload,
        );
      if (typeof value === "string") {
        const body = !payload && plan.bodies.get(path);
        if (body === "opaque" && project.options.dropOpaqueBodies)
          return changed(value, omitted, parts, "custom", "remove", null);
        if (body === "json") {
          const original = parseRedactionValue(value);
          const inner = walk(original, [...parts, "$json"], true, {
            outer: parts,
            inner: [],
          });
          if (inner === omitted) return omitted;
          return same(original, inner) ? value : JSON.stringify(inner);
        }
        if (plan.urls.has(path) || (data && /^https?:\/\//i.test(value)))
          return url(value, parts, payload);
        return value;
      }
      if (Array.isArray(value))
        return value.flatMap((child, i) => {
          const next = walk(
            child,
            [...parts, String(i)],
            data,
            payload
              ? { outer: payload.outer, inner: [...payload.inner, String(i)] }
              : undefined,
          );
          return next === omitted ? [] : [next];
        });
      if (obj(value))
        return Object.fromEntries(
          Object.entries(value).flatMap(([key, child]) => {
            const next = walk(
              child,
              [...parts, key],
              data,
              payload
                ? { outer: payload.outer, inner: [...payload.inner, key] }
                : undefined,
            );
            return next === omitted ? [] : [[key, next]];
          }),
        );
      return value;
    }
    const document = walk(parsed.document, [], false);
    if (document === omitted) throw new RedactionError("root");
    const canExport =
      source.kind !== "openapi" ||
      parseOpenApiSchema(JSON.stringify(document)).ok;
    if (!canExport) diagnostic([], "invalid-openapi", "error");
    const text =
      parsed.format === "yaml"
        ? YAML.stringify(document, { lineWidth: 0 })
        : JSON.stringify(document, null, 2) + "\n";
    if (
      getByteSize(text) > MAX_REDACTION_BYTES ||
      (totalOutput += getByteSize(text)) > 4 * 1024 * 1024
    )
      throw new RedactionError("limit");
    return {
      key: source.key,
      name: source.name,
      kind: source.kind,
      format: parsed.format,
      text,
      changes,
      canExport,
    };
  });
  return {
    files,
    findings,
    diagnostics,
    changeCount,
    diagnosticCount,
    categoryCounts,
  };
}
export function serializeRedactionReport(
  project: RedactionProject,
  result: RedactionResult,
) {
  // Original values, source text, replacements, and redacted output are excluded.
  const text =
    JSON.stringify(
      {
        kind: "rsswag-redaction-report",
        version: 1,
        name: project.name,
        files: result.files.map((f) => ({
          key: f.key,
          name: f.name,
          kind: f.kind,
          changes: f.changes,
          canExport: f.canExport,
        })),
        changeCount: result.changeCount,
        diagnosticCount: result.diagnosticCount,
        categoryCounts: result.categoryCounts,
        findings: result.findings,
        diagnostics: result.diagnostics,
      },
      null,
      2,
    ) + "\n";
  if (getByteSize(text) > MAX_REDACTION_BYTES)
    throw new RedactionError("limit");
  return text;
}

export function serializeRedactionRules(input: RedactionProject) {
  const project = validateRedactionProject(input);
  const { secrets, personal, action, dropOpaqueBodies } = project.options;
  const rules = project.rules.map((r) => ({
    key: r.key,
    name: r.name,
    enabled: r.enabled,
    selector: r.selector,
    action: r.action,
    ...(r.action === "replace" ? { replacement: r.replacement } : {}),
  }));
  const text =
    JSON.stringify(
      {
        kind: "rsswag-redaction-rules",
        version: 1,
        name: project.name,
        options: { secrets, personal, action, dropOpaqueBodies },
        rules,
      },
      null,
      2,
    ) + "\n";
  if (getByteSize(text) > MAX_REDACTION_BYTES)
    throw new RedactionError("limit");
  return text;
}
export function parseRedactionRules(
  text: string,
): Pick<RedactionProject, "rules" | "options"> {
  const value = parseRedactionValue(text);
  if (
    !obj(value) ||
    value.kind !== "rsswag-redaction-rules" ||
    value.version !== 1
  )
    throw new RedactionError("project");
  const project = validateRedactionProject({
    ...value,
    kind: "rsswag-data-redaction",
    sources: [],
  });
  return { rules: project.rules, options: project.options };
}
export function serializeRedactedBundle(result: RedactionResult) {
  if (result.files.some((f) => !f.canExport))
    throw new RedactionError("source");
  const text =
    JSON.stringify(
      {
        kind: "rsswag-redacted-bundle",
        version: 1,
        files: result.files.map((f) => ({
          name: f.name,
          kind: f.kind,
          format: f.format,
          text: f.text,
        })),
      },
      null,
      2,
    ) + "\n";
  if (getByteSize(text) > 6 * 1024 * 1024) throw new RedactionError("limit");
  return text;
}
