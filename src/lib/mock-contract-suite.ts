import type { EndpointSummary, ResponseSummary } from "./openapi";
import {
  createResponseContractReport,
  type ResponseContractReport,
} from "./response-contract";
import { createSchemaMockResponse } from "./request-mock";
import { selectResponseRepresentation } from "./response-representation";

export type MockContractSuiteCaseResult = "fail" | "partial" | "pass";
export type MockContractSuiteBodySource = "documented" | "generated" | "none";

export type MockContractSuiteCase = {
  actualStatus: string;
  bodySource: MockContractSuiteBodySource;
  contentType: string;
  documentedStatus: string;
  id: string;
  method: string;
  path: string;
  report: ResponseContractReport;
  result: MockContractSuiteCaseResult;
  skippedCount: number;
  summary: string;
};

export type MockContractSuiteReport = {
  cases: MockContractSuiteCase[];
  endpointCount: number;
  failedCount: number;
  partialCount: number;
  passedCount: number;
  totalCount: number;
};

function getCaseResult(
  report: ResponseContractReport,
): MockContractSuiteCaseResult {
  if (report.failedCount > 0) {
    return "fail";
  }

  return report.checks.some((check) => check.result === "skipped")
    ? "partial"
    : "pass";
}

function getBodySource(
  response: ResponseSummary | undefined,
  generated: boolean,
): MockContractSuiteBodySource {
  if (generated) {
    return "generated";
  }

  return response?.schema?.hasExplicitExample || response?.schema?.example
    ? "documented"
    : "none";
}

function createSuiteCase(
  endpoint: EndpointSummary,
  response: ResponseSummary | undefined,
  id: string,
) {
  const mockResponse = createSchemaMockResponse(response, "");
  const report = createResponseContractReport(endpoint.responses, {
    body: mockResponse.body,
    headers: mockResponse.headers,
    method: endpoint.method,
    status: mockResponse.status,
  });

  return {
    actualStatus: mockResponse.status,
    bodySource: getBodySource(response, mockResponse.generated),
    contentType: response?.contentTypes[0] ?? "",
    documentedStatus: response?.status ?? "",
    id,
    method: endpoint.method,
    path: endpoint.path,
    report,
    result: getCaseResult(report),
    skippedCount: report.checks.filter((check) => check.result === "skipped")
      .length,
    summary: endpoint.summary,
  } satisfies MockContractSuiteCase;
}

export function createMockContractSuite(
  endpoints: EndpointSummary[],
): MockContractSuiteReport {
  const cases = endpoints.flatMap((endpoint, endpointIndex) => {
    if (endpoint.responses.length === 0) {
      return [createSuiteCase(endpoint, undefined, `${endpointIndex}:none`)];
    }

    return endpoint.responses.flatMap((response, responseIndex) => {
      const contentTypes =
        response.contentTypes.length > 0 ? response.contentTypes : [""];

      return contentTypes.map((contentType, contentTypeIndex) => {
        const representation = selectResponseRepresentation(
          response,
          contentType,
        ).response;

        return createSuiteCase(
          endpoint,
          representation,
          `${endpointIndex}:${responseIndex}:${contentTypeIndex}`,
        );
      });
    });
  });

  return {
    cases,
    endpointCount: endpoints.length,
    failedCount: cases.filter((item) => item.result === "fail").length,
    partialCount: cases.filter((item) => item.result === "partial").length,
    passedCount: cases.filter((item) => item.result === "pass").length,
    totalCount: cases.length,
  };
}
