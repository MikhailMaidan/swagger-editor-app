import YAML from "yaml";
import {
  escapeTransformPointer,
  parseTransformPointer,
  readTransformSource,
  TransformError,
  type JsonValue,
} from "./api-transform";
import { parseOpenApiSchema, type SchemaFormat } from "./openapi";
import { getByteSize } from "./text-encoding";

export const MAX_LOCALIZATION_SOURCE_BYTES = 2 * 1024 * 1024;
export const MAX_LOCALIZATION_PROJECT_BYTES = 16 * 1024 * 1024;
export const MAX_LOCALIZATION_CATALOG_BYTES = 8 * 1024 * 1024;
export const MAX_LOCALIZATION_TEXT_BYTES = 64 * 1024;
export const MAX_LOCALIZATION_ENTRIES = 5000;
export const MAX_LOCALIZATION_LOCALES = 20;
export type DocumentationField = "title" | "summary" | "description";
export type DocumentationSection = "info" | "operations" | "schemas" | "other";
export type TranslationStatus = "missing" | "draft" | "reviewed" | "stale";
export type DocumentationEntry = {
  pointer: string;
  field: DocumentationField;
  section: DocumentationSection;
  source: string;
};
export type DocumentationSource = {
  text: string;
  document: Record<string, JsonValue>;
  format: SchemaFormat;
  title: string;
  entries: DocumentationEntry[];
};
export type DocumentationTranslation = {
  pointer: string;
  source: string;
  text: string;
  reviewed: boolean;
};
export type DocumentationCatalog = {
  locale: string;
  translations: DocumentationTranslation[];
};
export type LocalizationProject = {
  kind: "rsswag-documentation-localization";
  version: 1;
  name: string;
  source: string;
  locales: DocumentationCatalog[];
};
export type LocalizationPolicy = "fallback" | "strict";
export type LocalizationSummary = Record<TranslationStatus, number> & {
  total: number;
  orphaned: number;
};
export type LocalizedDocumentation = {
  locale: string;
  document: Record<string, JsonValue>;
  summary: LocalizationSummary;
  translated: number;
  ready: boolean;
};
export type LocalizationIssue =
  | "source"
  | "limit"
  | "locale"
  | "catalog"
  | "project"
  | "csv"
  | "text"
  | "result";
export class LocalizationError extends Error {
  constructor(public code: LocalizationIssue) {
    super(code);
  }
}
const object = (v: unknown): v is Record<string, JsonValue> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (
  v: Record<string, JsonValue>,
  key: string,
): JsonValue | undefined => (Object.hasOwn(v, key) ? v[key] : undefined);
const fields: DocumentationField[] = ["title", "summary", "description"];
const methods = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
];

