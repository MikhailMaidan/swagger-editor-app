import YAML from "yaml";
import { toJsonPointer } from "./example-validation";
import { extractEndpoints, type SchemaFormat } from "./openapi";

export type OpenApiUpgradeSource = "openapi-3.0" | "swagger-2.0";
export type OpenApiUpgradeTarget = "3.0.3" | "3.1.0";

export type OpenApiUpgradeChangeCode =
  | "bounds"
  | "file-types"
  | "form-data"
  | "nullable"
  | "parameters"
  | "references"
  | "request-bodies"
  | "responses"
  | "schema-examples"
  | "schemas"
  | "security-schemes"
  | "serialization-styles"
  | "servers"
  | "version"
  | "webhooks";

export type OpenApiUpgradeWarningCode =
  | "body-and-form-data"
  | "external-reference"
  | "form-data-media-type"
  | "missing-response-description"
  | "nullable-composition"
  | "operation-schemes"
  | "unresolved-reference"
  | "unsupported-collection-format"
  | "unsupported-oauth-flow"
  | "websocket-scheme";

export type OpenApiUpgradeWarning = {
  code: OpenApiUpgradeWarningCode;
  params: Record<string, string>;
  pointer: string;
};

export type OpenApiUpgradeResult = {
  changes: Array<{ code: OpenApiUpgradeChangeCode; count: number }>;
  document: Record<string, unknown>;
  source: OpenApiUpgradeSource;
  target: OpenApiUpgradeTarget;
  warnings: OpenApiUpgradeWarning[];
};

export type OpenApiUpgradeEndpointParity = {
  missing: string[];
  sourceCount: number;
  upgradedCount: number;
};

type Json = Record<string, unknown>;
type Segments = string[];

type Context = {
  counts: Map<OpenApiUpgradeChangeCode, number>;
  root: Json;
  warningKeys: Set<string>;
  warnings: OpenApiUpgradeWarning[];
};

type MediaTypes = string[] | undefined;

const CHANGE_ORDER: OpenApiUpgradeChangeCode[] = [
  "version",
  "servers",
  "schemas",
  "parameters",
  "request-bodies",
  "form-data",
  "responses",
  "security-schemes",
  "references",
  "serialization-styles",
  "file-types",
  "nullable",
  "bounds",
  "schema-examples",
  "webhooks",
];
const SWAGGER_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
];
const SIMPLE_SCHEMA_KEYS = [
  "type",
  "format",
  "items",
  "default",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "maxItems",
  "minItems",
  "uniqueItems",
  "enum",
  "multipleOf",
];
const SCHEMA_MAP_KEYWORDS = new Set(["patternProperties", "properties"]);
const SCHEMA_KEYWORDS = new Set(["additionalProperties", "items", "not"]);
const SCHEMA_ARRAY_KEYWORDS = new Set([
  "allOf",
  "anyOf",
  "oneOf",
  "prefixItems",
]);
const FORM_MEDIA_TYPES = new Set([
  "application/x-www-form-urlencoded",
  "multipart/form-data",
]);
const OAUTH_FLOWS: Record<string, string> = {
  accessCode: "authorizationCode",
  application: "clientCredentials",
  implicit: "implicit",
  password: "password",
};
const DEFAULT_MEDIA_TYPE = "application/json";

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isExtension(key: string) {
  return key.startsWith("x-");
}

function count(context: Context, code: OpenApiUpgradeChangeCode, amount = 1) {
  if (amount > 0) {
    context.counts.set(code, (context.counts.get(code) ?? 0) + amount);
  }
}

function warn(
  context: Context,
  code: OpenApiUpgradeWarningCode,
  segments: Segments | null,
  params: Record<string, string> = {},
) {
  const pointer = segments ? toJsonPointer(segments) : "";
  const key = `${code} ${pointer} ${JSON.stringify(params)}`;

  if (!context.warningKeys.has(key)) {
    context.warningKeys.add(key);
    context.warnings.push({ code, params, pointer });
  }
}

function copyExtensions(source: Json, target: Json, skip: string[] = []) {
  for (const [key, value] of Object.entries(source)) {
    if (isExtension(key) && !skip.includes(key)) {
      target[key] = value;
    }
  }
}

