import { MT_LIMITS } from "./mutation-model";

export type MTJsonKind =
  "object" | "array" | "number" | "string" | "boolean" | "null";
export type MTJsonNode = {
  kind: MTJsonKind;
  pointer: string;
  start: number;
  end: number;
  entries: { key: string; start: number; node: MTJsonNode }[];
  items: MTJsonNode[];
};
export type MTJsonDiagnostic =
  "non-json" | "duplicate-keys" | "json-limit" | "scope-missing";
export type MTJsonTree = {
  nodes: MTJsonNode[];
  diagnostic: MTJsonDiagnostic | null;
};
class JsonStop extends Error {
  constructor(public readonly diagnostic: MTJsonDiagnostic) {
    super(diagnostic);
  }
}
const escape = (value: string) =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

// Offsets refer to the original text, including a possible BOM. Mutation plans
// splice one range; untouched tokens are never serialized through JS numbers.
export function readMutationJson(source: string): MTJsonTree {
  try {
    JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    return { nodes: [], diagnostic: "non-json" };
  }
  const nodes: MTJsonNode[] = [];
  let position = source.startsWith("\uFEFF") ? 1 : 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(source[position] ?? "x")) position++;
  };
  function stringEnd() {
    position++;
    while (position < source.length) {
      const c = source[position++];
      if (c === "\\") position++;
      else if (c === '"') return;
    }
  }
  function visit(pointer: string, depth: number): MTJsonNode {
    if (depth > MT_LIMITS.depth || nodes.length >= MT_LIMITS.nodes)
      throw new JsonStop("json-limit");
    ws();
    const start = position,
      c = source[position];
    const kind: MTJsonKind =
      c === "{"
        ? "object"
        : c === "["
          ? "array"
          : c === '"'
            ? "string"
            : c === "n"
              ? "null"
              : c === "t" || c === "f"
                ? "boolean"
                : "number";
    const node: MTJsonNode = {
      kind,
      pointer,
      start,
      end: start,
      entries: [],
      items: [],
    };
    nodes.push(node);
    if (kind === "object") {
      position++;
      ws();
      const keys = new Set<string>();
      while (source[position] !== "}") {
        const keyStart = position;
        stringEnd();
        const key = JSON.parse(source.slice(keyStart, position)) as string;
        if (keys.has(key)) throw new JsonStop("duplicate-keys");
        keys.add(key);
        ws();
        position++;
        const child = visit(`${pointer}/${escape(key)}`, depth + 1);
        node.entries.push({ key, start: keyStart, node: child });
        ws();
        if (source[position] === "}") break;
        position++;
        ws();
      }
      position++;
    } else if (kind === "array") {
      position++;
      ws();
      while (source[position] !== "]") {
        node.items.push(visit(`${pointer}/${node.items.length}`, depth + 1));
        ws();
        if (source[position] === "]") break;
        position++;
        ws();
      }
      position++;
    } else if (kind === "string") stringEnd();
    else
      while (
        position < source.length &&
        !/[\x20\t\r\n,}\]]/.test(source[position])
      )
        position++;
    node.end = position;
    return node;
  }
  try {
    visit("", 0);
    return { nodes, diagnostic: null };
  } catch (e) {
    return {
      nodes: [],
      diagnostic: e instanceof JsonStop ? e.diagnostic : "non-json",
    };
  }
}

export function mtNumberEqualsSmall(raw: string, target: -1 | 0 | 1) {
  const negative = raw.startsWith("-"),
    [mantissa, exponent = "0"] = raw.replace(/^-/, "").toLowerCase().split("e");
  const fractional = mantissa.includes(".")
    ? mantissa.length - mantissa.indexOf(".") - 1
    : 0;
  const digits = mantissa.replace(".", "").replace(/^0+/, "");
  if (!digits) return target === 0;
  if (target === 0 || negative !== target < 0) return false;
  const stripped = digits.replace(/0+$/, "");
  return (
    stripped === "1" &&
    Number(exponent) - fractional + digits.length - stripped.length === 0
  );
}
