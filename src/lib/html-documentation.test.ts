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

function createDocumentationPage() {
  const build = createHtmlDocumentation(
    schema.endpoints,
    models,
    schema.securitySchemes,
    metadata,
  );
  const page = new DOMParser().parseFromString(build.html, "text/html");
  new Function("document", page.body.querySelector("script")!.textContent!)(
    page,
  );
  return page;
}

describe("createHtmlDocumentation", () => {
  it("searches words across endpoint details while keeping navigation and method filters synchronized", () => {
    const page = createDocumentationPage();
    const search = page.getElementById("docs-search") as HTMLInputElement;
    const method = page.getElementById("method-filter") as HTMLSelectElement;
    const endpoints = Array.from(
      page.querySelectorAll<HTMLElement>("[data-endpoint]"),
    );
    const navigation = Array.from(
      page.querySelectorAll<HTMLElement>("[data-nav-item]"),
    );
    const visibleMethods = (items: HTMLElement[]) =>
      items.filter((item) => !item.hidden).map((item) => item.dataset.method);

    search.value = "  USERS\tGETUSER  ";
    search.dispatchEvent(new Event("input"));
    expect(visibleMethods(endpoints)).toEqual(["GET"]);
    expect(visibleMethods(navigation)).toEqual(["GET"]);
    expect(page.getElementById("result-count")!.textContent).toBe(
      "1 of 2 endpoints",
    );
    expect(page.getElementById("empty-state")!.hidden).toBe(true);

    method.value = "DELETE";
    method.dispatchEvent(new Event("change"));
    expect(visibleMethods(endpoints)).toEqual([]);
    expect(visibleMethods(navigation)).toEqual([]);
    expect(page.getElementById("result-count")!.textContent).toBe(
      "0 of 2 endpoints",
    );
    expect(page.getElementById("empty-state")!.hidden).toBe(false);

    search.value = " \t ";
    search.dispatchEvent(new Event("input"));
    expect(visibleMethods(endpoints)).toEqual(["DELETE"]);
    expect(visibleMethods(navigation)).toEqual(["DELETE"]);
    expect(page.getElementById("result-count")!.textContent).toBe(
      "1 of 2 endpoints",
    );
    expect(page.getElementById("empty-state")!.hidden).toBe(true);
  });

  it("clears search with Escape while preserving the method filter and ignoring modified keys", () => {
    const page = createDocumentationPage();
    const search = page.getElementById("docs-search") as HTMLInputElement;
    const method = page.getElementById("method-filter") as HTMLSelectElement;
    method.value = "DELETE";
    method.dispatchEvent(new Event("change"));
    search.value = "missing";
    search.dispatchEvent(new Event("input"));

    for (const modifier of [
      "ctrlKey",
      "altKey",
      "metaKey",
      "shiftKey",
      "isComposing",
    ]) {
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        cancelable: true,
        [modifier]: true,
      });
      search.dispatchEvent(event);
      expect(search.value).toBe("missing");
      expect(event.defaultPrevented).toBe(false);
    }
    const handled = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    handled.preventDefault();
    search.dispatchEvent(handled);
    expect(search.value).toBe("missing");

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    search.dispatchEvent(escape);
    expect(search.value).toBe("");
    expect(escape.defaultPrevented).toBe(true);
    expect(method.value).toBe("DELETE");
    for (const selector of ["[data-endpoint]", "[data-nav-item]"]) {
      expect(
        Array.from(page.querySelectorAll<HTMLElement>(selector))
          .filter((item) => !item.hidden)
          .map((item) => item.dataset.method),
      ).toEqual(["DELETE"]);
    }
    expect(page.getElementById("result-count")!.textContent).toBe(
      "1 of 2 endpoints",
    );
    expect(page.getElementById("empty-state")!.hidden).toBe(true);
    expect(
      search.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
      ),
    ).toBe(true);
  });

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
