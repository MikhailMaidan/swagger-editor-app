import { describe, expect, it } from "vitest";
import type { EndpointSummary, ResponseSummary } from "./openapi";
import {
  createRequestCoverageReport,
  filterRequestCoverageRecords,
} from "./request-coverage";
import type { RequestHistoryRecord } from "./request-history";

function createResponse(status: string): ResponseSummary {
  return {
    contentTypes: [],
    description: `${status} response`,
    schema: null,
    status,
  };
}

function createEndpoint(
  method: string,
  path: string,
  statuses: string[],
): EndpointSummary {
  return {
    deprecated: false,
    description: "",
    method,
    operationId: `${method.toLowerCase()}Operation`,
    parameters: [],
    path,
    requestBodies: [],
    responses: statuses.map(createResponse),
    secured: false,
    securityRequirements: [],
    serverUrl: "https://api.example.com",
    summary: `${method} ${path}`,
    tags: [],
  };
}

function createRecord(
  id: string,
  method: string,
  path: string,
  status: number,
  createdAt = "2026-09-04T10:00:00.000Z",
): RequestHistoryRecord {
  return {
    createdAt,
    durationMs: status === 0 ? 0 : 20,
    errorDetails: status === 0 ? "Network error" : null,
    id,
    method,
    path,
    requestSize: 0,
    responseSize: 0,
    status,
    summary: `${method} ${path}`,
    url: `https://api.example.com${path}`,
  };
}

describe("request coverage", () => {
  it("maps recent requests to operations and documented response variants", () => {
    const report = createRequestCoverageReport(
      [
        createEndpoint("GET", "/users", ["200", "404"]),
        createEndpoint("POST", "/users", ["201"]),
        createEndpoint("DELETE", "/users/{id}", ["204"]),
      ],
      [
        createRecord("get-ok", "get", "/users", 200),
        createRecord(
          "get-missing",
          "GET",
          "/users",
          404,
          "2026-09-04T09:00:00.000Z",
        ),
        createRecord("post-undocumented", "POST", "/users", 202),
        createRecord("other-schema", "GET", "/projects", 200),
      ],
    );

    expect(report).toMatchObject({
      endpointCoveragePercentage: 67,
      failedRequestCount: 1,
      ignoredRequestCount: 1,
      operationCount: 3,
      requestCount: 3,
      responseCoveragePercentage: 50,
      statusVariantCount: 4,
      testedOperationCount: 2,
      testedStatusVariantCount: 2,
      undocumentedOperationCount: 1,
      untestedOperationCount: 1,
    });
    expect(report.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attempts: 2,
          latestStatus: 200,
          method: "GET",
          observedDocumentedResponses: ["200", "404"],
          observedStatuses: [200, 404],
          path: "/users",
          state: "covered",
        }),
        expect.objectContaining({
          method: "POST",
          state: "undocumented",
          undocumentedStatuses: [202],
        }),
        expect.objectContaining({
          method: "DELETE",
          state: "untested",
        }),
      ]),
    );
  });

  it("matches status ranges and defaults while prioritizing the latest failure", () => {
    const report = createRequestCoverageReport(
      [createEndpoint("GET", "/jobs", ["2XX", "default"])],
      [
        createRecord(
          "success",
          "GET",
          "/jobs",
          204,
          "2026-09-04T09:00:00.000Z",
        ),
        createRecord("failure", "GET", "/jobs", 503),
      ],
    );

    expect(report).toMatchObject({
      failedRequestCount: 1,
      failingOperationCount: 1,
      responseCoveragePercentage: 100,
      testedStatusVariantCount: 2,
    });
    expect(report.operations[0]).toMatchObject({
      averageDurationMs: 20,
      latestStatus: 503,
      observedDocumentedResponses: ["2XX", "default"],
      state: "failing",
    });
  });

  it("treats transport failures as undocumented and handles empty contracts", () => {
    const report = createRequestCoverageReport(
      [createEndpoint("GET", "/health", [])],
      [createRecord("network", "GET", "/health", 0)],
    );

    expect(report).toMatchObject({
      endpointCoveragePercentage: 100,
      responseCoveragePercentage: 0,
      statusVariantCount: 0,
    });
    expect(report.operations[0]).toMatchObject({
      state: "failing",
      undocumentedStatuses: [0],
    });
  });

  it("filters history by age without mutating the source records", () => {
    const records = [
      createRecord("recent", "GET", "/users", 200, "2026-09-04T11:00:00.000Z"),
      createRecord(
        "yesterday",
        "GET",
        "/users",
        200,
        "2026-09-03T10:59:59.999Z",
      ),
      createRecord("week", "GET", "/users", 200, "2026-08-28T12:00:00.000Z"),
      createRecord("invalid", "GET", "/users", 200, "not-a-date"),
    ];
    const now = new Date("2026-09-04T11:00:00.000Z");

    expect(
      filterRequestCoverageRecords(records, "24h", now).map(
        (record) => record.id,
      ),
    ).toEqual(["recent"]);
    expect(
      filterRequestCoverageRecords(records, "7d", now).map(
        (record) => record.id,
      ),
    ).toEqual(["recent", "yesterday", "week"]);
    expect(filterRequestCoverageRecords(records, "all", now)).toEqual(records);
    expect(filterRequestCoverageRecords(records, "all", now)).not.toBe(records);
    expect(
      filterRequestCoverageRecords(records, "24h", new Date("bad")),
    ).toEqual([]);
  });
});
