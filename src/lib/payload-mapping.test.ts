import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  createMappingModule,
  demoMappingProject,
  emptyMappingProject,
  mappingCasesReport,
  mappingPointerInventory,
  mappingRunReport,
  MAX_MAPPING_PAYLOAD_BYTES,
  newMappingRule,
  parseMappingInput,
  parseMappingProject,
  parseMappingRecipe,
  readMappingContract,
  runMappingCases,
  runMappingProject,
  runMappingRecipe,
  serializeMappingProject,
  validateMappingBinding,
  validateMappingRecipe,
  type MappingOperator,
  type MappingRecipe,
  type MappingRule,
} from "./payload-mapping";
import { executePayloadMapping } from "./payload-mapping-runtime";
import type { JsonValue } from "./api-transform";

const rule = (
  source: string,
  target: string,
  patch: Partial<MappingRule> = {},
): MappingRule => ({ ...newMappingRule(), source, target, ...patch });
const recipe = (
  rules: MappingRule[],
  base: "object" | "array" | "input" = "object",
): MappingRecipe => ({
  kind: "rsswag-payload-mapping",
  version: 1,
  name: "Adapter",
  stages: [{ id: "stage", name: "Map", base, enabled: true, rules }],
});
const expectCode = (fn: () => unknown, code: string) =>
  expect(fn).toThrowError(expect.objectContaining({ code }));
const output = (
  rules: MappingRule[],
  input: JsonValue,
  base: "object" | "array" | "input" = "object",
) => runMappingRecipe(recipe(rules, base), input).output;
const contractSource = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Adapter contract", version: "1" },
  paths: {
    "/customers": {
      post: {
        requestBody: { $ref: "#/components/requestBodies/Incoming" },
        responses: { "200": { $ref: "#/components/responses/Outgoing" } },
      },
    },
  },
  components: {
    schemas: {
      Input: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          id: { type: "integer", readOnly: true },
          password: { type: "string", writeOnly: true },
        },
      },
      Output: {
        type: "object",
        required: ["displayName"],
        properties: { displayName: { type: "string" } },
        additionalProperties: false,
      },
      Broken: { $ref: "missing.json#/A" },
      Conditional: { if: { type: "string" }, then: { minLength: 3 } },
      False: false,
    },
    requestBodies: {
      Incoming: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Input" },
          },
          "text/plain": { schema: { type: "string" } },
        },
      },
    },
    responses: {
      Outgoing: {
        description: "ok",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/Output" },
          },
        },
      },
    },
  },
});

