import { createSchemaMockResponse } from "./request-mock";
import type { EndpointSummary } from "./openapi";
import { parseResponseAssertions } from "./response-assertions";
import {
  MTError,
  normalizeMTFixture,
  normalizeMTResponse,
  mtFreshId,
  type MTCheck,
  type MTFixture,
} from "./mutation-model";
import { readMutationJson } from "./mutation-json";

export function importMTChecks(source: string, fixture: MTFixture): MTCheck[] {
  const parsed = parseResponseAssertions(source);
  if (!parsed.ok)
    throw new MTError(
      parsed.issue === "too-large" || parsed.issue === "too-many"
        ? "limit"
        : "assertion",
    );
  const checks = [...fixture.checks];
  for (const rule of parsed.rules)
    checks.push({
      id: mtFreshId("check", checks),
      enabled: true,
      pinned: false,
      rule,
    });
  return normalizeMTFixture({ ...fixture, checks }).checks;
}
export function fixtureFromMTOperation(
  endpoint: EndpointSummary,
  responseIndex: number,
  fixtures: MTFixture[],
): MTFixture {
  const response = endpoint.responses[responseIndex];
  if (!response) throw new MTError("schema");
  const generated = createSchemaMockResponse(response, ""),
    rawStatus = generated.status.trim();
  const status = /^[1-5]\d{2}$/.test(rawStatus)
    ? rawStatus
    : /^[1-5]xx$/i.test(rawStatus)
      ? `${rawStatus[0]}00`
      : "200";
  const snapshot = normalizeMTResponse({
    ...generated,
    status,
    durationMs: 25,
    source: "mock",
  });
  const checks: MTCheck[] = [
    {
      id: "status",
      enabled: true,
      pinned: true,
      rule: {
        name: "Documented status",
        target: "status",
        path: "",
        operator: "equals",
        expected: status,
      },
    },
  ];
  const contentType = Object.keys(snapshot.headers).find(
    (name) => name.toLowerCase() === "content-type",
  );
  if (contentType)
    checks.push({
      id: "content-type",
      enabled: true,
      pinned: false,
      rule: {
        name: "Documented media type",
        target: "header",
        path: contentType,
        operator: "equals",
        expected: snapshot.headers[contentType],
      },
    });
  const root = readMutationJson(snapshot.body).nodes[0];
  if (root)
    checks.push({
      id: "body-type",
      enabled: true,
      pinned: false,
      rule: {
        name: "Documented body shape",
        target: "body",
        path: "",
        operator: "type",
        expected: root.kind,
      },
    });
  for (const name of response.schema?.requiredProperties ?? [])
    checks.push({
      id: mtFreshId("required", checks),
      enabled: true,
      pinned: false,
      rule: {
        name: `Required ${name}`.slice(0, 120),
        target: "body",
        path: `/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        operator: "exists",
        expected: "",
      },
    });
  return normalizeMTFixture({
    id: mtFreshId("response", fixtures),
    name: `${endpoint.method} ${endpoint.path} (${response.status})`.slice(
      0,
      160,
    ),
    scope: "",
    response: snapshot,
    checks,
    expectation: null,
  });
}
