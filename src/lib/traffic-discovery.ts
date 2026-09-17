import YAML from "yaml";
import { getByteSize } from "./text-encoding";
import {
  inferResponseSchema,
  parseSchemaSample,
  type InferredSchema,
} from "./response-schema";
import type { SchemaFormat } from "./openapi";

export const MAX_DISCOVERY_BYTES = 5 * 1024 * 1024;
export const MAX_DISCOVERY_ENTRIES = 1000;
export const MAX_DISCOVERY_ROUTES = 500;
const MAX_BODY_NODES = 100000;
const METHODS = new Set([
  "GET",
  "PUT",
  "POST",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "PATCH",
  "TRACE",
]);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export type DiscoveryIssue =
  | "invalid-har"
  | "too-large"
  | "too-many"
  | "no-requests"
  | "origin"
  | "prefix"
  | "template"
  | "conflict"
  | "empty"
  | "metadata";
export class DiscoveryError extends Error {
  constructor(public code: DiscoveryIssue) {
    super(code);
  }
}
export type TrafficWarning = {
  entry: number;
  part: "request" | "response" | "entry";
  code: "skipped" | "missing" | "invalid" | "unsupported" | "limit" | "media";
};
export type TrafficBody = { mediaType: string; schema: InferredSchema };
export type TrafficObservation = {
  index: number;
  origin: string;
  path: string;
  method: string;
  status: number;
  query: { name: string; types: string[]; repeated: boolean }[];
  requestBody?: TrafficBody;
  responseBody?: TrafficBody;
};
export type TrafficCapture = {
  observations: TrafficObservation[];
  warnings: TrafficWarning[];
  total: number;
  skipped: number;
};
export type TrafficRoute = {
  id: string;
  method: string;
  path: string;
  included: boolean;
  observations: TrafficObservation[];
};
export type DiscoveryOptions = {
  origin: string;
  prefix: string;
  title: string;
  version: string;
  requireObserved: boolean;
};
export type TrafficDefinition = {
  document: Record<string, unknown>;
  operations: {
    method: string;
    path: string;
    observations: number;
    statuses: number[];
  }[];
  observations: number;
};

function mediaType(value: unknown) {
  if (typeof value !== "string") return "";
  const type = value.split(";", 1)[0].trim().toLowerCase();
  return type.length <= 128 &&
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)
    ? type
    : "";
}
function headerMedia(headers: unknown) {
  if (!Array.isArray(headers)) return "";
  return mediaType(
    headers.find(
      (entry) =>
        record(entry) &&
        typeof entry.name === "string" &&
        entry.name.toLowerCase() === "content-type",
    )?.value,
  );
}
function scalarType(value: string) {
  if (value === "true" || value === "false") return "boolean";
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
    const number = Number(value);
    if (
      Number.isFinite(number) &&
      (!Number.isInteger(number) || Number.isSafeInteger(number))
    )
      return Number.isInteger(number) ? "integer" : "number";
  }
  return "string";
}
function unionTypes(types: string[]) {
  const result = new Set(types);
  if (result.has("number")) result.delete("integer");
  return [...result].sort();
}
const typeSchema = (types: string[]): InferredSchema => {
  const values = unionTypes(types);
  return { type: values.length === 1 ? values[0] : values };
};