// Walk specification objects, never arbitrary strings inside examples, defaults,
// extensions, expressions, or schema constraints. References are not fetched.
export function readDocumentationSource(text: string): DocumentationSource {
  let source;
  try {
    source = readTransformSource(text);
  } catch (error) {
    throw new LocalizationError(
      error instanceof TransformError && error.code === "limit"
        ? "limit"
        : "source",
    );
  }
  if (!object(source.document)) throw new LocalizationError("source");
  const entries: DocumentationEntry[] = [];
  const pointer = (path: string, key: string | number) =>
    `${path}/${escapeTransformPointer(String(key))}`;
  type Visitor = (
    value: JsonValue | undefined,
    path: string,
    section: DocumentationSection,
  ) => void;
  const annotations = (
    value: Record<string, JsonValue>,
    path: string,
    section: DocumentationSection,
    allowed: DocumentationField[],
  ) => {
    for (const field of allowed) {
      const text = own(value, field);
      if (typeof text !== "string" || !text.trim()) continue;
      const location = pointer(path, field);
      try {
        parseTransformPointer(location);
      } catch {
        throw new LocalizationError("limit");
      }
      entries.push({ pointer: location, field, section, source: text });
      if (entries.length > MAX_LOCALIZATION_ENTRIES)
        throw new LocalizationError("limit");
    }
  };
  const map = (
    value: JsonValue | undefined,
    path: string,
    section: DocumentationSection,
    visit: Visitor,
    skipExtensions = false,
  ) => {
    if (object(value))
      for (const [key, child] of Object.entries(value)) {
        if (skipExtensions && key.startsWith("x-")) continue;
        visit(child, pointer(path, key), section);
      }
  };
  const array = (
    value: JsonValue | undefined,
    path: string,
    section: DocumentationSection,
    visit: Visitor,
  ) => {
    if (Array.isArray(value))
      value.forEach((child, index) =>
        visit(child, pointer(path, index), section),
      );
  };
  const child = (
    value: Record<string, JsonValue>,
    path: string,
    section: DocumentationSection,
    key: string,
    visit: Visitor,
  ) => visit(own(value, key), pointer(path, key), section);
  const description: Visitor = (value, path, section) => {
    if (object(value)) annotations(value, path, section, ["description"]);
  };
  const example: Visitor = (value, path, section) => {
    if (object(value))
      annotations(value, path, section, ["summary", "description"]);
  };
  const externalDocs = (
    value: Record<string, JsonValue>,
    path: string,
    section: DocumentationSection,
  ) => child(value, path, section, "externalDocs", description);
  const schema: Visitor = (value, path) => {
    if (!object(value)) return;
    const section = "schemas";
    annotations(value, path, section, ["title", "description"]);
    externalDocs(value, path, section);
    for (const key of [
      "properties",
      "patternProperties",
      "$defs",
      "definitions",
      "dependentSchemas",
    ]) {
      map(own(value, key), pointer(path, key), section, schema);
    }
    // Draft-04 dependencies may contain either schemas or property-name arrays.
    map(
      own(value, "dependencies"),
      pointer(path, "dependencies"),
      section,
      (v, p, s) => {
        if (object(v)) schema(v, p, s);
      },
    );
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"])
      array(own(value, key), pointer(path, key), section, schema);
    const items = own(value, "items");
    if (Array.isArray(items))
      array(items, pointer(path, "items"), section, schema);
    else child(value, path, section, "items", schema);
    for (const key of [
      "additionalItems",
      "additionalProperties",
      "unevaluatedItems",
      "unevaluatedProperties",
      "contains",
      "not",
      "if",
      "then",
      "else",
      "propertyNames",
      "contentSchema",
    ])
      child(value, path, section, key, schema);
  };
  const server: Visitor = (value, path, section) => {
    if (!object(value)) return;
    description(value, path, section);
    map(
      own(value, "variables"),
      pointer(path, "variables"),
      section,
      description,
    );
  };
  const media: Visitor = (value, path, section) => {
    if (!object(value)) return;
    child(value, path, section, "schema", schema);
    map(own(value, "examples"), pointer(path, "examples"), section, example);
    map(
      own(value, "encoding"),
      pointer(path, "encoding"),
      section,
      (encoding, p, s) => {
        if (object(encoding))
          map(own(encoding, "headers"), pointer(p, "headers"), s, parameter);
      },
    );
  };
  const body: Visitor = (value, path, section) => {
    if (!object(value)) return;
    annotations(value, path, section, ["summary", "description"]);
    child(value, path, section, "schema", schema);
    map(own(value, "content"), pointer(path, "content"), section, media);
  };
  const parameter: Visitor = (value, path, section) => {
    if (!object(value)) return;
    body(value, path, section);
    map(own(value, "examples"), pointer(path, "examples"), section, example);
    // Swagger 2 non-body parameters and response headers have inline items.
    child(value, path, section, "items", schema);
  };
  const link: Visitor = (value, path, section) => {
    if (!object(value)) return;
    annotations(value, path, section, ["summary", "description"]);
    child(value, path, section, "server", server);
  };
  const response: Visitor = (value, path, section) => {
    if (!object(value)) return;
    body(value, path, section);
    map(own(value, "headers"), pointer(path, "headers"), section, parameter);
    map(own(value, "links"), pointer(path, "links"), section, link);
  };
  const callback: Visitor = (value, path, section) => {
    if (!object(value)) return;
    annotations(value, path, section, ["summary", "description"]);
    for (const [key, v] of Object.entries(value))
      if (
        !key.startsWith("x-") &&
        key !== "$ref" &&
        key !== "summary" &&
        key !== "description"
      )
        pathItem(v, pointer(path, key), section);
  };
  const operation: Visitor = (value, path, section) => {
    if (!object(value)) return;
    annotations(value, path, section, ["summary", "description"]);
    externalDocs(value, path, section);
    array(
      own(value, "parameters"),
      pointer(path, "parameters"),
      section,
      parameter,
    );
    child(value, path, section, "requestBody", body);
    map(
      own(value, "responses"),
      pointer(path, "responses"),
      section,
      response,
      true,
    );
    map(own(value, "callbacks"), pointer(path, "callbacks"), section, callback);
    array(own(value, "servers"), pointer(path, "servers"), section, server);
  };
  const pathItem: Visitor = (value, path, section) => {
    if (!object(value)) return;
    annotations(value, path, section, ["summary", "description"]);
    for (const method of methods)
      child(value, path, section, method, operation);
    map(
      own(value, "additionalOperations"),
      pointer(path, "additionalOperations"),
      section,
      operation,
    );
    array(
      own(value, "parameters"),
      pointer(path, "parameters"),
      section,
      parameter,
    );
    array(own(value, "servers"), pointer(path, "servers"), section, server);
  };
  const root = source.document;
  const info = own(root, "info");
  if (object(info)) annotations(info, "/info", "info", fields);
  externalDocs(root, "", "info");
  const paths = own(root, "paths");
  if (object(paths))
    for (const [key, value] of Object.entries(paths))
      if (key.startsWith("/"))
        pathItem(value, pointer("/paths", key), "operations");
  map(own(root, "webhooks"), "/webhooks", "operations", pathItem);
  array(own(root, "tags"), "/tags", "other", (value, path, section) => {
    if (object(value)) {
      annotations(value, path, section, ["summary", "description"]);
      externalDocs(value, path, section);
    }
  });
  array(own(root, "servers"), "/servers", "other", server);
  map(own(root, "definitions"), "/definitions", "schemas", schema);
  map(own(root, "parameters"), "/parameters", "other", parameter);
  map(own(root, "responses"), "/responses", "other", response);
  map(
    own(root, "securityDefinitions"),
    "/securityDefinitions",
    "other",
    description,
  );
  const components = own(root, "components");
  if (object(components)) {
    const visitors: Record<string, Visitor> = {
      schemas: schema,
      parameters: parameter,
      headers: parameter,
      requestBodies: body,
      responses: response,
      examples: example,
      links: link,
      callbacks: callback,
      pathItems: pathItem,
      securitySchemes: description,
    };
    for (const [key, visit] of Object.entries(visitors))
      map(
        own(components, key),
        pointer("/components", key),
        key === "schemas" ? "schemas" : "other",
        visit,
      );
  }
  return { ...source, document: root, entries };
}

