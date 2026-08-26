import { describe, expect, it } from "vitest";
import { createSchemaAuditReport } from "./schema-audit";
import {
  createSchemaAuditExport,
  createSchemaAuditMarkdown,
  downloadSchemaAuditFile,
} from "./schema-audit-export";

describe("schema audit export", () => {
  it("creates a versioned, dated JSON report", () => {
    const report = createSchemaAuditReport([]);
    const result = createSchemaAuditExport(
      report,
      { title: "Catalog API / v2", version: "2.1.0" },
      new Date("2026-08-26T09:30:00.000Z"),
    );

    expect(result.fileName).toBe("rsswag-catalog-api-v2-audit-2026-08-26.json");
    expect(result.contentType).toBe("application/json");
    expect(JSON.parse(result.content)).toEqual({
      audit: report,
      exportedAt: "2026-08-26T09:30:00.000Z",
      schema: { title: "Catalog API / v2", version: "2.1.0" },
      version: 1,
    });
  });

  it("uses safe fallbacks for invalid dates and unsupported titles", () => {
    const result = createSchemaAuditExport(
      createSchemaAuditReport([]),
      { title: "Схема", version: "1.0.0" },
      new Date("invalid"),
    );

    expect(result.fileName).toBe("rsswag-openapi-schema-audit-1970-01-01.json");
  });

  it("creates localized Markdown summaries and sanitizes inline metadata", () => {
    const report = createSchemaAuditReport([]);
    const english = createSchemaAuditMarkdown(
      report,
      { title: "Catalog\n`API`", version: "1.0\nnext" },
      "en",
    );
    const russian = createSchemaAuditMarkdown(
      report,
      { title: "Каталог", version: "1.0" },
      "ru",
    );

    expect(english).toContain("# Catalog 'API' quality audit");
    expect(english).toContain("Schema version: 1.0 next");
    expect(english).toContain("Quality score: 0% (0/0 checks passed)");
    expect(english).toContain("## Coverage");
    expect(english).toContain("## Findings");
    expect(english).not.toContain("Catalog\n");
    expect(russian).toContain("# Аудит качества API: Каталог");
    expect(russian).toContain("Версия схемы: 1.0");
  });

  it("returns failure when browser downloads are blocked", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw new DOMException("Downloads blocked", "SecurityError");
    };

    try {
      expect(
        downloadSchemaAuditFile(createSchemaAuditReport([]), {
          title: "Catalog API",
          version: "1.0.0",
        }),
      ).toBe(false);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
