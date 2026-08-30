import { describe, expect, it, vi } from "vitest";
import { createMockContractSuite } from "./mock-contract-suite";
import {
  createMockContractSuiteExport,
  downloadMockContractSuiteFile,
} from "./mock-contract-suite-export";

describe("mock contract suite exports", () => {
  it("creates a deterministic versioned JSON report", () => {
    const report = createMockContractSuite([]);
    const suiteExport = createMockContractSuiteExport(
      report,
      { title: "Users API / v2", version: "2.0.0" },
      new Date("2026-08-30T12:00:00.000Z"),
    );

    expect(suiteExport).toMatchObject({
      contentType: "application/json",
      fileName: "rsswag-users-api-v2-mock-contracts-2026-08-30.json",
    });
    expect(JSON.parse(suiteExport.content)).toEqual({
      exportedAt: "2026-08-30T12:00:00.000Z",
      report,
      schema: { title: "Users API / v2", version: "2.0.0" },
      version: 1,
    });
  });

  it("downloads the report and reports blocked browser APIs", () => {
    const report = createMockContractSuite([]);
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-suite");
    URL.revokeObjectURL = revokeObjectURL;

    try {
      expect(
        downloadMockContractSuiteFile(report, {
          title: "Users API",
          version: "1.0.0",
        }),
      ).toBe(true);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-suite");

      URL.createObjectURL = vi.fn(() => {
        throw new DOMException("Downloads blocked", "SecurityError");
      });
      expect(
        downloadMockContractSuiteFile(report, {
          title: "Users API",
          version: "1.0.0",
        }),
      ).toBe(false);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });
});
