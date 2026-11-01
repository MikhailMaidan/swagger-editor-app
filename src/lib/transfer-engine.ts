import {
  MAX_TRANSFER_BYTES,
  MAX_TRANSFER_WIRE,
  TransferError,
  decodeTransferBytes,
  encodeTransferBytes,
  normalizeTransferResource,
  transferDate,
  transferInt,
  transferJson,
  transferObject,
  transferType,
  type TransferResource,
} from "./transfer-project";
export type ByteInterval = { start: number; end: number };
export type PreparedTransferResource = TransferResource & {
  bytes: Uint8Array;
  etag: string;
};
export type TransferRequest = {
  method: string;
  range: string | null;
  ifRange: string | null;
};
export type TransferResponse = {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  ranges: ByteInterval[];
  reason:
    | "full"
    | "head"
    | "ignored"
    | "validator"
    | "single"
    | "multipart"
    | "unsatisfiable"
    | "method";
};
export async function transferDigest(bytes: Uint8Array): Promise<string> {
  try {
    return Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    throw new TransferError("crypto");
  }
}
export async function prepareTransferResource(
  value: TransferResource,
): Promise<PreparedTransferResource> {
  const resource = normalizeTransferResource(value),
    bytes = decodeTransferBytes(resource.base64),
    etag = `"sha256-${await transferDigest(bytes)}"`;
  return { ...resource, bytes, etag };
}
const trimOws = (v: string) => v.replace(/^[ \t]+|[ \t]+$/g, "");
/** Invalid/unsupported/bounded-out ranges are ignored. Valid all-unsatisfiable ranges give 416.
 * Empty resources ignore Range. Large decimal values are compared as BigInt before clamping. */