describe("payload mapping pipelines", () => {
  it("translates arrays through two stages, applies missing defaults, preserves row alignment, and leaves input unchanged", () => {
    const p = demoMappingProject(),
      before = p.input,
      result = runMappingProject(p);
    expect(result.execution.output).toEqual({
      payload: {
        customers: [
          { id: 7, name: "Ada", enabled: true, country: "UK" },
          { id: 8, name: "Lin", enabled: false, country: "unknown" },
        ],
        count: 2,
      },
      version: "v2",
    });
    expect(result.execution.stages[0].output).toEqual(
      (result.execution.output as Record<string, JsonValue>).payload,
    );
    expect(
      result.execution.stages[0].rules.find((r) => r.id === "country"),
    ).toMatchObject({ mapped: 2, defaults: 1, omitted: 0 });
    expect(p.input).toBe(before);
  });
  it("reads every rule from the same stage input and updates only explicitly mapped fields in preserve mode", () => {
    const input = { name: "Ada", keep: { value: 1 } };
    expect(
      output(
        [
          rule("/name", "/name", { operator: "upper" }),
          rule("/name", "/original"),
        ],
        input,
        "input",
      ),
    ).toEqual({ name: "ADA", original: "Ada", keep: { value: 1 } });
    expect(input).toEqual({ name: "Ada", keep: { value: 1 } });
  });
  it("maps root arrays and retains empty arrays and omitted object rows", () => {
    expect(
      output([rule("/*/id", "/*/key")], [{ id: 1 }, { id: 2 }], "array"),
    ).toEqual([{ key: 1 }, { key: 2 }]);
    expect(
      output([rule("/items/*/id", "/rows/*/key", { missing: "omit" })], {
        items: [{}, { id: 2 }],
      }),
    ).toEqual({ rows: [{}, { key: 2 }] });
    expect(output([rule("/items/*/id", "/rows/*/key")], { items: [] })).toEqual(
      { rows: [] },
    );
    expect(
      output(
        [rule("/*/id", "/*", { missing: "omit" })],
        [{}, { id: 2 }],
        "array",
      ),
    ).toEqual([null, 2]);
  });
  it("maps scalar wildcard rows and preserves independent nested array groups", () => {
    expect(
      output(
        [
          rule("/names/*", "/items/*/name", { operator: "upper" }),
          rule("/ids/*", "/keys/*", { operator: "integer" }),
        ],
        { names: ["ada", "lin"], ids: ["1"] },
      ),
    ).toEqual({ items: [{ name: "ADA" }, { name: "LIN" }], keys: [1] });
  });
  it("distinguishes missing values from null and supports per-row defaults", () => {
    expect(
      output(
        [
          rule("/missing", "/default", { missing: "default", value: "null" }),
          rule("/null", "/kept", { missing: "default", value: '"fallback"' }),
          rule("/absent", "/omitted", { missing: "omit" }),
        ],
        { null: null },
      ),
    ).toEqual({ default: null, kept: null });
    expectCode(() => output([rule("/missing", "/required")], {}), "missing");
    expectCode(
      () =>
        output(
          [
            rule("/missing/*/x", "/rows/*/x", {
              missing: "default",
              value: "1",
            }),
          ],
          {},
        ),
      "missing",
    );
  });
  it("handles RFC pointer escaping, empty keys, roots, numeric object keys, and own prototype-related data", () => {
    const input = JSON.parse(
      '{"a/b":{"~key":7},"":8,"__proto__":{"safe":9},"constructor":10}',
    );
    const mapped = output(
      [
        rule("/a~1b/~0key", "/a~1b/~0key"),
        rule("/", "/"),
        rule("/__proto__/safe", "/__proto__/safe"),
        rule("/constructor", "/constructor"),
        rule("/", "/0"),
      ],
      input,
    );
    expect(mapped).toEqual(
      JSON.parse(
        '{"a/b":{"~key":7},"":8,"__proto__":{"safe":9},"constructor":10,"0":8}',
      ),
    );
    expect({}).not.toHaveProperty("safe");
    expectCode(() => output([rule("/toString", "/x")], {}), "missing");
  });
  it("rejects conflicting targets before any mutation and keeps failures atomic", () => {
    const input = { keep: 1 };
    expectCode(
      () =>
        output([rule("", "/result"), rule("", "/result/name")], input, "input"),
      "collision",
    );
    expect(input).toEqual({ keep: 1 });
    expectCode(
      () =>
        output(
          [rule("/items/*/id", "/rows/*/value"), rule("", "/rows/0/value")],
          { items: [{ id: 1 }] },
        ),
      "collision",
    );
    expectCode(
      () => output([rule("", ""), rule("", "/other")], input),
      "collision",
    );
  });
  it("rejects shape mismatches, sparse writes and arrays with mismatched row counts", () => {
    expectCode(
      () => output([rule("/items/*", "/rows/*")], { items: "bad" }),
      "array",
    );
    expectCode(() => output([rule("", "/2")], {}, "array"), "target");
    expectCode(
      () =>
        output(
          [rule("/items/*/a", "/rows/*/a"), rule("/short/*/b", "/rows/*/b")],
          { items: [{ a: 1 }, { a: 2 }], short: [{ b: 3 }] },
        ),
      "target",
    );
    expectCode(
      () =>
        output(
          [rule("/value", "/existing/name")],
          { existing: 5, value: 1 },
          "input",
        ),
      "target",
    );
  });
  it("disables stages/rules without modifying their recipes and applies stages in explicit order", () => {
    const p = demoMappingProject();
    p.recipe.stages[1].enabled = false;
    expect(runMappingProject(p).execution.output).toHaveProperty("customers");
    p.recipe.stages[0].rules.find((r) => r.id === "name")!.enabled = false;
    expect(runMappingProject(p).execution.output).not.toHaveProperty(
      "customers.0.name",
    );
    p.recipe.stages.reverse();
    p.recipe.stages[0].enabled = true;
    expectCode(() => runMappingProject(p), "missing");
  });
  it.each<[MappingOperator, JsonValue, JsonValue, string?]>([
    ["copy", { a: [1] }, { a: [1] }],
    ["string", false, "false"],
    ["number", "-1.25e2", -125],
    ["integer", "7", 7],
    ["boolean", "false", false],
    ["trim", "  Ada  ", "Ada"],
    ["lower", "ADA", "ada"],
    ["upper", "ada", "ADA"],
    ["length", "A😀", 2],
    ["length", [1, 2], 2],
    ["length", { x: 1 }, 1],
    ["join", ["a", 1, true], "a|1|true", "|"],
    ["split", "a::b::", ["a", "b", ""], "::"],
  ])(
    "converts %s without evaluating code",
    (operator, value, expected, argument) => {
      expect(
        output([rule("/x", "/y", { operator, argument: argument ?? "," })], {
          x: value,
        }),
      ).toEqual({ y: expected });
    },
  );
  it.each<[MappingOperator, JsonValue]>([
    ["string", {}],
    ["number", ""],
    ["number", "0x10"],
    ["number", true],
    ["number", "Infinity"],
    ["integer", "1.2"],
    ["integer", "9007199254740992"],
    ["boolean", "yes"],
    ["boolean", 2],
    ["trim", 1],
    ["lower", null],
    ["upper", []],
    ["length", true],
    ["join", [null]],
    ["join", [{}]],
    ["split", []],
  ])("rejects invalid %s conversion", (operator, value) =>
    expectCode(
      () => output([rule("/x", "/y", { operator })], { x: value }),
      "conversion",
    ),
  );
  it("uses JSON constants as data and rejects invalid literal JSON and empty split separators", () => {
    expect(
      output(
        [rule("", "/x", { operator: "constant", value: '{"a":[1,true]}' })],
        {},
      ),
    ).toEqual({ x: { a: [1, true] } });
    expectCode(
      () =>
        output(
          [rule("", "/x", { operator: "constant", value: "undefined" })],
          {},
        ),
      "literal",
    );
    expectCode(
      () =>
        output([rule("/x", "/y", { operator: "split", argument: "" })], {
          x: "abc",
        }),
      "conversion",
    );
  });
  it.each(["a", "/~2", "/items/*/*", "/" + "a/".repeat(33)])(
    "rejects invalid or overly deep pattern %s",
    (source) =>
      expectCode(
        () => validateMappingRecipe(recipe([rule(source, "/x")])),
        "pointer",
      ),
  );
  it("requires paired wildcards and forbids wildcard constants", () => {
    expectCode(
      () => validateMappingRecipe(recipe([rule("/a/*", "/x")])),
      "pointer",
    );
    expectCode(
      () => validateMappingRecipe(recipe([rule("/a", "/x/*")])),
      "pointer",
    );
    expectCode(
      () =>
        validateMappingRecipe(
          recipe([rule("/*", "/*", { operator: "constant" })]),
        ),
      "pointer",
    );
  });
  it("bounds JSON bytes, depth, nodes, stages, rules and repeated copy amplification", () => {
    expectCode(
      () =>
        parseMappingInput(
          JSON.stringify("a".repeat(MAX_MAPPING_PAYLOAD_BYTES)),
        ),
      "limit",
    );
    expectCode(
      () => parseMappingInput("[".repeat(33) + "0" + "]".repeat(33)),
      "limit",
    );
    expectCode(
      () =>
        parseMappingInput(
          JSON.stringify(Array.from({ length: 10001 }, () => 0)),
        ),
      "limit",
    );
    const r = recipe([]);
    r.stages = Array.from({ length: 13 }, (_, i) => ({
      ...r.stages[0],
      id: String(i),
    }));
    expectCode(() => validateMappingRecipe(r), "recipe");
    expectCode(
      () =>
        validateMappingRecipe(
          recipe(Array.from({ length: 201 }, (_, i) => rule("", `/x${i}`))),
        ),
      "limit",
    );
    expectCode(
      () => output([rule("", "/a"), rule("", "/b")], "a".repeat(140000)),
      "limit",
    );
  });
  it("rejects unsafe numbers, cyclic/non-JSON inputs, sparse arrays and getters without invoking them", () => {
    expectCode(() => parseMappingInput('{"n":9007199254740992}'), "input");
    expectCode(() => parseMappingInput("["), "input");
    const cycle: Record<string, unknown> = {};
    cycle.child = cycle;
    expectCode(() => runMappingRecipe(recipe([]), cycle as JsonValue), "input");
    let calls = 0;
    const getter = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        calls++;
        return 1;
      },
    });
    expectCode(() => runMappingRecipe(recipe([]), getter), "input");
    expect(calls).toBe(0);
    expectCode(() => runMappingRecipe(recipe([]), new Array(2)), "input");
    expectCode(
      () => runMappingRecipe(recipe([]), new Date() as unknown as JsonValue),
      "input",
    );
  });
  it("rejects invalid recipes and duplicate IDs, and strips imported extra fields", () => {
    expectCode(() => parseMappingRecipe("{}"), "recipe");
    const r = recipe([rule("", "/x")]);
    r.stages[0].rules[0].id = "stage";
    expectCode(() => validateMappingRecipe(r), "recipe");
    const clean = recipe([rule("", "/x")]),
      raw = { ...clean, secret: "ignored" };
    expect(parseMappingRecipe(JSON.stringify(raw))).toEqual(clean);
  });
});

