import YAML from "yaml";
import {
  escapeTransformPointer,
  parseTransformPointer,
  parseTransformValue,
  readTransformSource,
  TransformError,
  type JsonValue,
} from "./api-transform";
import { getByteSize } from "./text-encoding";
import type { SchemaFormat } from "./openapi";

export const MAX_COMPOSER_SERVICES = 8;
export const MAX_COMPOSER_SOURCE_BYTES = 1024 * 1024;
export const MAX_COMPOSER_BYTES = 2 * 1024 * 1024;
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
const OAS_DIALECT = "https://spec.openapis.org/oas/3.1/dialect/base";
const DIALECTS = new Set([
  OAS_DIALECT,
  "https://json-schema.org/draft/2020-12/schema",
]);
type Obj = { [key: string]: JsonValue };
type Kind =
  | "path"
  | "operation"
  | "schema"
  | "response"
  | "parameter"
  | "header"
  | "requestBody"
  | "media"
  | "encoding"
  | "example"
  | "link"
  | "callback"
  | "securityScheme";
const COMPONENTS: Record<string, Kind> = {
  schemas: "schema",
  responses: "response",
  parameters: "parameter",
  headers: "header",
  requestBodies: "requestBody",
  examples: "example",
  links: "link",
  callbacks: "callback",
  securitySchemes: "securityScheme",
  pathItems: "path",
};
export type ComposerService = {
  key: string;
  name: string;
  namespace: string;
  prefix: string;
  enabled: boolean;
  text: string;
};
export type ComposerProject = {
  title: string;
  version: string;
  gatewayUrl: string;
  services: ComposerService[];
};
export type ComposerIssueCode =
  | "settings"
  | "version"
  | "namespace"
  | "collision"
  | "reference"
  | "external"
  | "pathRef"
  | "operationId"
  | "link"
  | "security"
  | "schemaScope"
  | "discriminator"
  | "extensions"
  | "shape";
export type ComposerIssue = {
  serviceKey: string;
  pointer: string;
  code: ComposerIssueCode;
  severity: "error" | "warning";
};
export type ComposerRoute = {
  serviceKey: string;
  namespace: string;
  method: string;
  sourcePath: string;
  gatewayPath: string;
  operationId: string;
  upstreamServers: string[];
};
export type ComposerResult = {
  document: Obj;
  routes: ComposerRoute[];
  issues: ComposerIssue[];
  issueCount: number;
  canExport: boolean;
  serviceCount: number;
  componentCount: number;
};
export type ComposerErrorCode =
  "source" | "limit" | "project" | "settings" | "empty" | "output";
export class ComposerError extends Error {
  constructor(public code: ComposerErrorCode) {
    super(code);
  }
}
const isObj = (value: unknown): value is Obj =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const obj = (value: unknown): Obj => (isObj(value) ? value : {});
const textValue = (value: unknown) => (typeof value === "string" ? value : "");
const esc = escapeTransformPointer;
const pointer = (parts: string[]) =>
  "#" + parts.map((p) => "/" + esc(p)).join("");
