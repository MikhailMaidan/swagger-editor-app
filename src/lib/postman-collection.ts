import type {
  EndpointParameter,
  EndpointSummary,
  SchemaDetails,
  SecuritySchemeSummary,
} from "./openapi";
import { isJsonMediaType } from "./request-body";
import { createSchemaMockResponse } from "./request-mock";

export const POSTMAN_COLLECTION_SCHEMA =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

export type PostmanCollectionOptions = {
  groupByTags: boolean;
  includeResponseExamples: boolean;
};

export type PostmanVariable = {
  description?: string;
  key: string;
  type: "string";
  value: string;
};

type PostmanKeyValue = {
  description?: string;
  disabled?: boolean;
  key: string;
  type: "string" | "text";
  value: string;
};

type PostmanAuth =
  | { basic: PostmanKeyValue[]; type: "basic" }
  | { bearer: PostmanKeyValue[]; type: "bearer" };

type PostmanRequest = {
  auth?: PostmanAuth;
  body?: {
    mode: "raw";
    options: { raw: { language: "json" | "text" } };
    raw: string;
  };
  description?: string;
  header: PostmanKeyValue[];
  method: string;
  url: {
    host: string[];
    path: string[];
    query?: PostmanKeyValue[];
    raw: string;
    variable?: PostmanKeyValue[];
  };
};

type PostmanResponse = {
  body: string;
  code: number;
  header: PostmanKeyValue[];
  name: string;
  originalRequest: PostmanRequest;
  status: string;
};

export type PostmanRequestItem = {
  name: string;
  request: PostmanRequest;
  response: PostmanResponse[];
};

export type PostmanCollectionItem =
  PostmanRequestItem | { item: PostmanRequestItem[]; name: string };

export type PostmanCollection = {
  info: {
    description: string;
    name: string;
    schema: typeof POSTMAN_COLLECTION_SCHEMA;
  };
  item: PostmanCollectionItem[];
  variable: PostmanVariable[];
};

export type PostmanCollectionBuild = {
  collection: PostmanCollection;
  secretVariableKeys: string[];
  summary: {
    folderCount: number;
    requestCount: number;
    responseExampleCount: number;
    variableCount: number;
  };
};

const DEFAULT_OPTIONS: PostmanCollectionOptions = {
  groupByTags: true,
  includeResponseExamples: true,
};

type BuildContext = {
  schemesByName: Map<string, SecuritySchemeSummary>;
  secretVariableKeys: Set<string>;
  variables: Map<string, PostmanVariable>;
};

function normalizeVariableKey(value: string) {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "value";
}

function addVariable(
  context: BuildContext,
  key: string,
  value: string,
  description?: string,
  secret = false,
) {
  if (!context.variables.has(key)) {
    context.variables.set(key, {
      ...(description ? { description } : {}),
      key,
      type: "string",
      value,
    });
  }

  if (secret) {
    context.secretVariableKeys.add(key);
  }
}

function getParameterVariableKey(parameter: EndpointParameter) {
  return `${parameter.location}_${normalizeVariableKey(parameter.name)}`;
}

function getParameterValue(
  context: BuildContext,
  parameter: EndpointParameter,
) {
  const example = parameter.example || parameter.enumValues?.[0] || "";

  if (example) {
    return example;
  }

  const key = getParameterVariableKey(parameter);

  addVariable(context, key, "", parameter.description);
  return `{{${key}}}`;
}

function setUniqueHeader(headers: PostmanKeyValue[], header: PostmanKeyValue) {
  if (
    headers.some(
      (current) => current.key.toLowerCase() === header.key.toLowerCase(),
    )
  ) {
    return;
  }

  headers.push(header);
}

function setUniqueQuery(query: PostmanKeyValue[], parameter: PostmanKeyValue) {
  if (query.some((current) => current.key === parameter.key)) {
    return;
  }

  query.push(parameter);
}

function getSelectedSecurityNames(endpoint: EndpointSummary) {
  const securedGroup = endpoint.securityRequirementGroups?.find(
    (group) => group.length > 0,
  );

  return securedGroup ?? endpoint.securityRequirements;
}

function getAuthVariableKey(scheme: SecuritySchemeSummary, suffix: string) {
  return `${normalizeVariableKey(scheme.name)}${suffix}`;
}

