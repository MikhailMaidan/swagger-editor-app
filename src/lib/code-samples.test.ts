import { describe, expect, it } from "vitest";
import {
  createCodeSamplesMarkdown,
  createEndpointCodeInput,
  createEndpointCodeSamples,
  getCodeSamplesFile,
  injectCodeSamples,
} from "./code-samples";
import type { EndpointSummary, SecuritySchemeSummary } from "./openapi";

function endpoint(overrides: Partial<EndpointSummary> = {}): EndpointSummary {
  return {
    deprecated: false,
    description: "",
    method: "GET",
    operationId: "",
    parameters: [],
    path: "/items",
    requestBodies: [],
    responses: [],
    secured: false,
    securityRequirements: [],
    serverUrl: "https://api.example.com",
    summary: "",
    tags: [],
    ...overrides,
  };
}

function scheme(
  overrides: Partial<SecuritySchemeSummary>,
): SecuritySchemeSummary {
  return {
    bearerFormat: "",
    description: "",
    location: "",
    name: "auth",
    parameterName: "",
    scheme: "",
    type: "http",
    ...overrides,
  };
}

const schemes = [
  scheme({ name: "bearer", scheme: "bearer" }),
  scheme({ name: "basic", scheme: "basic" }),
  scheme({
    location: "query",
    name: "key",
    parameterName: "api_key",
    type: "apiKey",
  }),
  scheme({ name: "oauth", type: "oauth2" }),
];

describe("code samples", () => {
  it("builds inputs from documented examples and auth placeholders", () => {
    const input = createEndpointCodeInput(
      endpoint({
        method: "POST",
        parameters: [
          {
            description: "",
            example: " 7 ",
            location: "path",
            name: "id",
            required: true,
          },
          {
            description: "",
            example: "",
            location: "query",
            name: "empty",
            required: false,
          },
          {
            description: "",
            example: "custom",
            location: "header",
            name: "authorization",
            required: false,
          },
        ],
        path: "/items/{id}",
        requestBodies: [
          {
            contentType: "application/json",
            description: "",
            required: true,
            schema: {
              example: '{"a":1}',
              exampleName: "",
              properties: [],
              type: "object",
            },
          },
        ],
        securityRequirementGroups: [["bearer", "key"]],
        securityRequirements: ["bearer", "key"],
      }),
      schemes,
      true,
    );

    expect(input).toEqual({
      contentType: "application/json",
      method: "POST",
      parameters: [
        { location: "path", name: "id", value: "7" },
        { location: "header", name: "authorization", value: "custom" },
        { location: "query", name: "api_key", value: "YOUR_API_KEY" },
      ],
      path: "/items/{id}",
      requestBody: '{"a":1}',
      serverUrl: "https://api.example.com",
    });
  });

  it("uses scheme-specific placeholders and skips optional security", () => {
    const authFor = (groups: string[][]) =>
      createEndpointCodeInput(
        endpoint({
          securityRequirementGroups: groups,
          securityRequirements: groups.flat(),
        }),
        schemes,
        true,
      ).parameters;

    expect(authFor([["basic"]])).toEqual([
      {
        location: "header",
        name: "Authorization",
        value: "Basic YOUR_BASE64_CREDENTIALS",
      },
    ]);
    expect(authFor([["oauth"]])).toEqual([
      {
        location: "header",
        name: "Authorization",
        value: "Bearer YOUR_ACCESS_TOKEN",
      },
    ]);
    expect(authFor([["missing"], ["bearer"]])).toEqual([
      { location: "header", name: "Authorization", value: "Bearer YOUR_TOKEN" },
    ]);
    expect(authFor([[], ["bearer"]])).toEqual([]);
    expect(
      createEndpointCodeInput(
        endpoint({ securityRequirements: ["bearer"] }),
        schemes,
        false,
      ).parameters,
    ).toEqual([]);
  });

  it("creates a Markdown guide with safe code fences", () => {
    const samples = createEndpointCodeSamples(
      [
        endpoint({ summary: "List\nitems" }),
        endpoint({
          method: "POST",
          path: "/notes",
          requestBodies: [
            {
              contentType: "text/plain",
              description: "",
              required: false,
              schema: {
                example: "```md```",
                exampleName: "",
                properties: [],
                type: "string",
              },
            },
          ],
        }),
      ],
      [],
      {
        formats: ["python", "curl", "python", "bogus" as never],
        includeAuthPlaceholders: false,
      },
    );

    expect(samples[0].samples.map((sample) => sample.format)).toEqual([
      "python",
      "curl",
    ]);

    const markdown = createCodeSamplesMarkdown(samples, {
      title: "Items\nAPI",
      version: "2",
    });

    expect(
      markdown.startsWith(
        "# Items API code samples\n\nVersion 2 · 2 endpoints · Python (requests), cURL\n",
      ),
    ).toBe(true);
    expect(markdown).toContain(
      "## GET /items\n\nList items\n\n### Python (requests)\n\n```python\n",
    );
    expect(markdown).toContain("### cURL\n\n````bash\ncurl -X POST");
    expect(
      createCodeSamplesMarkdown(
        samples,
        { title: "Items", version: "2" },
        "ru",
      ),
    ).toContain("# Примеры кода Items");
  });

  it("injects x-codeSamples without mutating the source document", () => {
    const root = {
      openapi: "3.0.3",
      paths: {
        "/items": {
          get: {
            responses: {},
            "x-codeSamples": [
              { label: "Python (requests)", lang: "Python", source: "old" },
              { label: "Handwritten", lang: "Go", source: "keep" },
            ],
          },
        },
        "/linked": { $ref: "#/paths/~1items" },
      },
    };
    const snapshot = JSON.stringify(root);
    const samples = createEndpointCodeSamples(
      [
        endpoint(),
        endpoint({ path: "/linked" }),
        endpoint({ path: "/missing" }),
      ],
      [],
      { formats: ["python"], includeAuthPlaceholders: false },
    );
    const { document, operationCount } = injectCodeSamples(root, samples);
    const operation = (
      document.paths as Record<string, Record<string, Record<string, unknown>>>
    )["/items"].get;

    expect(operationCount).toBe(1);
    expect(operation["x-codeSamples"]).toEqual([
      { label: "Handwritten", lang: "Go", source: "keep" },
      {
        label: "Python (requests)",
        lang: "Python",
        source: samples[0].samples[0].source,
      },
    ]);
    expect(JSON.stringify(root)).toBe(snapshot);
  });

  it("names exported files", () => {
    expect(getCodeSamplesFile("Pet Store", "markdown", "yaml")).toEqual({
      contentType: "text/markdown;charset=utf-8",
      fileName: "pet-store-code-samples.md",
    });
    expect(getCodeSamplesFile("", "spec", "json")).toEqual({
      contentType: "application/json",
      fileName: "openapi-schema-with-code-samples.json",
    });
  });
});