const clone = <T extends JsonValue>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
function at(root: JsonValue, parts: string[]): JsonValue | undefined {
  let value: JsonValue | undefined = root;
  for (const part of parts) {
    if (Array.isArray(value))
      value = /^(0|[1-9]\d*)$/.test(part) ? value[Number(part)] : undefined;
    else
      value =
        isObj(value) && Object.hasOwn(value, part) ? value[part] : undefined;
  }
  return value;
}
export function readComposerSource(text: string): Obj {
  if (getByteSize(text) > MAX_COMPOSER_SOURCE_BYTES)
    throw new ComposerError("limit");
  try {
    const document = obj(readTransformSource(text).document);
    if (!/^3\.(0|1)\.\d+$/.test(textValue(document.openapi)))
      throw new ComposerError("source");
    return document;
  } catch (error) {
    if (error instanceof ComposerError) throw error;
    throw new ComposerError(
      error instanceof TransformError && error.code === "limit"
        ? "limit"
        : "source",
    );
  }
}
function checkProject(value: unknown): ComposerProject {
  if (
    !isObj(value) ||
    typeof value.title !== "string" ||
    value.title.length > 200 ||
    typeof value.version !== "string" ||
    value.version.length > 80 ||
    typeof value.gatewayUrl !== "string" ||
    value.gatewayUrl.length > 2048 ||
    !Array.isArray(value.services)
  )
    throw new ComposerError("project");
  if (value.services.length > MAX_COMPOSER_SERVICES)
    throw new ComposerError("limit");
  let bytes = 0;
  const keys = new Set<string>();
  const services = value.services.map((item) => {
    if (
      !isObj(item) ||
      !/^[a-zA-Z0-9-]{1,60}$/.test(textValue(item.key)) ||
      keys.has(textValue(item.key)) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 200 ||
      typeof item.namespace !== "string" ||
      item.namespace.length > 40 ||
      typeof item.prefix !== "string" ||
      item.prefix.length > 256 ||
      typeof item.enabled !== "boolean" ||
      typeof item.text !== "string"
    )
      throw new ComposerError("project");
    keys.add(item.key as string);
    bytes += getByteSize(item.text);
    if (bytes > MAX_COMPOSER_BYTES * 0.75) throw new ComposerError("limit");
    readComposerSource(item.text);
    return {
      key: item.key as string,
      name: item.name,
      namespace: item.namespace,
      prefix: item.prefix,
      enabled: item.enabled,
      text: item.text,
    };
  });
  return {
    title: value.title,
    version: value.version,
    gatewayUrl: value.gatewayUrl,
    services,
  };
}
export function parseComposerProject(text: string): ComposerProject {
  try {
    const value = obj(parseTransformValue(text));
    if (
      value.format !== "rsswag-gateway-composition" ||
      value.formatVersion !== 1
    )
      throw new ComposerError("project");
    return checkProject(value.project);
  } catch (error) {
    if (error instanceof ComposerError) throw error;
    throw new ComposerError(
      error instanceof TransformError && error.code === "limit"
        ? "limit"
        : "project",
    );
  }
}
export function serializeComposerProject(project: ComposerProject) {
  const text =
    JSON.stringify(
      {
        format: "rsswag-gateway-composition",
        formatVersion: 1,
        project: checkProject(project),
      },
      null,
      2,
    ) + "\n";
  if (getByteSize(text) > MAX_COMPOSER_BYTES) throw new ComposerError("limit");
  return text;
}
export function addComposerServices(
  project: ComposerProject,
  inputs: { name: string; text: string }[],
): ComposerProject {
  if (project.services.length + inputs.length > MAX_COMPOSER_SERVICES)
    throw new ComposerError("limit");
  const services = [...project.services];
  for (const input of inputs) {
    const document = readComposerSource(input.text);
    let index = 1;
    while (
      services.some(
        (s) =>
          s.key === `service-${index}` || s.namespace === `service-${index}`,
      )
    )
      index++;
    const key = `service-${index}`;
    services.push({
      key,
      name: (textValue(obj(document.info).title) || input.name).slice(0, 200),
      namespace: key,
      prefix: `/${key}`,
      enabled: true,
      text: input.text,
    });
  }
  return checkProject({ ...project, services });
}

/** Walk only OpenAPI/JSON Schema structural fields. Payloads and extensions are
 * opaque data, even when their keys are named $ref, security, or operationId. */
