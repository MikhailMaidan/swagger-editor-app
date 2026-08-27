import { describe, expect, it } from "vitest";
import { createSchemaChangeReport } from "./schema-change";
import {
  createSchemaChangeExport,
  downloadSchemaChangeFile,
} from "./schema-change-export";
import { createSchemaComparisonBaseline } from "./schema-comparison-baseline";

describe("schema change export", () => {
  const baseline = createSchemaComparisonBaseline(
    [],
    { title: "Catalog API", version: "1.0.0" },
    new Date("2026-08-26T09:00:00.000Z"),
  );
  const report = createSchemaChangeReport([], []);

  it("creates a versioned JSON change report", () => {
    const result = createSchemaChangeExport(
      report,
      baseline,
      { title: "Catalog API", version: "2.0.0" },
      new Date("2026-08-27T10:00:00.000Z"),
    );

    expect(result.fileName).toBe("rsswag-catalog-api-changes-2026-08-27.json");
    expect(JSON.parse(result.content)).toEqual({
      baseline: {
        capturedAt: "2026-08-26T09:00:00.000Z",
        endpointCount: 0,
        title: "Catalog API",
        version: "1.0.0",
      },
      current: { title: "Catalog API", version: "2.0.0" },
      exportedAt: "2026-08-27T10:00:00.000Z",
      report,
      version: 1,
    });
  });

  it("uses safe filename and date fallbacks", () => {
    const result = createSchemaChangeExport(
      report,
      baseline,
      { title: "Схема", version: "2.0.0" },
      new Date("invalid"),
    );

    expect(result.fileName).toBe(
      "rsswag-openapi-schema-changes-1970-01-01.json",
    );
  });

  it("returns failure when browser downloads are blocked", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw new DOMException("Downloads blocked", "SecurityError");
    };

    try {
      expect(
        downloadSchemaChangeFile(report, baseline, {
          title: "Catalog API",
          version: "2.0.0",
        }),
      ).toBe(false);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
