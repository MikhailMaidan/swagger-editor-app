import type {
  CurlParameter,
  EndpointSummary,
  SecuritySchemeSummary,
} from "./openapi";
import {
  createRequestCode,
  isRequestCodeFormat,
  REQUEST_CODE_FORMATS,
  type RequestCodeFormat,
  type RequestCodeInput,
} from "./request-snippets";
import { translate } from "./translations";
import type { Language } from "./translations";

export type CodeSampleOptions = {
  formats: RequestCodeFormat[];
  includeAuthPlaceholders: boolean;
};

export type CodeSample = {
  format: RequestCodeFormat;
  source: string;
};

export type EndpointCodeSamples = {
  endpoint: EndpointSummary;
  samples: CodeSample[];
};

export const DEFAULT_CODE_SAMPLE_FORMATS: RequestCodeFormat[] = [
  "curl",
  "python",
  "javascript-axios",
];

export const AUTH_PLACEHOLDERS = {
  apiKey: "YOUR_API_KEY",
  basic: "YOUR_BASE64_CREDENTIALS",
  bearer: "YOUR_TOKEN",
  oauth: "YOUR_ACCESS_TOKEN",
};

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createAuthPlaceholderParameters(
  endpoint: EndpointSummary,
  schemes: SecuritySchemeSummary[],
): CurlParameter[] {
  const schemesByName = new Map(schemes.map((scheme) => [scheme.name, scheme]));
  const groups = endpoint.securityRequirementGroups?.length
    ? endpoint.securityRequirementGroups
    : [endpoint.securityRequirements];
  // Optional security (an empty group) means the sample works without auth.
  const group = groups.some((candidate) => candidate.length === 0)
    ? []
    : (groups.find((candidate) =>
        candidate.every((name) => schemesByName.has(name)),
      ) ?? []);

  return group.flatMap<CurlParameter>((name) => {
    const scheme = schemesByName.get(name);

    if (!scheme) {
      return [];
    }

    if (scheme.type === "apiKey") {
      return scheme.location && scheme.parameterName
        ? [
            {
              location: scheme.location,
              name: scheme.parameterName,
              value: AUTH_PLACEHOLDERS.apiKey,
            },
          ]
        : [];
    }

    if (scheme.type === "http") {
      return [
        {
          location: "header",
          name: "Authorization",
          value:
            scheme.scheme.toLowerCase() === "basic"
              ? `Basic ${AUTH_PLACEHOLDERS.basic}`
              : `Bearer ${AUTH_PLACEHOLDERS.bearer}`,
        },
      ];
    }

    if (scheme.type === "oauth2" || scheme.type === "openIdConnect") {
      return [
        {
          location: "header",
          name: "Authorization",
          value: `Bearer ${AUTH_PLACEHOLDERS.oauth}`,
        },
      ];
    }

    return [];
  });
}

export function createEndpointCodeInput(
  endpoint: EndpointSummary,
  schemes: SecuritySchemeSummary[],
  includeAuthPlaceholders: boolean,
): RequestCodeInput {
  const requestBody = endpoint.requestBodies[0];
  const parameters = endpoint.parameters
    .map<CurlParameter>((parameter) => ({
      location: parameter.location,
      name: parameter.name,
      value: parameter.example.trim(),
    }))
    .filter((parameter) => parameter.value);

  if (includeAuthPlaceholders) {
    for (const authParameter of createAuthPlaceholderParameters(
      endpoint,
      schemes,
    )) {
      const exists = parameters.some(
        (parameter) =>
          parameter.location === authParameter.location &&
          parameter.name.toLowerCase() === authParameter.name.toLowerCase(),
      );

      if (!exists) {
        parameters.push(authParameter);
      }
    }
  }

  return {
    contentType: requestBody?.contentType ?? "",
    method: endpoint.method,
    parameters,
    path: endpoint.path,
    requestBody: requestBody?.schema.example ?? "",
    serverUrl: endpoint.serverUrl,
  };
}