function walk(
  value: JsonValue,
  kind: Kind,
  parts: string[],
  visit: (node: Obj, kind: Kind, parts: string[]) => void,
): JsonValue {
  if (!isObj(value)) return value;
  const result = { ...value };
  const child = (key: string, type: Kind) => {
    if (Object.hasOwn(result, key))
      result[key] = walk(result[key], type, [...parts, key], visit);
  };
  const map = (key: string, type: Kind) => {
    if (isObj(result[key]))
      result[key] = Object.fromEntries(
        Object.entries(result[key]).map(([name, v]) => [
          name,
          key === "responses" && name.startsWith("x-")
            ? v
            : walk(v, type, [...parts, key, name], visit),
        ]),
      );
  };
  const array = (key: string, type: Kind) => {
    if (Array.isArray(result[key]))
      result[key] = result[key].map((v, i) =>
        walk(v, type, [...parts, key, String(i)], visit),
      );
  };
  if (kind === "path") {
    for (const method of METHODS) child(method, "operation");
    array("parameters", "parameter");
  } else if (kind === "operation") {
    array("parameters", "parameter");
    child("requestBody", "requestBody");
    map("responses", "response");
    map("callbacks", "callback");
  } else if (kind === "schema") {
    for (const key of [
      "properties",
      "patternProperties",
      "$defs",
      "definitions",
      "dependentSchemas",
    ])
      map(key, "schema");
    for (const key of [
      "items",
      "additionalProperties",
      "unevaluatedProperties",
      "propertyNames",
      "contains",
      "if",
      "then",
      "else",
      "not",
      "contentSchema",
      "additionalItems",
      "unevaluatedItems",
    ])
      child(key, "schema");
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"])
      array(key, "schema");
    map("dependencies", "schema");
  } else if (["parameter", "header", "media"].includes(kind)) {
    child("schema", "schema");
    map("examples", "example");
    map("content", "media");
    if (kind === "media") map("encoding", "encoding");
  } else if (kind === "response") {
    map("content", "media");
    map("headers", "header");
    map("links", "link");
  } else if (kind === "requestBody") map("content", "media");
  else if (kind === "encoding") map("headers", "header");
  else if (kind === "callback")
    for (const [key, item] of Object.entries(result)) {
      if (key !== "$ref" && !key.startsWith("x-"))
        result[key] = walk(item, "path", [...parts, key], visit);
    }
  visit(result, kind, parts);
  return result;
}
function walkDocument(
  source: Obj,
  visit: (node: Obj, kind: Kind, parts: string[]) => void,
): Obj {
  const document = { ...source };
  for (const location of ["paths", "webhooks"])
    if (isObj(source[location]))
      document[location] = Object.fromEntries(
        Object.entries(source[location]).map(([name, item]) => [
          name,
          name.startsWith("x-")
            ? item
            : walk(item, "path", [location, name], visit),
        ]),
      );
  document.components = Object.fromEntries(
    Object.entries(obj(source.components)).map(([bucket, values]) => [
      bucket,
      Object.hasOwn(COMPONENTS, bucket) && isObj(values)
        ? Object.fromEntries(
            Object.entries(values).map(([name, item]) => [
              name,
              walk(
                item,
                COMPONENTS[bucket],
                ["components", bucket, name],
                visit,
              ),
            ]),
          )
        : values,
    ]),
  );
  return document;
}
function normalizePrefix(value: string): string | null {
  const prefix = value.trim().replace(/\/+$/, "");
  if (!prefix) return "";
  return /^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+$/.test(prefix) &&
    !prefix.split("/").some((p) => p === "." || p === "..")
    ? prefix
    : null;
}
function serverUrls(value: JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.flatMap((server) =>
        isObj(server) && typeof server.url === "string" ? [server.url] : [],
      )
    : [];
}

