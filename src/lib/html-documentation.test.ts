import { describe, expect, it } from "vitest";
import { parseOpenApiSchema } from "./openapi";
import { createHtmlDocumentation } from "./html-documentation";
import { extractSchemaModels } from "./schema-models";

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info:
  title: Catalog API
  version: 2.0.0
servers:
  - url: https://api.example.com/v2
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    legacyKey:
      type: apiKey
      in: header
      name: X-Legacy-Key
  schemas:
    User:
      type: object
      required: [id]
      properties:
        id:
          type: string
          example: user-1
        role:
          type: string
          enum: [admin, member]
    UserEnvelope:
      type: object
      properties:
        user:
          $ref: '#/components/schemas/User'
    Unused:
      type: object
      properties:
        internal:
          type: boolean
paths:
  /users/{id}:
    get:
      operationId: getUser
      summary: Get a user
      description: '<img src=x onerror=alert(1)>'
      tags: [users]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          description: User identifier
          schema:
            type: string
            minLength: 2
      responses:
        '200':
          description: User response
          headers:
            X-Trace-Id:
              description: Request trace
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserEnvelope'
              example:
                user:
                  id: user-1
    delete:
      deprecated: true
      operationId: removeUser
      security:
        - legacyKey: []
      responses:
        '204':
          description: Removed`);

if (!parsed.ok) {
  throw new Error(parsed.error);
}

const schema = parsed.value;
const models = extractSchemaModels(schema.schema);
const metadata = {
  serverUrl: schema.serverUrl,
  title: schema.title,
  version: schema.version,
};

describe("createHtmlDocumentation", () => {
  it("builds searchable documentation with scoped model and security dependencies", () => {
    const build = createHtmlDocumentation(
      schema.endpoints,
      models,
      schema.securitySchemes,
      metadata,
      { includeDeprecated: false },
    );

    expect(build.summary).toEqual({
      deprecatedExcludedCount: 1,
      endpointCount: 1,
      methodCount: 1,
      modelCount: 2,
      securitySchemeCount: 1,
    });
    expect(build.html).toContain("<!doctype html>");
    expect(build.html).toContain('id="docs-search"');
    expect(build.html).toContain('id="method-filter"');
    expect(build.html).toContain('data-method="GET"');
    expect(build.html).toContain("getUser");
    expect(build.html).toContain("UserEnvelope");
    expect(build.html).toContain("User");
    expect(build.html).toContain("bearerAuth");
    expect(build.html).toContain("X-Trace-Id");
    expect(build.html).not.toContain("removeUser");
    expect(build.html).not.toContain("legacyKey");
    expect(build.html).not.toContain("Unused");
    expect(build.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(build.html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("can omit examples and model documentation", () => {
    const build = createHtmlDocumentation(
      schema.endpoints.slice(0, 1),
      models,
      schema.securitySchemes,
      metadata,
      { includeExamples: false, includeModels: false },
    );

    expect(build.summary.modelCount).toBe(0);
    expect(build.html).not.toContain("Schema models");
    expect(build.html).not.toContain('<p class="detail-label">Example</p>');
    expect(build.html).not.toContain("user-1");
    expect(build.html).toContain("User response");
  });

  it("localizes generated controls and handles an empty endpoint selection", () => {
    const build = createHtmlDocumentation([], models, [], metadata, {
      language: "ru",
    });

    expect(build.summary).toEqual({
      deprecatedExcludedCount: 0,
      endpointCount: 0,
      methodCount: 0,
      modelCount: 0,
      securitySchemeCount: 0,
    });
    expect(build.html).toContain('<html lang="ru"');
    expect(build.html).toContain("Поиск по документации");
    expect(build.html).toContain("Нет эндпоинтов, соответствующих фильтрам.");
    expect(build.html).toContain("Эндпоинты: 0 из 0");
  });

  it("escapes schema metadata in text and attribute contexts", () => {
    const build = createHtmlDocumentation([], [], [], {
      serverUrl: 'https://example.com/?next="quoted"&mode=<unsafe>',
      title: "</title><script>window.pwned=true</script>",
      version: "1 & 2",
    });

    expect(build.html).toContain(
      "&lt;/title&gt;&lt;script&gt;window.pwned=true&lt;/script&gt;",
    );
    expect(build.html).toContain("1 &amp; 2");
    expect(build.html).toContain(
      "https://example.com/?next=&quot;quoted&quot;&amp;mode=&lt;unsafe&gt;",
    );
    expect(build.html).not.toContain("window.pwned=true</script>");
  });
});