function copyKeys(source: Json, target: Json, keys: string[]) {
  for (const key of keys) {
    if (hasOwn(source, key) && source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}

function readMediaTypes(value: unknown): MediaTypes {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

export function detectUpgradeSource(
  root: Record<string, unknown>,
): OpenApiUpgradeSource | null {
  if (root.swagger !== undefined && /^2(\.0)?$/.test(String(root.swagger))) {
    return "swagger-2.0";
  }

  if (
    root.openapi !== undefined &&
    /^3(\.0(\.\d+)?)?$/.test(String(root.openapi))
  ) {
    return "openapi-3.0";
  }

  return null;
}

export function getUpgradeTargets(
  source: OpenApiUpgradeSource,
): OpenApiUpgradeTarget[] {
  return source === "swagger-2.0" ? ["3.0.3", "3.1.0"] : ["3.1.0"];
}

/* Swagger 2.0 -> OpenAPI 3.0.3 */

function rewriteReference(
  context: Context,
  reference: string,
  segments: Segments,
) {
  const hashIndex = reference.indexOf("#");
  const base = hashIndex >= 0 ? reference.slice(0, hashIndex) : reference;
  const fragment = hashIndex >= 0 ? reference.slice(hashIndex) : "";

  if (base) {
    warn(context, "external-reference", segments, { reference });
  }

  for (const [from, to] of [
    ["#/definitions/", "#/components/schemas/"],
    ["#/parameters/", "#/components/parameters/"],
    ["#/responses/", "#/components/responses/"],
  ]) {
    if (fragment.startsWith(from)) {
      count(context, "references");

      return `${base}${to}${fragment.slice(from.length)}`;
    }
  }

  return reference;
}

function convertSchema2(
  context: Context,
  schema: unknown,
  segments: Segments,
): unknown {
  if (!isRecord(schema)) {
    return schema;
  }

  const result: Json = {};

  for (const [key, value] of Object.entries(schema)) {
    const childSegments = [...segments, key];

    if (key === "$ref" && typeof value === "string") {
      result.$ref = rewriteReference(context, value, childSegments);
    } else if (key === "x-nullable") {
      if (value === true) {
        result.nullable = true;
        count(context, "nullable");
      }
    } else if (key === "discriminator" && typeof value === "string") {
      result.discriminator = { propertyName: value };
    } else if (key === "type" && value === "file") {
      result.type = "string";
      result.format = "binary";
      count(context, "file-types");
    } else if (key === "format" && schema.type === "file") {
      continue;
    } else if (SCHEMA_MAP_KEYWORDS.has(key) && isRecord(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
          name,
          convertSchema2(context, child, [...childSegments, name]),
        ]),
      );
    } else if (SCHEMA_KEYWORDS.has(key) && isRecord(value)) {
      result[key] = convertSchema2(context, value, childSegments);
    } else if (
      (SCHEMA_ARRAY_KEYWORDS.has(key) || key === "items") &&
      Array.isArray(value)
    ) {
      result[key] = value.map((child, index) =>
        convertSchema2(context, child, [...childSegments, String(index)]),
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

function schemaFromSimpleType(
  context: Context,
  source: Json,
  segments: Segments,
): Json {
  const schema: Json = {};

  for (const key of SIMPLE_SCHEMA_KEYS) {
    if (!hasOwn(source, key)) {
      continue;
    }

    if (key === "items" && isRecord(source.items)) {
      schema.items = schemaFromSimpleType(context, source.items, [
        ...segments,
        "items",
      ]);
    } else if (key === "type" && source.type === "file") {
      schema.type = "string";
      schema.format = "binary";
      count(context, "file-types");
    } else if (!(key === "format" && source.type === "file")) {
      schema[key] = source[key];
    }
  }

  if (source["x-nullable"] === true) {
    schema.nullable = true;
    count(context, "nullable");
  }

  return schema;
}

function readCollectionFormat(parameter: Json) {
  return typeof parameter.collectionFormat === "string"
    ? parameter.collectionFormat
    : "csv";
}

function convertParameter2(
  context: Context,
  parameter: Json,
  segments: Segments,
): Json {
  const result: Json = {};
  const location = parameter.in;

  copyKeys(parameter, result, ["name", "in", "description"]);

  if (location === "path") {
    result.required = true;
  } else if (typeof parameter.required === "boolean") {
    result.required = parameter.required;
  }

  copyKeys(parameter, result, ["allowEmptyValue"]);

  if (parameter.type === "array") {
    const format = readCollectionFormat(parameter);
    const styles: Record<string, [string, boolean]> = {
      csv: ["form", false],
      pipes: ["pipeDelimited", false],
      ssv: ["spaceDelimited", false],
    };

    if (location === "query" && styles[format]) {
      result.style = styles[format][0];
      result.explode = styles[format][1];
      count(context, "serialization-styles");
    } else if (
      format === "tsv" ||
      (format !== "csv" && format !== "multi" && location !== "query")
    ) {
      warn(context, "unsupported-collection-format", segments, {
        format,
        name: String(parameter.name ?? ""),
      });
    }
  }

  result.schema = schemaFromSimpleType(context, parameter, segments);

  if (hasOwn(parameter, "x-example")) {
    result.example = parameter["x-example"];
  }

  copyExtensions(parameter, result, ["x-example", "x-nullable"]);
  count(context, "parameters");

  return result;
}

function resolveParameter2(
  context: Context,
  rawParameter: unknown,
  segments: Segments,
): {
  name: string;
  node: Json;
  referenceName: string;
  segments: Segments;
} | null {
  if (!isRecord(rawParameter)) {
    return null;
  }

  if (typeof rawParameter.$ref !== "string") {
    return {
      name: String(rawParameter.name ?? ""),
      node: rawParameter,
      referenceName: "",
      segments,
    };
  }

  const match = /^#\/parameters\/(.+)$/.exec(rawParameter.$ref);
  const referenceName = match
    ? match[1].replaceAll("~1", "/").replaceAll("~0", "~")
    : "";
  const target =
    referenceName && isRecord(context.root.parameters)
      ? context.root.parameters[referenceName]
      : undefined;

  if (!isRecord(target)) {
    if (rawParameter.$ref.startsWith("#")) {
      warn(context, "unresolved-reference", segments, {
        reference: rawParameter.$ref,
      });
    }

    return null;
  }

  return {
    name: String(target.name ?? ""),
    node: target,
    referenceName,
    segments: ["parameters", referenceName],
  };
}

// References that cannot be inspected (external files or missing entries) are
// kept, with local fragments rewritten to their OpenAPI 3 locations.
function keepUnresolvedParameter(
  context: Context,
  parameter: Json,
  segments: Segments,
) {
  return typeof parameter.$ref === "string"
    ? {
        $ref: rewriteReference(context, parameter.$ref, [...segments, "$ref"]),
      }
    : parameter;
}

function requestBodyFromBody(
  context: Context,
  parameter: Json,
  segments: Segments,
  consumes: MediaTypes,
): Json {
  const mediaTypes = (consumes ?? []).filter(
    (mediaType) => !FORM_MEDIA_TYPES.has(mediaType),
  );
  const examples = isRecord(parameter["x-examples"])
    ? parameter["x-examples"]
    : {};
  const content: Json = {};

  for (const mediaType of mediaTypes.length > 0
    ? mediaTypes
    : [DEFAULT_MEDIA_TYPE]) {
    const media: Json = {
      schema: convertSchema2(context, parameter.schema ?? {}, [
        ...segments,
        "schema",
      ]),
    };

    if (hasOwn(examples, mediaType)) {
      media.example = examples[mediaType];
    }

    content[mediaType] = media;
  }

  const requestBody: Json = {};

  copyKeys(parameter, requestBody, ["description"]);
  requestBody.content = content;

  if (parameter.required === true) {
    requestBody.required = true;
  }

  if (typeof parameter.name === "string" && parameter.name) {
    // Keeps generated SDKs using the same argument name as before.
    requestBody["x-codegen-request-body-name"] = parameter.name;
  }

  copyExtensions(parameter, requestBody, ["x-examples"]);
  count(context, "request-bodies");

  return requestBody;
}

function requestBodyFromFormData(
  context: Context,
  parameters: Array<{ name: string; node: Json; segments: Segments }>,
  consumes: MediaTypes,
  operationSegments: Segments,
): Json {
  const hasFile = parameters.some(
    (parameter) => parameter.node.type === "file",
  );
  const formMediaTypes = (consumes ?? []).filter((mediaType) =>
    FORM_MEDIA_TYPES.has(mediaType),
  );

  if ((consumes ?? []).length > 0 && formMediaTypes.length === 0) {
    warn(context, "form-data-media-type", operationSegments, {
      consumes: (consumes ?? []).join(", "),
    });
  }

  const properties: Json = {};
  const required: string[] = [];
  const encoding: Json = {};

  for (const parameter of parameters) {
    const property = schemaFromSimpleType(
      context,
      parameter.node,
      parameter.segments,
    );

    if (typeof parameter.node.description === "string") {
      property.description = parameter.node.description;
    }

    properties[parameter.name] = property;

    if (parameter.node.required === true) {
      required.push(parameter.name);
    }

    if (parameter.node.type === "array") {
      const format = readCollectionFormat(parameter.node);

      if (format === "csv") {
        encoding[parameter.name] = { explode: false, style: "form" };
        count(context, "serialization-styles");
      } else if (format !== "multi") {
        warn(context, "unsupported-collection-format", parameter.segments, {
          format,
          name: parameter.name,
        });
      }
    }
  }

  const schema: Json = { type: "object", properties };

  if (required.length > 0) {
    schema.required = required;
  }

  const content: Json = {};

  for (const mediaType of formMediaTypes.length > 0
    ? formMediaTypes
    : [hasFile ? "multipart/form-data" : "application/x-www-form-urlencoded"]) {
    content[mediaType] =
      Object.keys(encoding).length > 0 ? { encoding, schema } : { schema };
  }

  count(context, "form-data", parameters.length);
  count(context, "request-bodies");

  return required.length > 0 ? { content, required: true } : { content };
}

function convertHeader2(context: Context, header: unknown, segments: Segments) {
  if (!isRecord(header)) {
    return header;
  }

  const result: Json = {};

  copyKeys(header, result, ["description"]);
  result.schema = schemaFromSimpleType(context, header, segments);
  copyExtensions(header, result, ["x-nullable"]);

  return result;
}

function convertResponse2(
  context: Context,
  response: unknown,
  segments: Segments,
  produces: MediaTypes,
): unknown {
  if (!isRecord(response)) {
    return response;
  }

  if (typeof response.$ref === "string") {
    return {
      $ref: rewriteReference(context, response.$ref, [...segments, "$ref"]),
    };
  }

  const result: Json = {};

  if (typeof response.description === "string") {
    result.description = response.description;
  } else {
    result.description = "";
    warn(context, "missing-response-description", segments);
  }

  if (isRecord(response.headers)) {
    result.headers = Object.fromEntries(
      Object.entries(response.headers).map(([name, header]) => [
        name,
        convertHeader2(context, header, [...segments, "headers", name]),
      ]),
    );
  }

  const examples = isRecord(response.examples) ? response.examples : {};
  const hasSchema = response.schema !== undefined;

  if (hasSchema || Object.keys(examples).length > 0) {
    const mediaTypes = [
      ...new Set([
        ...(hasSchema
          ? produces && produces.length > 0
            ? produces
            : [DEFAULT_MEDIA_TYPE]
          : []),
        ...Object.keys(examples),
      ]),
    ];
    const content: Json = {};

    for (const mediaType of mediaTypes) {
      const media: Json = {};

      if (hasSchema) {
        media.schema = convertSchema2(context, response.schema, [
          ...segments,
          "schema",
        ]);
      }

      if (hasOwn(examples, mediaType)) {
        media.example = examples[mediaType];
      }

      content[mediaType] = media;
    }

    result.content = content;
    count(context, "responses");
  }

  copyExtensions(response, result);

  return result;
}

function getServerUrls(root: Json, schemes: unknown) {
  const host = typeof root.host === "string" ? root.host : "";
  const basePath =
    typeof root.basePath === "string" && root.basePath !== "/"
      ? root.basePath
      : "";

  if (!host) {
    return basePath ? [basePath] : [];
  }

  const schemeList = Array.isArray(schemes)
    ? schemes.filter((scheme): scheme is string => typeof scheme === "string")
    : [];

  return [
    ...new Set(
      (schemeList.length > 0 ? schemeList : ["https"]).map(
        (scheme) => `${scheme}://${host}${basePath}`,
      ),
    ),
  ];
}

function convertOperation2(
  context: Context,
  operation: Json,
  segments: Segments,
  inheritedParameters: unknown[],
  inheritedSegments: Segments,
): Json {
  const consumes =
    readMediaTypes(operation.consumes) ?? readMediaTypes(context.root.consumes);
  const produces =
    readMediaTypes(operation.produces) ?? readMediaTypes(context.root.produces);
  const result: Json = {};

  copyKeys(operation, result, [
    "tags",
    "summary",
    "description",
    "externalDocs",
    "operationId",
  ]);

  const parameters: unknown[] = [];
  const formData: Array<{ name: string; node: Json; segments: Segments }> = [];
  let requestBody: Json | undefined;
  const ownParameters = Array.isArray(operation.parameters)
    ? operation.parameters
    : [];
  const candidates = [
    ...inheritedParameters.map((parameter, index) => ({
      inherited: true,
      parameter,
      segments: [...inheritedSegments, String(index)],
    })),
    ...ownParameters.map((parameter, index) => ({
      inherited: false,
      parameter,
      segments: [...segments, "parameters", String(index)],
    })),
  ];
  const ownBodyLike = candidates.some(
    ({ inherited, parameter, segments: s }) => {
      const resolved = inherited
        ? null
        : resolveParameter2(context, parameter, s);

      return resolved?.node.in === "body" || resolved?.node.in === "formData";
    },
  );

  for (const candidate of candidates) {
    const resolved = resolveParameter2(
      context,
      candidate.parameter,
      candidate.segments,
    );

    if (!resolved) {
      if (isRecord(candidate.parameter) && !candidate.inherited) {
        parameters.push(
          keepUnresolvedParameter(
            context,
            candidate.parameter,
            candidate.segments,
          ),
        );
      }
      continue;
    }

    const location = resolved.node.in;

    if (location !== "body" && location !== "formData") {
      if (candidate.inherited) {
        continue;
      }

      parameters.push(
        resolved.referenceName
          ? {
              $ref: rewriteReference(
                context,
                (candidate.parameter as Json).$ref as string,
                [...candidate.segments, "$ref"],
              ),
            }
          : convertParameter2(context, resolved.node, candidate.segments),
      );
      continue;
    }

    // Path-level bodies apply only when the operation does not define its own.
    if (candidate.inherited && ownBodyLike) {
      continue;
    }

    if (location === "body") {
      if (requestBody) {
        continue;
      }

      requestBody = resolved.referenceName
        ? {
            $ref: `#/components/requestBodies/${resolved.referenceName
              .replaceAll("~", "~0")
              .replaceAll("/", "~1")}`,
          }
        : requestBodyFromBody(
            context,
            resolved.node,
            resolved.segments,
            consumes,
          );

      if (resolved.referenceName) {
        count(context, "references");
      }
    } else {
      formData.push(resolved);
    }
  }

  if (formData.length > 0) {
    if (requestBody) {
      warn(context, "body-and-form-data", segments);
    } else {
      requestBody = requestBodyFromFormData(
        context,
        formData,
        consumes,
        segments,
      );
    }
  }

  if (parameters.length > 0) {
    result.parameters = parameters;
  }

  if (requestBody) {
    result.requestBody = requestBody;
  }

  if (isRecord(operation.responses)) {
    result.responses = Object.fromEntries(
      Object.entries(operation.responses).map(([status, response]) => [
        status,
        isExtension(status)
          ? response
          : convertResponse2(
              context,
              response,
              [...segments, "responses", status],
              produces,
            ),
      ]),
    );
  } else {
    result.responses = {};
  }

  if (Array.isArray(operation.schemes)) {
    const urls = getServerUrls(context.root, operation.schemes);

    if (urls.length > 0) {
      result.servers = urls.map((url) => ({ url }));
      warn(context, "operation-schemes", [...segments, "schemes"], {
        schemes: operation.schemes.join(", "),
      });
    }
  }

  copyKeys(operation, result, ["deprecated", "security"]);
  copyExtensions(operation, result);

  return result;
}

function convertPaths2(context: Context): Json {
  const paths = isRecord(context.root.paths) ? context.root.paths : {};
  const result: Json = {};

  for (const [path, pathItem] of Object.entries(paths)) {
    if (isExtension(path) || !isRecord(pathItem)) {
      result[path] = pathItem;
      continue;
    }

    const pathSegments = ["paths", path];

    if (typeof pathItem.$ref === "string") {
      warn(context, "external-reference", [...pathSegments, "$ref"], {
        reference: pathItem.$ref,
      });
      result[path] = { ...pathItem };
      continue;
    }

    const converted: Json = {};
    const sharedParameters = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
      : [];
    const pathParameters: unknown[] = [];

    sharedParameters.forEach((parameter, index) => {
      const segments = [...pathSegments, "parameters", String(index)];
      const resolved = resolveParameter2(context, parameter, segments);

      if (!resolved) {
        if (isRecord(parameter)) {
          pathParameters.push(
            keepUnresolvedParameter(context, parameter, segments),
          );
        }
        return;
      }

      if (resolved.node.in === "body" || resolved.node.in === "formData") {
        return;
      }

      pathParameters.push(
        resolved.referenceName
          ? {
              $ref: rewriteReference(
                context,
                (parameter as Json).$ref as string,
                [...segments, "$ref"],
              ),
            }
          : convertParameter2(context, resolved.node, segments),
      );
    });

    for (const method of SWAGGER_METHODS) {
      if (isRecord(pathItem[method])) {
        converted[method] = convertOperation2(
          context,
          pathItem[method] as Json,
          [...pathSegments, method],
          sharedParameters,
          [...pathSegments, "parameters"],
        );
      }
    }

    if (pathParameters.length > 0) {
      converted.parameters = pathParameters;
    }

    copyExtensions(pathItem, converted);
    result[path] = converted;
  }

  return result;
}

function convertSecuritySchemes2(context: Context): Json {
  const definitions = isRecord(context.root.securityDefinitions)
    ? context.root.securityDefinitions
    : {};
  const result: Json = {};

  for (const [name, definition] of Object.entries(definitions)) {
    if (!isRecord(definition)) {
      continue;
    }

    const segments = ["securityDefinitions", name];
    const scheme: Json = {};

    if (definition.type === "basic") {
      scheme.type = "http";
      scheme.scheme = "basic";
    } else if (definition.type === "oauth2") {
      const flowName =
        typeof definition.flow === "string" ? OAUTH_FLOWS[definition.flow] : "";

      scheme.type = "oauth2";

      if (!flowName) {
        warn(context, "unsupported-oauth-flow", segments, {
          flow: String(definition.flow ?? ""),
        });
      } else {
        const flow: Json = {};

        if (flowName === "implicit" || flowName === "authorizationCode") {
          copyKeys(definition, flow, ["authorizationUrl"]);
        }

        if (flowName !== "implicit") {
          copyKeys(definition, flow, ["tokenUrl"]);
        }

        flow.scopes = isRecord(definition.scopes) ? definition.scopes : {};
        scheme.flows = { [flowName]: flow };
      }
    } else {
      copyKeys(definition, scheme, ["type", "name", "in"]);
    }

    copyKeys(definition, scheme, ["description"]);
    copyExtensions(definition, scheme);
    result[name] = scheme;
    count(context, "security-schemes");
  }

  return result;
}

function upgradeSwagger2(root: Json, context: Context): Json {
  const document: Json = {
    openapi: "3.0.3",
    info: isRecord(root.info) ? root.info : { title: "", version: "" },
  };

  count(context, "version");
  copyKeys(root, document, ["externalDocs"]);

  const servers = getServerUrls(root, root.schemes);

  if (servers.length > 0) {
    document.servers = servers.map((url) => ({ url }));
    count(context, "servers", servers.length);
  }

  for (const scheme of Array.isArray(root.schemes) ? root.schemes : []) {
    if (scheme === "ws" || scheme === "wss") {
      warn(context, "websocket-scheme", ["schemes"], { scheme });
    }
  }

  copyKeys(root, document, ["tags"]);
  document.paths = convertPaths2(context);

  const components: Json = {};

  if (isRecord(root.definitions)) {
    const definitions = root.definitions;

    components.schemas = Object.fromEntries(
      Object.entries(definitions).map(([name, schema]) => [
        name,
        convertSchema2(context, schema, ["definitions", name]),
      ]),
    );
    count(context, "schemas", Object.keys(definitions).length);
  }

  if (isRecord(root.responses)) {
    const responses = root.responses;
    const produces = readMediaTypes(root.produces);

    components.responses = Object.fromEntries(
      Object.entries(responses).map(([name, response]) => [
        name,
        convertResponse2(context, response, ["responses", name], produces),
      ]),
    );
  }

  if (isRecord(root.parameters)) {
    const parameters: Json = {};
    const requestBodies: Json = {};
    const consumes = readMediaTypes(root.consumes);

    for (const [name, parameter] of Object.entries(root.parameters)) {
      if (!isRecord(parameter)) {
        continue;
      }

      const segments = ["parameters", name];

      if (parameter.in === "body") {
        requestBodies[name] = requestBodyFromBody(
          context,
          parameter,
          segments,
          consumes,
        );
      } else if (parameter.in !== "formData") {
        // Shared form fields are inlined into each operation's request body.
        parameters[name] = convertParameter2(context, parameter, segments);
      }
    }

    if (Object.keys(parameters).length > 0) {
      components.parameters = parameters;
    }

    if (Object.keys(requestBodies).length > 0) {
      components.requestBodies = requestBodies;
    }
  }

  const securitySchemes = convertSecuritySchemes2(context);

  if (Object.keys(securitySchemes).length > 0) {
    components.securitySchemes = securitySchemes;
  }

  if (Object.keys(components).length > 0) {
    document.components = components;
  }

  copyKeys(root, document, ["security"]);
  copyExtensions(root, document);

  return document;
}

/* OpenAPI 3.0.x -> 3.1.0 */

function convertSchema31(
  context: Context,
  schema: unknown,
  segments: Segments,
  sourcePointer: Segments | null,
): unknown {
  if (!isRecord(schema)) {
    return schema;
  }

  const result: Json = {};

  for (const [key, value] of Object.entries(schema)) {
    const childSegments = [...segments, key];
    const childSource = sourcePointer ? [...sourcePointer, key] : null;

    if (key === "nullable") {
      continue;
    }

    if (
      (key === "exclusiveMinimum" || key === "exclusiveMaximum") &&
      typeof value === "boolean"
    ) {
      const bound = key === "exclusiveMinimum" ? "minimum" : "maximum";

      if (value && typeof schema[bound] === "number") {
        result[key] = schema[bound];
        count(context, "bounds");
      }

      continue;
    }

    if (
      (key === "minimum" && schema.exclusiveMinimum === true) ||
      (key === "maximum" && schema.exclusiveMaximum === true)
    ) {
      continue;
    }

    if (key === "example" && !hasOwn(schema, "examples")) {
      result.examples = [value];
      count(context, "schema-examples");
      continue;
    }

    if (SCHEMA_MAP_KEYWORDS.has(key) && isRecord(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
          name,
          convertSchema31(
            context,
            child,
            [...childSegments, name],
            childSource ? [...childSource, name] : null,
          ),
        ]),
      );
    } else if (SCHEMA_KEYWORDS.has(key) && isRecord(value)) {
      result[key] = convertSchema31(context, value, childSegments, childSource);
    } else if (SCHEMA_ARRAY_KEYWORDS.has(key) && Array.isArray(value)) {
      result[key] = value.map((child, index) =>
        convertSchema31(
          context,
          child,
          [...childSegments, String(index)],
          childSource ? [...childSource, String(index)] : null,
        ),
      );
    } else {
      result[key] = value;
    }
  }

  if (schema.nullable !== true) {
    return result;
  }

  count(context, "nullable");

  if (typeof result.type === "string") {
    result.type = [result.type, "null"];
  } else if (Array.isArray(result.type)) {
    if (!result.type.includes("null")) {
      result.type = [...result.type, "null"];
    }
  } else if (
    typeof result.$ref === "string" ||
    Array.isArray(result.allOf) ||
    Array.isArray(result.oneOf) ||
    Array.isArray(result.anyOf)
  ) {
    warn(context, "nullable-composition", sourcePointer);

    return { anyOf: [result, { type: "null" }] };
  }

  if (Array.isArray(result.enum) && !result.enum.includes(null)) {
    result.enum = [...result.enum, null];
  }

  return result;
}

const DATA_KEYS = new Set(["default", "enum", "example", "examples", "value"]);

function upgradeNode31(
  context: Context,
  node: unknown,
  segments: Segments,
  mapSourcePointer: (segments: Segments) => Segments | null,
): unknown {
  if (Array.isArray(node)) {
    return node.map((child, index) =>
      upgradeNode31(
        context,
        child,
        [...segments, String(index)],
        mapSourcePointer,
      ),
    );
  }

  if (!isRecord(node)) {
    return node;
  }

  const isSchemaMap =
    segments.length === 2 &&
    segments[0] === "components" &&
    segments[1] === "schemas";
  const result: Json = {};

  for (const [key, value] of Object.entries(node)) {
    const childSegments = [...segments, key];

    if (isSchemaMap || key === "schema") {
      result[key] = convertSchema31(
        context,
        value,
        childSegments,
        mapSourcePointer(childSegments),
      );
    } else if (DATA_KEYS.has(key) || isExtension(key)) {
      result[key] = value;
    } else {
      result[key] = upgradeNode31(
        context,
        value,
        childSegments,
        mapSourcePointer,
      );
    }
  }

  return result;
}

function upgradeOpenApi30(
  document: Json,
  context: Context,
  mapSourcePointer: (segments: Segments) => Segments | null,
): Json {
  const result: Json = {};

  for (const [key, value] of Object.entries(document)) {
    if (key === "openapi") {
      result.openapi = "3.1.0";
      count(context, "version");
    } else if (key === "x-webhooks" && !hasOwn(document, "webhooks")) {
      result.webhooks = upgradeNode31(
        context,
        value,
        ["webhooks"],
        mapSourcePointer,
      );
      count(context, "webhooks");
    } else if (
      key === "info" ||
      key === "tags" ||
      key === "servers" ||
      isExtension(key)
    ) {
      result[key] = value;
    } else {
      result[key] = upgradeNode31(context, value, [key], mapSourcePointer);
    }
  }

  return result;
}

export function upgradeOpenApiDocument(
  root: Record<string, unknown>,
  target: OpenApiUpgradeTarget,
): OpenApiUpgradeResult {
  const source = detectUpgradeSource(root);

  if (!source || !getUpgradeTargets(source).includes(target)) {
    throw new Error(`Cannot upgrade this document to OpenAPI ${target}.`);
  }

  const context: Context = {
    counts: new Map(),
    root,
    warningKeys: new Set(),
    warnings: [],
  };
  let document: Json;

  if (source === "swagger-2.0") {
    document = upgradeSwagger2(root, context);

    if (target === "3.1.0") {
      // Only component schemas keep a recognizable location in the source.
      document = upgradeOpenApi30(document, context, (segments) =>
        segments[0] === "components" && segments[1] === "schemas"
          ? ["definitions", ...segments.slice(2)]
          : null,
      );
      context.counts.set("version", 1);
    }
  } else {
    document = upgradeOpenApi30(root, context, (segments) => segments);
  }

  return {
    changes: CHANGE_ORDER.filter((code) => context.counts.has(code)).map(
      (code) => ({ code, count: context.counts.get(code) ?? 0 }),
    ),
    document,
    source,
    target,
    warnings: context.warnings,
  };
}

export function serializeUpgradedDocument(
  document: Record<string, unknown>,
  format: SchemaFormat,
) {
  return format === "json"
    ? `${JSON.stringify(document, null, 2)}\n`
    : YAML.stringify(document, { aliasDuplicateObjects: false });
}

export function compareUpgradeEndpoints(
  sourceRoot: Record<string, unknown>,
  upgradedDocument: Record<string, unknown>,
): OpenApiUpgradeEndpointParity {
  const toKeys = (document: Record<string, unknown>) =>
    extractEndpoints(document).map(
      (endpoint) => `${endpoint.method.toUpperCase()} ${endpoint.path}`,
    );
  const sourceKeys = toKeys(sourceRoot);
  const upgradedKeys = new Set(toKeys(upgradedDocument));

  return {
    missing: sourceKeys.filter((key) => !upgradedKeys.has(key)),
    sourceCount: sourceKeys.length,
    upgradedCount: upgradedKeys.size,
  };
}
