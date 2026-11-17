import {
  validateResponseAssertion,
  type AssertionResponse,
  type ResponseAssertion,
} from "./response-assertions";
import { getByteSize } from "./text-encoding";

export const MT_OPERATORS = [
  "status",
  "duration",
  "header-remove",
  "header-change",
  "field-remove",
  "null",
  "type",
  "number",
  "boolean",
  "string-empty",
  "string-change",
  "array-empty",
  "array-drop",
  "array-duplicate",
  "object-extra",
  "invalid-json",
] as const;
export type MTOperator = (typeof MT_OPERATORS)[number];
export type MTCheck = {
  id: string;
  enabled: boolean;
  pinned: boolean;
  rule: ResponseAssertion;
};
export type MTExpectation = {
  minScore: number;
  maxSurvived: number;
  maxInconclusive: number;
  allowTruncated: boolean;
};
export type MTFixture = {
  id: string;
  name: string;
  response: AssertionResponse;
  scope: string;
  checks: MTCheck[];
  expectation: MTExpectation | null;
};
export type MTWaiver = { fixture: string; key: string; reason: string };
export type MTProject = {
  version: 1;
  name: string;
  maxMutants: number;
  operators: MTOperator[];
  fixtures: MTFixture[];
  waivers: MTWaiver[];
};
export const MT_LIMITS = {
  bytes: 2 * 1024 * 1024,
  body: 64 * 1024,
  fixtures: 6,
  checks: 50,
  mutants: 128,
  totalMutants: 512,
  nodes: 2000,
  depth: 20,
  waivers: 512,
} as const;
export type MTErrorCode =
  | "project"
  | "limit"
  | "reference"
  | "duplicate"
  | "assertion"
  | "no-checks"
  | "cancelled"
  | "schema"
  | "suggestion"
  | "expectation";
