import YAML from "yaml";
import { getByteSize } from "./text-encoding";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDocumentationLocale,
  createLocalizedDocumentation,
  emptyLocalizationProject,
  localizationProgressReport,
  localizationSummary,
  LocalizationError,
  MAX_LOCALIZATION_CATALOG_BYTES,
  MAX_LOCALIZATION_ENTRIES,
  MAX_LOCALIZATION_LOCALES,
  MAX_LOCALIZATION_PROJECT_BYTES,
  MAX_LOCALIZATION_SOURCE_BYTES,
  MAX_LOCALIZATION_TEXT_BYTES,
  mergeDocumentationCatalog,
  normalizeDocumentationLocale,
  parseDocumentationCatalog,
  parseDocumentationCsv,
  parseLocalizationProject,
  readDocumentationSource,
  serializeDocumentationCatalog,
  serializeDocumentationCsv,
  serializeLocalizationProject,
  serializeLocalizedDocumentation,
  translationStatus,
  updateDocumentationTranslation,
  type DocumentationCatalog,
  type DocumentationSource,
} from "./documentation-localization";

afterEach(() => vi.restoreAllMocks());
const api = () => ({
  openapi: "3.1.0",
  info: {
    title: "Shop",
    summary: "Shopping API",
    description: "Shop docs",
    version: "1",
  },
  paths: {
    "/items/{id}": {
      summary: "Item route",
      get: {
        operationId: "getItem",
        tags: ["items"],
        summary: "Get item",
        description: "Fetch an item",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Item ID",
            schema: {
              type: "string",
              description: "ID value",
              enum: ["summary", "description"],
            },
          },
        ],
        responses: {
          "200": {
            description: "Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Item" },
                examples: {
                  item: {
                    summary: "Sample item",
                    description: "Demo example",
                    value: {
                      title: "Real product",
                      description: "Do not translate",
                      summary: "Data",
                    },
                  },
                },
              },
            },
            headers: {
              "X-Trace": {
                description: "Trace token",
                schema: { type: "string" },
              },
            },
            links: {
              next: {
                operationId: "getItem",
                description: "Next item",
                parameters: { id: "$response.body#/id" },
              },
            },
          },
        },
      },
      post: {
        summary: "Create item",
        requestBody: {
          description: "New item",
          content: {
            "application/json": {
              schema: {
                type: "object",
                title: "Input",
                properties: {
                  title: {
                    type: "string",
                    description: "Product name",
                    default: "Unchanged",
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
  },
  components: {
    schemas: {
      Item: {
        title: "Item model",
        description: "Stored item",
        type: "object",
        required: ["description"],
        properties: {
          description: {
            type: "string",
            description: "Product description",
            const: "Keep constant",
            examples: [{ description: "Keep sample" }],
          },
        },
        example: { description: "Keep payload" },
        "x-data": { description: "Keep extension" },
      },
    },
    securitySchemes: {
      token: {
        type: "apiKey",
        in: "header",
        name: "X-Token",
        description: "Access token",
      },
    },
  },
  servers: [
    {
      url: "https://example.test/{stage}",
      description: "Main server",
      variables: {
        stage: { default: "v1", enum: ["v1", "v2"], description: "Deployment" },
      },
    },
  ],
  tags: [
    {
      name: "items",
      description: "Item operations",
      externalDocs: {
        url: "https://example.test/docs",
        description: "More docs",
      },
    },
  ],
  externalDocs: { url: "https://example.test", description: "Guide" },
  "x-private": {
    description: "PRIVATE-EXTENSION",
    secret: "PRIVATE-CREDENTIAL",
  },
});
const sourceOf = (value: unknown = api()) =>
  readDocumentationSource(JSON.stringify(value));
const catalogOf = (
  source: DocumentationSource,
  reviewed = true,
): DocumentationCatalog => ({
  locale: "fr",
  translations: source.entries.map((e) => ({
    pointer: e.pointer,
    source: e.source,
    text: `FR ${e.source}`,
    reviewed,
  })),
});
const projectOf = (source = sourceOf(), catalog = catalogOf(source)) => ({
  ...emptyLocalizationProject(),
  source: source.text,
  locales: [catalog],
});
const issue = (fn: () => unknown, code: string) =>
  expect(fn).toThrowError(
    new LocalizationError(code as LocalizationError["code"]),
  );

describe("documentation inventory", () => {
  it("reads JSON and YAML without network calls and excludes contract values and payload annotations", () => {
    const fetch = vi.spyOn(globalThis, "fetch"),
      value = api();
    const json = sourceOf(value),
      yaml = readDocumentationSource(YAML.stringify(value));
    expect(json.format).toBe("json");
    expect(yaml.format).toBe("yaml");
    expect(yaml.entries).toEqual(json.entries);
    const pointers = json.entries.map((e) => e.pointer);
    expect(pointers).toEqual(
      expect.arrayContaining([
        "/info/title",
        "/info/summary",
        "/info/description",
        "/externalDocs/description",
        "/paths/~1items~1{id}/summary",
        "/paths/~1items~1{id}/get/summary",
        "/paths/~1items~1{id}/get/parameters/0/description",
        "/paths/~1items~1{id}/get/parameters/0/schema/description",
        "/paths/~1items~1{id}/get/responses/200/content/application~1json/examples/item/summary",
        "/paths/~1items~1{id}/get/responses/200/headers/X-Trace/description",
        "/paths/~1items~1{id}/get/responses/200/links/next/description",
        "/paths/~1items~1{id}/post/requestBody/description",
        "/components/schemas/Item/properties/description/description",
        "/components/securitySchemes/token/description",
        "/servers/0/variables/stage/description",
        "/tags/0/externalDocs/description",
      ]),
    );
    expect(
      pointers.some(
        (p) =>
          p.includes("/value/") ||
          p.includes("/example/") ||
          p.includes("/x-") ||
          p.includes("/default") ||
          p.includes("/const") ||
          p.includes("/enum/"),
      ),
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(value).toEqual(api());
  });
  it("inventories nested JSON Schema applicators without translating property names, defaults, or schema examples", () => {
    const value = api();
    Object.assign(value.components.schemas.Item, {
      $defs: { Nested: { title: "Nested" } },
      patternProperties: { ".*": { description: "Pattern" } },
      dependentSchemas: { name: { description: "Dependent" } },
      dependencies: { a: { description: "Old dependency" }, b: ["title"] },
      allOf: [{ title: "All" }],
      anyOf: [{ title: "Any" }],
      oneOf: [{ title: "One" }],
      prefixItems: [{ title: "Prefix" }],
      items: { title: "Items" },
      contains: { description: "Contains" },
      additionalProperties: { description: "Additional" },
      unevaluatedProperties: { title: "Unevaluated" },
      if: { description: "If" },
      then: { description: "Then" },
      else: { description: "Else" },
      not: { title: "Not" },
      propertyNames: { description: "Property names" },
      contentSchema: { title: "Content" },
    });
    const entries = sourceOf(value).entries;
    expect(
      entries.filter((e) => e.section === "schemas").map((e) => e.source),
    ).toEqual(
      expect.arrayContaining([
        "Nested",
        "Pattern",
        "Dependent",
        "Old dependency",
        "All",
        "Any",
        "One",
        "Prefix",
        "Items",
        "Contains",
        "Additional",
        "Unevaluated",
        "If",
        "Then",
        "Else",
        "Not",
        "Property names",
        "Content",
      ]),
    );
    expect(entries.find((e) => e.source === "title")).toBeUndefined();
  });
  it("supports Swagger 2 definitions, shared parameters, responses, and inline array items", () => {
    const source = sourceOf({
      swagger: "2.0",
      info: { title: "Legacy", version: "1" },
      paths: {
        "/items": {
          get: {
            summary: "List",
            parameters: [
              {
                name: "q",
                in: "query",
                type: "array",
                description: "Query",
                items: { type: "string", description: "Query item" },
              },
            ],
            responses: {
              "200": {
                description: "OK",
                schema: { $ref: "#/definitions/Item" },
              },
            },
          },
        },
      },
      definitions: {
        Item: {
          title: "Item",
          properties: { name: { type: "string", description: "Name" } },
        },
      },
      parameters: {
        limit: { name: "limit", in: "query", description: "Limit" },
      },
      responses: { Error: { description: "Error" } },
      securityDefinitions: {
        basic: { type: "basic", description: "Basic access" },
      },
    });
    expect(source.entries.map((e) => e.source)).toEqual(
      expect.arrayContaining([
        "Legacy",
        "List",
        "Query",
        "Query item",
        "OK",
        "Item",
        "Name",
        "Limit",
        "Error",
        "Basic access",
      ]),
    );
    expect(
      createLocalizedDocumentation(source, catalogOf(source), "strict").ready,
    ).toBe(true);
  });
  it("handles callbacks, reusable path items, webhooks, and additional operations while preserving runtime expressions", () => {
    const callback = {
      "{$request.body#/url}": {
        post: {
          description: "Callback",
          responses: { "204": { description: "Received" } },
        },
      },
    };
    const source = sourceOf({
      openapi: "3.2.0",
      info: { title: "Events", version: "1" },
      paths: {
        "/event": {
          query: {
            summary: "Query event",
            responses: { "200": { description: "OK" } },
          },
          additionalOperations: {
            COPY: {
              summary: "Copy",
              responses: { "200": { description: "Copied" } },
            },
          },
          post: {
            callbacks: { event: callback },
            responses: { "200": { description: "Sent" } },
          },
        },
      },
      webhooks: {
        event: {
          post: {
            description: "Webhook",
            responses: { "200": { description: "Accepted" } },
          },
        },
      },
      components: {
        callbacks: { event: callback },
        pathItems: { shared: { description: "Shared path" } },
        examples: {
          shared: {
            summary: "Shared example",
            value: { description: "Payload" },
          },
        },
      },
    });
    expect(source.entries.map((e) => e.source)).toEqual(
      expect.arrayContaining([
        "Callback",
        "Received",
        "Query event",
        "Copy",
        "Webhook",
        "Shared path",
        "Shared example",
      ]),
    );
    const output = serializeLocalizedDocumentation(
      createLocalizedDocumentation(source, catalogOf(source)),
      "json",
    );
    expect(output).toContain("{$request.body#/url}");
    expect(output).toContain('"description": "Payload"');
  });
  it("ignores empty annotations and external reference contents", () => {
    const source = sourceOf({
      openapi: "3.1.0",
      info: { title: "Empty", description: " \n ", version: "1" },
      paths: {},
      components: {
        schemas: { Remote: { $ref: "https://example.test/schema.json" } },
      },
    });
    expect(source.entries.map((e) => e.pointer)).toEqual(["/info/title"]);
  });
  it.each([
    "openapi: [",
    '{"openapi":"3.1.0","info":{"title":"T","version":"1"},"paths":[]}',
    'openapi: 3.1.0\ninfo: {title: T, version: "1"}\npaths: {}\ninfo: {}',
  ])("rejects invalid or ambiguous source %s", (text) =>
    issue(() => readDocumentationSource(text), "source"),
  );
  it("bounds input bytes and documentation inventory size", () => {
    issue(
      () =>
        readDocumentationSource(" ".repeat(MAX_LOCALIZATION_SOURCE_BYTES + 1)),
      "limit",
    );
    const properties = Object.fromEntries(
      Array.from({ length: MAX_LOCALIZATION_ENTRIES }, (_, i) => [
        `p${i}`,
        { description: "D" },
      ]),
    );
    issue(
      () =>
        sourceOf({
          openapi: "3.1.0",
          info: { title: "T", version: "1" },
          paths: {},
          components: { schemas: { Big: { properties } } },
        }),
      "limit",
    );
  });
});

describe("translation lifecycle and publication", () => {
  it("normalizes language tags and prevents duplicates and excessive targets", () => {
    expect(normalizeDocumentationLocale(" pt-br ")).toBe("pt-BR");
    expect(normalizeDocumentationLocale("ZH-hant")).toBe("zh-Hant");
    const project = addDocumentationLocale(emptyLocalizationProject(), "FR");
    expect(project.locales[0].locale).toBe("fr");
    issue(() => addDocumentationLocale(project, "fr"), "locale");
    issue(
      () =>
        addDocumentationLocale(
          {
            ...project,
            locales: Array.from(
              { length: MAX_LOCALIZATION_LOCALES },
              (_, i) => ({ locale: `en-x-${i}`, translations: [] }),
            ),
          },
          "ru",
        ),
      "limit",
    );
  });
  it.each(["", "wrong_locale", "../fr", "fr<script>", "a".repeat(65)])(
    "rejects invalid language %s",
    (locale) => issue(() => normalizeDocumentationLocale(locale), "locale"),
  );
  it("tracks missing, draft, reviewed, outdated, and orphaned translations independently", () => {
    const source = sourceOf(),
      catalog = catalogOf(source);
    catalog.translations[0].text = " ";
    catalog.translations[1].reviewed = false;
    catalog.translations[2].source = "Old description";
    catalog.translations.push({
      pointer: "/info/old/description",
      source: "Old",
      text: "Ancien",
      reviewed: true,
    });
    expect(localizationSummary(source, catalog)).toEqual({
      total: source.entries.length,
      missing: 1,
      draft: 1,
      stale: 1,
      reviewed: source.entries.length - 3,
      orphaned: 1,
    });
    expect(translationStatus(source.entries[0])).toBe("missing");
  });
  it("publishes only reviewed current text and preserves the entire machine contract and payloads", () => {
    const source = sourceOf(),
      catalog = catalogOf(source);
    catalog.translations.find((t) => t.pointer === "/info/summary")!.reviewed =
      false;
    catalog.translations.find(
      (t) => t.pointer === "/info/description",
    )!.source = "Old docs";
    const before = JSON.stringify(source.document),
      result = createLocalizedDocumentation(source, catalog);
    const output = JSON.parse(serializeLocalizedDocumentation(result, "json"));
    expect(output.info).toEqual({
      title: "FR Shop",
      summary: "Shopping API",
      description: "Shop docs",
      version: "1",
    });
    const get = output.paths["/items/{id}"].get;
    expect(get.operationId).toBe("getItem");
    expect(get.tags).toEqual(["items"]);
    expect(get.parameters[0]).toMatchObject({
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", enum: ["summary", "description"] },
    });
    expect(
      get.responses["200"].content["application/json"].examples.item.value,
    ).toEqual(
      api().paths["/items/{id}"].get.responses["200"].content[
        "application/json"
      ].examples.item.value,
    );
    expect(get.responses["200"].links.next.parameters.id).toBe(
      "$response.body#/id",
    );
    expect(output.components.schemas.Item.required).toEqual(["description"]);
    expect(output.components.schemas.Item.example).toEqual({
      description: "Keep payload",
    });
    expect(output.components.schemas.Item.properties.description.const).toBe(
      "Keep constant",
    );
    expect(
      output.components.schemas.Item.properties.description.examples,
    ).toEqual([{ description: "Keep sample" }]);
    expect(output.servers[0].url).toBe(api().servers[0].url);
    expect(output.servers[0].variables.stage.default).toBe("v1");
    expect(output["x-private"]).toEqual(api()["x-private"]);
    expect(output.tags[0].name).toBe("items");
    expect(JSON.stringify(source.document)).toBe(before);
    expect(result.ready).toBe(true);
  });
  it("blocks strict publication until all active fields are reviewed and current", () => {
    const source = sourceOf(),
      catalog = catalogOf(source);
    catalog.translations[0].reviewed = false;
    const blocked = createLocalizedDocumentation(source, catalog, "strict");
    expect(blocked.ready).toBe(false);
    issue(() => serializeLocalizedDocumentation(blocked, "json"), "result");
    catalog.translations[0].reviewed = true;
    expect(createLocalizedDocumentation(source, catalog, "strict").ready).toBe(
      true,
    );
    catalog.translations[0].source = "Old";
    expect(createLocalizedDocumentation(source, catalog, "strict").ready).toBe(
      false,
    );
  });
  it("retains old translations during refresh and requires explicit review of the new source", () => {
    const original = sourceOf(),
      project = projectOf(original),
      changed = api();
    changed.info.title = "Updated Shop";
    delete (changed.info as Partial<typeof changed.info>).description;
    const refreshed = sourceOf(changed),
      report = localizationSummary(refreshed, project.locales[0]);
    expect(report.stale).toBe(1);
    expect(report.orphaned).toBe(1);
    expect(
      (
        createLocalizedDocumentation(refreshed, project.locales[0]).document
          .info as Record<string, unknown>
      ).title,
    ).toBe("Updated Shop");
    const entry = refreshed.entries.find((e) => e.pointer === "/info/title")!;
    const next = updateDocumentationTranslation(
      { ...project, source: refreshed.text },
      "fr",
      entry,
      "Boutique mise à jour",
      true,
    );
    expect(localizationSummary(refreshed, next.locales[0]).stale).toBe(0);
    expect(
      next.locales[0].translations.find(
        (t) => t.pointer === "/info/description",
      ),
    ).toBeDefined();
    expect(project.locales[0].translations[0].source).toBe("Shop");
  });
  it("treats own prototype-like property names as ordinary schema data", () => {
    const value = api();
    Object.assign(value.components.schemas.Item, {
      properties: JSON.parse(
        '{"__proto__":{"description":"Prototype docs"},"constructor":{"description":"Constructor docs"},"a/b~c":{"description":"Escaped docs"}}',
      ),
    });
    const source = sourceOf(value),
      output = createLocalizedDocumentation(source, catalogOf(source));
    const item = JSON.parse(serializeLocalizedDocumentation(output, "json"))
      .components.schemas.Item;
    expect(item.properties.__proto__.description).toBe("FR Prototype docs");
    expect(item.properties.constructor.description).toBe("FR Constructor docs");
    expect(item.properties["a/b~c"].description).toBe("FR Escaped docs");
    expect(Object.prototype).not.toHaveProperty("description");
  });
  it("edits reset review and enforce UTF-8 translation limits without modifying prior state", () => {
    const source = sourceOf(),
      project = projectOf(source),
      entry = source.entries[0];
    const updated = updateDocumentationTranslation(
      project,
      "fr",
      entry,
      "Boutique",
    );
    expect(
      updated.locales[0].translations.find((t) => t.pointer === entry.pointer)
        ?.reviewed,
    ).toBe(false);
    expect(project.locales[0].translations[0].reviewed).toBe(true);
    issue(
      () =>
        updateDocumentationTranslation(
          project,
          "fr",
          entry,
          "я".repeat(MAX_LOCALIZATION_TEXT_BYTES / 2 + 1),
        ),
      "text",
    );
  });
  it("exports semantically equal JSON/YAML and rejects oversized translated outputs", () => {
    const source = sourceOf(),
      result = createLocalizedDocumentation(source, catalogOf(source));
    expect(YAML.parse(serializeLocalizedDocumentation(result, "yaml"))).toEqual(
      JSON.parse(serializeLocalizedDocumentation(result, "json")),
    );
    const big = sourceOf({
      openapi: "3.1.0",
      info: { title: "T", version: "1" },
      paths: {},
      components: {
        schemas: {
          Big: {
            properties: Object.fromEntries(
              Array.from({ length: 40 }, (_, i) => [
                `p${i}`,
                { description: "D" },
              ]),
            ),
          },
        },
      },
    });
    const catalog = catalogOf(big);
    catalog.translations.forEach((t) => {
      t.text = "T".repeat(60000);
    });
    issue(
      () =>
        serializeLocalizedDocumentation(
          createLocalizedDocumentation(big, catalog),
          "json",
        ),
      "limit",
    );
  });
});

describe("catalog and project exchange", () => {
  it("exports complete translator templates with latest source metadata while retaining stale and orphaned records", () => {
    const source = sourceOf(),
      catalog: DocumentationCatalog = {
        locale: "fr",
        translations: [
          {
            pointer: "/info/title",
            source: "Old title",
            text: "Ancien",
            reviewed: true,
          },
          {
            pointer: "/removed/description",
            source: "Removed",
            text: "Supprimé",
            reviewed: true,
          },
        ],
      };
    const text = serializeDocumentationCatalog(catalog, source),
      exported = JSON.parse(text),
      parsed = parseDocumentationCatalog(text);
    expect(
      exported.translations.find(
        (t: { pointer: string }) => t.pointer === "/info/title",
      ),
    ).toMatchObject({ source: "Old title", currentSource: "Shop" });
    expect(parsed.translations).toHaveLength(source.entries.length + 1);
    expect(localizationSummary(source, parsed).stale).toBe(1);
    expect(localizationSummary(source, parsed).orphaned).toBe(1);
    expect(text).not.toContain("PRIVATE-CREDENTIAL");
    expect(text).not.toContain("Real product");
  });
  it("merges catalogs conservatively or explicitly replaces matching rows, preserving all other languages and rows", () => {
    const source = sourceOf(),
      project = addDocumentationLocale(projectOf(source), "ru"),
      incoming = catalogOf(source);
    incoming.translations = [
      { ...incoming.translations[0], text: "Nouvelle boutique" },
      {
        pointer: "/old/description",
        source: "Old",
        text: "Ancien",
        reviewed: true,
      },
    ];
    const kept = mergeDocumentationCatalog(project, incoming);
    expect(kept).toMatchObject({ imported: 1, kept: 1 });
    expect(kept.project.locales[0].translations[0].text).toBe("FR Shop");
    const replaced = mergeDocumentationCatalog(project, incoming, true);
    expect(replaced).toMatchObject({ imported: 2, kept: 0 });
    expect(replaced.project.locales[0].translations[0].text).toBe(
      "Nouvelle boutique",
    );
    expect(replaced.project.locales[0].translations).toHaveLength(
      source.entries.length + 1,
    );
    expect(replaced.project.locales[1]).toEqual(project.locales[1]);
    expect(project.locales[0].translations[0].text).toBe("FR Shop");
  });
  it("catalog pointers can never modify hidden payloads or contract fields even with forged metadata", () => {
    const source = sourceOf(),
      catalog: DocumentationCatalog = {
        locale: "fr",
        translations: [
          {
            pointer: "/x-private/description",
            source: "PRIVATE-EXTENSION",
            text: "Tampered",
            reviewed: true,
          },
        ],
      };
    const exported = JSON.parse(serializeDocumentationCatalog(catalog));
    exported.ready = true;
    exported.translations[0].currentSource = "Forged";
    const parsed = parseDocumentationCatalog(JSON.stringify(exported));
    const result = createLocalizedDocumentation(source, parsed);
    expect(result.document).toEqual(source.document);
    expect(result.summary.orphaned).toBe(1);
    exported.translations[0].pointer = "/info/version";
    issue(() => parseDocumentationCatalog(JSON.stringify(exported)), "catalog");
  });
  it.each([
    { kind: "wrong", version: 1, locale: "fr", translations: [] },
    {
      kind: "rsswag-documentation-catalog",
      version: 2,
      locale: "fr",
      translations: [],
    },
    {
      kind: "rsswag-documentation-catalog",
      version: 1,
      locale: "fr",
      translations: [
        { pointer: "/info/title", source: "T", text: "T", reviewed: "true" },
      ],
    },
    {
      kind: "rsswag-documentation-catalog",
      version: 1,
      locale: "fr",
      translations: [
        { pointer: "/bad~2/title", source: "T", text: "T", reviewed: true },
      ],
    },
  ])("rejects malformed catalogs %#", (value) =>
    issue(() => parseDocumentationCatalog(JSON.stringify(value)), "catalog"),
  );
  it("rejects duplicates and malformed oversized catalog values atomically", () => {
    const source = sourceOf(),
      project = projectOf(source),
      incoming = catalogOf(source);
    incoming.translations.push(incoming.translations[0]);
    issue(() => mergeDocumentationCatalog(project, incoming, true), "catalog");
    expect(project.locales[0].translations).toHaveLength(source.entries.length);
    issue(
      () =>
        parseDocumentationCatalog(
          " ".repeat(MAX_LOCALIZATION_CATALOG_BYTES + 1),
        ),
      "limit",
    );
    const large = catalogOf(source);
    large.translations[0].text = "T".repeat(MAX_LOCALIZATION_TEXT_BYTES + 1);
    issue(() => serializeDocumentationCatalog(large), "text");
  });
  it("round-trips quoted multiline CSV, formulas, literal apostrophes, and BOMs", () => {
    const source = sourceOf(),
      catalog = catalogOf(source);
    const values = [
      'Comma, quote " and\nnewline',
      '=HYPERLINK("x")',
      "+SUM(1,2)",
      "-12",
      "@value",
      "\t=1",
      "  =2",
      "'=literal",
      "'ordinary",
    ];
    values.forEach((v, i) => {
      catalog.translations[i].source = v;
      catalog.translations[i].text = v;
    });
    const text = serializeDocumentationCsv(catalog, source),
      parsed = parseDocumentationCsv(`\uFEFF${text}`);
    expect(text).toContain('"\'=HYPERLINK(""x"")"');
    expect(parsed).toEqual(catalog);
    expect(text).toContain("current_source");
  });
  it("supports reordered CSV columns and carries current source without trusting it", () => {
    const csv =
      "translation,source,reviewed,current_source,pointer,locale\r\nBoutique,Old,true,Shop,/info/title,FR\r\n";
    const catalog = parseDocumentationCsv(csv);
    expect(catalog.locale).toBe("fr");
    expect(localizationSummary(sourceOf(), catalog).stale).toBe(1);
  });
  it.each([
    'locale,pointer,source,current_source,translation,reviewed\nfr,/info/title,T,T,"unterminated,true',
    'locale,pointer,source,current_source,translation,reviewed\nfr,/info/title,T,T,"text"x,true',
    "locale,pointer,source,current_source,translation,reviewed\nfr,/info/title,T,T,Texte",
    "locale,pointer,source,current_source,translation,reviewed\nfr,/info/title,T,T,Texte,yes",
    "locale,pointer,source,current_source,translation,reviewed\nfr,/info/title,T,T,Texte,true\nru,/info/description,D,D,Текст,true",
    "locale,pointer,source,current_source,translation,translation\nfr,/info/title,T,T,Texte,true",
  ])("rejects malformed CSV %#", (text) =>
    issue(() => parseDocumentationCsv(text), "csv"),
  );
  it("restores portable projects by recomputing the source inventory and ignores claimed preview results", () => {
    const source = sourceOf(),
      project = projectOf(source),
      text = serializeLocalizationProject(project),
      raw = JSON.parse(text);
    raw.preview = { ready: true, text: "malicious" };
    raw.inventory = [{ pointer: "/info/version" }];
    const restored = parseLocalizationProject(JSON.stringify(raw));
    expect(restored.project).toEqual(project);
    expect(restored.source.entries).toEqual(source.entries);
    expect(restored.project).not.toHaveProperty("preview");
  });
  it("rejects duplicate normalized locales, invalid project versions, and large/nested projects", () => {
    const project = projectOf();
    project.locales.push({ locale: "FR", translations: [] });
    issue(() => parseLocalizationProject(JSON.stringify(project)), "locale");
    issue(
      () =>
        parseLocalizationProject(JSON.stringify({ ...project, version: 2 })),
      "project",
    );
    issue(
      () =>
        parseLocalizationProject(
          " ".repeat(MAX_LOCALIZATION_PROJECT_BYTES + 1),
        ),
      "limit",
    );
    issue(
      () => parseLocalizationProject("[".repeat(66) + "0" + "]".repeat(66)),
      "limit",
    );
  });
  it("progress reports omit documentation, translations, and the full source", () => {
    const source = sourceOf(),
      project = projectOf(source),
      report = localizationProgressReport(project, source),
      text = JSON.stringify(report);
    expect(report.locales[0]).toMatchObject({
      locale: "fr",
      reviewed: source.entries.length,
      missing: 0,
    });
    expect(text).not.toContain("Shop docs");
    expect(text).not.toContain("FR Shop");
    expect(text).not.toContain("PRIVATE-CREDENTIAL");
    expect(text).toContain("/info/title");
  });
  it("bounds wide untrusted JSON before queuing excessive nodes", () => {
    issue(
      () => parseLocalizationProject(JSON.stringify(Array(250001).fill(0))),
      "limit",
    );
  });
  it("bounds long-location progress reports fairly across languages while keeping complete counters", () => {
    const source = sourceOf({
      openapi: "3.1.0",
      info: { title: "T", version: "1" },
      paths: {},
      components: {
        schemas: {
          ["L".repeat(3000)]: {
            properties: Object.fromEntries(
              Array.from({ length: 500 }, (_, i) => [
                `p${i}`,
                { description: "D" },
              ]),
            ),
          },
        },
      },
    });
    const project = {
      ...emptyLocalizationProject(),
      source: source.text,
      locales: Array.from({ length: MAX_LOCALIZATION_LOCALES }, (_, i) => ({
        locale: `en-x-${i}`,
        translations: [],
      })),
    };
    const report = localizationProgressReport(project, source);
    expect(getByteSize(JSON.stringify(report, null, 2))).toBeLessThanOrEqual(
      MAX_LOCALIZATION_CATALOG_BYTES,
    );
    for (const locale of report.locales) {
      expect(locale.missing).toBe(501);
      expect(locale.entriesTruncated).toBe(true);
      expect(locale.entries.length).toBeGreaterThan(0);
      expect(locale.orphanedPointersTruncated).toBe(false);
    }
  });
});
