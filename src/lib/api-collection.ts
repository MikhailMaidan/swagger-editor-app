import {
  parseTransformPointer,
  parseTransformValue,
  type JsonValue,
} from "./api-transform";
import {
  validateResponseAssertion,
  type ResponseAssertion,
} from "./response-assertions";
import { getByteSize } from "./text-encoding";

export const MAX_COLLECTION_BYTES = 2 * 1024 * 1024;
export const MAX_COLLECTION_PAGE_BYTES = 512 * 1024;
export const MAX_COLLECTION_RECORDS = 5000;
export const MAX_COLLECTION_PLANS = 10;
export const MAX_COLLECTION_FIXTURES = 40;
export const COLLECTION_STRATEGIES = [
  "link",
  "next-url",
  "cursor",
  "page",
  "offset",
] as const;
export type CollectionStrategy = (typeof COLLECTION_STRATEGIES)[number];
export type CollectionIssue =
  | "project"
  | "plan"
  | "fixture"
  | "pointer"
  | "headers"
  | "url"
  | "origin"
  | "loop"
  | "status"
  | "content-type"
  | "json"
  | "items"
  | "cursor"
  | "identity"
  | "duplicate"
  | "max-pages"
  | "max-records"
  | "max-bytes"
  | "timeout"
  | "cancelled"
  | "network"
  | "link";
export class CollectionError extends Error {
  constructor(public code: CollectionIssue) {
    super(code);
  }
}
export const collectionError = (e: unknown) =>
  e instanceof CollectionError ? e : new CollectionError("network");
export type CollectionPlan = {
  id: string;
  name: string;
  url: string;
  strategy: CollectionStrategy;
  itemsPointer: string;
  nextPointer: string;
  parameter: string;
  sizeParameter: string;
  start: number;
  pageSize: number;
  stopOnShortPage: boolean;
  identityPointer: string;
  deduplicate: "none" | "first" | "last" | "error";
  maxPages: number;
  maxRecords: number;
  maxBytes: number;
  requestTimeoutMs: number;
  durationMs: number;
  intervalMs: number;
  minRecords: number;
  expectedMaxRecords: number;
  maxDuplicates: number;
  assertions: ResponseAssertion[];
};
export type CollectionFixture = {
  id: string;
  name: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
};
export type CollectionProject = {
  kind: "rsswag-collection-project";
  version: 1;
  name: string;
  plans: CollectionPlan[];
  fixtures: CollectionFixture[];
};

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 4096): v is string =>
  typeof v === "string" && v.length <= max;