export function composeApis(input: ComposerProject): ComposerResult {
  const project = checkProject(input);
  if (!project.title.trim() || !project.version.trim())
    throw new ComposerError("settings");
  try {
    const url = new URL(project.gatewayUrl);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /[{}\s\\]/.test(project.gatewayUrl)
    )
      throw new Error();
  } catch {
    throw new ComposerError("settings");
  }
  const services = project.services.filter((s) => s.enabled);
  if (!services.length) throw new ComposerError("empty");
  const first = readComposerSource(services[0].text);
  const family = textValue(first.openapi).slice(0, 3);
  const dialect =
    textValue(first.jsonSchemaDialect) || (family === "3.1" ? OAS_DIALECT : "");
  const document: Obj = {
    openapi: first.openapi,
    info: { title: project.title.trim(), version: project.version.trim() },
    servers: [{ url: project.gatewayUrl.replace(/\/+$/, "") }],
    paths: {},
    components: {},
    tags: [],
    "x-gateway-services": {},
  };
  if (first.jsonSchemaDialect)
    document.jsonSchemaDialect = first.jsonSchemaDialect;
  const paths: Obj = Object.create(null),
    components: Obj = Object.create(null),
    webhooks: Obj = Object.create(null),
    catalog: Obj = Object.create(null);
  const tags = new Map<string, Obj>();
  const routes: ComposerRoute[] = [],
    issues: ComposerIssue[] = [];
  const references: { target: string[]; report: () => void }[] = [];
  let issueCount = 0,
    blocked = false,
    componentCount = 0,
    operationCount = 0;
  let inheritanceBytes = 0,
    inheritanceNodes = 0,
    discriminatorChecks = 0;
  // Root defaults may be copied into many operations. Bound that expansion
  // before allocating a document much larger than the imported sources.
  function reserveInheritance(value: JsonValue) {
    inheritanceBytes += getByteSize(JSON.stringify(value));
    if (inheritanceBytes > MAX_COMPOSER_BYTES) throw new ComposerError("limit");
    function count(entry: JsonValue) {
      if (++inheritanceNodes > 50_000) throw new ComposerError("limit");
      if (entry && typeof entry === "object")
        Object.values(entry).forEach(count);
    }
    count(value);
  }
  const namespaces = new Set<string>(),
    shapes = new Map<string, string>();
  for (const service of services) {
    const source = readComposerSource(service.text);
    const seenIssues = new Set<string>();
    const issue = (
      code: ComposerIssueCode,
      parts: string[] = [],
      severity: "error" | "warning" = "error",
    ) => {
      if (severity === "error") blocked = true;
      const key = `${code} ${pointer(parts)}`;
      if (seenIssues.has(key)) return;
      seenIssues.add(key);
      issueCount++;
      const next = {
        serviceKey: service.key,
        pointer: pointer(parts),
        code,
        severity,
      };
      if (issues.length < 200) issues.push(next);
      else if (severity === "error") {
        const index = issues.findIndex((i) => i.severity === "warning");
        if (index >= 0) issues.splice(index, 1, next);
      }
    };
    const prefix = normalizePrefix(service.prefix);
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(service.namespace) || prefix === null) {
      issue("settings");
      continue;
    }
    if (namespaces.has(service.namespace)) {
      issue("namespace");
      continue;
    }
    namespaces.add(service.namespace);
    if (Object.hasOwn(source, "components") && !isObj(source.components))
      issue("shape", ["components"]);
    if (Object.hasOwn(source, "webhooks") && !isObj(source.webhooks))
      issue("shape", ["webhooks"]);
    if (
      textValue(source.openapi).slice(0, 3) !== family ||
      (textValue(source.jsonSchemaDialect) ||
        (family === "3.1" ? OAS_DIALECT : "")) !== dialect
    ) {
      issue("version");
      continue;
    }
    if (dialect && !DIALECTS.has(dialect))
      issue("schemaScope", ["jsonSchemaDialect"]);
    if (
      family === "3.0" &&
      (source.webhooks ||
        obj(source.components).pathItems ||
        source.jsonSchemaDialect)
    ) {
      issue("version");
      continue;
    }
    const ns = service.namespace;
    const name = (value: string) => `${ns}__${value}`;
    const pathName = (value: string) => prefix + value;
    const tagName = (value: string) => `${ns}: ${value}`;
    const originalOperations = new Map<string, string>();
    const operationPointers = new Map<string, string>();
    const gatewayOperationIds = new Set<string>();
    let nextId = 0;
    walkDocument(source, (node, kind, parts) => {
      if (kind !== "operation") return;
      if (++operationCount > 1000) throw new ComposerError("limit");
      const original = textValue(node.operationId),
        location = pointer(parts);
      const id = original ? `${ns}__id_${original}` : `${ns}__auto_${++nextId}`;
      operationPointers.set(location, id);
      if (parts[0] === "paths" && parts.length === 3)
        gatewayOperationIds.add(id);
      if (original) {
        if (originalOperations.has(original))
          issue("operationId", [...parts, "operationId"]);
        originalOperations.set(original, id);
      }
    });
    function reference(
      value: string,
      parts: string[],
      operation = false,
    ): string {
      if (!value.startsWith("#")) {
        issue("external", parts);
        return value;
      }
      let target: string[];
      try {
        target = parseTransformPointer(decodeURIComponent(value.slice(1)));
      } catch {
        issue("reference", parts);
        return value;
      }
      if (
        at(source, target) === undefined ||
        (operation && !operationPointers.has(pointer(target)))
      ) {
        issue(operation ? "link" : "reference", parts);
        return value;
      }
      const [root, bucket, entry, ...rest] = target;
      let mapped: string[] | undefined;
      if (
        root === "components" &&
        bucket &&
        entry &&
        Object.hasOwn(COMPONENTS, bucket)
      )
        mapped = [root, bucket, name(entry), ...rest];
      if (root === "paths" && bucket?.startsWith("/"))
        mapped = [root, pathName(bucket), ...target.slice(2)];
      if (root === "webhooks" && bucket && !bucket.startsWith("x-"))
        mapped = [root, name(bucket), ...target.slice(2)];
      if (mapped) {
        references.push({
          target: mapped,
          report: () => issue("reference", parts),
        });
        return pointer(mapped);
      }
      issue("reference", parts);
      return value;
    }
    function security(value: JsonValue, parts: string[]): JsonValue {
      reserveInheritance(value);
      if (!Array.isArray(value)) {
        issue("security", parts);
        return [];
      }
      return value.map((group, index) => {
        if (!isObj(group)) {
          issue("security", [...parts, String(index)]);
          return {};
        }
        return Object.fromEntries(
          Object.entries(group).map(([key, scopes]) => {
            if (
              !Object.hasOwn(
                obj(obj(source.components).securitySchemes),
                key,
              ) ||
              !Array.isArray(scopes) ||
              scopes.some((s) => typeof s !== "string")
            )
              issue("security", [...parts, String(index), key]);
            return [name(key), scopes];
          }),
        );
      });
    }
    const transformed = walkDocument(source, (node, kind, parts) => {
      if (Object.keys(node).some((key) => key.startsWith("x-")))
        issue("extensions", [], "warning");
      if (Object.hasOwn(node, "$ref")) {
        if (kind === "path") issue("pathRef", [...parts, "$ref"]);
        if (typeof node.$ref !== "string")
          issue("reference", [...parts, "$ref"]);
        else node.$ref = reference(node.$ref, [...parts, "$ref"]);
      }
      if (kind === "schema") {
        if (
          Object.hasOwn(node, "$schema") &&
          !DIALECTS.has(textValue(node.$schema))
        )
          issue("schemaScope", [...parts, "$schema"]);
        if (
          [
            "$id",
            "$anchor",
            "$dynamicAnchor",
            "$dynamicRef",
            "$recursiveRef",
            "$recursiveAnchor",
          ].some((key) => Object.hasOwn(node, key))
        )
          issue("schemaScope", parts);
        if (isObj(node.discriminator)) {
          const discriminator = { ...node.discriminator };
          if (
            !isObj(discriminator.mapping) ||
            !Object.keys(discriminator.mapping).length
          )
            issue("discriminator", [...parts, "discriminator"]);
          else {
            // Named union members and inherited subtypes must have
            // explicit mappings: their old implicit names disappear on rename.
            const canonical = (value: JsonValue): string => {
              if (typeof value !== "string") return "";
              const ref = Object.hasOwn(
                obj(obj(source.components).schemas),
                value,
              )
                ? pointer(["components", "schemas", value])
                : value;
              try {
                return ref.startsWith("#")
                  ? pointer(
                      parseTransformPointer(decodeURIComponent(ref.slice(1))),
                    )
                  : ref;
              } catch {
                return "";
              }
            };
            const mapped = new Set(
              Object.values(discriminator.mapping).map(canonical),
            );
            const originalNode = obj(at(source, parts));
            const members = [originalNode.oneOf, originalNode.anyOf].flatMap(
              (value) =>
                Array.isArray(value)
                  ? value.flatMap((member) =>
                      typeof obj(member).$ref === "string"
                        ? [canonical(obj(member).$ref)]
                        : [],
                    )
                  : [],
            );
            const descendants = new Set([pointer(parts)]);
            let added = true;
            while (added) {
              added = false;
              for (const [key, candidate] of Object.entries(
                obj(obj(source.components).schemas),
              )) {
                if (++discriminatorChecks > 100_000)
                  throw new ComposerError("limit");
                const target = pointer(["components", "schemas", key]);
                const allOf = obj(candidate).allOf;
                if (
                  !descendants.has(target) &&
                  Array.isArray(allOf) &&
                  allOf.some((parent) =>
                    descendants.has(canonical(obj(parent).$ref)),
                  )
                ) {
                  descendants.add(target);
                  members.push(target);
                  added = true;
                }
              }
            }
            if (members.some((member) => !mapped.has(member)))
              issue("discriminator", [...parts, "discriminator"]);
            discriminator.mapping = Object.fromEntries(
              Object.entries(discriminator.mapping).map(([key, value]) => {
                if (typeof value !== "string") {
                  issue("discriminator", [
                    ...parts,
                    "discriminator",
                    "mapping",
                    key,
                  ]);
                  return [key, value];
                }
                const ref = Object.hasOwn(
                  obj(obj(source.components).schemas),
                  value,
                )
                  ? pointer(["components", "schemas", value])
                  : value;
                return [
                  key,
                  reference(ref, [...parts, "discriminator", "mapping", key]),
                ];
              }),
            );
          }
          node.discriminator = discriminator;
        }
      }
      if (kind === "link") {
        let gatewayLink = false;
        if (
          typeof node.operationRef === "string" &&
          node.operationRef.startsWith("#")
        ) {
          try {
            const target = parseTransformPointer(
              decodeURIComponent(node.operationRef.slice(1)),
            );
            gatewayLink =
              target[0] === "paths" &&
              target.length === 3 &&
              operationPointers.has(pointer(target));
          } catch {
            /* Reference diagnostics are added below. */
          }
        }
        if (typeof node.operationRef === "string")
          node.operationRef = reference(
            node.operationRef,
            [...parts, "operationRef"],
            true,
          );
        if (typeof node.operationId === "string") {
          if (!originalOperations.has(node.operationId))
            issue("link", [...parts, "operationId"]);
          else {
            node.operationId = originalOperations.get(node.operationId)!;
            gatewayLink ||= gatewayOperationIds.has(node.operationId);
          }
        }
        if (gatewayLink) delete node.server;
      }
      const gatewayPath = parts[0] === "paths" && parts.length === 2;
      const gatewayOperation = parts[0] === "paths" && parts.length === 3;
      if (kind === "path" && gatewayPath) delete node.servers;
      if (kind === "operation") {
        node.operationId = operationPointers.get(pointer(parts))!;
        node.security = security(
          Object.hasOwn(node, "security")
            ? node.security
            : Object.hasOwn(source, "security")
              ? source.security
              : [],
          [...parts, "security"],
        );
        const originalTags = Array.isArray(node.tags)
          ? node.tags.filter((t): t is string => typeof t === "string")
          : [];
        const mappedTags = originalTags.length
          ? originalTags.map(tagName)
          : [ns];
        node.tags = mappedTags;
        for (const tag of mappedTags)
          if (!tags.has(tag)) tags.set(tag, { name: tag });
        if (gatewayOperation) delete node.servers;
        else if (!Object.hasOwn(node, "servers")) {
          const parent = obj(at(source, parts.slice(0, -1)));
          if (!Object.hasOwn(parent, "servers")) {
            const servers = source.servers ?? [{ url: "/" }];
            reserveInheritance(servers);
            node.servers = clone(servers);
          }
        }
      }
    });
    if (Object.keys(source).some((k) => k.startsWith("x-")))
      issue("extensions", [], "warning");
    catalog[ns] = {
      name: service.name,
      prefix,
      info: clone(source.info),
      ...(source.externalDocs
        ? { externalDocs: clone(source.externalDocs) }
        : {}),
      extensions: Object.fromEntries(
        Object.entries(source).filter(([k]) => k.startsWith("x-")),
      ),
    };
    tags.set(ns, { name: ns, description: service.name });
    for (const tag of Array.isArray(source.tags) ? source.tags : [])
      if (isObj(tag) && typeof tag.name === "string")
        tags.set(tagName(tag.name), { ...tag, name: tagName(tag.name) });
    for (const [bucket, values] of Object.entries(
      obj(transformed.components),
    )) {
      if (bucket.startsWith("x-")) {
        components[`x-${ns}-${bucket.slice(2)}`] = values;
        issue("extensions", ["components", bucket], "warning");
        continue;
      }
      if (!Object.hasOwn(COMPONENTS, bucket) || !isObj(values)) {
        issue("shape", ["components", bucket]);
        continue;
      }
      const destination = obj(components[bucket]);
      for (const [key, value] of Object.entries(values)) {
        if (!/^[a-zA-Z0-9._-]+$/.test(key))
          issue("shape", ["components", bucket, key]);
        Object.defineProperty(destination, name(key), {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        componentCount++;
      }
      components[bucket] = destination;
    }
    for (const [path, item] of Object.entries(obj(transformed.paths))) {
      if (path.startsWith("x-")) {
        paths[`x-${ns}-${path.slice(2)}`] = item;
        issue("extensions", ["paths", path], "warning");
        continue;
      }
      if (!path.startsWith("/") || /[?#\\\s]/.test(path) || !isObj(item)) {
        issue("shape", ["paths", path]);
        continue;
      }
      const outputPath = pathName(path),
        shape = outputPath.replace(/\{[^{}]+\}/g, "{}");
      if (
        Object.keys(item).some(
          (k) =>
            !METHODS.has(k) &&
            ![
              "$ref",
              "summary",
              "description",
              "parameters",
              "servers",
            ].includes(k) &&
            !k.startsWith("x-"),
        )
      )
        issue("shape", ["paths", path]);
      if (Object.hasOwn(paths, outputPath) || shapes.has(shape)) {
        issue("collision", ["paths", path]);
        continue;
      }
      shapes.set(shape, outputPath);
      paths[outputPath] = item;
      for (const [method, operation] of Object.entries(item))
        if (METHODS.has(method)) {
          if (!isObj(operation) || !isObj(operation.responses)) {
            issue("shape", ["paths", path, method]);
            continue;
          }
          const originalPath = obj(obj(source.paths)[path]),
            original = obj(originalPath[method]);
          routes.push({
            serviceKey: service.key,
            namespace: ns,
            method: method.toUpperCase(),
            sourcePath: path,
            gatewayPath: outputPath,
            operationId: textValue(operation.operationId),
            upstreamServers: serverUrls(
              original.servers ?? originalPath.servers ?? source.servers,
            ),
          });
        }
    }
    for (const [key, value] of Object.entries(obj(transformed.webhooks))) {
      if (key.startsWith("x-")) {
        webhooks[`x-${ns}-${key.slice(2)}`] = value;
        issue("extensions", ["webhooks", key], "warning");
        continue;
      }
      webhooks[name(key)] = value;
    }
  }
  document.paths = paths;
  document.components = components;
  document.tags = [...tags.values()];
  document["x-gateway-services"] = catalog;
  if (Object.keys(webhooks).length) document.webhooks = webhooks;
  for (const ref of references)
    if (at(document, ref.target) === undefined) ref.report();
  return {
    document,
    routes,
    issues,
    issueCount,
    canExport: !blocked && routes.length > 0,
    serviceCount: services.length,
    componentCount,
  };
}
export function serializeComposedApi(
  result: ComposerResult,
  format: SchemaFormat,
): string {
  if (!result.canExport) throw new ComposerError("output");
  const json = JSON.stringify(result.document, null, 2) + "\n";
  if (getByteSize(json) > MAX_COMPOSER_BYTES) throw new ComposerError("limit");
  try {
    readTransformSource(json);
  } catch {
    throw new ComposerError("output");
  }
  const text =
    format === "json"
      ? json
      : YAML.stringify(result.document, { lineWidth: 0 });
  if (getByteSize(text) > MAX_COMPOSER_BYTES) throw new ComposerError("limit");
  return text;
}
export function serializeComposerInventory(result: ComposerResult) {
  const text =
    JSON.stringify(
      {
        format: "rsswag-gateway-routing-inventory",
        formatVersion: 1,
        routes: result.routes,
        diagnostics: result.issues,
        diagnosticCount: result.issueCount,
        complete: result.canExport,
      },
      null,
      2,
    ) + "\n";
  if (getByteSize(text) > MAX_COMPOSER_BYTES) throw new ComposerError("limit");
  return text;
}
