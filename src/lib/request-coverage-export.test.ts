import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestCoverageReport } from "./request-coverage";
import {
  createRequestCoverageExport,
  downloadRequestCoverageFile,
} from "./request-coverage-export";

const report: RequestCoverageReport = {
  coveredOperationCount: 0,
  endpointCoveragePercentage: 100,
  failedRequestCount: 1,
  failingOperationCount: 1,
  ignoredRequestCount: 0,
  operationCount: 1,
  operations: [
    {
      attempts: 1,
      averageDurationMs: 42,
      documentedResponseCount: 1,
      failedAttempts: 1,
      latestCreatedAt: "2026-09-04T10:00:00.000Z",
      latestStatus: 500,
      method: "GET",
      observedDocumentedResponses: ["500"],
      observedStatuses: [500],
      operationId: "healthCheck",
      path: "/health",
      state: "failing",
      successfulAttempts: 0,
      summary: "Health check",
      undocumentedStatuses: [],
    },
  ],
  requestCount: 1,
  responseCoveragePercentage: 100,
  statusVariantCount: 1,
  testedOperationCount: 1,
  testedStatusVariantCount: 1,
  undocumentedOperationCount: 0,
  untestedOperationCount: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("request coverage export", () => {
  it("creates a dated, versioned aggregate report without request URLs", () => {
    const exported = createRequestCoverageExport(
      report,
      { title: "Billing API!", version: "2.1" },
      "24h",
      new Date("2026-09-04T12:30:00.000Z"),
    );
    const content = JSON.parse(exported.content) as Record<string, unknown>;

    expect(exported).toMatchObject({
      contentType: "application/json",
      fileName: "rsswag-billing-api-request-coverage-2026-09-04.json",
    });
    expect(content).toMatchObject({
      exportedAt: "2026-09-04T12:30:00.000Z",
      schema: { title: "Billing API!", version: "2.1" },
      version: 1,
      window: "24h",
    });
    expect(exported.content).not.toContain("url");
  });

  it("downloads the generated JSON and revokes its object URL", () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:request-coverage");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    expect(
      downloadRequestCoverageFile(
        report,
        { title: "Billing API", version: "2.1" },
        "all",
      ),
    ).toBe(true);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:request-coverage");
  });
});