/** Extract shapes immediately; body, header, cookie and query values are not retained. */
export function parseTrafficCapture(text: string): TrafficCapture {
  if (
    text.length > MAX_DISCOVERY_BYTES ||
    getByteSize(text) > MAX_DISCOVERY_BYTES
  )
    throw new DiscoveryError("too-large");
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new DiscoveryError("invalid-har");
  }
  if (!record(data) || !record(data.log) || !Array.isArray(data.log.entries))
    throw new DiscoveryError("invalid-har");
  if (data.log.entries.length > MAX_DISCOVERY_ENTRIES)
    throw new DiscoveryError("too-many");
  const observations: TrafficObservation[] = [];
  const warnings: TrafficWarning[] = [];
  let nodes = 0;
  function body(
    value: unknown,
    headers: unknown,
    entry: number,
    part: "request" | "response",
    reportedBody = false,
  ): TrafficBody | undefined {
    const content = record(value) ? value : {};
    const mime = mediaType(content.mimeType) || headerMedia(headers);
    const warn = (code: TrafficWarning["code"]) =>
      warnings.push({ entry, part, code });
    if (!mime) {
      if (content.text || content.mimeType || reportedBody) warn("media");
      return undefined;
    }
    if (!/(?:\/|\+)json$/.test(mime)) {
      warn("unsupported");
      return {
        mediaType: mime,
        schema: mime.startsWith("text/") ? { type: "string" } : {},
      };
    }
    if (typeof content.text !== "string" || !content.text.length) {
      warn("missing");
      return { mediaType: mime, schema: {} };
    }
    let source = content.text;
    if (content.encoding !== undefined) {
      if (content.encoding !== "base64") {
        warn("unsupported");
        return { mediaType: mime, schema: {} };
      }
      try {
        const binary = atob(source);
        source = new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(binary, (char) => char.charCodeAt(0)),
        );
      } catch {
        warn("invalid");
        return { mediaType: mime, schema: {} };
      }
    }
    const parsed = parseSchemaSample(source);
    if (!parsed.ok) {
      warn(
        parsed.issue === "size-limit" || parsed.issue === "structure-limit"
          ? "limit"
          : "invalid",
      );
      return { mediaType: mime, schema: {} };
    }
    nodes += parsed.sample.nodes;
    if (nodes > MAX_BODY_NODES) {
      warn("limit");
      return { mediaType: mime, schema: {} };
    }
    return {
      mediaType: mime,
      schema: inferResponseSchema([parsed.sample]).schema,
    };
  }
  data.log.entries.forEach((entry: unknown, position: number) => {
    const index = position + 1;
    const skip = () =>
      warnings.push({ entry: index, part: "entry", code: "skipped" });
    if (!record(entry) || !record(entry.request) || !record(entry.response))
      return skip();
    const { request, response } = entry;
    const method =
      typeof request.method === "string" ? request.method.toUpperCase() : "";
    const status = response.status;
    if (
      !METHODS.has(method) ||
      typeof request.url !== "string" ||
      request.url.length > 16384 ||
      typeof status !== "number" ||
      !Number.isInteger(status) ||
      status < 100 ||
      status > 599
    )
      return skip();
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return skip();
    }
    if (
      !/^https?:$/.test(url.protocol) ||
      url.pathname.length > 1024 ||
      /[{}]/.test(url.pathname)
    )
      return skip();
    const pairs = new Map<string, string[]>();
    // URL is authoritative, including repeated/empty query values. HAR queryString is a fallback.
    const query = url.search
      ? [...url.searchParams]
      : Array.isArray(request.queryString)
        ? request.queryString
            .filter(
              (item) =>
                record(item) &&
                typeof item.name === "string" &&
                typeof item.value === "string",
            )
            .map((item) => [item.name as string, item.value as string])
        : [];
    for (const [name, value] of query) {
      if (
        !name ||
        name.length > 256 ||
        /[\u0000-\u001f\u007f]/.test(name) ||
        (!pairs.has(name) && pairs.size >= 128)
      ) {
        warnings.push({ entry: index, part: "request", code: "limit" });
        continue;
      }
      const types = pairs.get(name) ?? [];
      types.push(scalarType(value));
      pairs.set(name, types);
    }
    const observation: TrafficObservation = {
      index,
      method,
      status,
      origin: url.origin,
      path: url.pathname,
      query: [...pairs].map(([name, types]) => ({
        name,
        types: unionTypes(types),
        repeated: types.length > 1,
      })),
    };
    // HAR can report uploaded bytes without retaining the request's postData.
    const reportedRequestBody =
      typeof request.bodySize === "number" &&
      Number.isSafeInteger(request.bodySize) &&
      request.bodySize > 0;
    if (
      method !== "GET" &&
      method !== "HEAD" &&
      (record(request.postData) || reportedRequestBody)
    )
      observation.requestBody = body(
        request.postData,
        request.headers,
        index,
        "request",
        reportedRequestBody,
      );
    if (method !== "HEAD" && status !== 204 && status !== 304 && status >= 200)
      observation.responseBody = body(
        response.content,
        response.headers,
        index,
        "response",
      );
    observations.push(observation);
  });
  if (!observations.length) throw new DiscoveryError("no-requests");
  return {
    observations,
    warnings,
    total: data.log.entries.length,
    skipped: data.log.entries.length - observations.length,
  };
}

