import type { EndpointSummary } from "./openapi";

export type ApiWorkflowResolution =
  "ambiguous" | "external" | "resolved" | "unresolved";

export type ApiWorkflowIssueCode =
  | "ambiguous-operation-id"
  | "external-operation-ref"
  | "invalid-operation-ref"
  | "missing-operation-id"
  | "missing-target"
  | "multiple-targets";

export type ApiWorkflowOperation = {
  key: string;
  method: string;
  operationId: string;
  path: string;
  summary: string;
};

export type ApiWorkflowMapping = {
  name: string;
  expression: string;
};

export type ApiWorkflowLink = {
  description: string;
  definitionReference: string;
  inCycle: boolean;
  issueCodes: ApiWorkflowIssueCode[];
  key: string;
  name: string;
  operationId: string;
  operationRef: string;
  parameters: ApiWorkflowMapping[];
  requestBodyExpression: string;
  resolution: ApiWorkflowResolution;
  serverUrl: string;
  source: ApiWorkflowOperation;
  status: string;
  target: ApiWorkflowOperation | null;
  targetLabel: string;
};

export type ApiWorkflowNode = ApiWorkflowOperation & {
  inCycle: boolean;
  inboundCount: number;
  outboundCount: number;
};

export type ApiWorkflowCycle = {
  operationKeys: string[];
};

export type ApiWorkflowReport = {
  ambiguousCount: number;
  connectedOperationCount: number;
  cycleCount: number;
  cycles: ApiWorkflowCycle[];
  externalCount: number;
  links: ApiWorkflowLink[];
  nodes: ApiWorkflowNode[];
  problemCount: number;
  resolvedCount: number;
  totalLinkCount: number;
  unresolvedCount: number;
};

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatExpression(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function decodePointerSegment(value: string) {
  let decoded = value;

  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep malformed URI fragments readable so the reference can be reported.
  }

  return decoded.replaceAll("~1", "/").replaceAll("~0", "~");
}

function readPointerSegments(reference: string) {
  if (!reference.startsWith("#/")) {
    return null;
  }

  return reference.slice(2).split("/").map(decodePointerSegment);
}

function resolvePointer(root: Record<string, unknown>, reference: string) {
  const segments = readPointerSegments(reference);

  if (!segments) {
    return null;
  }

  let current: unknown = root;

  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return null;
    }

    current = current[segment];
  }

  return current;
}

function resolveObjectReference(root: Record<string, unknown>, value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  let current = value;
  const visited = new Set<string>();

  while (true) {
    const reference = readString(current.$ref);

    if (!reference.startsWith("#/") || visited.has(reference)) {
      return current;
    }

    const resolved = resolvePointer(root, reference);

    if (!isRecord(resolved)) {
      return current;
    }

    visited.add(reference);
    current = resolved;
  }
}

function getOperationKey(method: string, path: string) {
  return `${method.toUpperCase()} ${path}`;
}

function toWorkflowOperation(endpoint: EndpointSummary): ApiWorkflowOperation {
  return {
    key: getOperationKey(endpoint.method, endpoint.path),
    method: endpoint.method.toUpperCase(),
    operationId: endpoint.operationId,
    path: endpoint.path,
    summary: endpoint.summary,
  };
}

function createFallbackOperation(
  method: string,
  path: string,
  operation: Record<string, unknown>,
): ApiWorkflowOperation {
  return {
    key: getOperationKey(method, path),
    method: method.toUpperCase(),
    operationId: readString(operation.operationId),
    path,
    summary: readString(operation.summary) || `${method.toUpperCase()} ${path}`,
  };
}

function readMappings(value: unknown) {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).map(([name, expression]) => ({
    expression: formatExpression(expression),
    name,
  }));
}

function resolveOperationReference(
  reference: string,
  endpointsByKey: Map<string, EndpointSummary>,
) {
  const segments = readPointerSegments(reference);

  if (
    !segments ||
    segments.length !== 3 ||
    segments[0] !== "paths" ||
    !HTTP_METHODS.has(segments[2].toLowerCase())
  ) {
    return null;
  }

  return endpointsByKey.get(getOperationKey(segments[2], segments[1])) ?? null;
}

