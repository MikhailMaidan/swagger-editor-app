import type { EndpointSummary } from "./openapi";

export type SchemaAuditSeverity = "error" | "info" | "warning";

export type SchemaAuditIssueCode =
  | "duplicate-operation-id"
  | "missing-documentation"
  | "missing-error-response"
  | "missing-operation-id"
  | "missing-path-parameter"
  | "missing-success-response"
  | "missing-tags"
  | "no-endpoints";

export type SchemaAuditMetricKey =
  | "documentation"
  | "error-responses"
  | "operation-ids"
  | "path-parameters"
  | "success-responses"
  | "tags";

export type SchemaAuditIssue = {
  code: SchemaAuditIssueCode;
  method?: string;
  operationId?: string;
  parameterName?: string;
  path?: string;
  severity: SchemaAuditSeverity;
};

export type SchemaAuditMetric = {
  key: SchemaAuditMetricKey;
  passed: number;
  percentage: number;
  total: number;
};

export type SchemaAuditReport = {
  endpointCount: number;
  issueCounts: Record<SchemaAuditSeverity, number>;
  issues: SchemaAuditIssue[];
  metrics: SchemaAuditMetric[];
  passedChecks: number;
  score: number;
  totalChecks: number;
};

const METRIC_KEYS: SchemaAuditMetricKey[] = [
  "documentation",
  "operation-ids",
  "tags",
  "success-responses",
  "error-responses",
  "path-parameters",
];

const ISSUE_SEVERITY_ORDER: Record<SchemaAuditSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function getPathParameterNames(path: string) {
  return Array.from(path.matchAll(/\{([^{}]+)\}/g), (match) => match[1]);
}

function hasSuccessResponse(endpoint: EndpointSummary) {
  return endpoint.responses.some((response) =>
    /^2(?:\d{2}|xx)$/i.test(response.status),
  );
}

function hasErrorResponse(endpoint: EndpointSummary) {
  return endpoint.responses.some(
    (response) =>
      response.status.toLowerCase() === "default" ||
      /^[45](?:\d{2}|xx)$/i.test(response.status),
  );
}

function hasDocumentation(endpoint: EndpointSummary) {
  return (
    Boolean(endpoint.description.trim()) ||
    (Boolean(endpoint.summary.trim()) &&
      endpoint.summary !== "Untitled endpoint")
  );
}

function createIssue(
  endpoint: EndpointSummary,
  code: SchemaAuditIssueCode,
  severity: SchemaAuditSeverity,
  details: Pick<SchemaAuditIssue, "operationId" | "parameterName"> = {},
): SchemaAuditIssue {
  return {
    code,
    method: endpoint.method,
    path: endpoint.path,
    severity,
    ...details,
  };
}

export function createSchemaAuditReport(
  endpoints: EndpointSummary[],
): SchemaAuditReport {
  const operationIdCounts = endpoints.reduce<Map<string, number>>(
    (counts, endpoint) => {
      const operationId = endpoint.operationId.trim();

      if (operationId) {
        counts.set(operationId, (counts.get(operationId) ?? 0) + 1);
      }

      return counts;
    },
    new Map(),
  );
  const metricPasses = new Map<SchemaAuditMetricKey, number>(
    METRIC_KEYS.map((key) => [key, 0]),
  );
  const issues: SchemaAuditIssue[] = [];

  const passMetric = (key: SchemaAuditMetricKey) => {
    metricPasses.set(key, (metricPasses.get(key) ?? 0) + 1);
  };

  endpoints.forEach((endpoint) => {
    if (hasDocumentation(endpoint)) {
      passMetric("documentation");
    } else {
      issues.push(createIssue(endpoint, "missing-documentation", "info"));
    }

    const operationId = endpoint.operationId.trim();

    if (!operationId) {
      issues.push(createIssue(endpoint, "missing-operation-id", "warning"));
    } else if ((operationIdCounts.get(operationId) ?? 0) > 1) {
      issues.push(
        createIssue(endpoint, "duplicate-operation-id", "error", {
          operationId,
        }),
      );
    } else {
      passMetric("operation-ids");
    }

    if (endpoint.tags.length > 0) {
      passMetric("tags");
    } else {
      issues.push(createIssue(endpoint, "missing-tags", "info"));
    }

    if (hasSuccessResponse(endpoint)) {
      passMetric("success-responses");
    } else {
      issues.push(createIssue(endpoint, "missing-success-response", "error"));
    }

    if (hasErrorResponse(endpoint)) {
      passMetric("error-responses");
    } else {
      issues.push(createIssue(endpoint, "missing-error-response", "warning"));
    }

    const definedPathParameters = new Set(
      endpoint.parameters
        .filter((parameter) => parameter.location === "path")
        .map((parameter) => parameter.name),
    );
    const missingPathParameters = getPathParameterNames(endpoint.path).filter(
      (parameterName) => !definedPathParameters.has(parameterName),
    );

    if (missingPathParameters.length === 0) {
      passMetric("path-parameters");
    } else {
      missingPathParameters.forEach((parameterName) => {
        issues.push(
          createIssue(endpoint, "missing-path-parameter", "error", {
            parameterName,
          }),
        );
      });
    }
  });

  if (endpoints.length === 0) {
    issues.push({ code: "no-endpoints", severity: "warning" });
  }

  issues.sort(
    (first, second) =>
      ISSUE_SEVERITY_ORDER[first.severity] -
        ISSUE_SEVERITY_ORDER[second.severity] ||
      (first.path ?? "").localeCompare(second.path ?? "") ||
      (first.method ?? "").localeCompare(second.method ?? "") ||
      first.code.localeCompare(second.code),
  );

  const metrics = METRIC_KEYS.map<SchemaAuditMetric>((key) => {
    const passed = metricPasses.get(key) ?? 0;
    const total = endpoints.length;

    return {
      key,
      passed,
      percentage: total === 0 ? 0 : Math.round((passed / total) * 100),
      total,
    };
  });
  const passedChecks = metrics.reduce(
    (total, metric) => total + metric.passed,
    0,
  );
  const totalChecks = endpoints.length * METRIC_KEYS.length;

  return {
    endpointCount: endpoints.length,
    issueCounts: issues.reduce<Record<SchemaAuditSeverity, number>>(
      (counts, issue) => {
        counts[issue.severity] += 1;
        return counts;
      },
      { error: 0, info: 0, warning: 0 },
    ),
    issues,
    metrics,
    passedChecks,
    score:
      totalChecks === 0 ? 0 : Math.round((passedChecks / totalChecks) * 100),
    totalChecks,
  };
}