export function createEndpointCodeSamples(
  endpoints: EndpointSummary[],
  schemes: SecuritySchemeSummary[],
  options: CodeSampleOptions,
): EndpointCodeSamples[] {
  const formats = [...new Set(options.formats)].filter((format) =>
    isRequestCodeFormat(format),
  );

  return endpoints.map((endpoint) => {
    const input = createEndpointCodeInput(
      endpoint,
      schemes,
      options.includeAuthPlaceholders,
    );

    return {
      endpoint,
      samples: formats.map((format) => ({
        format,
        source: createRequestCode(format, input),
      })),
    };
  });
}

function getFence(source: string) {
  const longestRun = Math.max(
    2,
    ...Array.from(source.matchAll(/`+/g), (match) => match[0].length),
  );

  return "`".repeat(longestRun + 1);
}

function sanitizeHeading(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function createCodeSamplesMarkdown(
  samples: EndpointCodeSamples[],
  schema: { title: string; version: string },
  language: Language = "en",
) {
  const formats = samples[0]?.samples.map((sample) => sample.format) ?? [];
  const lines = [
    `# ${translate(language, "workspace.codeSamplesMarkdownTitle", {
      title: sanitizeHeading(schema.title),
    })}`,
    "",
    translate(language, "workspace.codeSamplesMarkdownSummary", {
      count: String(samples.length),
      languages: formats
        .map((format) => REQUEST_CODE_FORMATS[format].label)
        .join(", "),
      version: sanitizeHeading(schema.version),
    }),
  ];

  for (const { endpoint, samples: endpointSamples } of samples) {
    lines.push(
      "",
      `## ${sanitizeHeading(`${endpoint.method.toUpperCase()} ${endpoint.path}`)}`,
    );

    const summary = sanitizeHeading(endpoint.summary || endpoint.description);

    if (summary) {
      lines.push("", summary);
    }

    for (const sample of endpointSamples) {
      const definition = REQUEST_CODE_FORMATS[sample.format];
      const fence = getFence(sample.source);

      lines.push(
        "",
        `### ${definition.label}`,
        "",
        `${fence}${definition.fence}`,
        sample.source,
        fence,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

// Produces a copy of the document with Redocly-style `x-codeSamples` on each
// operation; samples generated earlier for the same language are replaced.
export function injectCodeSamples(
  root: Record<string, unknown>,
  samples: EndpointCodeSamples[],
) {
  const document = structuredClone(root);
  const paths = isRecord(document.paths) ? document.paths : {};
  let operationCount = 0;

  for (const { endpoint, samples: endpointSamples } of samples) {
    const pathItem = paths[endpoint.path];
    const methodKey = endpoint.method.toLowerCase();

    if (
      !isRecord(pathItem) ||
      !HTTP_METHODS.has(methodKey) ||
      !isRecord(pathItem[methodKey])
    ) {
      continue;
    }

    const operation = pathItem[methodKey] as Record<string, unknown>;
    const generated = endpointSamples.map((sample) => ({
      label: REQUEST_CODE_FORMATS[sample.format].label,
      lang: REQUEST_CODE_FORMATS[sample.format].codeSampleLang,
      source: sample.source,
    }));
    const generatedLabels = new Set(generated.map((sample) => sample.label));
    const existing = Array.isArray(operation["x-codeSamples"])
      ? operation["x-codeSamples"].filter(
          (sample) =>
            !isRecord(sample) ||
            typeof sample.label !== "string" ||
            !generatedLabels.has(sample.label),
        )
      : [];

    operation["x-codeSamples"] = [...existing, ...generated];
    operationCount += 1;
  }

  return { document, operationCount };
}

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "openapi-schema";
}

export function getCodeSamplesFile(
  title: string,
  kind: "markdown" | "spec",
  format: "json" | "yaml",
) {
  if (kind === "markdown") {
    return {
      contentType: "text/markdown;charset=utf-8",
      fileName: `${slugifyTitle(title)}-code-samples.md`,
    };
  }

  return {
    contentType: format === "json" ? "application/json" : "application/yaml",
    fileName: `${slugifyTitle(title)}-with-code-samples.${format === "json" ? "json" : "yaml"}`,
  };
}
