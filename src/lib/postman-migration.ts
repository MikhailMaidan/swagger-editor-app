import YAML from "yaml";
import { readTransformSource } from "./api-transform";
import type { SchemaFormat } from "./openapi";
import {
  inferResponseSchema,
  parseSchemaSample,
  type InferredSchema,
} from "./response-schema";
import { mergeTrafficSchemas } from "./traffic-discovery";

export const MAX_MIGRATION_BYTES = 5 * 1024 * 1024;
export const MAX_MIGRATION_REQUESTS = 500;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);
type RecordValue = Record<string, unknown>;
export type MigrationErrorCode =
  | "json"
  | "limit"
  | "collection"
  | "environment"
  | "overrides"
  | "selection"
  | "metadata"
  | "output";
export class MigrationError extends Error {
  constructor(public code: MigrationErrorCode) {
    super(code);
  }
}
export type MigrationDiagnosticCode =
  | "scripts"
  | "settings"
  | "method"
  | "url"
  | "path"
  | "unresolved"
  | "auth"
  | "headers"
  | "body"
  | "sample"
  | "file"
  | "response"
  | "merged"
  | "conflict"
  | "credentials";
export type MigrationDiagnostic = {
  code: MigrationDiagnosticCode;
  requestId: string;
  severity: "warning" | "error";
};
export type MigrationRequest = {
  id: string;
  name: string;
  folders: string[];
  method: string;
  request: RecordValue;
  responses: unknown[];
  variables: Record<string, string>;
  auth: RecordValue | null;
  scripts: boolean;
  settings: boolean;
};
export type MigrationCollection = {
  name: string;
  description: string;
  requests: MigrationRequest[];
};
export type MigrationOptions = {
  title: string;
  version: string;
  selectedIds: string[];
  environment?: Record<string, string>;
  overrides?: Record<string, string>;
  paths?: Record<string, string>;
  fallbackServer?: string;
  includeExamples?: boolean;
  requireObserved?: boolean;
};
type Schema = Omit<InferredSchema, "properties" | "items"> & {
  format?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
};
type Media = { schema: Schema; example?: unknown };
type Parameter = {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  description?: string;
  schema: Schema;
  example?: unknown;
  style?: string;
  explode?: boolean;
};
type Operation = {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  servers: { url: string }[];
  parameters: Parameter[];
  requestBody?: { required: false; content: Record<string, Media> };
  responses: Record<
    string,
    { description: string; content?: Record<string, Media> }
  >;
  security: Record<string, string[]>[];
  "x-postman-request-names": string[];
  "x-postman-auth-review-required"?: true;
};
export type MigrationResult = {
  document: {
    openapi: string;
    info: { title: string; version: string; description?: string };
    paths: Record<string, Record<string, Operation>>;
    components?: { securitySchemes: Record<string, RecordValue> };
  };
  diagnostics: MigrationDiagnostic[];
  diagnosticCount: number;
  requests: number;
  operations: { method: string; path: string; requestCount: number }[];
  canExport: boolean;
};