export function normalizeDocumentationLocale(locale: string): string {
  if (typeof locale !== "string" || locale.length > 64 || !locale.trim())
    throw new LocalizationError("locale");
  try {
    return Intl.getCanonicalLocales(locale.trim())[0];
  } catch {
    throw new LocalizationError("locale");
  }
}
export function emptyLocalizationProject(): LocalizationProject {
  return {
    kind: "rsswag-documentation-localization",
    version: 1,
    name: "API documentation",
    source: "",
    locales: [],
  };
}
export function translationStatus(
  entry: DocumentationEntry,
  translation?: DocumentationTranslation,
): TranslationStatus {
  if (!translation?.text.trim()) return "missing";
  if (translation.source !== entry.source) return "stale";
  return translation.reviewed ? "reviewed" : "draft";
}
export function localizationSummary(
  source: DocumentationSource,
  catalog: DocumentationCatalog,
): LocalizationSummary {
  const translations = new Map(catalog.translations.map((t) => [t.pointer, t]));
  const pointers = new Set(source.entries.map((e) => e.pointer));
  const summary: LocalizationSummary = {
    total: source.entries.length,
    missing: 0,
    draft: 0,
    reviewed: 0,
    stale: 0,
    orphaned: 0,
  };
  source.entries.forEach(
    (entry) =>
      summary[translationStatus(entry, translations.get(entry.pointer))]++,
  );
  summary.orphaned = catalog.translations.filter(
    (t) => !pointers.has(t.pointer),
  ).length;
  return summary;
}
function size(text: string, max: number) {
  if (getByteSize(text) > max) throw new LocalizationError("limit");
}
function readJson(text: string, max: number, code: "catalog" | "project") {
  size(text, max);
  try {
    const value: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
    // Reject excessive nesting/node counts without recursive traversal.
    const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    let nodes = 0;
    while (pending.length) {
      const { value: v, depth } = pending.pop()!;
      if (++nodes > 250000 || depth > 64) throw new LocalizationError("limit");
      if (v !== null && typeof v === "object")
        for (const child of Object.values(v)) {
          pending.push({ value: child, depth: depth + 1 });
          if (nodes + pending.length > 250000)
            throw new LocalizationError("limit");
        }
    }
    return value;
  } catch (error) {
    throw error instanceof LocalizationError
      ? error
      : new LocalizationError(code);
  }
}
function readCatalog(value: unknown): DocumentationCatalog {
  if (
    !object(value) ||
    typeof value.locale !== "string" ||
    !Array.isArray(value.translations)
  )
    throw new LocalizationError("catalog");
  if (value.translations.length > MAX_LOCALIZATION_ENTRIES)
    throw new LocalizationError("limit");
  const seen = new Set<string>();
  const translations = value.translations.map((entry) => {
    if (
      !object(entry) ||
      typeof entry.pointer !== "string" ||
      typeof entry.source !== "string" ||
      typeof entry.text !== "string" ||
      typeof entry.reviewed !== "boolean"
    )
      throw new LocalizationError("catalog");
    let parts: string[];
    try {
      parts = parseTransformPointer(entry.pointer);
    } catch {
      throw new LocalizationError("catalog");
    }
    if (
      !parts.length ||
      !fields.includes(parts.at(-1) as DocumentationField) ||
      seen.has(entry.pointer)
    )
      throw new LocalizationError("catalog");
    seen.add(entry.pointer);
    size(entry.source, MAX_LOCALIZATION_SOURCE_BYTES);
    if (getByteSize(entry.text) > MAX_LOCALIZATION_TEXT_BYTES)
      throw new LocalizationError("text");
    return {
      pointer: entry.pointer,
      source: entry.source,
      text: entry.text,
      reviewed: entry.reviewed,
    };
  });
  return { locale: normalizeDocumentationLocale(value.locale), translations };
}
export function addDocumentationLocale(
  project: LocalizationProject,
  locale: string,
): LocalizationProject {
  const normalized = normalizeDocumentationLocale(locale);
  if (project.locales.some((c) => c.locale === normalized))
    throw new LocalizationError("locale");
  if (project.locales.length >= MAX_LOCALIZATION_LOCALES)
    throw new LocalizationError("limit");
  return {
    ...project,
    locales: [...project.locales, { locale: normalized, translations: [] }],
  };
}
export function updateDocumentationTranslation(
  project: LocalizationProject,
  locale: string,
  entry: DocumentationEntry,
  text: string,
  reviewed = false,
): LocalizationProject {
  if (getByteSize(text) > MAX_LOCALIZATION_TEXT_BYTES)
    throw new LocalizationError("text");
  if (!project.locales.some((c) => c.locale === locale))
    throw new LocalizationError("locale");
  const translation: DocumentationTranslation = {
    pointer: entry.pointer,
    source: entry.source,
    text,
    reviewed: reviewed && Boolean(text.trim()),
  };
  const locales = project.locales.map((catalog) =>
    catalog.locale !== locale
      ? catalog
      : {
          ...catalog,
          translations: [
            ...catalog.translations.filter((t) => t.pointer !== entry.pointer),
            translation,
          ],
        },
  );
  if (locales.some((c) => c.translations.length > MAX_LOCALIZATION_ENTRIES))
    throw new LocalizationError("limit");
  size(JSON.stringify({ ...project, locales }), MAX_LOCALIZATION_PROJECT_BYTES);
  return { ...project, locales };
}
export function createLocalizedDocumentation(
  source: DocumentationSource,
  catalog: DocumentationCatalog,
  policy: LocalizationPolicy = "fallback",
): LocalizedDocumentation {
  const summary = localizationSummary(source, catalog);
  const document = JSON.parse(JSON.stringify(source.document)) as Record<
    string,
    JsonValue
  >;
  const translations = new Map(catalog.translations.map((t) => [t.pointer, t]));
  let translated = 0;
  for (const entry of source.entries) {
    const translation = translations.get(entry.pointer);
    // Both policies publish only reviewed, current text. Incomplete strict
    // results are previewable but cannot be serialized or applied.
    if (translationStatus(entry, translation) !== "reviewed" || !translation)
      continue;
    const parts = parseTransformPointer(entry.pointer);
    let parent: JsonValue = document;
    for (const part of parts.slice(0, -1)) {
      if (Array.isArray(parent)) parent = parent[Number(part)];
      else if (object(parent) && Object.hasOwn(parent, part))
        parent = parent[part];
      else throw new LocalizationError("result");
    }
    const key = parts.at(-1)!;
    if (!object(parent) || own(parent, key) !== entry.source)
      throw new LocalizationError("result");
    Object.defineProperty(parent, key, {
      value: translation.text,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    translated++;
  }
  return {
    locale: catalog.locale,
    document,
    summary,
    translated,
    ready: policy === "fallback" || translated === source.entries.length,
  };
}
export function serializeLocalizedDocumentation(
  result: LocalizedDocumentation,
  format: SchemaFormat,
): string {
  if (!result.ready) throw new LocalizationError("result");
  let text =
    format === "yaml"
      ? YAML.stringify(result.document, { lineWidth: 0 })
      : JSON.stringify(result.document, null, 2);
  if (format === "json" && getByteSize(text) > MAX_LOCALIZATION_SOURCE_BYTES)
    text = JSON.stringify(result.document);
  size(text, MAX_LOCALIZATION_SOURCE_BYTES);
  // Reuse bounded reading so expanded translations cannot bypass limits.
  readDocumentationSource(text);
  if (!parseOpenApiSchema(text).ok) throw new LocalizationError("result");
  return text;
}
export function serializeLocalizationProject(
  project: LocalizationProject,
): string {
  const text = JSON.stringify(project, null, 2);
  size(text, MAX_LOCALIZATION_PROJECT_BYTES);
  parseLocalizationProject(text);
  return text;
}
export function parseLocalizationProject(text: string): {
  project: LocalizationProject;
  source: DocumentationSource;
} {
  const value = readJson(text, MAX_LOCALIZATION_PROJECT_BYTES, "project");
  if (
    !object(value) ||
    value.kind !== "rsswag-documentation-localization" ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 120 ||
    typeof value.source !== "string" ||
    !Array.isArray(value.locales)
  )
    throw new LocalizationError("project");
  if (value.locales.length > MAX_LOCALIZATION_LOCALES)
    throw new LocalizationError("limit");
  const source = readDocumentationSource(value.source);
  const locales = value.locales.map(readCatalog);
  if (new Set(locales.map((c) => c.locale)).size !== locales.length)
    throw new LocalizationError("locale");
  return {
    project: {
      kind: "rsswag-documentation-localization",
      version: 1,
      name: value.name.trim(),
      source: value.source,
      locales,
    },
    source,
  };
}
export function serializeDocumentationCatalog(
  catalog: DocumentationCatalog,
  source?: DocumentationSource,
): string {
  const translations = catalogRows(catalog, source);
  const text = JSON.stringify(
    {
      kind: "rsswag-documentation-catalog",
      version: 1,
      locale: catalog.locale,
      translations,
    },
    null,
    2,
  );
  size(text, MAX_LOCALIZATION_CATALOG_BYTES);
  parseDocumentationCatalog(text);
  return text;
}
export function parseDocumentationCatalog(text: string): DocumentationCatalog {
  const value = readJson(text, MAX_LOCALIZATION_CATALOG_BYTES, "catalog");
  if (
    !object(value) ||
    value.kind !== "rsswag-documentation-catalog" ||
    value.version !== 1
  )
    throw new LocalizationError("catalog");
  return readCatalog(value);
}
function catalogRows(
  catalog: DocumentationCatalog,
  source?: DocumentationSource,
): DocumentationTranslation[] {
  if (!source) return catalog.translations;
  const translations = new Map(catalog.translations.map((t) => [t.pointer, t]));
  const active = new Set(source.entries.map((e) => e.pointer));
  return [
    ...source.entries.map((entry) => ({
      ...(translations.get(entry.pointer) ?? {
        pointer: entry.pointer,
        source: entry.source,
        text: "",
        reviewed: false,
      }),
      currentSource: entry.source,
    })),
    ...catalog.translations.filter((t) => !active.has(t.pointer)),
  ];
}
export function mergeDocumentationCatalog(
  project: LocalizationProject,
  incoming: DocumentationCatalog,
  overwrite = false,
): { project: LocalizationProject; imported: number; kept: number } {
  const catalog = readCatalog(incoming);
  const previous = project.locales.find((c) => c.locale === catalog.locale);
  if (!previous && project.locales.length >= MAX_LOCALIZATION_LOCALES)
    throw new LocalizationError("limit");
  const translations = new Map(
    previous?.translations.map((t) => [t.pointer, t]) ?? [],
  );
  let imported = 0,
    kept = 0;
  for (const row of catalog.translations) {
    if (!overwrite && translations.get(row.pointer)?.text.trim()) {
      kept++;
      continue;
    }
    translations.set(row.pointer, row);
    imported++;
  }
  if (translations.size > MAX_LOCALIZATION_ENTRIES)
    throw new LocalizationError("limit");
  const merged = {
    locale: catalog.locale,
    translations: [...translations.values()],
  };
  const locales = previous
    ? project.locales.map((c) => (c.locale === merged.locale ? merged : c))
    : [...project.locales, merged];
  const next = { ...project, locales };
  size(JSON.stringify(next), MAX_LOCALIZATION_PROJECT_BYTES);
  return { project: next, imported, kept };
}

const csvHeaders = [
  "locale",
  "pointer",
  "source",
  "current_source",
  "translation",
  "reviewed",
];
const formula = /^(?:\s*[=+\-@]|[\t\r\n'])/;
function csvCell(value: string) {
  const safe = formula.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
function decodeCsvCell(value: string) {
  return value.startsWith("'") && formula.test(value.slice(1))
    ? value.slice(1)
    : value;
}
export function serializeDocumentationCsv(
  catalog: DocumentationCatalog,
  source?: DocumentationSource,
): string {
  const rows = catalogRows(catalog, source);
  if (rows.length > MAX_LOCALIZATION_ENTRIES)
    throw new LocalizationError("limit");
  const active = new Map(
    source?.entries.map((entry) => [entry.pointer, entry.source]) ?? [],
  );
  const text =
    [
      csvHeaders.join(","),
      ...rows.map((row) =>
        [
          catalog.locale,
          row.pointer,
          row.source,
          active.get(row.pointer) ?? "",
          row.text,
          String(row.reviewed),
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n";
  size(text, MAX_LOCALIZATION_CATALOG_BYTES);
  return text;
}
export function parseDocumentationCsv(text: string): DocumentationCatalog {
  size(text, MAX_LOCALIZATION_CATALOG_BYTES);
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const input = text.replace(/^\uFEFF/, "");
  const finishCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > csvHeaders.length) throw new LocalizationError("csv");
  };
  const finishRow = () => {
    finishCell();
    rows.push(row);
    row = [];
    if (rows.length > MAX_LOCALIZATION_ENTRIES + 1)
      throw new LocalizationError("limit");
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === ",") finishCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      finishRow();
    } else if (char === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new LocalizationError("csv");
      cell += char;
    }
  }
  if (quoted) throw new LocalizationError("csv");
  if (cell || row.length || closed) finishRow();
  const headers = rows.shift();
  if (
    !headers ||
    headers.length !== csvHeaders.length ||
    new Set(headers).size !== csvHeaders.length ||
    headers.some((h) => !csvHeaders.includes(h)) ||
    !rows.length
  )
    throw new LocalizationError("csv");
  let locale = "";
  const translations = rows.map((r) => {
    if (r.length !== csvHeaders.length) throw new LocalizationError("csv");
    const value = Object.fromEntries(
      headers.map((h, i) => [h, decodeCsvCell(r[i])]),
    );
    const normalized = normalizeDocumentationLocale(value.locale);
    if (locale && locale !== normalized) throw new LocalizationError("csv");
    locale = normalized;
    if (value.reviewed !== "true" && value.reviewed !== "false")
      throw new LocalizationError("csv");
    return {
      pointer: value.pointer,
      source: value.source,
      text: value.translation,
      reviewed: value.reviewed === "true",
    };
  });
  return readCatalog({ locale, translations });
}
export function localizationProgressReport(
  project: LocalizationProject,
  source: DocumentationSource,
) {
  const active = new Set(source.entries.map((e) => e.pointer));
  // Share a report byte budget fairly across languages. Long JSON Pointers can
  // expand far beyond source size when repeated for many translated variants.
  const perLocaleBudget = Math.floor(
    (MAX_LOCALIZATION_CATALOG_BYTES - 65536) /
      Math.max(1, project.locales.length),
  );
  return {
    kind: "rsswag-documentation-progress",
    version: 1,
    locales: project.locales.map((catalog) => {
      const translations = new Map(
        catalog.translations.map((t) => [t.pointer, t]),
      );
      let remaining = perLocaleBudget;
      const entries: {
        pointer: string;
        field: DocumentationField;
        section: DocumentationSection;
        status: TranslationStatus;
      }[] = [];
      for (const entry of source.entries) {
        const row = {
          pointer: entry.pointer,
          field: entry.field,
          section: entry.section,
          status: translationStatus(entry, translations.get(entry.pointer)),
        };
        const bytes = getByteSize(JSON.stringify(row, null, 2)) + 128;
        if (bytes > remaining) break;
        entries.push(row);
        remaining -= bytes;
      }
      const orphans = catalog.translations.filter(
        (t) => !active.has(t.pointer),
      );
      const orphanedPointers: string[] = [];
      for (const row of orphans) {
        const bytes = getByteSize(JSON.stringify(row.pointer)) + 24;
        if (bytes > remaining) break;
        orphanedPointers.push(row.pointer);
        remaining -= bytes;
      }
      return {
        locale: catalog.locale,
        ...localizationSummary(source, catalog),
        entries,
        entriesTruncated: entries.length < source.entries.length,
        orphanedPointers,
        orphanedPointersTruncated: orphanedPointers.length < orphans.length,
      };
    }),
  };
}
