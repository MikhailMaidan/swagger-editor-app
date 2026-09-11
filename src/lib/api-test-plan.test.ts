import { describe, expect, it } from "vitest";
import type { EndpointSummary } from "./openapi";
import {
  createApiTestPlan,
  importPlanProgress,
  MAX_PLAN_BYTES,
  MAX_PLAN_CASES,
  planSummary,
  serializeTestPlan,
  testPlanMarkdown,
} from "./api-test-plan";

const endpoint: EndpointSummary = {
  method: "GET",
  path: "/users/{id}",
  operationId: "getUser",
  deprecated: false,
  secured: false,
  securityRequirements: [],
  serverUrl: "https://secret.test",
  summary: "",
  description: "",
  tags: [],
  parameters: [
    {
      location: "path",
      name: "id",
      type: "integer",
      required: true,
      minimum: 1,
      maximum: 10,
      description: "",
      example: "private-example",
    },
  ],
  requestBodies: [],
  responses: [
    { status: "200", contentTypes: [], schema: null, description: "" },
  ],
};

describe("API test plan", () => {
  it("generates happy path, required omissions, and inclusive numeric boundary suggestions", () => {
    const plan = createApiTestPlan([endpoint]);
    expect(
      plan.cases.map((test) => [test.kind, test.value, test.expectation]),
    ).toEqual([
      ["happy", null, "accept"],
      ["omit", null, "reject"],
      ["minimum", "1", "accept"],
      ["below-minimum", "0", "reject"],
      ["maximum", "10", "accept"],
      ["above-maximum", "11", "reject"],
    ]);
    expect(JSON.stringify(plan)).not.toMatch(/private-example|secret\.test/);
  });

  it("generates enum, length, pattern, required body and top-level property cases", () => {
    const plan = createApiTestPlan([
      {
        ...endpoint,
        parameters: [
          {
            ...endpoint.parameters[0],
            type: "string",
            minLength: 2,
            maxLength: 4,
            enumValues: ["__outside_enum__", "ok"],
            pattern: "^[a-z]+$",
          },
        ],
        requestBodies: [
          {
            contentType: "application/json",
            required: true,
            description: "",
            schema: {
              type: "object",
              properties: ["name"],
              requiredProperties: ["name"],
              example: "private-body",
              exampleName: "",
            },
          },
        ],
      },
    ]);
    expect(plan.cases.find((test) => test.kind === "enum-invalid")?.value).toBe(
      "__outside_enum___",
    );
    expect(
      plan.cases
        .filter((test) =>
          ["min-length", "shorter", "max-length", "longer"].includes(test.kind),
        )
        .map((test) => test.value),
    ).toEqual(["aa", "a", "aaaa", "aaaaa"]);
    expect(plan.cases.find((test) => test.kind === "pattern")).toMatchObject({
      value: "^[a-z]+$",
      expectation: "review",
    });
    expect(plan.cases.filter((test) => test.location === "body")).toMatchObject(
      [
        { kind: "omit", name: "application/json" },
        { kind: "body-property", name: "application/json · name" },
      ],
    );
    expect(JSON.stringify(plan)).not.toContain("private-body");
  });

  it("rounds fractional integer boundaries inward and preserves decimal number boundaries", () => {
    for (const [type, values] of [
      ["integer", ["2", "1", "3", "4"]],
      ["number", ["1.5", "0.5", "3.5", "4.5"]],
    ] as const) {
      const plan = createApiTestPlan([
        {
          ...endpoint,
          parameters: [
            {
              ...endpoint.parameters[0],
              type,
              minimum: 1.5,
              maximum: 3.5,
              required: false,
            },
          ],
        },
      ]);
      expect(plan.cases.slice(1).map((test) => test.value)).toEqual(values);
    }
  });

  it("bounds suggestions and never creates negative-length strings or evaluates regexes", () => {
    const plan = createApiTestPlan([
      {
        ...endpoint,
        parameters: [
          {
            ...endpoint.parameters[0],
            minimum: Infinity,
            maximum: Number.MAX_SAFE_INTEGER,
          },
          {
            ...endpoint.parameters[0],
            name: "text",
            type: "string",
            minLength: 0,
            maxLength: 257,
            pattern: "[",
          },
        ],
      },
    ]);
    expect(plan.cases.map((test) => test.kind)).toEqual([
      "happy",
      "omit",
      "omit",
      "min-length",
      "pattern",
    ]);
    expect(plan.cases.find((test) => test.kind === "min-length")?.value).toBe(
      "",
    );
  });

  it("uses stable identities across metadata and parameter order changes but refreshes changed constraints", () => {
    const extra = {
      ...endpoint.parameters[0],
      name: "other",
      location: "query" as const,
    };
    const original = {
      ...endpoint,
      parameters: [...endpoint.parameters, extra],
    };
    const first = createApiTestPlan([original]);
    const reordered = createApiTestPlan([
      {
        ...original,
        serverUrl: "https://new.test",
        summary: "changed",
        parameters: [
          extra,
          {
            ...endpoint.parameters[0],
            example: "different",
            description: "new",
          },
        ],
      },
    ]);
    expect(reordered).toEqual(first);
    const changed = createApiTestPlan([
      {
        ...original,
        parameters: [{ ...endpoint.parameters[0], maximum: 11 }, extra],
      },
    ]);
    expect(
      changed.cases.some((test) =>
        first.cases.some((old) => old.id === test.id),
      ),
    ).toBe(false);
    const responses = createApiTestPlan([
      { ...original, responses: [{ ...endpoint.responses[0], status: "201" }] },
    ]);
    expect(responses.cases[0].id).not.toBe(first.cases[0].id);
  });

  it("deduplicates operations and cases, bounds plan size, and reports skipped oversized operations", () => {
    expect(createApiTestPlan([endpoint, endpoint]).cases).toHaveLength(6);
    expect(
      createApiTestPlan([
        {
          ...endpoint,
          parameters: [endpoint.parameters[0], endpoint.parameters[0]],
        },
      ]).cases,
    ).toHaveLength(6);
    const large = createApiTestPlan(
      Array.from({ length: 1100 }, (_, index) => ({
        ...endpoint,
        path: `/users/${index}`,
        parameters: [],
      })),
    );
    expect(large.cases).toHaveLength(MAX_PLAN_CASES);
    expect(large.truncated).toBe(true);
    expect(
      createApiTestPlan([
        { ...endpoint, path: "/".repeat(1025) },
        {
          ...endpoint,
          parameters: [
            { ...endpoint.parameters[0], pattern: "a".repeat(4096) },
          ],
        },
      ]),
    ).toMatchObject({ skipped: 2, cases: [] });
    expect(createApiTestPlan([])).toEqual({
      cases: [],
      truncated: false,
      skipped: 0,
    });
  });

  it("exports results, notes, and pending cases, then restores only matching identities", () => {
    const { cases } = createApiTestPlan([endpoint]);
    const progress = {
      [cases[0].id]: { status: "passed" as const, note: "Verified manually" },
      [cases[1].id]: { status: "blocked" as const, note: "No test account" },
    };
    const report = serializeTestPlan(cases, progress);
    expect(planSummary(cases, progress)).toEqual({
      total: 6,
      pending: 4,
      passed: 1,
      failed: 0,
      blocked: 1,
    });
    const restored = importPlanProgress("\uFEFF" + report, cases.slice(0, 2));
    expect(restored).toMatchObject({
      ok: true,
      restored: 2,
      ignored: 4,
      progress,
    });
    const changed = createApiTestPlan([{ ...endpoint, parameters: [] }]);
    expect(importPlanProgress(report, changed.cases)).toMatchObject({
      ok: true,
      restored: 0,
      ignored: 6,
    });
  });

  it.each([
    "null",
    "{}",
    "{",
    '{"kind":"rsswag-api-test-plan","version":2,"cases":[]}',
  ])("rejects invalid report %s", (value) => {
    expect(importPlanProgress(value, [])).toEqual({
      ok: false,
      issue: "invalid",
    });
  });

  it("rejects duplicate IDs, invalid status or notes, and oversized imports atomically", () => {
    const { cases } = createApiTestPlan([endpoint]);
    const report = JSON.parse(serializeTestPlan(cases, {}));
    for (const rows of [
      [report.cases[0], report.cases[0]],
      [{ ...report.cases[0], status: "unknown" }],
      [{ ...report.cases[0], note: "x".repeat(1001) }],
      [null],
      Array(1001).fill(report.cases[0]),
    ]) {
      expect(
        importPlanProgress(JSON.stringify({ ...report, cases: rows }), cases),
      ).toEqual({ ok: false, issue: "invalid" });
    }
    expect(importPlanProgress(" ".repeat(MAX_PLAN_BYTES + 1), cases)).toEqual({
      ok: false,
      issue: "too-large",
    });
    expect(
      importPlanProgress("я".repeat(MAX_PLAN_BYTES / 2 + 1), cases),
    ).toEqual({ ok: false, issue: "too-large" });
  });

  it("escapes Markdown table cells, raw HTML, and multiline notes", () => {
    const { cases } = createApiTestPlan([endpoint]);
    const text = testPlanMarkdown(
      cases,
      {
        [cases[0].id]: {
          status: "failed",
          note: "<script>|[link](https://bad.test)\nsecond line",
        },
      },
      {
        title: "QA",
        columns: [
          "Endpoint",
          "Scenario",
          "Target",
          "Value",
          "Intent",
          "Result",
          "Notes",
        ],
        kind: (kind) => kind,
        status: (status) => status,
        expectation: (value) => value,
      },
    );
    expect(text).toContain("# QA");
    expect(text).toContain(
      "&lt;script&gt;\\|\\[link\\]\\(https://bad.test\\)<br>second line",
    );
    expect(text).not.toContain("<script>");
    expect(text).toContain("failed");
  });
});