function resolveLinkTarget(
  link: Record<string, unknown>,
  endpointsByKey: Map<string, EndpointSummary>,
  endpointsByOperationId: Map<string, EndpointSummary[]>,
): {
  issueCodes: ApiWorkflowIssueCode[];
  resolution: ApiWorkflowResolution;
  target: EndpointSummary | null;
  targetLabel: string;
} {
  const operationId = readString(link.operationId);
  const operationRef = readString(link.operationRef);
  const issueCodes: ApiWorkflowIssueCode[] = [];

  if (operationId && operationRef) {
    issueCodes.push("multiple-targets");
  }

  if (operationRef) {
    if (!operationRef.startsWith("#/")) {
      return {
        issueCodes: [...issueCodes, "external-operation-ref"],
        resolution: "external" as const,
        target: null,
        targetLabel: operationRef,
      };
    }

    const target = resolveOperationReference(operationRef, endpointsByKey);

    return target
      ? {
          issueCodes,
          resolution: "resolved" as const,
          target,
          targetLabel: getOperationKey(target.method, target.path),
        }
      : {
          issueCodes: [...issueCodes, "invalid-operation-ref"],
          resolution: "unresolved" as const,
          target: null,
          targetLabel: operationRef,
        };
  }

  if (operationId) {
    const matches = endpointsByOperationId.get(operationId) ?? [];

    if (matches.length === 1) {
      return {
        issueCodes,
        resolution: "resolved" as const,
        target: matches[0],
        targetLabel: getOperationKey(matches[0].method, matches[0].path),
      };
    }

    return matches.length > 1
      ? {
          issueCodes: [...issueCodes, "ambiguous-operation-id"],
          resolution: "ambiguous" as const,
          target: null,
          targetLabel: operationId,
        }
      : {
          issueCodes: [...issueCodes, "missing-operation-id"],
          resolution: "unresolved" as const,
          target: null,
          targetLabel: operationId,
        };
  }

  return {
    issueCodes: [...issueCodes, "missing-target"],
    resolution: "unresolved" as const,
    target: null,
    targetLabel: "",
  };
}

function findStronglyConnectedComponents(
  operationKeys: string[],
  links: ApiWorkflowLink[],
) {
  const adjacency = new Map(
    operationKeys.map((key) => [key, new Set<string>()]),
  );

  links.forEach((link) => {
    if (link.resolution === "resolved" && link.target) {
      adjacency.get(link.source.key)?.add(link.target.key);
    }
  });

  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  function connect(key: string) {
    indexes.set(key, nextIndex);
    lowLinks.set(key, nextIndex);
    nextIndex += 1;
    stack.push(key);
    onStack.add(key);

    adjacency.get(key)?.forEach((targetKey) => {
      if (!indexes.has(targetKey)) {
        connect(targetKey);
        lowLinks.set(
          key,
          Math.min(lowLinks.get(key) ?? 0, lowLinks.get(targetKey) ?? 0),
        );
      } else if (onStack.has(targetKey)) {
        lowLinks.set(
          key,
          Math.min(lowLinks.get(key) ?? 0, indexes.get(targetKey) ?? 0),
        );
      }
    });

    if (lowLinks.get(key) !== indexes.get(key)) {
      return;
    }

    const component: string[] = [];
    let member = "";

    do {
      member = stack.pop() ?? "";
      onStack.delete(member);
      component.push(member);
    } while (member && member !== key);

    const hasSelfLoop = component.some((operationKey) =>
      adjacency.get(operationKey)?.has(operationKey),
    );

    if (component.length > 1 || hasSelfLoop) {
      components.push(component.sort());
    }
  }

  operationKeys.forEach((key) => {
    if (!indexes.has(key)) {
      connect(key);
    }
  });

  return components.sort((left, right) => left[0].localeCompare(right[0]));
}