export function normalizeDiscoveryPrefix(prefix: string) {
  if (
    prefix.length > 512 ||
    (prefix && (!prefix.startsWith("/") || /[?#\\{}\s]/.test(prefix)))
  )
    throw new DiscoveryError("prefix");
  return prefix.replace(/\/+$/, "");
}
function strippedPath(path: string, prefix: string) {
  return !prefix
    ? path
    : path === prefix
      ? "/"
      : path.startsWith(prefix + "/")
        ? path.slice(prefix.length)
        : null;
}
function suggestPath(path: string) {
  let count = 0;
  return path
    .split("/")
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        /* Keep malformed encodings literal. */
      }
      return /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(
        decoded,
      )
        ? `{id${++count === 1 ? "" : count}}`
        : segment;
    })
    .join("/");
}
export function discoverTrafficRoutes(
  capture: TrafficCapture,
  origin: string,
  prefixInput: string,
  parameterize: boolean,
): TrafficRoute[] {
  if (!capture.observations.some((row) => row.origin === origin))
    throw new DiscoveryError("origin");
  const prefix = normalizeDiscoveryPrefix(prefixInput);
  const groups = new Map<string, TrafficRoute>();
  for (const observation of capture.observations) {
    if (observation.origin !== origin) continue;
    const source = strippedPath(observation.path, prefix);
    if (source === null) continue;
    const path = parameterize ? suggestPath(source) : source;
    const id = `${observation.method} ${path}`;
    let group = groups.get(id);
    if (!group) {
      if (groups.size >= MAX_DISCOVERY_ROUTES)
        throw new DiscoveryError("too-many");
      group = {
        id,
        method: observation.method,
        path,
        included: true,
        observations: [],
      };
      groups.set(id, group);
    }
    group.observations.push(observation);
  }
  return [...groups.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

/** Merge schemas without retaining examples or turning observed values into enums. */
export function mergeTrafficSchemas(
  schemas: InferredSchema[],
  requireObserved: boolean,
): InferredSchema {
  if (!schemas.length || schemas.some((schema) => !schema.type)) return {};
  const types = (schema: InferredSchema) =>
    Array.isArray(schema.type) ? schema.type : [schema.type!];
  const result = typeSchema(schemas.flatMap(types));
  const objects = schemas.filter((schema) => types(schema).includes("object"));
  if (objects.length) {
    const names = [
      ...new Set(
        objects.flatMap((schema) => Object.keys(schema.properties ?? {})),
      ),
    ].sort();
    result.properties = Object.fromEntries(
      names.map((name) => [
        name,
        mergeTrafficSchemas(
          objects
            .filter((schema) => Object.hasOwn(schema.properties ?? {}, name))
            .map((schema) => schema.properties![name]),
          requireObserved,
        ),
      ]),
    );
    const required = requireObserved
      ? names.filter((name) =>
          objects.every((schema) => schema.required?.includes(name)),
        )
      : [];
    if (required.length) result.required = required;
  }
  const arrays = schemas.filter((schema) => types(schema).includes("array"));
  if (arrays.length) {
    // Empty arrays provide no item evidence; keep them from erasing known item shapes.
    const items = arrays.flatMap((schema) =>
      schema.items?.type ? [schema.items] : [],
    );
    result.items = mergeTrafficSchemas(items, requireObserved);
  }
  return result;
}

function templateSegments(path: string) {
  if (!path.startsWith("/") || path.length > 1024 || /[?#\\\s]/.test(path))
    throw new DiscoveryError("template");
  const names = new Set<string>();
  return path.split("/").map((segment) => {
    if (!/[{}]/.test(segment)) return { literal: segment, name: "" };
    if (!/^\{[A-Za-z_][A-Za-z0-9_]{0,63}\}$/.test(segment))
      throw new DiscoveryError("template");
    const name = segment.slice(1, -1);
    if (names.has(name)) throw new DiscoveryError("template");
    names.add(name);
    return { literal: "", name };
  });
}

export function buildTrafficDefinition(
  routes: TrafficRoute[],
  options: DiscoveryOptions,
): TrafficDefinition {
  const prefix = normalizeDiscoveryPrefix(options.prefix);
  if (
    !options.title.trim() ||
    options.title.length > 200 ||
    !options.version.trim() ||
    options.version.length > 80
  )
    throw new DiscoveryError("metadata");
  let origin: URL;
  try {
    origin = new URL(options.origin);
  } catch {
    throw new DiscoveryError("origin");
  }
  if (!/^https?:$/.test(origin.protocol) || origin.origin !== options.origin)
    throw new DiscoveryError("origin");
  const selected = routes.filter((route) => route.included);
  if (!selected.length) throw new DiscoveryError("empty");
  if (selected.length > MAX_DISCOVERY_ROUTES)
    throw new DiscoveryError("too-many");
  const shapes = new Map<string, string>();
  const groups = new Map<string, TrafficRoute>();
  for (const route of selected) {
    const segments = templateSegments(route.path);
    const shape = segments
      .map((segment) => (segment.name ? "{}" : segment.literal))
      .join("/");
    if (shapes.has(shape) && shapes.get(shape) !== route.path)
      throw new DiscoveryError("conflict");
    shapes.set(shape, route.path);
    for (const row of route.observations) {
      const parts = strippedPath(row.path, prefix)?.split("/");
      if (
        row.origin !== options.origin ||
        row.method !== route.method ||
        !parts ||
        parts.length !== segments.length ||
        segments.some((segment, index) =>
          segment.name ? !parts[index] : segment.literal !== parts[index],
        )
      )
        throw new DiscoveryError("template");
    }
    const key = `${route.method} ${route.path}`;
    const group = groups.get(key);
    if (group) group.observations.push(...route.observations);
    else groups.set(key, { ...route, observations: [...route.observations] });
  }
  const paths = new Map<string, Record<string, unknown>>();
  const operations: TrafficDefinition["operations"] = [];
  let count = 0;
  const content = (bodies: TrafficBody[]) =>
    Object.fromEntries(
      [...new Set(bodies.map((body) => body.mediaType))].sort().map((mime) => [
        mime,
        {
          schema: mergeTrafficSchemas(
            bodies
              .filter((body) => body.mediaType === mime)
              .map((body) => body.schema),
            options.requireObserved,
          ),
        },
      ]),
    );
  for (const route of groups.values()) {
    const rows = route.observations;
    const parameters: Record<string, unknown>[] = [];
    templateSegments(route.path).forEach((segment, index) => {
      if (segment.name)
        parameters.push({
          name: segment.name,
          in: "path",
          required: true,
          schema: typeSchema(
            rows.map((row) => {
              const value = strippedPath(row.path, prefix)!.split("/")[index];
              try {
                return scalarType(decodeURIComponent(value));
              } catch {
                return "string";
              }
            }),
          ),
        });
    });
    const queryNames = [
      ...new Set(rows.flatMap((row) => row.query.map((query) => query.name))),
    ].sort();
    for (const name of queryNames) {
      const values = rows.flatMap((row) =>
        row.query.filter((query) => query.name === name),
      );
      const schema = typeSchema(values.flatMap((query) => query.types));
      parameters.push({
        name,
        in: "query",
        required: options.requireObserved && values.length === rows.length,
        style: "form",
        explode: true,
        schema: values.some((query) => query.repeated)
          ? { type: "array", items: schema }
          : schema,
      });
    }
    const statuses = [...new Set(rows.map((row) => row.status))].sort(
      (a, b) => a - b,
    );
    const responses = Object.fromEntries(
      statuses.map((status) => {
        const bodies = rows
          .filter((row) => row.status === status)
          .flatMap((row) => (row.responseBody ? [row.responseBody] : []));
        return [
          String(status),
          {
            description: `Observed HTTP ${status} response`,
            ...(bodies.length ? { content: content(bodies) } : {}),
          },
        ];
      }),
    );
    const bodies = rows.flatMap((row) =>
      row.requestBody ? [row.requestBody] : [],
    );
    const operation = {
      summary: `${route.method} ${route.path}`,
      operationId: `observed_${route.method.toLowerCase()}_${operations.length + 1}`,
      description: `Inferred from ${rows.length} captured request(s). Review this draft against the API's intended contract.`,
      ...(parameters.length ? { parameters } : {}),
      ...(bodies.length
        ? {
            requestBody: {
              required:
                options.requireObserved && bodies.length === rows.length,
              content: content(bodies),
            },
          }
        : {}),
      responses,
    };
    const path = paths.get(route.path) ?? {};
    Object.defineProperty(path, route.method.toLowerCase(), {
      value: operation,
      enumerable: true,
      configurable: true,
    });
    paths.set(route.path, path);
    operations.push({
      method: route.method,
      path: route.path,
      observations: rows.length,
      statuses,
    });
    count += rows.length;
  }
  const document = {
    openapi: "3.1.0",
    info: {
      title: options.title.trim(),
      version: options.version.trim(),
      description:
        "Draft inferred from observed HTTP traffic. Captures do not establish complete API behavior, authentication requirements, or field constraints.",
    },
    servers: [{ url: options.origin + prefix }],
    paths: Object.fromEntries(paths),
  };
  return { document, operations, observations: count };
}

export function serializeTrafficDefinition(
  result: TrafficDefinition,
  format: SchemaFormat,
) {
  const text =
    format === "json"
      ? JSON.stringify(result.document, null, 2) + "\n"
      : YAML.stringify(result.document, { lineWidth: 0 });
  if (getByteSize(text) > MAX_DISCOVERY_BYTES * 2)
    throw new DiscoveryError("too-large");
  return text;
}
