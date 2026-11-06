import {
  ConsistencyError,
  MAX_LC_PROJECT,
  MAX_LC_OPERATIONS,
  lcList,
  lcObject,
  lcText,
  lcMethods,
  lcJson,
  parseLcJson,
  normalizeLcHistory,
  type LCJson,
  type LCObject,
  type LCOperation,
  type LCHistory,
} from "./consistency-model";
import { getByteSize } from "./text-encoding";

export function importLcOperations(
  text: string,
  history: LCHistory,
  objects: LCObject[],
  append = false,
): LCHistory {
  if (getByteSize(text) > MAX_LC_PROJECT) throw new ConsistencyError("limit");
  const lines = text.trim().startsWith("[")
    ? null
    : text.split(/\r\n|\r|\n/).filter((line) => line.trim());
  if (lines && lines.length > MAX_LC_OPERATIONS)
    throw new ConsistencyError("limit");
  const source = lines
    ? lines.map((line) => parseLcJson(line))
    : parseLcJson(text);
  return normalizeLcHistory(
    {
      ...history,
      operations: [
        ...(append ? history.operations : []),
        ...lcList(source, MAX_LC_OPERATIONS),
      ],
    },
    objects,
  );
}
type LCBinding =
  { kind: "literal"; value: LCJson } | { kind: "body"; pointer: string };
export type LCHarRule = {
  method: string;
  path: string;
  objectId: string;
  operation: LCOperation["method"];
  input: LCBinding;
  output: LCBinding;
};
const pointerValid = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length <= 256 &&
  (!v || v.startsWith("/")) &&
  !/~(?![01])/.test(v);