export function createApiWorkflowReport(
  schema: Record<string, unknown>,
  endpoints: EndpointSummary[],
): ApiWorkflowReport {
  const endpointOperations = endpoints.map(toWorkflowOperation);
  const endpointsByKey = new Map(
    endpoints.map((endpoint) => [
      getOperationKey(endpoint.method, endpoint.path),
      endpoint,
    ]),
  );
  const endpointsByOperationId = endpoints.reduce<
    Map<string, EndpointSummary[]>
  >((index, endpoint) => {
    if (!endpoint.operationId) {
      return index;
    }

    index.set(endpoint.operationId, [
      ...(index.get(endpoint.operationId) ?? []),
      endpoint,
    ]);
    return index;
  }, new Map());
  const operationByKey = new Map(
    endpointOperations.map((operation) => [operation.key, operation]),
  );
  const paths = isRecord(schema.paths) ? schema.paths : {};
  const links: ApiWorkflowLink[] = [];

  Object.entries(paths).forEach(([path, rawPathConfig]) => {
    const pathConfig = resolveObjectReference(schema, rawPathConfig);

    if (!pathConfig) {
      return;
    }

    Object.entries(pathConfig).forEach(([method, rawOperation]) => {
      if (!HTTP_METHODS.has(method.toLowerCase())) {
        return;
      }

      const operation = resolveObjectReference(schema, rawOperation);

      if (!operation) {
        return;
      }

      const sourceKey = getOperationKey(method, path);
      const source =
        operationByKey.get(sourceKey) ??
        createFallbackOperation(method, path, operation);
      const responses = resolveObjectReference(schema, operation.responses);

      if (!responses) {
        return;
      }

      Object.entries(responses).forEach(([status, rawResponse]) => {
        const response = resolveObjectReference(schema, rawResponse);

        if (!response || !isRecord(response.links)) {
          return;
        }

        Object.entries(response.links).forEach(([name, rawLink]) => {
          const definitionReference = isRecord(rawLink)
            ? readString(rawLink.$ref)
            : "";
          const link = resolveObjectReference(schema, rawLink);

          if (!link) {
            return;
          }

          const targetResult = resolveLinkTarget(
            link,
            endpointsByKey,
            endpointsByOperationId,
          );
          const target = targetResult.target
            ? toWorkflowOperation(targetResult.target)
            : null;

          links.push({
            description: readString(link.description),
            definitionReference,
            inCycle: false,
            issueCodes: targetResult.issueCodes,
            key: `${sourceKey} ${status} ${name} ${links.length}`,
            name,
            operationId: readString(link.operationId),
            operationRef: readString(link.operationRef),
            parameters: readMappings(link.parameters),
            requestBodyExpression: formatExpression(link.requestBody),
            resolution: targetResult.resolution,
            serverUrl: isRecord(link.server) ? readString(link.server.url) : "",
            source,
            status,
            target,
            targetLabel: targetResult.targetLabel,
          });
        });
      });
    });
  });

  const linkedOperationByKey = new Map<string, ApiWorkflowOperation>();

  links.forEach((link) => {
    linkedOperationByKey.set(link.source.key, link.source);

    if (link.target) {
      linkedOperationByKey.set(link.target.key, link.target);
    }
  });

  const cycles = findStronglyConnectedComponents(
    Array.from(linkedOperationByKey.keys()),
    links,
  );
  const cycleByOperationKey = new Map<string, number>();

  cycles.forEach((cycle, cycleIndex) => {
    cycle.forEach((operationKey) => {
      cycleByOperationKey.set(operationKey, cycleIndex);
    });
  });

  const linksWithCycles = links.map((link) => ({
    ...link,
    inCycle:
      Boolean(link.target) &&
      cycleByOperationKey.get(link.source.key) !== undefined &&
      cycleByOperationKey.get(link.source.key) ===
        cycleByOperationKey.get(link.target?.key ?? ""),
  }));
  const nodes = Array.from(linkedOperationByKey.values()).map((operation) => ({
    ...operation,
    inCycle: cycleByOperationKey.has(operation.key),
    inboundCount: linksWithCycles.filter(
      (link) => link.target?.key === operation.key,
    ).length,
    outboundCount: linksWithCycles.filter(
      (link) => link.source.key === operation.key,
    ).length,
  }));
  const resolvedCount = linksWithCycles.filter(
    (link) => link.resolution === "resolved",
  ).length;
  const ambiguousCount = linksWithCycles.filter(
    (link) => link.resolution === "ambiguous",
  ).length;
  const externalCount = linksWithCycles.filter(
    (link) => link.resolution === "external",
  ).length;
  const unresolvedCount = linksWithCycles.filter(
    (link) => link.resolution === "unresolved",
  ).length;

  return {
    ambiguousCount,
    connectedOperationCount: nodes.length,
    cycleCount: cycles.length,
    cycles: cycles.map((operationKeys) => ({ operationKeys })),
    externalCount,
    links: linksWithCycles,
    nodes,
    problemCount: linksWithCycles.filter((link) => link.issueCodes.length > 0)
      .length,
    resolvedCount,
    totalLinkCount: linksWithCycles.length,
    unresolvedCount,
  };
}
