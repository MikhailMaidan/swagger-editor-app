import { parseTransformValue, type JsonValue } from "./api-transform";
import { getByteSize } from "./text-encoding";

export type { JsonValue };
export const MAX_RPC_FRAME_BYTES = 256 * 1024;
export const MAX_RPC_CONTRACT_BYTES = 1024 * 1024;
export const MAX_RPC_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_RPC_BATCH = 30;
export type RpcIssueCode =
  | "json"
  | "limit"
  | "contract"
  | "reference"
  | "project"
  | "request"
  | "url"
  | "headers"
  | "network"
  | "timeout"
  | "cancelled"
  | "mime";
export class RpcError extends Error {
  constructor(public code: RpcIssueCode) {
    super(code);
    this.name = "RpcError";
  }
}
export const rpcError = (e: unknown): RpcIssueCode =>
  e instanceof RpcError ? e.code : "network";
export const rpcObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const rpcText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
export const rpcOwn = (v: object, key: string) => Object.hasOwn(v, key);
export function rpcJson(source: string, max = MAX_RPC_FRAME_BYTES): JsonValue {
  if (!rpcText(source, max)) throw new RpcError("limit");
  try {
    return parseTransformValue(source);
  } catch {
    throw new RpcError("json");
  }
}
export function rpcUrl(value: unknown): string {
  try {
    if (!rpcText(value, 8192) || value !== value.trim()) throw 0;
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw 0;
    return url.href;
  } catch {
    throw new RpcError("url");
  }
}
export type RpcId = string | number | null;
export const rpcId = (v: unknown): v is RpcId =>
  v === null ||
  rpcText(v, 256) ||
  (typeof v === "number" && Number.isSafeInteger(v));
export const rpcIdKey = (v: RpcId): string =>
  `${typeof v}:${JSON.stringify(v)}`;
export type RpcFault = { code: number; message: string; data?: JsonValue };
export function rpcFault(value: unknown): value is RpcFault {
  return (
    rpcObject(value) &&
    typeof value.code === "number" &&
    Number.isSafeInteger(value.code) &&
    rpcText(value.message, 8192)
  );
}
export function equalRpcValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equalRpcValue(v, b[i]));
  if (rpcObject(a) && rpcObject(b))
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((k) => rpcOwn(b, k) && equalRpcValue(a[k], b[k]))
    );
  return false;
}
