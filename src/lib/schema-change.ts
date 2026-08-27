import type { EndpointParameter, EndpointSummary } from "./openapi";

export type SchemaChangeImpact = "breaking" | "non-breaking";
export type SchemaEndpointChangeKind = "added" | "modified" | "removed";

export type SchemaChangeDetailCode =
  | "deprecated"
  | "documentation-changed"
  | "operation-id-added"
  | "operation-id-changed"
  | "operation-id-removed"
  | "optional-parameter-added"
  | "parameter-became-optional"
  | "parameter-became-required"
  | "parameter-removed"
  | "request-body-added"
  | "request-body-became-optional"
  | "request-body-became-required"
  | "request-body-removed"
  | "required-parameter-added"
  | "response-added"
  | "response-removed"
  | "security-added"
  | "security-removed"
  | "tags-changed"
  | "undeprecated";

export type ComparableEndpoint = {
  deprecated: boolean;
  description: string;
  method: string;
  operationId: string;
  parameters: Array<{
    location: EndpointParameter["location"];
    name: string;
    required: boolean;
  }>;
  path: string;
  requestBodies: Array<{
    contentType: string;
    required: boolean;
  }>;
  responseStatuses: string[];
  secured: boolean;
  summary: string;
  tags: string[];
};

export type SchemaChangeDetail = {
  code: SchemaChangeDetailCode;
  contentType?: string;
  current?: string;
  impact: SchemaChangeImpact;
  location?: EndpointParameter["location"];
  name?: string;
  previous?: string;
  status?: string;
};

export type SchemaEndpointChange = {
  details: SchemaChangeDetail[];
  impact: SchemaChangeImpact;
  kind: SchemaEndpointChangeKind;
  method: string;
  path: string;
  summary: string;
};

export type SchemaChangeReport = {
  addedCount: number;
  breakingCount: number;
  changes: SchemaEndpointChange[];
  modifiedCount: number;
  removedCount: number;
  unchangedCount: number;
};

const IMPACT_ORDER: Record<SchemaChangeImpact, number> = {
  breaking: 0,
  "non-breaking": 1,
};

function getEndpointKey(endpoint: Pick<ComparableEndpoint, "method" | "path">) {
  return `${endpoint.method.trim().toUpperCase()} ${endpoint.path.trim()}`;
}

function sortStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (first, second) => first.localeCompare(second),
  );
}

export function createComparableEndpoint(
  endpoint: EndpointSummary,
): ComparableEndpoint {
  return {
    deprecated: endpoint.deprecated,
    description: endpoint.description.trim(),
    method: endpoint.method.trim().toUpperCase(),
    operationId: endpoint.operationId.trim(),
    parameters: endpoint.parameters
      .map((parameter) => ({
        location: parameter.location,
        name: parameter.name.trim(),
        required: parameter.required,
      }))
      .sort((first, second) =>
        `${first.location}:${first.name}`.localeCompare(
          `${second.location}:${second.name}`,
        ),
      ),
    path: endpoint.path.trim(),
    requestBodies: endpoint.requestBodies
      .map((requestBody) => ({
        contentType: requestBody.contentType.trim().toLowerCase(),
        required: requestBody.required,
      }))
      .sort((first, second) =>
        first.contentType.localeCompare(second.contentType),
      ),
    responseStatuses: sortStrings(
      endpoint.responses.map((response) => response.status.toLowerCase()),
    ),
    secured: endpoint.secured,
    summary: endpoint.summary.trim(),
    tags: sortStrings(endpoint.tags),
  };
}

function compareOperationId(
  baseline: ComparableEndpoint,
  current: ComparableEndpoint,
) {
  if (baseline.operationId === current.operationId) {
    return [];
  }

  if (!baseline.operationId) {
    return [
      {
        code: "operation-id-added",
        current: current.operationId,
        impact: "non-breaking",
      } satisfies SchemaChangeDetail,
    ];
  }

  if (!current.operationId) {
    return [
      {
        code: "operation-id-removed",
        previous: baseline.operationId,
        impact: "breaking",
      } satisfies SchemaChangeDetail,
    ];
  }

  return [
    {
      code: "operation-id-changed",
      current: current.operationId,
      impact: "breaking",
      previous: baseline.operationId,
    } satisfies SchemaChangeDetail,
  ];
}

function compareParameters(
  baseline: ComparableEndpoint,
  current: ComparableEndpoint,
) {
  const baselineParameters = new Map(
    baseline.parameters.map((parameter) => [
      `${parameter.location}:${parameter.name}`,
      parameter,
    ]),
  );
  const currentParameters = new Map(
    current.parameters.map((parameter) => [
      `${parameter.location}:${parameter.name}`,
      parameter,
    ]),
  );
  const details: SchemaChangeDetail[] = [];

  baselineParameters.forEach((parameter, key) => {
    const currentParameter = currentParameters.get(key);

    if (!currentParameter) {
      details.push({
        code: "parameter-removed",
        impact: "breaking",
        location: parameter.location,
        name: parameter.name,
      });
    } else if (!parameter.required && currentParameter.required) {
      details.push({
        code: "parameter-became-required",
        impact: "breaking",
        location: parameter.location,
        name: parameter.name,
      });
    } else if (parameter.required && !currentParameter.required) {
      details.push({
        code: "parameter-became-optional",
        impact: "non-breaking",
        location: parameter.location,
        name: parameter.name,
      });
    }
  });

  currentParameters.forEach((parameter, key) => {
    if (!baselineParameters.has(key)) {
      details.push({
        code: parameter.required
          ? "required-parameter-added"
          : "optional-parameter-added",
        impact: parameter.required ? "breaking" : "non-breaking",
        location: parameter.location,
        name: parameter.name,
      });
    }
  });

  return details;
}