describe("mapping OpenAPI bindings and regression projects", () => {
  it("resolves reusable operation bodies and JSON media types with stable schema choices", () => {
    const contract = readMappingContract(contractSource);
    expect(
      contract.bindings.find(
        (b) => b.label === "POST /customers request · application/json",
      )?.direction,
    ).toBe("request");
    expect(
      contract.bindings.find(
        (b) =>
          b.label === "POST /customers response 200 · application/problem+json",
      )?.direction,
    ).toBe("response");
    expect(contract.bindings.some((b) => b.label.includes("text/plain"))).toBe(
      false,
    );
    expect(contract.bindings.find((b) => b.label === "False")?.schema).toBe(
      false,
    );
  });
  it("supports Swagger 2 models and body/response bindings", () => {
    const c = readMappingContract(
      JSON.stringify({
        swagger: "2.0",
        info: { title: "Legacy", version: "1" },
        paths: {
          "/a": {
            post: {
              parameters: [
                {
                  in: "body",
                  name: "body",
                  schema: { $ref: "#/definitions/A" },
                },
              ],
              responses: {
                "200": {
                  description: "ok",
                  schema: { $ref: "#/definitions/A" },
                },
              },
            },
          },
        },
        definitions: { A: { type: "object" } },
      }),
    );
    expect(c.bindings.map((b) => b.direction)).toEqual([
      "none",
      "request",
      "response",
    ]);
  });
  it("checks input/output types and required fields without blocking a useful mapped preview", () => {
    const p = emptyMappingProject();
    p.contract = contractSource;
    p.inputBinding = "/components/schemas/Input";
    p.outputBinding = "/components/schemas/Output";
    p.recipe = recipe([rule("/name", "/displayName")]);
    p.input = '{"name":7}';
    const run = runMappingProject(p);
    expect(run.execution.output).toEqual({ displayName: 7 });
    expect(run.inputValidation.status).toBe("invalid");
    expect(run.outputValidation.status).toBe("invalid");
    expect(run.outputValidation.issues[0].instancePath).toBe("/displayName");
    expect(
      validateMappingBinding(
        readMappingContract(contractSource),
        "/components/schemas/False",
        {},
      ).status,
    ).toBe("invalid");
  });
  it("respects request/response readOnly/writeOnly direction and marks unresolved/unsupported checks partial", () => {
    const c = readMappingContract(contractSource),
      req = c.bindings.find((b) => b.direction === "request")!.id,
      res = c.bindings.find((b) => b.direction === "response")!.id;
    expect(validateMappingBinding(c, req, { name: "Ada", id: 1 }).status).toBe(
      "warning",
    );
    expect(validateMappingBinding(c, res, { displayName: "Ada" }).status).toBe(
      "valid",
    );
    expect(
      validateMappingBinding(c, "/components/schemas/Broken", {}).status,
    ).toBe("partial");
    expect(
      validateMappingBinding(c, "/components/schemas/Conditional", "a").status,
    ).toBe("partial");
    expectCode(() => validateMappingBinding(c, "/missing", {}), "binding");
    expectCode(() => readMappingContract("openapi: ["), "source");
  });
  it("runs cases independently, compares object keys structurally, and preserves partial/failure results", () => {
    const p = demoMappingProject();
    p.cases[0].expected = JSON.stringify({
      version: "v2",
      payload: {
        count: 2,
        customers: [
          { country: "UK", enabled: true, name: "Ada", id: 7 },
          { country: "unknown", name: "Lin", id: 8, enabled: false },
        ],
      },
    });
    p.cases.push(
      { ...p.cases[0], id: "mismatch", name: "Mismatch", expected: "{}" },
      { ...p.cases[0], id: "invalid", name: "Invalid", input: "[" },
    );
    const results = runMappingCases(p);
    expect(results.map((c) => c.status)).toEqual([
      "passed",
      "failed",
      "failed",
    ]);
    expect(results[1].expected).toBe("mismatch");
    expect(results[2].error?.code).toBe("input");
    expect(results[0].run?.execution.stages[0]).not.toHaveProperty("output");
    p.contract = contractSource;
    p.outputBinding = "/components/schemas/Broken";
    expect(runMappingCases(p)[0].status).toBe("partial");
  });
  it("skips complex patterns with partial status, checks simple patterns, and preserves enum/const payload fields named pattern", () => {
    const c = readMappingContract(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Patterns", version: "1" },
        paths: {},
        components: {
          schemas: {
            Unsafe: { type: "string", pattern: "^(a+)+$" },
            Safe: { type: "string", pattern: "^[a-z]+$" },
            Literal: { const: { pattern: "^(a+)+$" } },
            const: { type: "string", pattern: "^(a+)+$" },
            Ref: { $ref: "#/components/schemas/const" },
          },
        },
      }),
    );
    expect(
      validateMappingBinding(
        c,
        "/components/schemas/Unsafe",
        "a".repeat(10000) + "!",
      ).status,
    ).toBe("partial");
    expect(
      validateMappingBinding(c, "/components/schemas/Safe", "123").status,
    ).toBe("invalid");
    expect(
      validateMappingBinding(c, "/components/schemas/Literal", {
        pattern: "^(a+)+$",
      }).status,
    ).toBe("valid");
    expect(
      validateMappingBinding(
        c,
        "/components/schemas/Ref",
        "a".repeat(10000) + "!",
      ).status,
    ).toBe("partial");
  });
  it("exports reports without fixtures, literals, intermediate outputs or diagnostic parameter values", () => {
    const p = demoMappingProject(),
      run = runMappingProject(p),
      report = JSON.stringify(mappingRunReport(run));
    expect(report).not.toContain("Ada");
    expect(report).not.toContain("unknown");
    expect(report).not.toContain("v2");
    expect(report).not.toContain('"output"');
    const cases = JSON.stringify(mappingCasesReport(runMappingCases(p)));
    expect(cases).not.toContain("Ada");
    expect(cases).not.toContain('"input"');
  });
  it("round-trips complete projects and retains editable cases while dropping claimed results", () => {
    const p = demoMappingProject();
    p.contract = contractSource;
    p.outputBinding = "/components/schemas/Output";
    const text = serializeMappingProject(p),
      raw = JSON.parse(text);
    raw.run = { success: true };
    raw.cases[0].result = "fake";
    expect(parseMappingProject(JSON.stringify(raw))).toEqual(p);
    expect(parseMappingProject(text)).toEqual(p);
    raw.cases.push(raw.cases[0]);
    expectCode(() => parseMappingProject(JSON.stringify(raw)), "project");
  });
  it("bounds cases and rejects stale bindings, invalid drafts and malformed projects", () => {
    const p = demoMappingProject();
    p.cases = Array.from({ length: 31 }, (_, i) => ({
      ...p.cases[0],
      id: String(i),
    }));
    expectCode(() => runMappingCases(p), "limit");
    expectCode(() => parseMappingProject("{}"), "project");
    expectCode(
      () => serializeMappingProject({ ...demoMappingProject(), input: "[" }),
      "input",
    );
    expectCode(
      () =>
        serializeMappingProject({
          ...demoMappingProject(),
          inputBinding: "/missing",
        }),
      "binding",
    );
  });
  it("marks unsupported formats partial and respects root references to false schemas", () => {
    const c = readMappingContract(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Formats", version: "1" },
        paths: {},
        components: {
          schemas: {
            Format: { type: "string", format: "__proto__" },
            False: false,
            Ref: { $ref: "#/components/schemas/False" },
          },
        },
      }),
    );
    expect(
      validateMappingBinding(c, "/components/schemas/Format", "a").status,
    ).toBe("partial");
    expect(
      validateMappingBinding(c, "/components/schemas/Ref", {}).status,
    ).toBe("invalid");
  });
  it("indexes source pointers and types without values, including escaped properties and bounded arrays", () => {
    const rows = mappingPointerInventory(
      '{"a/b":[1,2,3,4],"secret":"never-export"}',
    );
    expect(rows.map((r) => r.pointer)).toEqual([
      "",
      "/a~1b",
      "/a~1b/0",
      "/a~1b/1",
      "/a~1b/2",
      "/secret",
    ]);
    expect(JSON.stringify(rows)).not.toContain("never-export");
  });
});