function binding(v: unknown): LCBinding {
  if (!lcObject(v)) throw new ConsistencyError("capture");
  if (v.kind === "literal") return { kind: v.kind, value: lcJson(v.value) };
  if (v.kind === "body" && pointerValid(v.pointer))
    return { kind: v.kind, pointer: v.pointer };
  throw new ConsistencyError("capture");
}
export function normalizeLcHarRules(
  value: unknown,
  objects: LCObject[],
): LCHarRule[] {
  const rules = lcList(value, 12).map((v) => {
    if (
      !lcObject(v) ||
      typeof v.method !== "string" ||
      !/^[A-Z]{1,16}$/.test(v.method) ||
      !lcText(v.path, 1024) ||
      !v.path.startsWith("/") ||
      typeof v.objectId !== "string"
    )
      throw new ConsistencyError("capture");
    const object = objects.find((o) => o.id === v.objectId);
    if (
      !object ||
      !lcMethods(object.kind).includes(v.operation as LCOperation["method"])
    )
      throw new ConsistencyError("reference");
    return {
      method: v.method,
      path: v.path,
      objectId: v.objectId,
      operation: v.operation as LCOperation["method"],
      input: binding(v.input),
      output: binding(v.output),
    };
  });
  if (
    !rules.length ||
    new Set(rules.map((r) => `${r.method} ${r.path}`)).size !== rules.length
  )
    throw new ConsistencyError("capture");
  return rules;
}
function bodyValue(body: unknown, rule: LCBinding): LCJson {
  if (rule.kind === "literal") return rule.value;
  if (!lcObject(body) || typeof body.text !== "string")
    throw new ConsistencyError("capture");
  let text = body.text;
  if (body.encoding === "base64") {
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        text,
      )
    )
      throw new ConsistencyError("capture");
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
    );
  } else if (body.encoding !== undefined && body.encoding !== "")
    throw new ConsistencyError("capture");
  let current = parseLcJson(text);
  for (const raw of rule.pointer ? rule.pointer.slice(1).split("/") : []) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key) ||
      (Array.isArray(current) && !/^(0|[1-9]\d*)$/.test(key))
    )
      throw new ConsistencyError("capture");
    current = (current as Record<string, unknown>)[key];
  }
  return lcJson(current);
}
export type LCHarPreview = {
  operations: LCOperation[];
  skipped: {
    index: number;
    reason: "unmatched" | "status" | "timing" | "body" | "client" | "entry";
  }[];
  origin: string | null;
};
export function inspectLcHar(
  text: string,
  rulesValue: unknown,
  objects: LCObject[],
  clientHeader = "",
): LCHarPreview {
  const rules = normalizeLcHarRules(rulesValue, objects),
    raw = parseLcJson(text);
  if (
    clientHeader &&
    (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(clientHeader) ||
      clientHeader.length > 64)
  )
    throw new ConsistencyError("capture");
  if (!lcObject(raw) || !lcObject(raw.log))
    throw new ConsistencyError("capture");
  const skipped: LCHarPreview["skipped"] = [],
    collected: {
      start: number;
      duration: number;
      operation: Omit<LCOperation, "start" | "end">;
    }[] = [];
  lcList(raw.log.entries, 1000).forEach((entry, index) => {
    let reason: LCHarPreview["skipped"][number]["reason"] = "entry";
    try {
      if (
        !lcObject(entry) ||
        !lcObject(entry.request) ||
        !lcObject(entry.response) ||
        typeof entry.request.url !== "string" ||
        typeof entry.request.method !== "string"
      )
        throw new Error();
      const request = entry.request;
      const url = new URL(request.url as string);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      reason = "unmatched";
      const rule = rules.find(
        (r) => r.method === request.method && r.path === url.pathname,
      );
      if (!rule) throw new Error();
      reason = "status";
      if (
        typeof entry.response.status !== "number" ||
        entry.response.status < 200 ||
        entry.response.status >= 300
      )
        throw new Error();
      reason = "timing";
      const start =
          typeof entry.startedDateTime === "string"
            ? Date.parse(entry.startedDateTime)
            : NaN,
        duration = entry.time;
      if (
        !Number.isFinite(start) ||
        typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        Math.round(duration * 1000) < 1
      )
        throw new Error();
      reason = "client";
      let client = `capture-${index + 1}`;
      if (clientHeader) {
        const headers = lcList(entry.request.headers, 200);
        const values = headers.filter(
          (h) =>
            lcObject(h) &&
            typeof h.name === "string" &&
            h.name.toLowerCase() === clientHeader.toLowerCase(),
        );
        if (
          values.length !== 1 ||
          !lcObject(values[0]) ||
          !lcText(values[0].value, 64)
        )
          throw new Error();
        client = values[0].value;
      }
      reason = "body";
      const input = bodyValue(entry.request.postData, rule.input),
        output = bodyValue(entry.response.content, rule.output);
      collected.push({
        start,
        duration: Math.round(duration * 1000),
        operation: {
          id: `capture-${index + 1}`,
          client,
          objectId: rule.objectId,
          method: rule.operation,
          input,
          output,
        },
      });
    } catch {
      skipped.push({ index, reason });
    }
  });
  if (collected.length > MAX_LC_OPERATIONS) throw new ConsistencyError("limit");
  const min = Math.min(...collected.map((c) => c.start));
  const operations = normalizeLcHistory(
    {
      id: "capture",
      name: "Capture",
      mode: "linearizable",
      maxStates: 20000,
      expected: null,
      operations: collected.map((c) => {
        const start = Math.round((c.start - min) * 1000);
        return { ...c.operation, start, end: start + c.duration };
      }),
    },
    objects,
  ).operations;
  return {
    operations,
    skipped,
    origin: Number.isFinite(min) ? new Date(min).toISOString() : null,
  };
}
export const defaultLcHarRules = (objectId: string) => [
  {
    method: "PUT",
    path: "/value",
    objectId,
    operation: "write",
    input: { kind: "body", pointer: "/value" },
    output: { kind: "literal", value: null },
  },
  {
    method: "GET",
    path: "/value",
    objectId,
    operation: "read",
    input: { kind: "literal", value: null },
    output: { kind: "body", pointer: "/value" },
  },
];