function object(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function description(value: unknown): string {
  return str(value) || str(object(value).content);
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function size(text: string) {
  return new TextEncoder().encode(text).length;
}
function parseJson(text: string): unknown {
  if (text.length > MAX_MIGRATION_BYTES || size(text) > MAX_MIGRATION_BYTES)
    throw new MigrationError("limit");
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new MigrationError("json");
  }
  let nodes = 0;
  function visit(entry: unknown, depth: number) {
    if (++nodes > 100_000 || depth > 48) throw new MigrationError("limit");
    if (
      typeof entry === "number" &&
      (!Number.isFinite(entry) ||
        (Number.isInteger(entry) && !Number.isSafeInteger(entry)))
    )
      throw new MigrationError("json");
    if (entry && typeof entry === "object")
      Object.values(entry).forEach((child) => visit(child, depth + 1));
  }
  visit(value, 0);
  return value;
}
function variables(value: unknown): Record<string, string> {
  if (list(value).length > 1000) throw new MigrationError("limit");
  return Object.fromEntries(
    list(value).flatMap((entry) => {
      const v = object(entry);
      const key = str(v.key) || str(v.id);
      return key &&
        v.disabled !== true &&
        v.enabled !== false &&
        ["string", "number", "boolean"].includes(typeof v.value)
        ? [[key, String(v.value)]]
        : [];
    }),
  );
}
function scopedVariables(parent: Record<string, string>, value: unknown) {
  const own = variables(value);
  const merged = Object.keys(own).length ? { ...parent, ...own } : parent;
  if (Object.keys(merged).length > 1000) throw new MigrationError("limit");
  return merged;
}
export function parseMigrationCollection(text: string): MigrationCollection {
  const doc = object(parseJson(text));
  const info = object(doc.info);
  if (
    !str(info.name).trim() ||
    !/^https?:\/\/schema\.(?:getpostman|postman)\.com\/(?:json\/collection|collection\/json)\/v2\.1\.0\/(?:draft-04\/)?collection\.json$/.test(
      str(info.schema),
    ) ||
    !Array.isArray(doc.item)
  )
    throw new MigrationError("collection");
  const requests: MigrationRequest[] = [];
  if (
    str(info.name).length > 500 ||
    description(info.description).length > 20_000
  )
    throw new MigrationError("limit");
  function walk(
    node: RecordValue,
    folders: string[],
    pointer: string,
    inherited: Record<string, string>,
    auth: RecordValue | null,
    scripts: boolean,
    settings: boolean,
  ) {
    const vars = scopedVariables(inherited, node.variable);
    const nextAuth =
      node.auth && typeof node.auth === "object" ? object(node.auth) : auth;
    const hasScripts =
      scripts || list(node.event).some((e) => object(e).disabled !== true);
    const hasSettings =
      settings || Object.keys(object(node.protocolProfileBehavior)).length > 0;
    list(node.item).forEach((entry, index) => {
      const item = object(entry);
      if (str(item.name).length > 500) throw new MigrationError("limit");
      const id = `${pointer}/item/${index}`;
      if (Array.isArray(item.item)) {
        walk(
          item,
          [...folders, str(item.name) || `Folder ${index + 1}`],
          id,
          vars,
          nextAuth,
          hasScripts,
          hasSettings,
        );
      } else if (
        typeof item.request === "string" ||
        (item.request &&
          typeof item.request === "object" &&
          !Array.isArray(item.request))
      ) {
        const request =
          typeof item.request === "string"
            ? { method: "GET", url: item.request }
            : object(item.request);
        if (description(request.description).length > 20_000)
          throw new MigrationError("limit");
        requests.push({
          id,
          name: str(item.name) || `Request ${requests.length + 1}`,
          folders,
          method: str(request.method).toUpperCase() || "GET",
          request,
          responses: list(item.response),
          variables: scopedVariables(vars, item.variable),
          auth:
            request.auth && typeof request.auth === "object"
              ? object(request.auth)
              : nextAuth,
          scripts:
            hasScripts ||
            list(item.event).some((e) => object(e).disabled !== true),
          settings:
            hasSettings ||
            Object.keys(object(item.protocolProfileBehavior)).length > 0,
        });
        if (requests.length > MAX_MIGRATION_REQUESTS)
          throw new MigrationError("limit");
      } else throw new MigrationError("collection");
    });
  }
  walk(doc, [], "", {}, null, false, false);
  if (!requests.length) throw new MigrationError("collection");
  return {
    name: str(info.name),
    description: description(info.description),
    requests,
  };
}
export function parseMigrationEnvironment(
  text: string,
): Record<string, string> {
  const doc = object(parseJson(text));
  if (
    !Array.isArray(doc.values) ||
    doc.values.some(
      (entry) =>
        !str(object(entry).key) ||
        !["string", "number", "boolean"].includes(typeof object(entry).value),
    )
  )
    throw new MigrationError("environment");
  return variables(doc.values);
}
export function parseMigrationOverrides(text: string): Record<string, string> {
  const value = parseJson(text || "{}");
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.entries(value).some(([key, v]) => !key || typeof v !== "string")
  )
    throw new MigrationError("overrides");
  if (Object.keys(value).length > 1000) throw new MigrationError("limit");
  return value as Record<string, string>;
}
function resolver(
  vars: Record<string, string>,
  warn: (code: MigrationDiagnosticCode) => void,
) {
  return function resolve(text: string): string {
    let replacements = 0;
    function expand(input: string, seen: Set<string>): string {
      const chunks: string[] = [];
      let length = 0,
        offset = 0;
      function append(value: string) {
        length += value.length;
        if (length > MAX_OUTPUT_BYTES) throw new MigrationError("limit");
        chunks.push(value);
      }
      for (const match of input.matchAll(/\{\{([^{}]+)\}\}/g)) {
        append(input.slice(offset, match.index));
        const key = match[1];
        if (
          ++replacements > 2000 ||
          seen.size >= 12 ||
          seen.has(key) ||
          !Object.hasOwn(vars, key) ||
          key.startsWith("$") ||
          key.startsWith("vault:")
        ) {
          warn("unresolved");
          append(match[0]);
        } else append(expand(vars[key], new Set([...seen, key])));
        offset = match.index + match[0].length;
      }
      append(input.slice(offset));
      return chunks.join("");
    }
    return expand(text, new Set());
  };
}
type Pair = { key: string; value: string; description: string; type?: string };
function pairs(value: unknown): Pair[] {
  if (typeof value === "string")
    return value.split(/\r?\n/).flatMap((line) => {
      const at = line.indexOf(":");
      return at > 0
        ? [
            {
              key: line.slice(0, at).trim(),
              value: line.slice(at + 1).trim(),
              description: "",
            },
          ]
        : [];
    });
  return list(value).flatMap((entry) => {
    const pair = object(entry);
    return pair.disabled !== true && str(pair.key)
      ? [
          {
            key: str(pair.key),
            value: str(pair.value),
            description: description(pair.description),
            type: str(pair.type),
          },
        ]
      : [];
  });
}
function mediaType(value: string, fallback: string) {
  const media = value.split(";", 1)[0].trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(media)
    ? media
    : fallback;
}
function rawUrl(value: unknown) {
  if (typeof value === "string") return value;
  const url = object(value);
  if (str(url.raw)) return str(url.raw);
  const host = Array.isArray(url.host)
    ? url.host.map(str).join(".")
    : str(url.host);
  const path = Array.isArray(url.path)
    ? url.path.map((p) => str(p) || str(object(p).value)).join("/")
    : str(url.path).replace(/^\//, "");
  return `${str(url.protocol) ? `${str(url.protocol)}://` : ""}${host}${str(url.port) ? `:${str(url.port)}` : ""}/${path}`;
}
function validPath(path: string) {
  if (!path.startsWith("/") || path.length > 2048 || /[?#\\\s]/.test(path))
    return false;
  const names: string[] = [];
  for (const segment of path.split("/")) {
    if (!/[{}]/.test(segment)) continue;
    if (!/^\{[A-Za-z_][A-Za-z0-9_]{0,63}\}$/.test(segment)) return false;
    names.push(segment.slice(1, -1));
  }
  return new Set(names).size === names.length;
}
function requestUrl(
  entry: MigrationRequest,
  options: MigrationOptions,
  resolve: (s: string) => string,
  warn: (code: MigrationDiagnosticCode) => void,
) {
  let raw = rawUrl(entry.request.url).trim();
  if (!raw || raw.length > 8192 || /[\r\n\\]/.test(raw)) return null;
  // Expand a URL-valued prefix before treating standalone path variables as parameters.
  const leading = raw.match(/^\{\{([^{}]+)\}\}/)?.[0];
  if (leading) {
    const expanded = resolve(leading);
    raw =
      (expanded === leading && options.fallbackServer
        ? options.fallbackServer.replace(/\/$/, "")
        : expanded) + raw.slice(leading.length);
  }
  if (
    options.fallbackServer &&
    !raw.startsWith("//") &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)
  )
    raw =
      options.fallbackServer.replace(/\/$/, "") + "/" + raw.replace(/^\//, "");
  const parts = raw.match(/^(https?:\/\/[^/?#]+)([^?#]*)(\?[^#]*)?(?:#.*)?$/i);
  if (!parts) return null;
  let server: URL;
  try {
    server = new URL(resolve(parts[1]));
  } catch {
    return null;
  }
  if (
    !/^https?:$/.test(server.protocol) ||
    /[{}]/.test(server.href) ||
    server.search ||
    server.hash ||
    server.pathname !== "/"
  )
    return null;
  if (server.username || server.password) warn("credentials");
  let path = (parts[2] || "/")
    .split("/")
    .map((segment) => {
      const variable = segment.match(
        /^(?:\{\{([A-Za-z_][A-Za-z0-9_]{0,63})\}\}|:([A-Za-z_][A-Za-z0-9_]{0,63}))$/,
      );
      return variable ? `{${variable[1] || variable[2]}}` : resolve(segment);
    })
    .join("/");
  if (
    options.paths &&
    Object.hasOwn(options.paths, entry.id) &&
    options.paths[entry.id].trim()
  )
    path = options.paths[entry.id].trim();
  if (!validPath(path)) {
    warn("path");
    return null;
  }
  const url = object(entry.request.url);
  const query = Array.isArray(url.query)
    ? pairs(url.query)
    : [...new URLSearchParams(parts[3] || "")].map(([key, value]) => ({
        key,
        value,
        description: "",
      }));
  return {
    server: server.origin,
    path,
    query,
    credentials: Boolean(server.username || server.password),
  };
}

export function buildPostmanMigration(
  collection: MigrationCollection,
  options: MigrationOptions,
): MigrationResult {
  if (
    !options.title.trim() ||
    options.title.length > 200 ||
    !options.version.trim() ||
    options.version.length > 80
  )
    throw new MigrationError("metadata");
  if (options.fallbackServer) {
    try {
      const fallback = new URL(options.fallbackServer);
      if (
        !/^https?:$/.test(fallback.protocol) ||
        fallback.username ||
        fallback.password ||
        fallback.search ||
        fallback.hash ||
        /[{}\\\s]/.test(options.fallbackServer) ||
        options.fallbackServer.length > 2048
      )
        throw new Error();
    } catch {
      throw new MigrationError("metadata");
    }
  }
  const selected = new Set(options.selectedIds);
  const entries = collection.requests.filter((entry) => selected.has(entry.id));
  if (
    !entries.length ||
    entries.length !== selected.size ||
    entries.length > MAX_MIGRATION_REQUESTS
  )
    throw new MigrationError("selection");
  const document: MigrationResult["document"] = {
    openapi: "3.1.0",
    info: {
      title: options.title.trim(),
      version: options.version.trim(),
      ...(collection.description
        ? { description: collection.description }
        : {}),
    },
    paths: Object.create(null),
  };
  const diagnostics: MigrationDiagnostic[] = [];
  let diagnosticCount = 0,
    hasError = false,
    totalSampleNodes = 0,
    resolvedCharacters = 0;
  const schemes = new Map<string, { name: string; schema: RecordValue }>();
  const identities = new Map<string, string>();
  const operations = new Map<
    string,
    { method: string; path: string; requestCount: number }
  >();
  const requireObserved = options.requireObserved === true;
  const examples = options.includeExamples === true;
  for (const entry of entries) {
    const codes = new Set<MigrationDiagnosticCode>();
    function warn(
      code: MigrationDiagnosticCode,
      severity: "warning" | "error" = "warning",
    ) {
      if (severity === "error") hasError = true;
      if (codes.has(code)) return;
      codes.add(code);
      diagnosticCount++;
      if (diagnostics.length < 200)
        diagnostics.push({ code, requestId: entry.id, severity });
      else if (severity === "error") {
        const warning = diagnostics.findIndex((d) => d.severity === "warning");
        if (warning !== -1)
          diagnostics.splice(warning, 1, {
            code,
            requestId: entry.id,
            severity,
          });
      }
    }
    const expand = resolver(
      { ...entry.variables, ...options.environment, ...options.overrides },
      warn,
    );
    const resolve = (text: string) => {
      const value = expand(text);
      resolvedCharacters += value.length;
      if (resolvedCharacters > MAX_MIGRATION_BYTES * 2)
        throw new MigrationError("limit");
      return value;
    };
    if (entry.scripts) warn("scripts");
    if (entry.settings) warn("settings");
    const method = entry.method.toLowerCase();
    if (!METHODS.has(method)) {
      warn("method", "error");
      continue;
    }
    const url = requestUrl(entry, options, resolve, warn);
    if (!url) {
      warn("url", "error");
      continue;
    }
    const identity = url.path.replace(/\{[^{}]+\}/g, "{}");
    if (identities.has(identity) && identities.get(identity) !== url.path) {
      warn("conflict", "error");
      continue;
    }
    identities.set(identity, url.path);
    function sample(body: string, media: string): Media {
      const resolved = resolve(body);
      if (media === "application/json" || media.endsWith("+json")) {
        const parsed = parseSchemaSample(resolved);
        if (!parsed.ok || totalSampleNodes + parsed.sample.nodes > 100_000) {
          warn("sample");
          return { schema: {} };
        }
        totalSampleNodes += parsed.sample.nodes;
        return {
          schema: inferResponseSchema([parsed.sample], {
            requireObserved,
            allowAdditional: true,
          }).schema,
          ...(examples ? { example: parsed.sample.value } : {}),
        };
      }
      return {
        schema: { type: "string" },
        ...(examples && !resolved.includes("{{") ? { example: resolved } : {}),
      };
    }
    const parameters: Parameter[] = [];
    const pathVariables = new Map(
      pairs(object(entry.request.url).variable).map((pair) => [pair.key, pair]),
    );
    for (const match of url.path.matchAll(/\{([^{}]+)\}/g)) {
      const pair = pathVariables.get(match[1]);
      parameters.push({
        name: match[1],
        in: "path",
        required: true,
        schema: { type: "string" },
        ...(pair?.description ? { description: pair.description } : {}),
      });
    }
    const headers = pairs(entry.request.header);
    const auth = entry.auth;
    const authType = str(auth?.type);
    let security: Record<string, string[]>[] = [];
    let authReview = url.credentials;
    let apiKey: { name: string; in: "query" | "header" } | null = null;
    if (auth && authType !== "noauth") {
      let scheme: RecordValue | null = null;
      if (["basic", "bearer", "digest"].includes(authType))
        scheme = { type: "http", scheme: authType };
      if (authType === "apikey") {
        const attrs = new Map(
          pairs(auth?.apikey).map((pair) => [pair.key, pair.value]),
        );
        const location = resolve(attrs.get("in") || "header"),
          name = resolve(attrs.get("key") || "");
        if (
          ["query", "header"].includes(location) &&
          name &&
          !/[{}\s\x00-\x1f\x7f]/.test(name)
        ) {
          apiKey = { name, in: location as "query" | "header" };
          scheme = { type: "apiKey", ...apiKey };
        }
      }
      if (scheme) {
        const key = JSON.stringify(scheme);
        if (!schemes.has(key))
          schemes.set(key, {
            name: `postmanAuth${schemes.size + 1}`,
            schema: scheme,
          });
        security = [{ [schemes.get(key)!.name]: [] }];
      } else {
        warn("auth");
        authReview = true;
      }
    }
    function addPairs(values: Pair[], location: "query" | "header") {
      const grouped = new Map<string, Pair[]>();
      for (const pair of values) {
        const resolvedName = resolve(pair.key);
        const name = location === "header" ? resolvedName.trim() : resolvedName;
        const normalized = location === "header" ? name.toLowerCase() : name;
        if (!name || name.length > 256 || /[{}\x00-\x1f\x7f]/.test(name)) {
          warn("unresolved");
          continue;
        }
        if (
          location === "header" &&
          !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)
        ) {
          warn("headers");
          continue;
        }
        if (
          location === "header" &&
          [
            "authorization",
            "cookie",
            "host",
            "content-length",
            "content-type",
            "accept",
            "connection",
            "transfer-encoding",
          ].includes(normalized)
        ) {
          if (["authorization", "cookie"].includes(normalized)) {
            warn("headers");
            if (!security.length) authReview = true;
          }
          continue;
        }
        if (
          apiKey?.in === location &&
          (location === "header" ? apiKey.name.toLowerCase() : apiKey.name) ===
            normalized
        )
          continue;
        const group = grouped.get(normalized) ?? [];
        group.push({ ...pair, key: name });
        grouped.set(normalized, group);
      }
      for (const group of grouped.values()) {
        const repeated = location === "query" && group.length > 1;
        const values = group.map((pair) => resolve(pair.value));
        parameters.push({
          name: group[0].key,
          in: location,
          required: false,
          schema: repeated
            ? { type: "array", items: { type: "string" } }
            : { type: "string" },
          ...(repeated ? { style: "form", explode: true } : {}),
          ...(group[0].description
            ? { description: group[0].description }
            : {}),
          ...(examples && !values.some((v) => v.includes("{{"))
            ? { example: repeated ? values : values[0] }
            : {}),
        });
      }
    }
    addPairs(url.query, "query");
    addPairs(headers, "header");
    const op: Operation = {
      operationId: `postman_${entry.id.replace(/\D+/g, "_").replace(/^_/, "")}`,
      summary: entry.name,
      ...(description(entry.request.description)
        ? { description: description(entry.request.description) }
        : {}),
      tags: entry.folders.length ? [entry.folders.join(" / ")] : [],
      servers: [{ url: url.server }],
      parameters,
      responses: Object.create(null),
      security,
      "x-postman-request-names": [entry.name],
      ...(authReview ? { "x-postman-auth-review-required": true } : {}),
    };
    const body = object(entry.request.body);
    if (body.disabled !== true && str(body.mode)) {
      const content: Record<string, Media> = Object.create(null);
      const headerType = resolve(
        headers.find((h) => h.key.trim().toLowerCase() === "content-type")
          ?.value || "",
      );
      if (body.mode === "raw") {
        const language = str(object(object(body.options).raw).language);
        const fallback =
          language === "json"
            ? "application/json"
            : language === "xml"
              ? "application/xml"
              : "text/plain";
        const media = mediaType(headerType, fallback);
        content[media] = sample(str(body.raw), media);
      } else if (body.mode === "urlencoded" || body.mode === "formdata") {
        const fields = pairs(body[body.mode]);
        const props: Record<string, Schema> = Object.create(null),
          counts = new Map<string, number>();
        for (const field of fields) {
          const name = resolve(field.key);
          if (!name || name.includes("{{")) {
            warn("unresolved");
            continue;
          }
          const schema: Schema =
            field.type === "file"
              ? { type: "string", format: "binary" }
              : { type: "string" };
          if (field.type === "file") warn("file");
          const count = (counts.get(name) || 0) + 1;
          counts.set(name, count);
          props[name] =
            count > 1
              ? {
                  type: "array",
                  items: mergeSchemas(
                    [count > 2 ? props[name].items! : props[name], schema],
                    false,
                  ),
                }
              : schema;
        }
        content[
          body.mode === "urlencoded"
            ? "application/x-www-form-urlencoded"
            : "multipart/form-data"
        ] = {
          schema: {
            type: "object",
            properties: props,
            ...(requireObserved && Object.keys(props).length
              ? { required: Object.keys(props) }
              : {}),
          },
        };
      } else if (body.mode === "file") {
        warn("file");
        content[mediaType(headerType, "application/octet-stream")] = {
          schema: { type: "string", format: "binary" },
        };
      } else if (body.mode === "graphql") {
        const graph = object(body.graphql);
        const vars = str(graph.variables).trim();
        let variableSchema: Schema = { type: "object" };
        if (vars) variableSchema = sample(vars, "application/json").schema;
        content["application/json"] = {
          schema: {
            type: "object",
            properties: {
              query: { type: "string" },
              variables: variableSchema,
            },
          },
        };
      } else warn("body");
      if (Object.keys(content).length)
        op.requestBody = { required: false, content };
    }
    for (const saved of entry.responses) {
      const response = object(saved),
        code = response.code;
      if (
        typeof code !== "number" ||
        !Number.isInteger(code) ||
        code < 100 ||
        code > 599
      ) {
        warn("response");
        continue;
      }
      const key = String(code);
      const next: Operation["responses"][string] = {
        description:
          str(response.name) || str(response.status) || `HTTP ${key}`,
      };
      const responseBody = str(response.body);
      if (responseBody && method !== "head" && ![204, 304].includes(code)) {
        const declared =
          pairs(response.header).find(
            (h) => h.key.trim().toLowerCase() === "content-type",
          )?.value || "";
        const media = mediaType(
          resolve(declared),
          /^[\s]*[\[{]/.test(responseBody) ? "application/json" : "text/plain",
        );
        next.content = { [media]: sample(responseBody, media) };
      }
      if (Object.hasOwn(op.responses, key))
        mergeContent(op.responses[key], next, requireObserved);
      else op.responses[key] = next;
    }
    if (!Object.keys(op.responses).length)
      op.responses.default = {
        description: "Response not documented in the collection.",
      };
    const key = `${method} ${url.path}`;
    const path =
      document.paths[url.path] ??
      (document.paths[url.path] = Object.create(null));
    if (Object.hasOwn(path, method)) {
      warn("merged");
      const previous = path[method];
      previous.tags = [...new Set([...previous.tags, ...op.tags])];
      previous.servers = [
        ...new Set([...previous.servers, ...op.servers].map((s) => s.url)),
      ].map((url) => ({ url }));
      previous["x-postman-request-names"].push(entry.name);
      if (op.description && op.description !== previous.description)
        previous.description = [previous.description, op.description]
          .filter(Boolean)
          .join("\n\n");
      for (const parameter of op.parameters) {
        const before = previous.parameters.find(
          (p) =>
            p.in === parameter.in &&
            (p.in === "header"
              ? p.name.toLowerCase() === parameter.name.toLowerCase()
              : p.name === parameter.name),
        );
        if (before) {
          before.schema = mergeSchemas(
            [before.schema, parameter.schema],
            requireObserved,
          );
          if (!Object.hasOwn(parameter, "example")) delete before.example;
        } else previous.parameters.push(parameter);
      }
      if (op.requestBody) {
        if (previous.requestBody)
          mergeContent(previous.requestBody, op.requestBody, requireObserved);
        else previous.requestBody = op.requestBody;
      }
      for (const [status, response] of Object.entries(op.responses)) {
        if (Object.hasOwn(previous.responses, status))
          mergeContent(previous.responses[status], response, requireObserved);
        else previous.responses[status] = response;
      }
      const alternatives = [
        ...(previous.security.length ? previous.security : [{}]),
        ...(op.security.length ? op.security : [{}]),
      ];
      previous.security = [
        ...new Map(alternatives.map((s) => [JSON.stringify(s), s])).values(),
      ];
      if (authReview) previous["x-postman-auth-review-required"] = true;
      operations.get(key)!.requestCount++;
    } else {
      path[method] = op;
      operations.set(key, {
        method: method.toUpperCase(),
        path: url.path,
        requestCount: 1,
      });
    }
  }
  if (schemes.size)
    document.components = {
      securitySchemes: Object.fromEntries(
        [...schemes.values()].map((s) => [s.name, s.schema]),
      ),
    };
  return {
    document,
    diagnostics,
    diagnosticCount,
    requests: entries.length,
    operations: [...operations.values()],
    canExport: !hasError && operations.size > 0,
  };
}
// The shared sample merger deliberately omits formats. Retain binary form/file
// contracts only where every contributing schema agrees on the format.
function mergeSchemas(schemas: Schema[], required: boolean): Schema {
  const merged: Schema = mergeTrafficSchemas(schemas, required);
  function restoreFormats(target: Schema, sources: Schema[]) {
    if (
      target.type === "string" &&
      sources[0]?.format &&
      sources.every((s) => s.format === sources[0].format)
    )
      target.format = sources[0].format;
    if (target.properties)
      for (const [key, child] of Object.entries(target.properties)) {
        restoreFormats(
          child,
          sources.flatMap((s) =>
            s.properties && Object.hasOwn(s.properties, key)
              ? [s.properties[key]]
              : [],
          ),
        );
      }
    if (target.items)
      restoreFormats(
        target.items,
        sources.flatMap((s) => (s.items ? [s.items] : [])),
      );
  }
  restoreFormats(merged, schemas);
  return merged;
}
function mergeContent(
  target: { content?: Record<string, Media> },
  source: { content?: Record<string, Media> },
  requireObserved: boolean,
) {
  if (!source.content) return;
  target.content ??= Object.create(null) as Record<string, Media>;
  for (const [media, next] of Object.entries(source.content)) {
    if (Object.hasOwn(target.content, media)) {
      target.content[media].schema = mergeSchemas(
        [target.content[media].schema, next.schema],
        requireObserved,
      );
      if (
        !Object.hasOwn(target.content[media], "example") &&
        Object.hasOwn(next, "example")
      )
        target.content[media].example = next.example;
    } else target.content[media] = next;
  }
}
export function serializePostmanMigration(
  result: MigrationResult,
  format: SchemaFormat,
): string {
  if (!result.canExport) throw new MigrationError("output");
  const json = JSON.stringify(result.document, null, 2) + "\n";
  if (size(json) > MAX_OUTPUT_BYTES) throw new MigrationError("output");
  try {
    readTransformSource(json);
  } catch {
    throw new MigrationError("output");
  }
  const text =
    format === "json"
      ? json
      : YAML.stringify(result.document, { lineWidth: 0 });
  if (size(text) > MAX_OUTPUT_BYTES) throw new MigrationError("output");
  return text;
}
