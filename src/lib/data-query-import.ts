import { getByteSize } from "./text-encoding";
import {
  DataQueryError,
  MAX_DQ_IMPORT,
  dqObject,
  dqPointer,
  dqText,
  dqList,
  parseDqJson,
  normalizeDqRows,
  type DQRecord,
  type DQJson,
} from "./data-query-model";
import { dqResolve } from "./data-query-engine";

export type DQImportMode = "records" | "values";
export function extractDqRows(
  value: unknown,
  pointer = "",
  mode: DQImportMode = "records",
): DQRecord[] {
  if (!dqPointer(pointer) || !["records", "values"].includes(mode))
    throw new DataQueryError("import");
  // JSON source is bounded before traversal; row normalization validates the extracted values.
  const cell = dqResolve(value as DQJson, pointer);
  if (!cell.found) throw new DataQueryError("reference");
  const values = dqList(
    Array.isArray(cell.value) ? cell.value : [cell.value],
    2000,
  );
  return normalizeDqRows(
    mode === "values" ? values.map((value) => ({ value })) : values,
  );
}
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false,
    start = true;
  function cell() {
    if (row.length >= 64) throw new DataQueryError("limit");
    row.push(field);
    field = "";
    closed = false;
    start = true;
  }
  function end() {
    cell();
    if (rows.length > 2000) throw new DataQueryError("limit");
    rows.push(row);
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
      continue;
    }
    if (closed && c !== "," && c !== "\r" && c !== "\n")
      throw new DataQueryError("import");
    if (c === '"') {
      if (!start) throw new DataQueryError("import");
      quoted = true;
      start = false;
    } else if (c === ",") cell();
    else if (c === "\r" || c === "\n") {
      end();
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += c;
      start = false;
    }
  }
  if (quoted) throw new DataQueryError("import");
  if (field.length || row.length || closed) end();
  return rows;
}
export function importDqText(
  text: string,
  format: "json" | "ndjson" | "csv",
  pointer = "",
  mode: DQImportMode = "records",
): DQRecord[] {
  if (getByteSize(text) > MAX_DQ_IMPORT) throw new DataQueryError("limit");
  text = text.replace(/^\uFEFF/, "");
  if (format === "json")
    return extractDqRows(parseDqJson(text, MAX_DQ_IMPORT), pointer, mode);
  if (format === "ndjson") {
    const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim());
    if (lines.length > 2000) throw new DataQueryError("limit");
    const rows: DQRecord[] = [];
    for (const line of lines) {
      const next = extractDqRows(
        parseDqJson(line, MAX_DQ_IMPORT),
        pointer,
        mode,
      );
      if (rows.length + next.length > 2000) throw new DataQueryError("limit");
      rows.push(...next);
    }
    return normalizeDqRows(rows);
  }
  if (format !== "csv" || pointer !== "" || mode !== "records")
    throw new DataQueryError("import");
  const [header, ...rows] = csvRows(text);
  if (
    !header ||
    header.some((h) => !dqText(h, 80)) ||
    new Set(header).size !== header.length
  )
    throw new DataQueryError("import");
  return normalizeDqRows(
    rows.map((row) => {
      if (row.length !== header.length) throw new DataQueryError("import");
      return Object.fromEntries(header.map((h, i) => [h, row[i]]));
    }),
  );
}
export type DQHarEntry = { index: number; label: string; value: DQJson };
export function readDqHar(text: string): {
  entries: DQHarEntry[];
  skipped: number;
} {
  const value = parseDqJson(text, MAX_DQ_IMPORT);
  if (!dqObject(value) || !dqObject(value.log))
    throw new DataQueryError("import");
  const entries: DQHarEntry[] = [];
  let skipped = 0;
  dqList(value.log.entries, 500).forEach((entry, index) => {
    try {
      if (
        !dqObject(entry) ||
        !dqObject(entry.response) ||
        !dqObject(entry.response.content)
      )
        throw new DataQueryError("import");
      const content = entry.response.content;
      if (typeof content.text !== "string") throw new DataQueryError("import");
      const mediaType = String(content.mimeType ?? "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (
        mediaType !== "application/json" &&
        !/^[^/]+\/[^/]+\+json$/.test(mediaType)
      )
        throw new DataQueryError("import");
      let source = content.text;
      if (content.encoding === "base64") {
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            source,
          )
        )
          throw new DataQueryError("import");
        source = new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(atob(source), (c) => c.charCodeAt(0)),
        );
      } else if (content.encoding !== undefined && content.encoding !== "")
        throw new DataQueryError("import");
      const request = dqObject(entry.request) ? entry.request : {};
      entries.push({
        index,
        label: `${String(request.method ?? "GET").slice(0, 16)} ${String(request.url ?? "").slice(0, 300)} (${String(entry.response.status ?? "")})`,
        value: parseDqJson(source, MAX_DQ_IMPORT) as DQJson,
      });
    } catch {
      skipped++;
    }
  });
  return { entries, skipped };
}
export function dqDatasetInventory(rows: DQRecord[]) {
  const fields = new Map<
    string,
    { pointer: string; kinds: Set<string>; present: number }
  >();
  let truncated = false;
  function visit(value: DQJson, pointer: string, depth: number) {
    if (pointer) {
      let field = fields.get(pointer);
      if (!field) {
        if (fields.size >= 256) {
          truncated = true;
          return;
        }
        field = { pointer, kinds: new Set(), present: 0 };
        fields.set(pointer, field);
      }
      field.present++;
      field.kinds.add(
        value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
      );
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      if (depth >= 8) {
        if (Object.keys(value).length) truncated = true;
        return;
      }
      for (const [key, item] of Object.entries(value))
        visit(
          item,
          `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
          depth + 1,
        );
    }
  }
  rows.forEach((row) => visit(row, "", 0));
  return {
    fields: [...fields.values()].map((f) => ({
      pointer: f.pointer,
      kinds: [...f.kinds].sort(),
      present: f.present,
      missing: rows.length - f.present,
    })),
    truncated,
  };
}
export function exportDqCsv(rows: DQRecord[]) {
  const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  if (fields.length > 128) throw new DataQueryError("limit");
  const cell = (value: DQJson | undefined) => {
    let text =
      value === undefined
        ? ""
        : typeof value === "string"
          ? value
          : JSON.stringify(value);
    text = text.replace(/\u0000/g, "");
    if (/^[\t\r\n ]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [
    fields.map(cell).join(","),
    ...rows.map((r) =>
      fields.map((f) => cell(Object.hasOwn(r, f) ? r[f] : undefined)).join(","),
    ),
  ].join("\r\n");
}