function applySecurity(
  context: BuildContext,
  endpoint: EndpointSummary,
  headers: PostmanKeyValue[],
  query: PostmanKeyValue[],
) {
  let auth: PostmanAuth | undefined;

  getSelectedSecurityNames(endpoint).forEach((name) => {
    const scheme = context.schemesByName.get(name);

    if (!scheme) {
      return;
    }

    if (scheme.type === "apiKey" && scheme.location && scheme.parameterName) {
      const key = getAuthVariableKey(scheme, "Value");
      const value = `{{${key}}}`;

      addVariable(context, key, "", scheme.description, true);

      if (scheme.location === "query") {
        setUniqueQuery(query, {
          key: scheme.parameterName,
          type: "text",
          value,
        });
      } else {
        setUniqueHeader(headers, {
          key: scheme.location === "cookie" ? "Cookie" : scheme.parameterName,
          type: "text",
          value:
            scheme.location === "cookie"
              ? `${scheme.parameterName}=${value}`
              : value,
        });
      }

      return;
    }

    if (auth) {
      return;
    }

    if (scheme.type === "http" && scheme.scheme === "basic") {
      const usernameKey = getAuthVariableKey(scheme, "Username");
      const passwordKey = getAuthVariableKey(scheme, "Password");

      addVariable(context, usernameKey, "", scheme.description, true);
      addVariable(context, passwordKey, "", scheme.description, true);
      auth = {
        basic: [
          { key: "username", type: "string", value: `{{${usernameKey}}}` },
          { key: "password", type: "string", value: `{{${passwordKey}}}` },
        ],
        type: "basic",
      };
      return;
    }

    if (
      (scheme.type === "http" && scheme.scheme === "bearer") ||
      scheme.type === "oauth2" ||
      scheme.type === "openIdConnect"
    ) {
      const tokenKey = getAuthVariableKey(scheme, "Token");

      addVariable(context, tokenKey, "", scheme.description, true);
      auth = {
        bearer: [{ key: "token", type: "string", value: `{{${tokenKey}}}` }],
        type: "bearer",
      };
    }
  });

  return auth;
}

function createGeneratedValue(type: string): unknown {
  switch (type.toLowerCase()) {
    case "array":
      return [];
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "object":
      return {};
    case "string":
      return "string";
    default:
      return null;
  }
}

function createRequestBodyExample(schema: SchemaDetails, contentType: string) {
  if (schema.example) {
    return schema.example;
  }

  if (!isJsonMediaType(contentType)) {
    return schema.type === "string" ? "string" : "";
  }

  if (schema.type === "object" || schema.properties.length > 0) {
    return JSON.stringify(
      Object.fromEntries(
        schema.properties.map((property) => [
          property,
          createGeneratedValue(schema.propertyTypes?.[property] ?? "unknown"),
        ]),
      ),
      null,
      2,
    );
  }

  return JSON.stringify(createGeneratedValue(schema.type), null, 2) ?? "";
}

function createRequestDescription(endpoint: EndpointSummary) {
  const metadata = [
    endpoint.description,
    endpoint.operationId ? `Operation ID: ${endpoint.operationId}` : "",
    endpoint.deprecated ? "Deprecated operation" : "",
  ].filter(Boolean);

  return metadata.join("\n\n");
}

function getResponseCode(status: string) {
  if (/^\d{3}$/.test(status)) {
    return Number(status);
  }

  const range = status.match(/^([1-5])xx$/i);
  return range ? Number(`${range[1]}00`) : 200;
}

function createResponseExamples(
  endpoint: EndpointSummary,
  request: PostmanRequest,
) {
  return endpoint.responses.map<PostmanResponse>((response) => {
    const mock = createSchemaMockResponse(response, "");
    const headers = Object.entries(mock.headers).map<PostmanKeyValue>(
      ([key, value]) => ({ key, type: "text", value }),
    );

    return {
      body: mock.body,
      code: getResponseCode(response.status),
      header: headers,
      name: `${response.status} ${response.description}`.trim(),
      originalRequest: request,
      status: response.description || response.status,
    };
  });
}