const named = (v: unknown): v is string => str(v, 120) && !!v.trim();
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
export function collectionUrl(source: string, base?: string): string {
  try {
    if (!str(source, 8192) || !source.trim()) throw 0;
    const url = new URL(source, base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw 0;
    url.hash = "";
    if (url.href.length > 8192) throw 0;
    return url.href;
  } catch {
    throw new CollectionError("url");
  }
}
export function collectionUrlKey(url: string): string {
  const parsed = new URL(collectionUrl(url));
  parsed.searchParams.sort();
  return parsed.href;
}
export function collectionPointer(pointer: string): string[] {
  try {
    return parseTransformPointer(pointer);
  } catch {
    throw new CollectionError("pointer");
  }
}
export function collectionValue(
  value: JsonValue,
  pointer: string,
): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const key of collectionPointer(pointer)) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    )
      return undefined;
    if (Array.isArray(current) && !/^(0|[1-9]\d*)$/.test(key)) return undefined;
    current = (current as Record<string, JsonValue>)[key];
  }
  return current;
}
export function parseCollectionJson(source: string): JsonValue {
  try {
    return parseTransformValue(source);
  } catch {
    throw new CollectionError("json");
  }
}
export function normalizeCollectionPlan(v: unknown): CollectionPlan {
  if (
    !object(v) ||
    !named(v.id) ||
    !named(v.name) ||
    !str(v.url, 8192) ||
    !COLLECTION_STRATEGIES.includes(v.strategy as CollectionStrategy) ||
    !str(v.itemsPointer, 512) ||
    !str(v.nextPointer, 512) ||
    !str(v.identityPointer, 512) ||
    !str(v.parameter, 120) ||
    !str(v.sizeParameter, 120) ||
    !["none", "first", "last", "error"].includes(v.deduplicate as string) ||
    typeof v.stopOnShortPage !== "boolean" ||
    !integer(v.start, 0, 1_000_000_000) ||
    !integer(v.pageSize, 1, 1000) ||
    !integer(v.maxPages, 1, 100) ||
    !integer(v.maxRecords, 1, MAX_COLLECTION_RECORDS) ||
    !integer(v.maxBytes, 1, MAX_COLLECTION_BYTES) ||
    !integer(v.requestTimeoutMs, 100, 30000) ||
    !integer(v.durationMs, 100, 120000) ||
    !integer(v.intervalMs, 0, 5000) ||
    !integer(v.minRecords, 0, MAX_COLLECTION_RECORDS) ||
    !integer(v.expectedMaxRecords, 0, MAX_COLLECTION_RECORDS) ||
    v.minRecords > v.expectedMaxRecords ||
    !integer(v.maxDuplicates, 0, MAX_COLLECTION_RECORDS) ||
    !Array.isArray(v.assertions) ||
    v.assertions.length > 20
  )
    throw new CollectionError("plan");
  const strategy = v.strategy as CollectionStrategy;
  if (
    ["cursor", "page", "offset"].includes(strategy) &&
    (!v.parameter.trim() || v.parameter === v.sizeParameter)
  )
    throw new CollectionError("plan");
  const url = collectionUrl(v.url);
  collectionPointer(v.itemsPointer);
  collectionPointer(v.nextPointer);
  collectionPointer(v.identityPointer);
  const assertions = v.assertions.map((rule) => {
    if (
      !object(rule) ||
      rule.target !== "body" ||
      validateResponseAssertion(rule as ResponseAssertion)
    )
      throw new CollectionError("plan");
    return {
      name: rule.name,
      target: "body",
      path: rule.path,
      operator: rule.operator,
      expected: rule.expected,
    } as ResponseAssertion;
  });
  return {
    id: v.id,
    name: v.name,
    url,
    strategy,
    itemsPointer: v.itemsPointer,
    nextPointer: v.nextPointer,
    parameter: v.parameter,
    sizeParameter: v.sizeParameter,
    start: v.start,
    pageSize: v.pageSize,
    stopOnShortPage: v.stopOnShortPage,
    identityPointer: v.identityPointer,
    deduplicate: v.deduplicate as CollectionPlan["deduplicate"],
    maxPages: v.maxPages,
    maxRecords: v.maxRecords,
    maxBytes: v.maxBytes,
    requestTimeoutMs: v.requestTimeoutMs,
    durationMs: v.durationMs,
    intervalMs: v.intervalMs,
    minRecords: v.minRecords,
    expectedMaxRecords: v.expectedMaxRecords,
    maxDuplicates: v.maxDuplicates,
    assertions,
  };
}
export function parseCollectionHeaders(source: string): Record<string, string> {
  if (getByteSize(source) > 16384) throw new CollectionError("headers");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new CollectionError("headers");
  }
  if (!object(value) || Object.keys(value).length > 40)
    throw new CollectionError("headers");
  const entries: [string, string][] = [],
    names = new Set<string>();
  for (const [name, text] of Object.entries(value)) {
    const lower = name.toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~\w-]+$/.test(name) ||
      !str(text, 8192) ||
      /[\r\n\0]/.test(text) ||
      names.has(lower) ||
      /^(cookie|set-cookie|host|origin|referer|connection|content-length|transfer-encoding|upgrade|proxy-.*|sec-.*)$/i.test(
        name,
      )
    )
      throw new CollectionError("headers");
    names.add(lower);
    entries.push([name, text]);
  }
  try {
    new Headers(entries);
  } catch {
    throw new CollectionError("headers");
  }
  return Object.fromEntries(entries);
}
export function normalizeCollectionFixture(v: unknown): CollectionFixture {
  if (
    !object(v) ||
    !named(v.id) ||
    !named(v.name) ||
    !str(v.url, 8192) ||
    !integer(v.status, 100, 599) ||
    !object(v.headers) ||
    !str(v.body, MAX_COLLECTION_PAGE_BYTES) ||
    getByteSize(v.body) > MAX_COLLECTION_PAGE_BYTES
  )
    throw new CollectionError("fixture");
  const names = new Set<string>();
  const headers = Object.fromEntries(
    Object.entries(v.headers)
      .filter(([key]) => ["content-type", "link"].includes(key.toLowerCase()))
      .map(([key, value]) => {
        const name = key.toLowerCase();
        if (!str(value, 16384) || /[\r\n\0]/.test(value) || names.has(name))
          throw new CollectionError("fixture");
        names.add(name);
        return [name, value];
      }),
  );
  // Store response navigation metadata only; credential and cookie headers are discarded.
  return {
    id: v.id,
    name: v.name,
    url: collectionUrl(v.url),
    status: v.status,
    headers,
    body: v.body,
  };
}
export function normalizeCollectionProject(v: unknown): CollectionProject {
  if (
    !object(v) ||
    v.kind !== "rsswag-collection-project" ||
    v.version !== 1 ||
    !named(v.name) ||
    !Array.isArray(v.plans) ||
    !v.plans.length ||
    v.plans.length > MAX_COLLECTION_PLANS ||
    !Array.isArray(v.fixtures) ||
    v.fixtures.length > MAX_COLLECTION_FIXTURES
  )
    throw new CollectionError("project");
  const plans = v.plans.map(normalizeCollectionPlan),
    fixtures = v.fixtures.map(normalizeCollectionFixture);
  if (
    new Set(plans.map((p) => p.id)).size !== plans.length ||
    new Set(fixtures.map((f) => f.id)).size !== fixtures.length ||
    new Set(fixtures.map((f) => collectionUrlKey(f.url))).size !==
      fixtures.length
  )
    throw new CollectionError("project");
  return {
    kind: "rsswag-collection-project",
    version: 1,
    name: v.name,
    plans,
    fixtures,
  };
}
export function parseCollectionProject(source: string): CollectionProject {
  if (getByteSize(source) > MAX_COLLECTION_BYTES)
    throw new CollectionError("max-bytes");
  return normalizeCollectionProject(parseCollectionJson(source));
}
export function serializeCollectionProject(project: CollectionProject): string {
  const source =
    JSON.stringify(normalizeCollectionProject(project), null, 2) + "\n";
  if (getByteSize(source) > MAX_COLLECTION_BYTES)
    throw new CollectionError("max-bytes");
  return source;
}

