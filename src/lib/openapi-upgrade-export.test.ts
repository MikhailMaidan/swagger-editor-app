import { describe, expect, it } from "vitest";
import {
  compareUpgradeEndpoints,
  upgradeOpenApiDocument,
} from "./openapi-upgrade";
import {
  createUpgradeNotesMarkdown,
  getUpgradedDocumentFile,
  upgradeChangeKeys,
  upgradeWarningKeys,
} from "./openapi-upgrade-export";
import { translations } from "./translations";

const source = {
  definitions: { Pet: { properties: { tag: { "x-nullable": true } } } },
  host: "api.example.com",
  info: { title: "Pets `API`", version: "1.0.0" },
  paths: {
    "/pets": {
      get: {
        responses: { "200": { schema: { $ref: "#/definitions/Pet" } } },
      },
    },
  },
  swagger: "2.0",
};

describe("OpenAPI upgrade export", () => {
  it("has English and Russian copy for every change and warning", () => {
    for (const key of [
      ...Object.values(upgradeChangeKeys),
      ...Object.values(upgradeWarningKeys),
    ]) {
      expect(translations.en[key]).toBeTruthy();
      expect(translations.ru[key]).toBeTruthy();
    }
  });

  it("summarizes the migration path, parity, changes, and review items", () => {
    const result = upgradeOpenApiDocument(source, "3.0.3");
    const parity = compareUpgradeEndpoints(source, result.document);

    expect(
      createUpgradeNotesMarkdown(result, parity, {
        title: "Pets `API`",
        version: "1.0.0",
      }),
    ).toBe(
      [
        "# OpenAPI upgrade notes: Pets 'API'",
        "",
        "Swagger 2.0 → OpenAPI 3.0.3",
        "All 1 endpoints are preserved.",
        "",
        "## Automatic changes",
        "- Declares OpenAPI 3.0.3",
        "- Builds 1 server URLs from host, basePath, and schemes",
        "- Moves 1 definitions to components/schemas",
        "- Wraps 1 response schemas in media type content",
        "- Rewrites 1 $ref pointers to components",
        "- Converts 1 nullable flags",
        "",
        "## Review after upgrading",
        "- The response had no description, so an empty one was added. (`/paths/~1pets/get/responses/200`)",
        "",
      ].join("\n"),
    );
    expect(
      createUpgradeNotesMarkdown(
        result,
        { missing: ["GET /pets"], sourceCount: 1, upgradedCount: 0 },
        { title: "Pets", version: "1" },
        "ru",
      ),
    ).toContain("Будут потеряны эндпоинты (1): GET /pets");
  });

  it("names downloaded documents by title, target, and format", () => {
    expect(getUpgradedDocumentFile("Pet Store", "3.1.0", "yaml")).toEqual({
      contentType: "application/yaml",
      fileName: "pet-store-openapi-3.1.0.yaml",
    });
    expect(getUpgradedDocumentFile("", "3.0.3", "json")).toEqual({
      contentType: "application/json",
      fileName: "openapi-schema-openapi-3.0.3.json",
    });
  });
});
