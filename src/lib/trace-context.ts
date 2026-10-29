import { TraceError, traceHex, traceText } from "./trace-data";

export type TraceParent = {
  traceId: string;
  parentId: string;
  flags: string;
  sampled: boolean;
};
export function readTraceParent(value: string): TraceParent {
  if (!/^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/.test(value))
    throw new TraceError("context");
  const [, traceId, parentId, flags] = value.split("-");
  traceHex(traceId, 32);
  traceHex(parentId, 16);
  return { traceId, parentId, flags, sampled: (parseInt(flags, 16) & 1) === 1 };
}
export type TraceStateEntry = { key: string; value: string };
export function readTraceState(source: string): TraceStateEntry[] {
  if (!traceText(source, 512)) throw new TraceError("state");
  if (!source.trim()) return [];
  const parts = source.split(",");
  if (parts.length > 32) throw new TraceError("state");
  const keys = new Set<string>();
  return parts.map((part) => {
    const value = part.replace(/^[ \t]+|[ \t]+$/g, ""),
      at = value.indexOf("="),
      key = value.slice(0, at),
      content = value.slice(at + 1);
    const validKey =
      /^[a-z][a-z0-9_*/-]{0,255}$/.test(key) ||
      /^[a-z0-9][a-z0-9_*/-]{0,240}@[a-z][a-z0-9_*/-]{0,13}$/.test(key);
    if (
      at < 1 ||
      !validKey ||
      key.length > 256 ||
      keys.has(key) ||
      !/^[\x20-\x2b\x2d-\x3c\x3e-\x7e]{0,255}[\x21-\x2b\x2d-\x3c\x3e-\x7e]$/.test(
        content,
      )
    )
      throw new TraceError("state");
    keys.add(key);
    return { key, value: content };
  });
}
export function updateTraceState(
  source: string,
  key: string,
  value: string,
): { value: string; removed: number } {
  const original = readTraceState(source),
    replacement = readTraceState(`${key}=${value}`);
  if (
    replacement.length !== 1 ||
    replacement[0].key !== key ||
    replacement[0].value !== value
  )
    throw new TraceError("state");
  const entries = [...replacement, ...original.filter((e) => e.key !== key)];
  let removed = 0;
  const serialize = () => entries.map((e) => `${e.key}=${e.value}`).join(",");
  while (entries.length > 32 || serialize().length > 512) {
    if (entries.length <= 1) throw new TraceError("state");
    entries.pop();
    removed++;
  }
  return { value: serialize(), removed };
}
function randomId(bytes: number, exclude = ""): string {
  if (!globalThis.crypto?.getRandomValues) throw new TraceError("crypto");
  for (let i = 0; i < 4; i++) {
    const data = crypto.getRandomValues(new Uint8Array(bytes)),
      id = Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
    if (!/^0+$/.test(id) && id !== exclude) return id;
  }
  throw new TraceError("crypto");
}
export function newTraceContext(sampled = true): {
  traceparent: string;
  tracestate: string;
} {
  return {
    traceparent: `00-${randomId(16)}-${randomId(8)}-${sampled ? "01" : "00"}`,
    tracestate: "",
  };
}
export function childTraceContext(
  parent: string,
  state: string,
  sampled: boolean,
): { traceparent: string; tracestate: string } {
  const parsed = readTraceParent(parent);
  readTraceState(state);
  return {
    traceparent: `00-${parsed.traceId}-${randomId(8, parsed.parentId)}-${sampled ? "01" : "00"}`,
    tracestate: state,
  };
}
export function inspectTraceContext(
  traceparent: string,
  tracestate: string,
): {
  parent: TraceParent | null;
  state: TraceStateEntry[];
  issue: "context" | "state" | null;
} {
  let parent: TraceParent;
  try {
    parent = readTraceParent(traceparent);
  } catch {
    return { parent: null, state: [], issue: "context" };
  }
  try {
    return { parent, state: readTraceState(tracestate), issue: null };
  } catch {
    return { parent, state: [], issue: "state" };
  }
}