// Split only outside quoted parameter values and URI references (RFC 8288).
function splitLink(source: string, separator: string): string[] {
  const result: string[] = [];
  let start = 0,
    quote = false,
    angle = false,
    escape = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (quote && c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"' && !angle) quote = !quote;
    else if (!quote && c === "<") angle = true;
    else if (!quote && c === ">") angle = false;
    else if (!quote && !angle && c === separator) {
      result.push(source.slice(start, i));
      start = i + 1;
    }
  }
  if (quote || angle || escape) throw new CollectionError("link");
  result.push(source.slice(start));
  return result;
}
export function collectionNextLink(header: string): string | null {
  if (!header.trim()) return null;
  if (header.length > 16384) throw new CollectionError("link");
  const next: string[] = [];
  for (const part of splitLink(header, ",")) {
    const match = /^\s*<([^<>]*)>(.*)$/.exec(part);
    if (!match) throw new CollectionError("link");
    let rel: string | undefined,
      anchored = false;
    for (const param of splitLink(match[2], ";")) {
      if (!param.trim()) continue;
      const pair =
        /^\s*([^\s=]+)(?:\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s";]+)))?\s*$/.exec(
          param,
        );
      if (!pair) throw new CollectionError("link");
      const name = pair[1].toLowerCase(),
        value =
          pair[2] === undefined ? pair[3] : pair[2].replace(/\\(.)/g, "$1");
      if (value === undefined && ["rel", "anchor"].includes(name))
        throw new CollectionError("link");
      if (name === "rel" && rel === undefined) rel = value;
      if (name === "anchor") anchored = true;
    }
    // An anchor changes the context resource; this client does not apply it.
    if (!anchored && rel?.toLowerCase().split(/\s+/).includes("next"))
      next.push(match[1]);
  }
  if (next.length > 1) throw new CollectionError("link");
  return next[0] ?? null;
}
export function collectionStartUrl(plan: CollectionPlan): string {
  const url = new URL(plan.url);
  if (["page", "offset"].includes(plan.strategy))
    url.searchParams.set(plan.parameter, String(plan.start));
  if (
    plan.sizeParameter &&
    ["page", "offset", "cursor"].includes(plan.strategy)
  )
    url.searchParams.set(plan.sizeParameter, String(plan.pageSize));
  return url.href;
}
export function collectionNextUrl(
  plan: CollectionPlan,
  current: string,
  body: JsonValue,
  headers: Record<string, string>,
  itemCount: number,
  pageIndex: number,
): string | null {
  let reference: string | null = null;
  if (plan.strategy === "link")
    reference = collectionNextLink(headers.link ?? "");
  else if (plan.strategy === "next-url") {
    const value = collectionValue(body, plan.nextPointer);
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") throw new CollectionError("cursor");
    reference = value;
  } else if (plan.strategy === "cursor") {
    const value = collectionValue(body, plan.nextPointer);
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" && typeof value !== "number")
      throw new CollectionError("cursor");
    const url = new URL(current);
    url.searchParams.set(plan.parameter, String(value));
    reference = url.href;
  } else {
    if (!itemCount || (plan.stopOnShortPage && itemCount < plan.pageSize))
      return null;
    const url = new URL(current);
    url.searchParams.set(
      plan.parameter,
      String(
        plan.start + pageIndex * (plan.strategy === "page" ? 1 : plan.pageSize),
      ),
    );
    reference = url.href;
  }
  if (reference === null) return null;
  const next = collectionUrl(reference === "" ? current : reference, current);
  if (new URL(next).origin !== new URL(plan.url).origin)
    throw new CollectionError("origin");
  return next;
}