function compareRequestBodies(
  baseline: ComparableEndpoint,
  current: ComparableEndpoint,
) {
  const baselineBodies = new Map(
    baseline.requestBodies.map((body) => [body.contentType, body]),
  );
  const currentBodies = new Map(
    current.requestBodies.map((body) => [body.contentType, body]),
  );
  const details: SchemaChangeDetail[] = [];

  baselineBodies.forEach((body, contentType) => {
    const currentBody = currentBodies.get(contentType);

    if (!currentBody) {
      details.push({
        code: "request-body-removed",
        contentType,
        impact: "breaking",
      });
    } else if (!body.required && currentBody.required) {
      details.push({
        code: "request-body-became-required",
        contentType,
        impact: "breaking",
      });
    } else if (body.required && !currentBody.required) {
      details.push({
        code: "request-body-became-optional",
        contentType,
        impact: "non-breaking",
      });
    }
  });

  currentBodies.forEach((body, contentType) => {
    if (!baselineBodies.has(contentType)) {
      details.push({
        code: "request-body-added",
        contentType,
        impact: body.required ? "breaking" : "non-breaking",
      });
    }
  });

  return details;
}

function compareResponses(
  baseline: ComparableEndpoint,
  current: ComparableEndpoint,
) {
  const baselineStatuses = new Set(baseline.responseStatuses);
  const currentStatuses = new Set(current.responseStatuses);
  const details: SchemaChangeDetail[] = [];

  baselineStatuses.forEach((status) => {
    if (!currentStatuses.has(status)) {
      details.push({ code: "response-removed", impact: "breaking", status });
    }
  });
  currentStatuses.forEach((status) => {
    if (!baselineStatuses.has(status)) {
      details.push({
        code: "response-added",
        impact: "non-breaking",
        status,
      });
    }
  });

  return details;
}

function compareEndpointDetails(
  baseline: ComparableEndpoint,
  current: ComparableEndpoint,
) {
  const details: SchemaChangeDetail[] = [
    ...compareOperationId(baseline, current),
    ...compareParameters(baseline, current),
    ...compareRequestBodies(baseline, current),
    ...compareResponses(baseline, current),
  ];

  if (baseline.secured !== current.secured) {
    details.push({
      code: current.secured ? "security-added" : "security-removed",
      impact: current.secured ? "breaking" : "non-breaking",
    });
  }

  if (baseline.deprecated !== current.deprecated) {
    details.push({
      code: current.deprecated ? "deprecated" : "undeprecated",
      impact: "non-breaking",
    });
  }

  if (
    baseline.summary !== current.summary ||
    baseline.description !== current.description
  ) {
    details.push({
      code: "documentation-changed",
      impact: "non-breaking",
    });
  }

  if (baseline.tags.join("\n") !== current.tags.join("\n")) {
    details.push({ code: "tags-changed", impact: "non-breaking" });
  }

  return details.sort(
    (first, second) =>
      IMPACT_ORDER[first.impact] - IMPACT_ORDER[second.impact] ||
      first.code.localeCompare(second.code) ||
      (first.name ?? first.status ?? first.contentType ?? "").localeCompare(
        second.name ?? second.status ?? second.contentType ?? "",
      ),
  );
}

export function createSchemaChangeReport(
  baselineEndpoints: ComparableEndpoint[],
  currentEndpoints: EndpointSummary[],
): SchemaChangeReport {
  const baselineByKey = new Map(
    baselineEndpoints.map((endpoint) => [getEndpointKey(endpoint), endpoint]),
  );
  const currentComparableEndpoints = currentEndpoints.map(
    createComparableEndpoint,
  );
  const currentByKey = new Map(
    currentComparableEndpoints.map((endpoint) => [
      getEndpointKey(endpoint),
      endpoint,
    ]),
  );
  const changes: SchemaEndpointChange[] = [];
  let unchangedCount = 0;

  baselineByKey.forEach((baselineEndpoint, key) => {
    const currentEndpoint = currentByKey.get(key);

    if (!currentEndpoint) {
      changes.push({
        details: [],
        impact: "breaking",
        kind: "removed",
        method: baselineEndpoint.method,
        path: baselineEndpoint.path,
        summary: baselineEndpoint.summary,
      });
      return;
    }

    const details = compareEndpointDetails(baselineEndpoint, currentEndpoint);

    if (details.length === 0) {
      unchangedCount += 1;
      return;
    }

    changes.push({
      details,
      impact: details.some((detail) => detail.impact === "breaking")
        ? "breaking"
        : "non-breaking",
      kind: "modified",
      method: currentEndpoint.method,
      path: currentEndpoint.path,
      summary: currentEndpoint.summary,
    });
  });

  currentByKey.forEach((endpoint, key) => {
    if (!baselineByKey.has(key)) {
      changes.push({
        details: [],
        impact: "non-breaking",
        kind: "added",
        method: endpoint.method,
        path: endpoint.path,
        summary: endpoint.summary,
      });
    }
  });

  changes.sort(
    (first, second) =>
      IMPACT_ORDER[first.impact] - IMPACT_ORDER[second.impact] ||
      first.path.localeCompare(second.path) ||
      first.method.localeCompare(second.method),
  );

  return {
    addedCount: changes.filter((change) => change.kind === "added").length,
    breakingCount: changes.filter((change) => change.impact === "breaking")
      .length,
    changes,
    modifiedCount: changes.filter((change) => change.kind === "modified")
      .length,
    removedCount: changes.filter((change) => change.kind === "removed").length,
    unchangedCount,
  };
}
