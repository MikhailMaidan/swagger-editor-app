import { describe, expect, it } from "vitest";
import {
  evaluateResponseAssertions,
  MAX_ASSERTION_BODY_BYTES,
  MAX_ASSERTION_IMPORT_BYTES,
  parseResponseAssertions,
  serializeAssertionReport,
  serializeResponseAssertions,
  validateResponseAssertion,
  type AssertionResponse,
  type ResponseAssertion,
} from "./response-assertions";

const response: AssertionResponse = {
  status: "200",
  durationMs: 25,
  source: "live",
  headers: { "Content-Type": " application/json ", "X-Empty": "" },
  body: JSON.stringify({
    items: [{ id: 7, name: "Ada" }],
    nullable: null,
    active: false,
    empty: "",
    count: 0,
  }),
};
const rule = (patch: Partial<ResponseAssertion> = {}): ResponseAssertion => ({
  name: "",
  target: "body",
  path: "/items/0/id",
  operator: "equals",
  expected: "7",
  ...patch,
});
const run = (patch: Partial<ResponseAssertion>, data = response) =>
  evaluateResponseAssertions([rule(patch)], data)[0];

describe("response assertions", () => {
  it("checks status and response time inclusively without changing the response", () => {
    const before = JSON.stringify(response);
    expect(run({ target: "status", expected: "200" })).toEqual({
      outcome: "pass",
    });
    expect(run({ target: "status", expected: "201" })).toEqual({
      outcome: "fail",
    });
    expect(
      run({ target: "status", operator: "gte", expected: "200" }).outcome,
    ).toBe("pass");
    expect(
      run({ target: "status", operator: "lte", expected: "199" }).outcome,
    ).toBe("fail");
    expect(
      run({ target: "duration", operator: "lte", expected: "25" }).outcome,
    ).toBe("pass");
    expect(
      run({ target: "duration", operator: "gte", expected: "26" }).outcome,
    ).toBe("fail");
    expect(JSON.stringify(response)).toBe(before);
  });

  it("normalizes header names and whitespace while retaining case-sensitive values", () => {
    expect(
      run({
        target: "header",
        path: "CONTENT-TYPE",
        expected: "application/json",
      }).outcome,
    ).toBe("pass");
    expect(
      run({
        target: "header",
        path: "content-type",
        operator: "contains",
        expected: "JSON",
      }).outcome,
    ).toBe("fail");
    expect(
      run({
        target: "header",
        path: "content-type",
        operator: "contains",
        expected: "json",
      }).outcome,
    ).toBe("pass");
    expect(
      run({ target: "header", path: "x-empty", operator: "exists" }).outcome,
    ).toBe("pass");
    expect(
      run({ target: "header", path: "x-missing", operator: "absent" }).outcome,
    ).toBe("pass");
    expect(run({ target: "header", path: "x-missing" })).toEqual({
      outcome: "fail",
      issue: "missing",
    });
    expect(
      run(
        { target: "header", path: "x-tag", expected: "one, two" },
        { ...response, headers: { "X-Tag": "one", "x-tag": "two" } },
      ).outcome,
    ).toBe("pass");
  });

  it("distinguishes missing fields from null, false, zero, and empty strings", () => {
    for (const path of ["/nullable", "/active", "/empty", "/count", ""]) {
      expect(run({ path, operator: "exists" }).outcome).toBe("pass");
      expect(run({ path, operator: "absent" }).outcome).toBe("fail");
    }
    expect(run({ path: "/missing", operator: "absent" }).outcome).toBe("pass");
    expect(run({ path: "/missing" })).toEqual({
      outcome: "fail",
      issue: "missing",
    });
    expect(run({ path: "/nullable", expected: "null" }).outcome).toBe("pass");
  });

  it("resolves escaped, empty, and prototype-shaped own keys safely", () => {
    const data = {
      ...response,
      body: '{"a/b":{"~key":3},"":4,"__proto__":{"value":5}}',
    };
    expect(run({ path: "/a~1b/~0key", expected: "3" }, data).outcome).toBe(
      "pass",
    );
    expect(run({ path: "/", expected: "4" }, data).outcome).toBe("pass");
    expect(run({ path: "/__proto__/value", expected: "5" }, data).outcome).toBe(
      "pass",
    );
    expect(
      run({ path: "/constructor", operator: "absent" }, data).outcome,
    ).toBe("pass");
    for (const path of [
      "/items/01",
      "/items/-",
      "/items/length",
      "/items/0/name/length",
      "/nullable/x",
    ]) {
      expect(run({ path, operator: "absent" }).outcome).toBe("pass");
    }
    expect(({} as Record<string, unknown>).value).toBeUndefined();
  });

  it("compares JSON structurally with ordered arrays and strict types", () => {
    expect(
      run({ path: "/items/0", expected: '{"name":"Ada","id":7}' }).outcome,
    ).toBe("pass");
    expect(run({ expected: '"7"' }).outcome).toBe("fail");
    expect(run({ path: "/items/0", expected: '{"id":7}' }).outcome).toBe(
      "fail",
    );
    expect(
      run({ path: "", expected: "[2,1]" }, { ...response, body: "[1,2]" })
        .outcome,
    ).toBe("fail");
    expect(
      run({ path: "", expected: "[1,2]" }, { ...response, body: "[1,2]" })
        .outcome,
    ).toBe("pass");
    expect(
      run(
        { path: "", expected: '{"0":1,"1":2}' },
        { ...response, body: "[1,2]" },
      ).outcome,
    ).toBe("fail");
  });

  it.each([
    ["/items", "array"],
    ["/items/0", "object"],
    ["/items/0/id", "number"],
    ["/items/0/name", "string"],
    ["/nullable", "null"],
    ["/active", "boolean"],
  ])("checks the JSON type at %s", (path, expected) => {
    expect(run({ path, operator: "type", expected }).outcome).toBe("pass");
    expect(run({ path, operator: "type", expected: "null" }).outcome).toBe(
      path === "/nullable" ? "pass" : "fail",
    );
  });

  it("checks text, numeric bounds, and lengths without coercion", () => {
    expect(
      run({ path: "/items/0/name", operator: "contains", expected: "Ad" })
        .outcome,
    ).toBe("pass");
    expect(run({ operator: "contains", expected: "7" })).toEqual({
      outcome: "fail",
      issue: "wrong-type",
    });
    expect(run({ operator: "gte", expected: "7" }).outcome).toBe("pass");
    expect(run({ operator: "lte", expected: "6.9" }).outcome).toBe("fail");
    expect(
      run({ path: "/items/0/name", operator: "gte", expected: "0" }).issue,
    ).toBe("wrong-type");
    expect(
      run({ path: "/items", operator: "length", expected: "1" }).outcome,
    ).toBe("pass");
    expect(
      run({ path: "/items/0", operator: "length", expected: "2" }).issue,
    ).toBe("wrong-type");
    expect(
      run(
        { path: "", operator: "length", expected: "2" },
        { ...response, body: '"😀a"' },
      ).outcome,
    ).toBe("pass");
  });

  it.each([
    { path: "items" },
    { path: "/bad~2" },
    { target: "header", path: "bad header" },
    { target: "header", path: "" },
    { target: "header", path: "a".repeat(129) },
  ] as Partial<ResponseAssertion>[])("rejects invalid paths: %j", (patch) => {
    expect(validateResponseAssertion(rule(patch))).toBe("invalid-path");
  });

  it.each([
    { expected: "undefined" },
    { expected: "1e999" },
    { expected: "9007199254740993" },
    { operator: "type", expected: "integer" },
    { operator: "gte", expected: "" },
    { operator: "gte", expected: "0x10" },
    { operator: "lte", expected: "Infinity" },
    { operator: "length", expected: "-1" },
    { operator: "length", expected: "1.5" },
    { target: "duration", operator: "lte", expected: "-1" },
    { target: "status", expected: "600" },
    { target: "status", expected: "99" },
    { target: "status", expected: "200.5" },
  ] as Partial<ResponseAssertion>[])(
    "rejects invalid expectations: %j",
    (patch) => {
      expect(run(patch)).toEqual({
        outcome: "error",
        issue: "invalid-expected",
      });
    },
  );

  it("rejects malformed and unsupported rule shapes", () => {
    for (const patch of [
      { target: "__proto__" },
      { target: "other" },
      { target: "status", operator: "contains" },
      { name: "x".repeat(121) },
      { path: "x".repeat(513) },
      { expected: "x".repeat(4097) },
      { expected: 7 },
    ]) {
      expect(
        validateResponseAssertion(rule(patch as Partial<ResponseAssertion>)),
      ).toBe("invalid-rule");
    }
    expect(
      validateResponseAssertion(null as unknown as ResponseAssertion),
    ).toBe("invalid-rule");
    expect(
      evaluateResponseAssertions(
        Array.from({ length: 51 }, () => rule()),
        response,
      ).every((result) => result.outcome === "error"),
    ).toBe(true);
  });

  it("does not treat unreadable JSON as an absent field and still checks other targets", () => {
    const results = evaluateResponseAssertions(
      [
        rule({ operator: "absent" }),
        rule({ target: "status", expected: "200" }),
        rule({ target: "duration", operator: "lte", expected: "100" }),
        rule({ target: "header", path: "content-type", operator: "exists" }),
      ],
      { ...response, body: "not JSON" },
    );
    expect(results[0]).toEqual({ outcome: "error", issue: "unreadable-body" });
    expect(results.slice(1).every((result) => result.outcome === "pass")).toBe(
      true,
    );
  });

  it("reports body size, depth, value-count, and numeric precision limits explicitly", () => {
    for (const body of [
      '"' + "a".repeat(MAX_ASSERTION_BODY_BYTES) + '"',
      '"' + "я".repeat(MAX_ASSERTION_BODY_BYTES / 2) + '"',
      "[".repeat(66) + "0" + "]".repeat(66),
      JSON.stringify(Array(20_000).fill(null)),
    ]) {
      expect(run({}, { ...response, body })).toEqual({
        outcome: "error",
        issue: "body-limit",
      });
    }
    for (const body of [
      "9007199254740993",
      "1e999",
      '{"irrelevant":9007199254740993}',
    ]) {
      expect(run({}, { ...response, body }).issue).toBe("unsafe-number");
    }
    expect(
      run({ path: "", expected: "null" }, { ...response, body: "null" })
        .outcome,
    ).toBe("pass");
  });

  it("reports unavailable status and timing measurements", () => {
    for (const status of ["0", "99", "600", "200.5"]) {
      expect(
        run(
          { target: "status", operator: "lte", expected: "599" },
          { ...response, status },
        ).issue,
      ).toBe("unavailable");
    }
    expect(
      run(
        { target: "status", expected: "200" },
        { ...response, status: "error" },
      ).issue,
    ).toBe("unavailable");
    for (const durationMs of [NaN, Infinity, -1]) {
      expect(
        run(
          { target: "duration", operator: "lte", expected: "1" },
          { ...response, durationMs },
        ).issue,
      ).toBe("unavailable");
    }
  });

  it("round-trips reusable sets and strips unknown fields", () => {
    const rules = [
      rule({ name: "Check ID" }),
      rule({ target: "status", expected: "200" }),
    ];
    expect(parseResponseAssertions(serializeResponseAssertions(rules))).toEqual(
      { ok: true, rules },
    );
    const data = JSON.parse(serializeResponseAssertions(rules));
    data.checks[0].requestSecret = "discard";
    expect(parseResponseAssertions(JSON.stringify(data))).toEqual({
      ok: true,
      rules,
    });
    expect(parseResponseAssertions(serializeResponseAssertions([]))).toEqual({
      ok: true,
      rules: [],
    });
  });

  it("imports sets with a leading byte-order mark without changing rule text", () => {
    const rules = [
      rule({
        name: "\uFEFFHeader check",
        target: "header",
        path: "x-value",
        operator: "equals",
        expected: "\uFEFFvalue",
      }),
    ];
    expect(
      parseResponseAssertions("\uFEFF" + serializeResponseAssertions(rules)),
    ).toEqual({ ok: true, rules });
  });

  it("rejects malformed, unsupported, oversized, and invalid imported sets", () => {
    for (const text of [
      "oops",
      "\uFEFFoops",
      "\uFEFF\uFEFF" + serializeResponseAssertions([]),
      "\uFEFF" + serializeResponseAssertions([rule({ expected: "oops" })]),
      "null",
      "[]",
      '{"kind":"rsswag-response-assertions","version":2,"checks":[]}',
      serializeResponseAssertions([rule({ expected: "oops" })]),
      '{"kind":"rsswag-response-assertions","version":1,"checks":[null]}',
    ]) {
      expect(parseResponseAssertions(text)).toEqual({
        ok: false,
        issue: "invalid-set",
      });
    }
    expect(
      parseResponseAssertions(" ".repeat(MAX_ASSERTION_IMPORT_BYTES + 1)),
    ).toEqual({ ok: false, issue: "too-large" });
    expect(
      parseResponseAssertions("я".repeat(MAX_ASSERTION_IMPORT_BYTES)),
    ).toEqual({ ok: false, issue: "too-large" });
    expect(
      parseResponseAssertions(
        serializeResponseAssertions(Array.from({ length: 51 }, () => rule())),
      ),
    ).toEqual({ ok: false, issue: "too-many" });
  });

  it("can reimport a full exported set even when expected literals need JSON escaping", () => {
    const rules = Array.from({ length: 50 }, () =>
      rule({
        target: "header",
        path: "x-value",
        name: "\u0000".repeat(120),
        expected: "\u0000".repeat(4096),
      }),
    );
    expect(parseResponseAssertions(serializeResponseAssertions(rules))).toEqual(
      { ok: true, rules },
    );
  });

  it("exports all numbered outcomes while excluding response and assertion values", () => {
    const rules = [
      rule({ name: "private name" }),
      rule({ expected: "8" }),
      rule({ expected: "secret invalid literal" }),
    ];
    const raw = serializeAssertionReport(
      rules,
      {
        ...response,
        headers: { authorization: "Bearer secret" },
        body: '{"items":[{"id":7}],"secret":"private response"}',
      },
      { method: "GET", path: "/items" },
    );
    const report = JSON.parse(raw);
    expect(report.summary).toEqual({ total: 3, pass: 1, fail: 1, error: 1 });
    expect(report.results).toEqual([
      { check: 1, outcome: "pass" },
      { check: 2, outcome: "fail" },
      { check: 3, outcome: "error", issue: "invalid-expected" },
    ]);
    expect(report.endpoint).toEqual({ method: "GET", path: "/items" });
    expect(raw).not.toMatch(/secret|private|"expected"|"headers"|"body"/);
  });
});