export class MTError extends Error {
  constructor(public readonly code: MTErrorCode) {
    super(code);
    this.name = "MTError";
  }
}
export function mtRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new MTError("project");
  return v as Record<string, unknown>;
}
function list(v: unknown, max: number, min = 0): unknown[] {
  if (!Array.isArray(v) || v.length < min) throw new MTError("project");
  if (v.length > max) throw new MTError("limit");
  return v;
}
function text(v: unknown, max: number, empty = false): string {
  if (typeof v !== "string" || v.length > max || (!empty && !v.trim()))
    throw new MTError("project");
  return v;
}
function id(v: unknown) {
  const value = text(v, 48);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) throw new MTError("project");
  return value;
}
function integer(v: unknown, min: number, max: number) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max)
    throw new MTError("project");
  return v;
}
function bool(v: unknown) {
  if (typeof v !== "boolean") throw new MTError("project");
  return v;
}
function unique<T extends { id: string }>(values: T[]) {
  if (new Set(values.map((v) => v.id)).size !== values.length)
    throw new MTError("duplicate");
  return values;
}
export function normalizeMTCheck(raw: unknown): MTCheck {
  const v = mtRecord(raw),
    source = mtRecord(v.rule);
  const rule = {
    name: source.name,
    target: source.target,
    path: source.path,
    operator: source.operator,
    expected: source.expected,
  } as ResponseAssertion;
  if (validateResponseAssertion(rule)) throw new MTError("assertion");
  return {
    id: id(v.id),
    enabled: bool(v.enabled),
    pinned: bool(v.pinned),
    rule,
  };
}
export function normalizeMTResponse(raw: unknown): AssertionResponse {
  const v = mtRecord(raw),
    body = text(v.body, MT_LIMITS.body, true),
    status = text(v.status, 3);
  if (
    !/^[1-5]\d{2}$/.test(status) ||
    getByteSize(body) > MT_LIMITS.body ||
    typeof v.durationMs !== "number" ||
    !Number.isFinite(v.durationMs) ||
    v.durationMs < 0 ||
    v.durationMs > 600_000
  )
    throw new MTError("project");
  const headers = Object.entries(mtRecord(v.headers));
  if (headers.length > 32) throw new MTError("limit");
  if (
    new Set(headers.map(([name]) => name.toLowerCase())).size !== headers.length
  )
    throw new MTError("duplicate");
  for (const [name, value] of headers)
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) ||
      typeof value !== "string" ||
      value.length > 4096 ||
      /[\r\n\0]/.test(value)
    )
      throw new MTError("project");
  return {
    body,
    status,
    headers: Object.fromEntries(headers) as Record<string, string>,
    durationMs: v.durationMs,
    source: "mock",
  };
}
export function normalizeMTFixture(raw: unknown): MTFixture {
  const v = mtRecord(raw),
    scope = text(v.scope, 512, true);
  if (scope && (!scope.startsWith("/") || /~(?![01])/.test(scope)))
    throw new MTError("project");
  let expectation: MTExpectation | null = null;
  if (v.expectation !== null) {
    const e = mtRecord(v.expectation);
    if (
      typeof e.minScore !== "number" ||
      !Number.isFinite(e.minScore) ||
      e.minScore < 0 ||
      e.minScore > 100
    )
      throw new MTError("expectation");
    expectation = {
      minScore: e.minScore,
      maxSurvived: integer(e.maxSurvived, 0, MT_LIMITS.mutants),
      maxInconclusive: integer(e.maxInconclusive, 0, MT_LIMITS.mutants),
      allowTruncated: bool(e.allowTruncated),
    };
  }
  return {
    id: id(v.id),
    name: text(v.name, 160),
    response: normalizeMTResponse(v.response),
    scope,
    checks: unique(list(v.checks, MT_LIMITS.checks).map(normalizeMTCheck)),
    expectation,
  };
}
export function normalizeMTProject(raw: unknown): MTProject {
  const v = mtRecord(raw);
  if (v.version !== 1) throw new MTError("project");
  const operators = list(v.operators, MT_OPERATORS.length, 1);
  if (operators.some((op) => !MT_OPERATORS.includes(op as MTOperator)))
    throw new MTError("project");
  if (new Set(operators).size !== operators.length)
    throw new MTError("duplicate");
  const fixtures = unique(
    list(v.fixtures, MT_LIMITS.fixtures, 1).map(normalizeMTFixture),
  );
  const waivers = list(v.waivers, MT_LIMITS.waivers).map((raw) => {
    const w = mtRecord(raw),
      fixture = id(w.fixture);
    if (!fixtures.some((f) => f.id === fixture)) throw new MTError("reference");
    return { fixture, key: text(w.key, 2048), reason: text(w.reason, 240) };
  });
  if (
    new Set(waivers.map((w) => JSON.stringify([w.fixture, w.key]))).size !==
    waivers.length
  )
    throw new MTError("duplicate");
  const project: MTProject = {
    version: 1,
    name: text(v.name, 160),
    maxMutants: integer(v.maxMutants, 1, MT_LIMITS.mutants),
    operators: operators as MTOperator[],
    fixtures,
    waivers,
  };
  if (getByteSize(JSON.stringify(project, null, 2)) > MT_LIMITS.bytes)
    throw new MTError("limit");
  return project;
}
export function parseMTJson(source: string): unknown {
  if (source.length > MT_LIMITS.bytes || getByteSize(source) > MT_LIMITS.bytes)
    throw new MTError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new MTError("project");
  }
}
export function parseMTProject(source: string) {
  return normalizeMTProject(parseMTJson(source));
}
export function serializeMTProject(project: MTProject) {
  return JSON.stringify(normalizeMTProject(project), null, 2);
}
export function mtFreshId(prefix: string, items: { id: string }[]) {
  let n = 1;
  while (items.some((v) => v.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
export function emptyMTProject(): MTProject {
  return {
    version: 1,
    name: "Response mutation tests",
    maxMutants: 100,
    operators: MT_OPERATORS.filter((op) => op !== "invalid-json"),
    waivers: [],
    fixtures: [
      {
        id: "response-1",
        name: "Example response",
        scope: "",
        expectation: null,
        response: {
          status: "200",
          headers: { "content-type": "application/json" },
          body: '{"id":1,"active":true}',
          durationMs: 25,
          source: "mock",
        },
        checks: [
          {
            id: "check-1",
            enabled: true,
            pinned: true,
            rule: {
              name: "Successful status",
              target: "status",
              path: "",
              operator: "equals",
              expected: "200",
            },
          },
        ],
      },
    ],
  };
}