function createRequestItem(
  context: BuildContext,
  endpoint: EndpointSummary,
  includeResponseExamples: boolean,
): PostmanRequestItem {
  const headers: PostmanKeyValue[] = [];
  const query: PostmanKeyValue[] = [];
  const pathVariables: PostmanKeyValue[] = [];

  endpoint.parameters.forEach((parameter) => {
    const value = getParameterValue(context, parameter);
    const item: PostmanKeyValue = {
      ...(parameter.description ? { description: parameter.description } : {}),
      ...(!parameter.required ? { disabled: true } : {}),
      key: parameter.name,
      type: "text",
      value,
    };

    if (parameter.location === "query") {
      setUniqueQuery(query, item);
    } else if (parameter.location === "header") {
      setUniqueHeader(headers, item);
    } else if (parameter.location === "cookie") {
      setUniqueHeader(headers, {
        ...item,
        key: "Cookie",
        value: `${parameter.name}=${value}`,
      });
    } else {
      pathVariables.push({ ...item, disabled: undefined });
    }
  });

  const auth = applySecurity(context, endpoint, headers, query);
  const requestBody = endpoint.requestBodies[0];
  const requestBodyExample = requestBody
    ? createRequestBodyExample(requestBody.schema, requestBody.contentType)
    : "";

  if (requestBody) {
    setUniqueHeader(headers, {
      key: "Content-Type",
      type: "text",
      value: requestBody.contentType,
    });
  }

  const normalizedPath = endpoint.path
    .replace(/\{([^{}]+)\}/g, ":$1")
    .replace(/^\/+/, "");
  const path = normalizedPath ? normalizedPath.split("/") : [];
  const rawQuery = query
    .map(
      (parameter) => `${encodeURIComponent(parameter.key)}=${parameter.value}`,
    )
    .join("&");
  const rawPath = normalizedPath ? `/` + normalizedPath : "";
  const description = createRequestDescription(endpoint);
  const request: PostmanRequest = {
    ...(auth ? { auth } : {}),
    ...(requestBody
      ? {
          body: {
            mode: "raw" as const,
            options: {
              raw: {
                language: isJsonMediaType(requestBody.contentType)
                  ? ("json" as const)
                  : ("text" as const),
              },
            },
            raw: requestBodyExample,
          },
        }
      : {}),
    ...(description ? { description } : {}),
    header: headers,
    method: endpoint.method,
    url: {
      host: ["{{baseUrl}}"],
      path,
      ...(query.length > 0 ? { query } : {}),
      raw: `{{baseUrl}}${rawPath}${rawQuery ? `?${rawQuery}` : ""}`,
      ...(pathVariables.length > 0 ? { variable: pathVariables } : {}),
    },
  };

  return {
    name: endpoint.summary || `${endpoint.method} ${endpoint.path}`,
    request,
    response: includeResponseExamples
      ? createResponseExamples(endpoint, request)
      : [],
  };
}

export function createPostmanCollection(
  endpoints: EndpointSummary[],
  securitySchemes: SecuritySchemeSummary[],
  schema: { serverUrl: string; title: string; version: string },
  options: Partial<PostmanCollectionOptions> = {},
): PostmanCollectionBuild {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const context: BuildContext = {
    schemesByName: new Map(
      securitySchemes.map((scheme) => [scheme.name, scheme]),
    ),
    secretVariableKeys: new Set(),
    variables: new Map(),
  };

  addVariable(
    context,
    "baseUrl",
    schema.serverUrl || endpoints[0]?.serverUrl || "",
    "Active RSSwag API server",
  );

  const requests = endpoints.map((endpoint) => ({
    endpoint,
    item: createRequestItem(
      context,
      endpoint,
      resolvedOptions.includeResponseExamples,
    ),
  }));
  let items: PostmanCollectionItem[];
  let folderCount = 0;

  if (resolvedOptions.groupByTags) {
    const folders = new Map<string, PostmanRequestItem[]>();

    requests.forEach(({ endpoint, item }) => {
      const folderName = endpoint.tags[0] || "General";
      const folder = folders.get(folderName) ?? [];

      folder.push(item);
      folders.set(folderName, folder);
    });

    items = Array.from(folders, ([name, item]) => ({ item, name }));
    folderCount = folders.size;
  } else {
    items = requests.map(({ item }) => item);
  }

  const variables = Array.from(context.variables.values());
  const responseExampleCount = requests.reduce(
    (count, { item }) => count + item.response.length,
    0,
  );

  return {
    collection: {
      info: {
        description:
          `Generated by RSSwag from ${schema.title} ${schema.version}`.trim(),
        name: schema.title || "RSSwag API Collection",
        schema: POSTMAN_COLLECTION_SCHEMA,
      },
      item: items,
      variable: variables,
    },
    secretVariableKeys: Array.from(context.secretVariableKeys),
    summary: {
      folderCount,
      requestCount: requests.length,
      responseExampleCount,
      variableCount: variables.length,
    },
  };
}
