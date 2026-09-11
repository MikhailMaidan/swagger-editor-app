import { getByteSize } from "./text-encoding";

export const MAX_EXPLORER_BYTES = 1024 * 1024;
export const MAX_EXPLORER_NODES = 20000;
export const MAX_TABLE_ROWS = 5000;
export const MAX_TABLE_COLUMNS = 64;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonValueType =
  "null" | "boolean" | "number" | "string" | "array" | "object";
export type ExplorerNode = {
  pointer: string;
  parent: string | null;
  key: string;
  type: JsonValueType;
  value: JsonValue;
  children: string[];
};
export type ExplorerIndex =
  | { ok: true; nodes: Map<string, ExplorerNode> }
  | {
      ok: false;
      issue:
        "invalid-json" | "size-limit" | "structure-limit" | "unsafe-number";
    };
export type ExplorerTable =
  | { ok: true; rows: JsonValue[]; columns: (string | null)[] }
  | { ok: false; issue: "not-array" | "row-limit" | "column-limit" };

export function jsonValueType(value: JsonValue): JsonValueType {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : (typeof value as JsonValueType);
}
export function escapeExplorerPointer(key: string) {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}
export function isExplorerPointer(pointer: string) {
  return (
    pointer === "" || (pointer.startsWith("/") && !/~(?![01])/u.test(pointer))
  );
}

export function indexResponseJson(body: string): ExplorerIndex {
  if (
    body.length > MAX_EXPLORER_BYTES ||
    getByteSize(body) > MAX_EXPLORER_BYTES
  )
    return { ok: false, issue: "size-limit" };
  let root: JsonValue;
  try {
    root = JSON.parse(body);
  } catch {
    return { ok: false, issue: "invalid-json" };
  }
  const nodes = new Map<string, ExplorerNode>();
  const pending = [
    {
      value: root,
      pointer: "",
      parent: null as string | null,
      key: "",
      depth: 0,
    },
  ];
  while (pending.length) {
    const entry = pending.pop()!;
    if (nodes.size >= MAX_EXPLORER_NODES || entry.depth > 64)
      return { ok: false, issue: "structure-limit" };
    if (
      typeof entry.value === "number" &&
      (!Number.isFinite(entry.value) ||
        (Number.isInteger(entry.value) && !Number.isSafeInteger(entry.value)))
    )
      return { ok: false, issue: "unsafe-number" };
    const children =
      entry.value !== null && typeof entry.value === "object"
        ? Object.entries(entry.value)
        : [];
    if (nodes.size + pending.length + children.length + 1 > MAX_EXPLORER_NODES)
      return { ok: false, issue: "structure-limit" };
    nodes.set(entry.pointer, {
      pointer: entry.pointer,
      parent: entry.parent,
      key: entry.key,
      type: jsonValueType(entry.value),
      value: entry.value,
      children: children.map(
        ([key]) => entry.pointer + "/" + escapeExplorerPointer(key),
      ),
    });
    for (let i = children.length - 1; i >= 0; i--) {
      const [key, value] = children[i];
      pending.push({
        value,
        pointer: entry.pointer + "/" + escapeExplorerPointer(key),
        parent: entry.pointer,
        key,
        depth: entry.depth + 1,
      });
    }
  }
  return { ok: true, nodes };
}

export function previewJsonValue(value: JsonValue, limit = 180): string {
  const type = jsonValueType(value);
  if (type === "array") return `[${(value as JsonValue[]).length}]`;
  if (type === "object") return `{${Object.keys(value!).length}}`;
  const text = JSON.stringify(value);
  return text.length > limit ? text.slice(0, limit) + "…" : text;
}

export function searchExplorerNodes(
  index: Extract<ExplorerIndex, { ok: true }>,
  query: string,
  type: JsonValueType | "all" = "all",
) {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  return Array.from(index.nodes.values()).filter((node) => {
    if (type !== "all" && node.type !== type) return false;
    const text =
      `${node.pointer} ${node.key} ${node.type === "array" || node.type === "object" ? "" : String(node.value)}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function createExplorerTable(value: JsonValue): ExplorerTable {
  if (!Array.isArray(value)) return { ok: false, issue: "not-array" };
  if (value.length > MAX_TABLE_ROWS) return { ok: false, issue: "row-limit" };
  const columns = new Set<string>();
  if (
    value.length &&
    value.every(
      (row) => row !== null && !Array.isArray(row) && typeof row === "object",
    )
  ) {
    for (const row of value) {
      for (const key of Object.keys(row!)) {
        columns.add(key);
        if (columns.size > MAX_TABLE_COLUMNS)
          return { ok: false, issue: "column-limit" };
      }
    }
  }
  return {
    ok: true,
    rows: value,
    columns: columns.size ? Array.from(columns) : [null],
  };
}

export function explorerCell(
  row: JsonValue,
  column: string | null,
): JsonValue | undefined {
  if (column === null) return row;
  return row !== null &&
    typeof row === "object" &&
    Object.prototype.hasOwnProperty.call(row, column)
    ? (row as Record<string, JsonValue>)[column]
    : undefined;
}

export function filterExplorerRows(
  table: Extract<ExplorerTable, { ok: true }>,
  columns: (string | null)[],
  query: string,
) {
  const search = query.trim().toLowerCase();
  const matches: { row: JsonValue; index: number }[] = [];
  table.rows.forEach((row, index) => {
    if (
      !search ||
      columns.some((column) => {
        const value = explorerCell(row, column);
        return (
          value !== undefined &&
          (typeof value === "string" ? value : JSON.stringify(value))
            .toLowerCase()
            .includes(search)
        );
      })
    ) {
      matches.push({ row, index });
    }
  });
  return matches;
}

function csvCell(value: JsonValue | undefined): string {
  let text =
    value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  text = text.replaceAll("\0", "");
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/u.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function exportExplorerCsv(
  table: Extract<ExplorerTable, { ok: true }>,
  columns: (string | null)[],
  query: string,
  valueLabel = "Value",
) {
  const selected = table.columns.filter((column) => columns.includes(column));
  const rows = filterExplorerRows(table, selected, query);
  return (
    "\uFEFF" +
    [
      [
        csvCell("#"),
        ...selected.map((column) => csvCell(column ?? valueLabel)),
      ].join(","),
      ...rows.map(({ row, index }) =>
        [
          csvCell(index),
          ...selected.map((column) => csvCell(explorerCell(row, column))),
        ].join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