describe("standalone mapper export", () => {
  function load(r: MappingRecipe) {
    const source = createMappingModule(r)
      .replaceAll("export const", "const")
      .replaceAll("export function", "function");
    return runInNewContext(
      `${source}\n({mapPayload, runPayloadMapping, recipe})`,
      { TextEncoder },
      { timeout: 1000 },
    ) as {
      mapPayload: (input: JsonValue) => JsonValue;
      runPayloadMapping: typeof executePayloadMapping;
      recipe: MappingRecipe;
    };
  }
  it("runs the exported module without application imports and matches the studio for nested pipelines and metadata", () => {
    const p = demoMappingProject(),
      exported = load(p.recipe),
      input = parseMappingInput(p.input);
    expect(JSON.stringify(exported.mapPayload(input))).toBe(
      JSON.stringify(runMappingProject(p).execution.output),
    );
    expect(
      JSON.stringify(exported.runPayloadMapping(exported.recipe, input)),
    ).toBe(JSON.stringify(runMappingRecipe(p.recipe, input)));
    expect(createMappingModule(p.recipe)).not.toContain("import ");
  });
  it("matches mapping failures and handles literal script-looking strings as plain data", () => {
    const r = recipe([rule("/missing", "/x")]),
      exported = load(r);
    expectCode(() => exported.mapPayload({}), "missing");
    const payload = '"; globalThis.injected=true; //';
    const constant = recipe([
      rule("", "/data", {
        operator: "constant",
        value: JSON.stringify(payload),
      }),
    ]);
    constant.name = payload;
    expect(JSON.stringify(load(constant).mapPayload({}))).toBe(
      JSON.stringify({ data: payload }),
    );
    expect(globalThis).not.toHaveProperty("injected");
  });
  it("preserves aligned root-array transformations and prototype-safe writes in exported code", () => {
    const r = recipe([rule("/*/value", "/*/value")], "array");
    expect(JSON.stringify(load(r).mapPayload([{ value: 1 }]))).toBe(
      '[{"value":1}]',
    );
    const proto = recipe([rule("", "/__proto__/value")]);
    expect(JSON.stringify(load(proto).mapPayload(7))).toBe(
      '{"__proto__":{"value":7}}',
    );
    expect({}).not.toHaveProperty("value");
  });
});
