import type { EndpointSummary, SecuritySchemeSummary } from "./openapi";

export type SecurityAccess = "optional" | "public" | "secured";

export type SecurityFindingSeverity = "error" | "info" | "warning";

export type SecurityFindingCode =
  | "incomplete-api-key"
  | "incomplete-http"
  | "optional-authentication"
  | "undefined-scheme"
  | "unsupported-scheme"
  | "unused-scheme";

export type SecurityPostureFinding = {
  code: SecurityFindingCode;
  method?: string;
  path?: string;
  schemeName?: string;
  severity: SecurityFindingSeverity;
};

export type SecurityPostureOperation = {
  access: SecurityAccess;
  issueCodes: SecurityFindingCode[];
  method: string;
  path: string;
  requirementGroups: string[][];
  requirements: string[];
  summary: string;
  undefinedSchemes: string[];
};

export type SecurityPostureScheme = SecuritySchemeSummary & {
  issueCodes: SecurityFindingCode[];
  operationCount: number;
};

export type SecurityPostureReport = {
  coveragePercentage: number;
  findingCounts: Record<SecurityFindingSeverity, number>;
  findings: SecurityPostureFinding[];
  operations: SecurityPostureOperation[];
  optionalCount: number;
  publicCount: number;
  schemes: SecurityPostureScheme[];
  securedCount: number;
  totalCount: number;
  undefinedSchemeNames: string[];
  usedSchemeCount: number;
};

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeRequirementGroups(endpoint: EndpointSummary) {
  if (endpoint.securityRequirementGroups?.length) {
    return endpoint.securityRequirementGroups.map((group) => unique(group));
  }

  return endpoint.securityRequirements.length > 0
    ? [unique(endpoint.securityRequirements)]
    : [];
}

function getOperationAccess(groups: string[][]): SecurityAccess {
  const hasSecuredAlternative = groups.some((group) => group.length > 0);

  if (!hasSecuredAlternative) {
    return "public";
  }

  return groups.some((group) => group.length === 0) ? "optional" : "secured";
}

function getSchemeIssueCodes(scheme: SecuritySchemeSummary) {
  const issueCodes: SecurityFindingCode[] = [];

  if (scheme.type === "apiKey" && (!scheme.parameterName || !scheme.location)) {
    issueCodes.push("incomplete-api-key");
  }

  if (scheme.type === "http" && !scheme.scheme) {
    issueCodes.push("incomplete-http");
  }

  if (scheme.type === "unsupported") {
    issueCodes.push("unsupported-scheme");
  }

  return issueCodes;
}

function countFindings(findings: SecurityPostureFinding[]) {
  return findings.reduce<Record<SecurityFindingSeverity, number>>(
    (counts, finding) => ({
      ...counts,
      [finding.severity]: counts[finding.severity] + 1,
    }),
    { error: 0, info: 0, warning: 0 },
  );
}

export function createSecurityPostureReport(
  endpoints: EndpointSummary[],
  securitySchemes: SecuritySchemeSummary[],
): SecurityPostureReport {
  const declaredSchemeNames = new Set(
    securitySchemes.map((scheme) => scheme.name),
  );
  const findings: SecurityPostureFinding[] = [];
  const operations = endpoints.map<SecurityPostureOperation>((endpoint) => {
    const requirementGroups = normalizeRequirementGroups(endpoint);
    const requirements = unique(requirementGroups.flat());
    const access = getOperationAccess(requirementGroups);
    const undefinedSchemes = requirements.filter(
      (name) => !declaredSchemeNames.has(name),
    );
    const issueCodes: SecurityFindingCode[] = [];

    if (access === "optional") {
      issueCodes.push("optional-authentication");
      findings.push({
        code: "optional-authentication",
        method: endpoint.method,
        path: endpoint.path,
        severity: "warning",
      });
    }

    if (undefinedSchemes.length > 0) {
      issueCodes.push("undefined-scheme");
      undefinedSchemes.forEach((schemeName) => {
        findings.push({
          code: "undefined-scheme",
          method: endpoint.method,
          path: endpoint.path,
          schemeName,
          severity: "error",
        });
      });
    }

    return {
      access,
      issueCodes,
      method: endpoint.method,
      path: endpoint.path,
      requirementGroups,
      requirements,
      summary: endpoint.summary,
      undefinedSchemes,
    };
  });
  const schemes = securitySchemes.map<SecurityPostureScheme>((scheme) => {
    const operationCount = operations.filter((operation) =>
      operation.requirements.includes(scheme.name),
    ).length;
    const issueCodes = getSchemeIssueCodes(scheme);

    if (operationCount === 0) {
      issueCodes.push("unused-scheme");
    }

    issueCodes.forEach((code) => {
      findings.push({
        code,
        schemeName: scheme.name,
        severity:
          code === "incomplete-api-key" || code === "incomplete-http"
            ? "error"
            : code === "unsupported-scheme"
              ? "warning"
              : "info",
      });
    });

    return { ...scheme, issueCodes, operationCount };
  });
  const securedCount = operations.filter(
    (operation) => operation.access === "secured",
  ).length;
  const optionalCount = operations.filter(
    (operation) => operation.access === "optional",
  ).length;
  const publicCount = operations.filter(
    (operation) => operation.access === "public",
  ).length;
  const undefinedSchemeNames = unique(
    operations.flatMap((operation) => operation.undefinedSchemes),
  );

  return {
    coveragePercentage:
      operations.length === 0
        ? 100
        : Math.round((securedCount / operations.length) * 100),
    findingCounts: countFindings(findings),
    findings,
    operations,
    optionalCount,
    publicCount,
    schemes,
    securedCount,
    totalCount: operations.length,
    undefinedSchemeNames,
    usedSchemeCount: schemes.filter((scheme) => scheme.operationCount > 0)
      .length,
  };
}
