import { describe, expect, it } from "vitest";
import { createSchemaAuditReport } from "./schema-audit";
import {
  createSchemaAuditExport,
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