export function defaultCollectionPlan(id = "starter"): CollectionPlan {
  return {
    id,
    name: "New collection",
    url: "https://api.example/items",
    strategy: "next-url",
    itemsPointer: "/items",
    nextPointer: "/next",
    parameter: "cursor",
    sizeParameter: "",
    start: 1,
    pageSize: 100,
    stopOnShortPage: true,
    identityPointer: "/id",
    deduplicate: "first",
    maxPages: 20,
    maxRecords: 1000,
    maxBytes: MAX_COLLECTION_BYTES,
    requestTimeoutMs: 10000,
    durationMs: 60000,
    intervalMs: 0,
    minRecords: 1,
    expectedMaxRecords: 5000,
    maxDuplicates: 5000,
    assertions: [],
  };
}
export const emptyCollectionProject = (): CollectionProject => ({
  kind: "rsswag-collection-project",
  version: 1,
  name: "API collections",
  plans: [defaultCollectionPlan()],
  fixtures: [],
});
export function demoCollectionProject(): CollectionProject {
  const fixtures: CollectionFixture[] = [],
    plans: CollectionPlan[] = [];
  for (const strategy of COLLECTION_STRATEGIES) {
    const base = `https://collection.example/${strategy}`,
      size = 2;
    const plan = {
      ...defaultCollectionPlan(strategy),
      name: `${strategy} pagination`,
      url: base,
      strategy,
      parameter:
        strategy === "page"
          ? "page"
          : strategy === "offset"
            ? "offset"
            : "cursor",
      sizeParameter: ["cursor", "page", "offset"].includes(strategy)
        ? "limit"
        : "",
      pageSize: size,
      start: strategy === "offset" ? 0 : 1,
      minRecords: 3,
      expectedMaxRecords: 3,
      maxDuplicates: 1,
      assertions: [
        {
          name: "Item ID exists",
          target: "body" as const,
          path: "/id",
          operator: "exists" as const,
          expected: "",
        },
      ],
    };
    plans.push(plan);
    let url = collectionStartUrl(plan);
    for (let index = 1; index <= 3; index++) {
      const items =
        index === 1
          ? [
              { id: 1, name: "Atlas" },
              { id: 2, name: "Birch" },
            ]
          : index === 2
            ? [
                { id: 2, name: "Birch updated" },
                { id: 3, name: "Cedar" },
              ]
            : [];
      const next = index < 3 ? `${base}?part=${index + 1}` : null;
      const body = {
        items,
        next:
          strategy === "cursor"
            ? index < 3
              ? `token-${index + 1}`
              : null
            : next,
      };
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (strategy === "link" && next)
        headers.link = `<${next}>; rel="next"; title="Page, ${index + 1}"`;
      fixtures.push({
        id: `${strategy}-${index}`,
        name: `${strategy} page ${index}`,
        url,
        status: 200,
        headers,
        body: JSON.stringify(body, null, 2),
      });
      const following = collectionNextUrl(
        plan,
        url,
        body,
        headers,
        items.length,
        index,
      );
      if (!following) break;
      url = following;
    }
  }
  return {
    kind: "rsswag-collection-project",
    version: 1,
    name: "Five pagination patterns",
    plans,
    fixtures,
  };
}

export function collectionDataset(
  records: JsonValue[],
  format: "json" | "ndjson" | "csv",
): string {
  const bounded = (source: string) => {
    if (getByteSize(source) > 8 * 1024 * 1024)
      throw new CollectionError("max-bytes");
    return source;
  };
  if (format === "json")
    return bounded(JSON.stringify(records, null, 2) + "\n");
  if (format === "ndjson")
    return bounded(
      records.map((v) => JSON.stringify(v)).join("\n") +
        (records.length ? "\n" : ""),
    );
  const columns = Array.from(
    new Set(records.flatMap((v) => (object(v) ? Object.keys(v) : ["$value"]))),
  );
  if (columns.length > 200) throw new CollectionError("max-bytes");
  const cell = (v: unknown) => {
    let text =
      v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
    if (/^[\s\uFEFF]*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const rows = [columns.map(cell).join(",")];
  let bytes = getByteSize(rows[0]) + 2;
  for (const v of records) {
    const row = columns
      .map((k) =>
        cell(
          object(v)
            ? Object.hasOwn(v, k)
              ? v[k]
              : undefined
            : k === "$value"
              ? v
              : undefined,
        ),
      )
      .join(",");
    bytes += getByteSize(row) + 2;
    if (bytes > 8 * 1024 * 1024) throw new CollectionError("max-bytes");
    rows.push(row);
  }
  return rows.join("\r\n") + "\r\n";
}
