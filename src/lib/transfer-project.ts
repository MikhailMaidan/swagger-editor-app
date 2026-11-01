import { getByteSize } from "./text-encoding";
export const MAX_TRANSFER_BYTES = 4 * 1024 * 1024;
export const MAX_TRANSFER_PROJECT = 6 * 1024 * 1024;
export const MAX_TRANSFER_WIRE = MAX_TRANSFER_BYTES + 65536;
export const TRANSFER_FAULTS = [
  "drop",
  "truncate",
  "corrupt",
  "wrong-range",
  "wrong-validator",
  "ignore-range",
] as const;
export type TransferFault = (typeof TRANSFER_FAULTS)[number];
export type TransferResource = {
  id: string;
  name: string;
  contentType: string;
  lastModified: string | null;
  dateStrong: boolean;
  ranges: boolean;
  base64: string;
};
export type TransferScenario = {
  id: string;
  name: string;
  resourceId: string;
  replacementId: string | null;
  switchAt: number;
  chunkSize: number;
  maxAttempts: number;
  faults: { at: number; kind: TransferFault }[];
  expect: {
    outcome: TransferOutcome;
    maxRejected: number;
    maxRestarts: number;
  } | null;
};
export type TransferOutcome = "complete" | "exhausted" | "integrity-failed";
export type TransferProject = {
  kind: "rsswag-transfer-project";
  version: 1;
  name: string;
  resources: TransferResource[];
  scenarios: TransferScenario[];
};
export type TransferCheckpoint = {
  kind: "rsswag-transfer-checkpoint";
  version: 1;
  etag: string;
  total: number;
  segments: { start: number; base64: string }[];
};
export class TransferError extends Error {
  constructor(
    public code:
      | "json"
      | "project"
      | "limit"
      | "bytes"
      | "crypto"
      | "packet"
      | "checkpoint"
      | "cancelled",
  ) {
    super(code);
    this.name = "TransferError";
  }
}
export const transferObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const transferInt = (
  v: unknown,
  min: number,
  max: number,
): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
const id = (v: unknown): v is string =>
  text(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
const named = (v: unknown): v is string => text(v, 120) && !!v.trim();
export const transferTag = (v: unknown): v is string =>
  typeof v === "string" && /^"sha256-[a-f0-9]{64}"$/.test(v);
export const transferType = (v: unknown): v is string =>
  text(v, 200) &&
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:;[ \t]*[A-Za-z0-9!#$&^_.+-]+=[A-Za-z0-9!#$&^_.+-]+)*$/.test(
    v,
  );
export function transferDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === 29 &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toUTCString() === value
  );
}
function list(v: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    throw new TransferError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new TransferError("project");
  return v;
}
function unique<T extends { id: string }>(v: T[]): T[] {
  if (new Set(v.map((x) => x.id)).size !== v.length)
    throw new TransferError("project");
  return v;
}
export function transferJson(
  source: string,
  max = MAX_TRANSFER_PROJECT,
): unknown {
  if (getByteSize(source) > max) throw new TransferError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new TransferError("json");
  }
}
export function encodeTransferBytes(bytes: Uint8Array): string {
  if (bytes.length > MAX_TRANSFER_WIRE) throw new TransferError("limit");
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export function decodeTransferBytes(
  value: unknown,
  max = MAX_TRANSFER_BYTES,
): Uint8Array {
  if (typeof value !== "string" || value.length > 4 * Math.ceil(max / 3))
    throw new TransferError("limit");
  if (value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new TransferError("bytes");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    throw new TransferError("bytes");
  }
  if (bytes.length > max) throw new TransferError("limit");
  if (encodeTransferBytes(bytes) !== value) throw new TransferError("bytes");
  return bytes;
}
export function readTransferBytes(
  source: string,
  format: "utf8" | "base64" | "hex",
): Uint8Array {
  if (getByteSize(source) > 3 * MAX_TRANSFER_BYTES)
    throw new TransferError("limit");
  let bytes: Uint8Array;
  if (format === "utf8") bytes = new TextEncoder().encode(source);
  else if (format === "base64")
    bytes = decodeTransferBytes(source.replace(/[ \t\r\n]/g, ""));
  else {
    const value = source.replace(/[ \t\r\n]/g, "");
    if (value.length % 2 || !/^[a-fA-F0-9]*$/.test(value))
      throw new TransferError("bytes");
    if (value.length > MAX_TRANSFER_BYTES * 2) throw new TransferError("limit");
    bytes = Uint8Array.from(value.match(/../g) ?? [], (p) => parseInt(p, 16));
  }
  if (bytes.length > MAX_TRANSFER_BYTES) throw new TransferError("limit");
  return bytes;
}
export function normalizeTransferResource(v: unknown): TransferResource {
  if (
    !transferObject(v) ||
    !id(v.id) ||
    !named(v.name) ||
    !transferType(v.contentType) ||
    !(v.lastModified === null || transferDate(v.lastModified)) ||
    typeof v.dateStrong !== "boolean" ||
    typeof v.ranges !== "boolean"
  )
    throw new TransferError("project");
  decodeTransferBytes(v.base64);
  return {
    id: v.id,
    name: v.name,
    contentType: v.contentType,
    lastModified: v.lastModified as string | null,
    dateStrong: v.dateStrong,
    ranges: v.ranges,
    base64: v.base64 as string,
  };
}
export function normalizeTransferProject(value: unknown): TransferProject {
  if (
    !transferObject(value) ||
    value.kind !== "rsswag-transfer-project" ||
    value.version !== 1 ||
    !named(value.name)
  )
    throw new TransferError("project");
  const resources = unique(
    list(value.resources, 1, 3).map(normalizeTransferResource),
  );
  if (
    resources.reduce((n, r) => n + decodeTransferBytes(r.base64).length, 0) >
    MAX_TRANSFER_BYTES
  )
    throw new TransferError("limit");
  const scenarios = unique(
    list(value.scenarios, 0, 12).map((s): TransferScenario => {
      if (
        !transferObject(s) ||
        !id(s.id) ||
        !named(s.name) ||
        !resources.some((r) => r.id === s.resourceId) ||
        !(
          s.replacementId === null ||
          resources.some((r) => r.id === s.replacementId)
        ) ||
        !transferInt(s.switchAt, 1, 200) ||
        !transferInt(s.chunkSize, 1, 1048576) ||
        !transferInt(s.maxAttempts, 1, 200)
      )
        throw new TransferError("project");
      const faults = list(s.faults, 0, 100).map((f) => {
        if (
          !transferObject(f) ||
          !transferInt(f.at, 1, 200) ||
          !TRANSFER_FAULTS.includes(f.kind as TransferFault)
        )
          throw new TransferError("project");
        return { at: f.at, kind: f.kind as TransferFault };
      });
      if (new Set(faults.map((f) => f.at)).size !== faults.length)
        throw new TransferError("project");
      const e = s.expect;
      if (!(
        e === null ||
        (transferObject(e) &&
          ["complete", "exhausted", "integrity-failed"].includes(
            e.outcome as string,
          ) &&
          transferInt(e.maxRejected, 0, 200) &&
          transferInt(e.maxRestarts, 0, 200))
      ))
        throw new TransferError("project");
      return {
        id: s.id,
        name: s.name,
        resourceId: s.resourceId as string,
        replacementId: s.replacementId as string | null,
        switchAt: s.switchAt,
        chunkSize: s.chunkSize,
        maxAttempts: s.maxAttempts,
        faults,
        expect:
          e === null
            ? null
            : {
                outcome: e.outcome as TransferOutcome,
                maxRejected: e.maxRejected as number,
                maxRestarts: e.maxRestarts as number,
              },
      };
    }),
  );
  const project: TransferProject = {
    kind: "rsswag-transfer-project",
    version: 1,
    name: value.name,
    resources,
    scenarios,
  };
  if (getByteSize(JSON.stringify(project)) > MAX_TRANSFER_PROJECT)
    throw new TransferError("limit");
  return project;
}
export const parseTransferProject = (source: string) =>
  normalizeTransferProject(transferJson(source));
export function serializeTransferProject(p: TransferProject): string {
  const project = normalizeTransferProject(p),
    pretty = JSON.stringify(project, null, 2);
  return getByteSize(pretty) <= MAX_TRANSFER_PROJECT
    ? pretty
    : JSON.stringify(project);
}
export function normalizeTransferCheckpoint(
  value: unknown,
): TransferCheckpoint {
  if (
    !transferObject(value) ||
    value.kind !== "rsswag-transfer-checkpoint" ||
    value.version !== 1 ||
    !transferTag(value.etag) ||
    !transferInt(value.total, 0, MAX_TRANSFER_BYTES)
  )
    throw new TransferError("checkpoint");
  const total = value.total;
  const segments = list(value.segments, 0, 200)
    .map((s) => {
      if (
        !transferObject(s) ||
        !transferInt(s.start, 0, Math.max(0, total - 1))
      )
        throw new TransferError("checkpoint");
      const bytes = decodeTransferBytes(s.base64);
      if (!bytes.length || s.start + bytes.length > total)
        throw new TransferError("checkpoint");
      return {
        start: s.start,
        base64: s.base64 as string,
        length: bytes.length,
      };
    })
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < segments.length; i++)
    if (segments[i - 1].start + segments[i - 1].length > segments[i].start)
      throw new TransferError("checkpoint");
  return {
    kind: "rsswag-transfer-checkpoint",
    version: 1,
    etag: value.etag,
    total,
    segments: segments.map(({ start, base64 }) => ({ start, base64 })),
  };
}
export function newTransferResource(id = "resource-1"): TransferResource {
  return {
    id,
    name: id,
    contentType: "application/octet-stream",
    lastModified: "Sun, 01 Nov 2026 12:00:00 GMT",
    dateStrong: false,
    ranges: true,
    base64: encodeTransferBytes(
      new TextEncoder().encode("RSSwag binary transfer demo\n".repeat(20)),
    ),
  };
}
export function newTransferScenario(
  resourceId = "resource-1",
  id = "scenario-1",
): TransferScenario {
  return {
    id,
    name: id,
    resourceId,
    replacementId: null,
    switchAt: 2,
    chunkSize: 128,
    maxAttempts: 30,
    faults: [],
    expect: null,
  };
}
export function emptyTransferProject(): TransferProject {
  return {
    kind: "rsswag-transfer-project",
    version: 1,
    name: "Resumable transfers",
    resources: [newTransferResource()],
    scenarios: [newTransferScenario()],
  };
}