export function parseTransferRanges(
  header: string | null,
  length: number,
): { kind: "ignored" | "ranges" | "unsatisfiable"; ranges: ByteInterval[] } {
  const ignored = { kind: "ignored" as const, ranges: [] };
  if (!transferInt(length, 0, MAX_TRANSFER_BYTES))
    throw new TransferError("limit");
  if (
    header === null ||
    !length ||
    typeof header !== "string" ||
    header.length > 4096 ||
    /[^\t\x20-\x7e]/.test(header)
  )
    return ignored;
  const matched = /^bytes=(.*)$/i.exec(trimOws(header));
  if (!matched) return ignored;
  const members = matched[1].split(",").map(trimOws).filter(Boolean);
  if (!members.length || members.length > 16) return ignored;
  const n = BigInt(length),
    found: (ByteInterval & { order: number })[] = [];
  for (let order = 0; order < members.length; order++) {
    const m = /^(\d{1,80})?-(\d{1,80})?$/.exec(members[order]);
    if (!m || (!m[1] && !m[2])) return ignored;
    if (!m[1]) {
      const count = BigInt(m[2]);
      if (count === BigInt(0)) continue;
      found.push({
        start: count >= n ? 0 : Number(n - count),
        end: length - 1,
        order,
      });
    } else {
      const start = BigInt(m[1]),
        end = m[2] ? BigInt(m[2]) : n - BigInt(1);
      if (m[2] && end < start) return ignored;
      if (start >= n) continue;
      found.push({
        start: Number(start),
        end: Number(end >= n ? n - BigInt(1) : end),
        order,
      });
    }
  }
  if (!found.length) return { kind: "unsatisfiable", ranges: [] };
  const merged: typeof found = [];
  for (const range of found.sort((a, b) => a.start - b.start)) {
    const prev = merged.at(-1);
    if (prev && range.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, range.end);
      prev.order = Math.min(prev.order, range.order);
    } else merged.push({ ...range });
  }
  return {
    kind: "ranges",
    ranges: merged
      .sort((a, b) => a.order - b.order)
      .map(({ start, end }) => ({ start, end })),
  };
}
export function transferIfRangeMatches(
  value: string,
  resource: PreparedTransferResource,
): boolean {
  const v = trimOws(value);
  if (v === resource.etag) return true;
  return (
    resource.dateStrong &&
    resource.lastModified !== null &&
    transferDate(v) &&
    v === resource.lastModified
  );
}
const ascii = (value: string) => new TextEncoder().encode(value);
function joinBytes(pieces: Uint8Array[]): Uint8Array {
  const length = pieces.reduce((n, p) => n + p.length, 0);
  if (length > MAX_TRANSFER_WIRE) throw new TransferError("limit");
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of pieces) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
function indexOfBytes(
  haystack: Uint8Array,
  needle: Uint8Array,
  start = 0,
): number {
  outer: for (let i = start; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++)
      if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
export function serveTransferBytes(
  resource: PreparedTransferResource,
  request: TransferRequest,
): TransferResponse {
  const { bytes } = resource,
    headers: Record<string, string> = {
      "Accept-Ranges": resource.ranges ? "bytes" : "none",
      ETag: resource.etag,
      "Content-Type": resource.contentType,
    };
  if (resource.lastModified) headers["Last-Modified"] = resource.lastModified;
  const response = (
    status: number,
    body: Uint8Array,
    ranges: ByteInterval[],
    reason: TransferResponse["reason"],
  ): TransferResponse => ({
    status,
    headers: { ...headers, "Content-Length": String(body.length) },
    body,
    ranges,
    reason,
  });
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.Allow = "GET, HEAD";
    return response(405, new Uint8Array(), [], "method");
  }
  if (request.method === "HEAD")
    return {
      ...response(200, new Uint8Array(), [], "head"),
      headers: { ...headers, "Content-Length": String(bytes.length) },
    };
  const full = (reason: TransferResponse["reason"]) =>
    response(200, bytes.slice(), [], reason);
  if (!resource.ranges || request.range === null || !bytes.length)
    return full("full");
  if (
    request.ifRange !== null &&
    !transferIfRangeMatches(request.ifRange, resource)
  )
    return full("validator");
  const parsed = parseTransferRanges(request.range, bytes.length);
  if (parsed.kind === "ignored") return full("ignored");
  if (parsed.kind === "unsatisfiable") {
    headers["Content-Range"] = `bytes */${bytes.length}`;
    return response(416, new Uint8Array(), [], "unsatisfiable");
  }
  const ranges = parsed.ranges;
  if (ranges.length === 1) {
    const r = ranges[0];
    headers["Content-Range"] = `bytes ${r.start}-${r.end}/${bytes.length}`;
    return response(206, bytes.slice(r.start, r.end + 1), ranges, "single");
  }
  let boundary = "";
  for (let i = 0; i < 64; i++) {
    const candidate = `rsswag_${resource.etag.slice(8, 40)}_${i}`;
    if (indexOfBytes(bytes, ascii(candidate)) < 0) {
      boundary = candidate;
      break;
    }
  }
  if (!boundary) return full("ignored");
  headers["Content-Type"] = `multipart/byteranges; boundary=${boundary}`;
  const parts = ranges.flatMap((r) => [
    ascii(
      `--${boundary}\r\nContent-Type: ${resource.contentType}\r\nContent-Range: bytes ${r.start}-${r.end}/${bytes.length}\r\n\r\n`,
    ),
    bytes.slice(r.start, r.end + 1),
    ascii("\r\n"),
  ]);
  parts.push(ascii(`--${boundary}--\r\n`));
  return response(206, joinBytes(parts), ranges, "multipart");
}
export type TransferPacket = {
  kind: "rsswag-range-response";
  version: 1;
  method: "GET" | "HEAD";
  status: number;
  headers: Record<string, string>;
  base64: string;
};
export type InspectedTransferPart = ByteInterval & {
  total: number;
  contentType: string;
  bytes: Uint8Array;
};
export type InspectedTransferPacket = {
  status: number;
  total: number | null;
  parts: InspectedTransferPart[];
  body: Uint8Array;
  multipart: boolean;
  headers: Record<string, string>;
};
export function transferPacket(
  response: TransferResponse,
  method: "GET" | "HEAD" = "GET",
): TransferPacket {
  return {
    kind: "rsswag-range-response",
    version: 1,
    method,
    status: response.status,
    headers: { ...response.headers },
    base64: encodeTransferBytes(response.body),
  };
}
function contentRange(value: string): ByteInterval & { total: number } {
  const m = /^bytes (\d{1,16})-(\d{1,16})\/(\d{1,16})$/.exec(value);
  if (!m) throw new TransferError("packet");
  const [start, end, total] = m.slice(1).map(Number);
  if (
    !transferInt(total, 1, MAX_TRANSFER_BYTES) ||
    !transferInt(start, 0, total - 1) ||
    !transferInt(end, start, total - 1)
  )
    throw new TransferError("packet");
  return { start, end, total };
}
export function inspectTransferPacket(value: unknown): InspectedTransferPacket {
  if (
    !transferObject(value) ||
    value.kind !== "rsswag-range-response" ||
    value.version !== 1 ||
    !["GET", "HEAD"].includes(value.method as string) ||
    !transferInt(value.status, 100, 599) ||
    !transferObject(value.headers)
  )
    throw new TransferError("packet");
  if (Object.keys(value.headers).length > 32) throw new TransferError("limit");
  const headers: Record<string, string> = Object.create(null);
  for (const [key, v] of Object.entries(value.headers)) {
    const k = key.toLowerCase();
    if (
      !/^[A-Za-z0-9-]{1,80}$/.test(key) ||
      typeof v !== "string" ||
      v.length > 4096 ||
      /[^\t\x20-\x7e]/.test(v) ||
      Object.hasOwn(headers, k)
    )
      throw new TransferError("packet");
    headers[k] = v;
  }
  const body = decodeTransferBytes(value.base64, MAX_TRANSFER_WIRE),
    status = value.status;
  const length = headers["content-length"];
  if (
    length !== undefined &&
    (!/^\d{1,16}$/.test(length) ||
      !transferInt(Number(length), 0, MAX_TRANSFER_WIRE))
  )
    throw new TransferError("packet");
  if (value.method === "HEAD") {
    if (
      body.length ||
      status !== 200 ||
      (length !== undefined && Number(length) > MAX_TRANSFER_BYTES)
    )
      throw new TransferError("packet");
    return {
      status,
      total: length === undefined ? null : Number(length),
      parts: [],
      body,
      multipart: false,
      headers,
    };
  }
  if (length !== undefined && Number(length) !== body.length)
    throw new TransferError("packet");
  if (
    headers["content-encoding"] &&
    headers["content-encoding"].toLowerCase() !== "identity"
  )
    throw new TransferError("packet");
  if (status === 200) {
    if (
      body.length > MAX_TRANSFER_BYTES ||
      headers["content-range"] !== undefined
    )
      throw new TransferError("packet");
    return {
      status,
      total: body.length,
      parts: [],
      body,
      multipart: false,
      headers,
    };
  }
  if (status === 416) {
    const m = /^bytes \*\/(\d{1,16})$/.exec(headers["content-range"] ?? "");
    if (!m || !transferInt(Number(m[1]), 0, MAX_TRANSFER_BYTES))
      throw new TransferError("packet");
    return {
      status,
      total: Number(m[1]),
      parts: [],
      body,
      multipart: false,
      headers,
    };
  }
  if (status !== 206) throw new TransferError("packet");
  const type = headers["content-type"] ?? "";
  if (!/^multipart\/byteranges(?:;|$)/i.test(type)) {
    const r = contentRange(headers["content-range"] ?? "");
    if (body.length !== r.end - r.start + 1 || !transferType(type))
      throw new TransferError("packet");
    return {
      status,
      total: r.total,
      parts: [{ ...r, contentType: type, bytes: body.slice() }],
      body,
      multipart: false,
      headers,
    };
  }
  if (headers["content-range"] !== undefined) throw new TransferError("packet");
  const m =
    /^multipart\/byteranges;[ \t]*boundary=(?:"([A-Za-z0-9_-]{1,70})"|([A-Za-z0-9_-]{1,70}))$/i.exec(
      type,
    );
  if (!m) throw new TransferError("packet");
  const boundary = m[1] ?? m[2],
    marker = ascii(`--${boundary}`),
    separator = ascii("\r\n\r\n"),
    parts: InspectedTransferPart[] = [];
  let at = 0,
    total: number | null = null;
  while (true) {
    if (indexOfBytes(body, marker, at) !== at)
      throw new TransferError("packet");
    at += marker.length;
    if (body[at] === 45 && body[at + 1] === 45) {
      at += 2;
      if (body[at] === 13 && body[at + 1] === 10) at += 2;
      if (at !== body.length || !parts.length)
        throw new TransferError("packet");
      break;
    }
    if (body[at++] !== 13 || body[at++] !== 10 || parts.length >= 16)
      throw new TransferError("packet");
    const end = indexOfBytes(body, separator, at);
    if (end < at || end - at > 1024) throw new TransferError("packet");
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        body.slice(at, end),
      );
    } catch {
      throw new TransferError("packet");
    }
    const fields: Record<string, string> = Object.create(null);
    for (const line of text.split("\r\n")) {
      const i = line.indexOf(":"),
        key = line.slice(0, i).toLowerCase(),
        v = trimOws(line.slice(i + 1));
      if (
        i < 1 ||
        !["content-range", "content-type"].includes(key) ||
        Object.hasOwn(fields, key) ||
        /[^\x20-\x7e]/.test(v)
      )
        throw new TransferError("packet");
      fields[key] = v;
    }
    const r = contentRange(fields["content-range"] ?? "");
    if (
      !transferType(fields["content-type"]) ||
      (total !== null && total !== r.total)
    )
      throw new TransferError("packet");
    total = r.total;
    at = end + 4;
    const length = r.end - r.start + 1;
    if (at + length + 2 > body.length) throw new TransferError("packet");
    const bytes = body.slice(at, at + length);
    if (indexOfBytes(bytes, ascii(`\r\n--${boundary}`)) >= 0)
      throw new TransferError("packet");
    parts.push({ ...r, contentType: fields["content-type"], bytes });
    at += length;
    if (body[at++] !== 13 || body[at++] !== 10)
      throw new TransferError("packet");
  }
  return { status, total, parts, body, multipart: true, headers };
}
export const parseTransferPacket = (source: string) =>
  inspectTransferPacket(transferJson(source));
