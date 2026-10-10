import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkGraphqlRequest,
  createGraphqlHttpContract,
  DEMO_GRAPHQL_SCHEMA,
  emptyGraphqlDraft,
  emptyGraphqlProject,
  exportGraphqlIntrospection,
  generateGraphqlOperation,
  graphqlCheckReport,
  graphqlRequestPayload,
  MAX_GRAPHQL_CASES,
  MAX_GRAPHQL_FIXTURE_BYTES,
  MAX_GRAPHQL_PROJECT_BYTES,
  MAX_GRAPHQL_REQUEST_BYTES,
  MAX_GRAPHQL_SOURCE_BYTES,
  parseGraphqlProject,
  readGraphqlContract,
  readGraphqlRequestPayload,
  rehearseGraphql,
  saveGraphqlCase,
  serializeGraphqlProject,
  type GraphqlDraft,
  type GraphqlIssueCode,
} from "./graphql-studio";
import { parseOpenApiSchema } from "./openapi";
import { validateExampleValue } from "./example-validation";

afterEach(() => vi.restoreAllMocks());
const contract = () => readGraphqlContract(DEMO_GRAPHQL_SCHEMA);
const operation = (
  document: string,
  variables: Record<string, unknown> = {},
  fixtures: Record<string, unknown> = {},
  operationName = "",
): GraphqlDraft => ({
  ...emptyGraphqlDraft(),
  name: "Test operation",
  document,
  variables: JSON.stringify(variables),
  fixtures: JSON.stringify(fixtures),
  operationName,
});
const project = () => ({
  ...emptyGraphqlProject(),
  source: DEMO_GRAPHQL_SCHEMA,
  draft: generateGraphqlOperation(contract(), "query:item"),
});
const issue = (fn: () => unknown, code: GraphqlIssueCode) =>
  expect(fn).toThrowError(expect.objectContaining({ code }));

describe("GraphQL schema contracts", () => {
  it("inventories root operations, input/output types, dependencies, defaults, descriptions, and deprecation without network calls", () => {
    const network = vi.spyOn(globalThis, "fetch"),
      doc = contract();
    expect(doc.format).toBe("sdl");
    expect(doc.sdl).toBe(DEMO_GRAPHQL_SCHEMA);
    expect(doc.operations.map((op) => op.key)).toEqual([
      "query:item",
      "query:items",
      "mutation:createItem",
      "subscription:itemChanged",
    ]);
    expect(doc.types.find((t) => t.name === "Item")).toMatchObject({
      kind: "object",
      members: ["Node"],
      dependencies: expect.arrayContaining([
        "ID",
        "Float",
        "Item",
        "ItemStatus",
        "Node",
      ]),
    });
    expect(
      doc.types
        .find((t) => t.name === "Item")
        ?.fields.find((f) => f.name === "legacyName"),
    ).toMatchObject({ deprecated: true, deprecationReason: "Use name" });
    expect(
      doc.operations.find((op) => op.key === "query:items")?.arguments[0],
    ).toMatchObject({ required: false, defaultValue: "10" });
    expect(doc.operations[0].description).toBe("Look up one item.");
    expect(doc.types.find((t) => t.name === "Node")?.possibleTypes).toEqual([
      "Item",
    ]);
    expect(network).not.toHaveBeenCalled();
  });
  it("round-trips direct and data-wrapped introspection exports into an equivalent schema", () => {
    const original = contract(),
      data = JSON.parse(exportGraphqlIntrospection(original));
    const direct = readGraphqlContract(JSON.stringify(data)),
      wrapped = readGraphqlContract(JSON.stringify({ data }));
    expect(direct.format).toBe("introspection");
    expect(wrapped.operations).toEqual(original.operations);
    expect(direct.types).toEqual(original.types);
    expect(readGraphqlContract(direct.sdl).operations).toEqual(
      original.operations,
    );
  });
  it("supports custom root names, union membership, interface implementations, schema extensions, and OneOf input metadata", () => {
    const doc = readGraphqlContract(
      "schema { query: Read } interface Node { id: ID! } type A implements Node { id: ID! } type B { name: String } union Result = A | B input Choice @oneOf { id: ID name: String } type Read { find(by: Choice!): Result } extend type Read { version: Int! }",
    );
    expect(doc.operations[0]).toMatchObject({
      key: "query:find",
      owner: "Read",
    });
    expect(doc.types.find((t) => t.name === "Choice")?.oneOf).toBe(true);
    expect(doc.types.find((t) => t.name === "Result")).toMatchObject({
      kind: "union",
      members: ["A", "B"],
    });
    expect(doc.operations).toHaveLength(2);
    expect(
      readGraphqlContract(exportGraphqlIntrospection(doc)).types.find(
        (t) => t.name === "Choice",
      )?.oneOf,
    ).toBe(true);
  });
  it("round-trips deeply wrapped types within the supported wrapper limit", () => {
    const source = `type Query { values: ${"[".repeat(12)}String${"]".repeat(12)} }`;
    const doc = readGraphqlContract(source),
      restored = readGraphqlContract(exportGraphqlIntrospection(doc));
    expect(restored.operations).toEqual(doc.operations);
    issue(
      () =>
        readGraphqlContract(
          `type Query { values: ${"[".repeat(17)}String${"]".repeat(17)} }`,
        ),
      "limit",
    );
  });
  it.each([
    "type Query {",
    "type Item { id: ID }",
    "type Query { x: Unknown }",
    "type Query { x: String x: Int }",
    "input Loop { next: Loop! } type Query { value(input: Loop): String }",
    '{"data":{}}',
  ])("rejects invalid schema %s", (source) =>
    issue(() => readGraphqlContract(source), "schema"),
  );
  it("bounds schema bytes, lexical nesting, names, and introspection input depth", () => {
    issue(
      () => readGraphqlContract(" ".repeat(MAX_GRAPHQL_SOURCE_BYTES + 1)),
      "limit",
    );
    issue(
      () =>
        readGraphqlContract(
          `type Query { x: ${"[".repeat(42)}String${"]".repeat(42)} }`,
        ),
      "limit",
    );
    issue(
      () => readGraphqlContract(`type Query { ${"f".repeat(257)}: String }`),
      "limit",
    );
    issue(
      () =>
        readGraphqlContract(
          '{"data":' + "[".repeat(66) + "0" + "]".repeat(66) + "}",
        ),
      "limit",
    );
  });
});

describe("GraphQL operation generation and validation", () => {
  it("generates executable query, mutation, and subscription documents with typed variables and matching fixtures", () => {
    const doc = contract();
    for (const op of doc.operations) {
      const draft = generateGraphqlOperation(doc, op.key);
      expect(checkGraphqlRequest(doc, draft).ready).toBe(true);
      expect(draft.operationName).toBe(`Studio_${op.name}`);
      if (op.kind !== "subscription")
        expect(rehearseGraphql(doc, draft).status).toBe("success");
    }
    const mutation = generateGraphqlOperation(doc, "mutation:createItem");
    expect(JSON.parse(mutation.variables)).toEqual({
      input: { name: "example", price: 1.5 },
    });
    expect(mutation.document).not.toContain("legacyName");
  });
  it("includes optional arguments/defaults on request and prevents output cycles and required nested arguments", () => {
    const doc = readGraphqlContract(
      'input Input { id: ID! optional: String = "default" children: [Input!]! } type User { id: ID! parent: User requires(id: ID!): String } type Query { user(input: Input!, limit: Int = 10): User }',
    );
    const draft = generateGraphqlOperation(doc, "query:user", 4, true);
    expect(JSON.parse(draft.variables)).toEqual({
      input: { id: "1", optional: "default", children: [] },
      limit: 10,
    });
    expect(draft.document).toContain("__typename");
    expect(draft.document).not.toContain("requires");
    expect(checkGraphqlRequest(doc, draft).ready).toBe(true);
  });
  it("generates interface/union selections and valid OneOf inputs", () => {
    const doc = readGraphqlContract(
      "type A { id: ID! } type B { name: String! } union Result = A | B input Choice @oneOf { id: ID name: String } type Query { find(by: Choice!): Result }",
    );
    const draft = generateGraphqlOperation(doc, "query:find");
    expect(JSON.parse(draft.variables)).toEqual({ by: { id: "1" } });
    expect(draft.document).toContain("... on A");
    expect(draft.document).toContain("... on B");
    expect(rehearseGraphql(doc, draft).response).toMatchObject({
      data: { find: { __typename: "A", id: "1" } },
    });
  });
  it("requires explicit selection for multiple operations and supports anonymous requests", () => {
    const doc = contract(),
      draft = operation(
        "query One { items { id } } query Two { items { name } }",
      );
    expect(checkGraphqlRequest(doc, draft)).toMatchObject({
      ready: false,
      operations: [
        { name: "One", kind: "query" },
        { name: "Two", kind: "query" },
      ],
    });
    draft.operationName = "Two";
    expect(checkGraphqlRequest(doc, draft).ready).toBe(true);
    draft.operationName = "Missing";
    expect(checkGraphqlRequest(doc, draft).issues[0].phase).toBe("selection");
    expect(checkGraphqlRequest(doc, operation("{ items { id } }")).ready).toBe(
      true,
    );
  });
  it("bounds branching sample generation before recursive expansion produces large drafts", () => {
    const outputs = Array.from(
      { length: 5 },
      (_, i) =>
        `type T${i} { ${Array.from({ length: 8 }, (_, j) => `f${j}: ${i === 4 ? "String" : `T${i + 1}`}`).join(" ")} }`,
    ).join(" ");
    const output = readGraphqlContract(`type Query { tree: T0 } ${outputs}`);
    issue(() => generateGraphqlOperation(output, "query:tree", 4), "limit");
    const inputs = Array.from(
      { length: 8 },
      (_, i) =>
        `input I${i} { ${Array.from({ length: 6 }, (_, j) => `f${j}: ${i === 7 ? "String" : `I${i + 1}`}!`).join(" ")} }`,
    ).join(" ");
    const input = readGraphqlContract(
      `type Query { value(input: I0!): String } ${inputs}`,
    );
    issue(() => generateGraphqlOperation(input, "query:value"), "limit");
  });
  it("applies variable defaults, coerces ID/list inputs, and counts ignored extra variables", () => {
    const doc = readGraphqlContract(
      "type Query { echo(id: ID!, values: [Int!]!, enabled: Boolean!): String }",
    );
    const check = checkGraphqlRequest(
      doc,
      operation(
        "query Echo($id: ID!, $values: [Int!]!, $enabled: Boolean! = true) { echo(id: $id, values: $values, enabled: $enabled) }",
        { id: 7, values: 2, ignored: "PRIVATE" },
        {},
        "Echo",
      ),
    );
    expect(check.ready).toBe(true);
    expect(check.coercedVariables).toMatchObject({
      id: "7",
      values: [2],
      enabled: true,
    });
    expect(check.ignoredVariableCount).toBe(1);
  });
  it.each([
    ["{ unknown }", {}, "document"],
    ["{ item { id } }", {}, "document"],
    ["query ($id: ID!) { item(id: $id) { id } }", {}, "variables"],
    ["query ($id: ID!) { item(id: $id) { id } }", { id: null }, "variables"],
    [
      "query ($limit: Int) { items(limit: $limit) { id } }",
      { limit: "PRIVATE-VALUE" },
      "variables",
    ],
    ["{ items { missing } }", {}, "document"],
    ["query { items { id }", {}, "document"],
  ])("diagnoses invalid requests %#", (document, variables, phase) => {
    const check = checkGraphqlRequest(
      contract(),
      operation(document as string, variables as Record<string, unknown>),
    );
    expect(check.ready).toBe(false);
    expect(check.issues[0].phase).toBe(phase);
  });
  it("validates OneOf selection and nested unknown input fields", () => {
    const doc = readGraphqlContract(
      "input Choice @oneOf { id: ID name: String } type Query { find(by: Choice!): String }",
    );
    const request = operation("query ($by: Choice!) { find(by: $by) }", {
      by: { id: "1", name: "A" },
    });
    expect(checkGraphqlRequest(doc, request).ready).toBe(false);
    request.variables = '{"by":{"id":null}}';
    expect(checkGraphqlRequest(doc, request).ready).toBe(false);
    request.variables = '{"by":{"id":"1","unknown":"A"}}';
    expect(checkGraphqlRequest(doc, request).ready).toBe(false);
  });
  it("warns about custom scalar inputs/outputs, nested inputs, and custom schema directives", () => {
    const doc = readGraphqlContract(
      "scalar Date directive @auth on FIELD_DEFINITION input Input { date: Date } type Query { event(input: Input!): Date @auth }",
    );
    const check = checkGraphqlRequest(
      doc,
      operation("query ($input: Input!) { event(input: $input) }", {
        input: { date: "any-date" },
      }),
    );
    expect(check.ready).toBe(true);
    expect(check.warnings).toEqual(
      expect.arrayContaining([
        { code: "custom-scalar", name: "Date" },
        { code: "custom-directive", name: "auth" },
      ]),
    );
  });
  it("bounds document bytes, selection expansion, nesting, and invalid variable JSON", () => {
    const doc = contract();
    issue(
      () =>
        checkGraphqlRequest(
          doc,
          operation(" ".repeat(MAX_GRAPHQL_REQUEST_BYTES + 1)),
        ),
      "limit",
    );
    const fragments = Array.from(
      { length: 16 },
      (_, i) =>
        `fragment F${i} on Item { ${i === 15 ? "id" : `...F${i + 1} ...F${i + 1}`} }`,
    ).join("\n");
    issue(
      () =>
        checkGraphqlRequest(doc, operation(`{ items { ...F0 } } ${fragments}`)),
      "limit",
    );
    const draft = operation("{ items { id } }");
    draft.variables = "[]";
    issue(() => checkGraphqlRequest(doc, draft), "variables");
    draft.variables = "{";
    issue(() => checkGraphqlRequest(doc, draft), "variables");
  });
  it("rejects fragment cycles as validation issues without attempting rehearsal", () => {
    const result = rehearseGraphql(
      contract(),
      operation(
        "{ items { ...A } } fragment A on Item { ...B } fragment B on Item { ...A }",
      ),
    );
    expect(result.status).toBe("invalid");
    expect(result.response).toBeNull();
    expect(result.fieldSteps).toBe(0);
  });
});

describe("offline GraphQL rehearsal", () => {
  it("executes aliases, fragments, built-in directives and __typename using root fixtures without network activity", () => {
    const network = vi.spyOn(globalThis, "fetch"),
      doc = contract();
    const draft = operation(
      'query Read($skip: Boolean!) { first: item(id:"1") { ...Details price @skip(if:$skip) } second: item(id:"2") { name } } fragment Details on Item { __typename id }',
      { skip: true },
      { item: { id: "1", name: "Fixture", price: 9 } },
      "Read",
    );
    const result = rehearseGraphql(doc, draft);
    expect(result.status).toBe("success");
    expect(result.response).toEqual({
      data: {
        first: { __typename: "Item", id: "1" },
        second: { name: "Fixture" },
      },
    });
    expect(network).not.toHaveBeenCalled();
  });
  it("implements scalar checks and null bubbling with partial data and standard error paths", () => {
    const result = rehearseGraphql(
      contract(),
      operation(
        '{ item(id:"1") { name price } items { name } }',
        {},
        { item: { name: "A", price: "INVALID-PRICE" }, items: [] },
      ),
    );
    expect(result.status).toBe("errors");
    expect(result.response).toMatchObject({
      data: { item: null, items: [] },
      errors: [{ path: ["item", "price"] }],
    });
    const draft = generateGraphqlOperation(contract(), "mutation:createItem");
    const fixtures = JSON.parse(draft.fixtures);
    fixtures.createItem.name = null;
    draft.fixtures = JSON.stringify(fixtures);
    expect(rehearseGraphql(contract(), draft).response).toMatchObject({
      data: null,
      errors: [{ path: ["createItem", "name"] }],
    });
  });
  it("requires a valid __typename for abstract fixture objects", () => {
    const doc = readGraphqlContract(
      "type A { id: ID } type B { name: String } union Result = A | B type Query { result: Result }",
    );
    expect(
      rehearseGraphql(
        doc,
        operation(
          "{ result { __typename ... on A { id } } }",
          {},
          { result: { id: "1" } },
        ),
      ).status,
    ).toBe("errors");
    expect(
      rehearseGraphql(
        doc,
        operation(
          "{ result { __typename ... on A { id } } }",
          {},
          { result: { __typename: "A", id: "1" } },
        ),
      ).status,
    ).toBe("success");
  });
  it("routes selected introspection queries to dedicated export while allowing ordinary selected operations", () => {
    const doc = contract();
    issue(
      () => rehearseGraphql(doc, operation("{ __schema { types { name } } }")),
      "introspection",
    );
    const draft = operation(
      'query Meta { __type(name:"Query") { name } } query User { items { id } }',
      {},
      { items: [] },
      "User",
    );
    expect(rehearseGraphql(doc, draft).response).toEqual({
      data: { items: [] },
    });
    draft.operationName = "Meta";
    issue(() => rehearseGraphql(doc, draft), "introspection");
  });
  it("never resolves inherited prototype fields and treats own constructor values as data", () => {
    const doc = readGraphqlContract("type Query { constructor: String }");
    expect(rehearseGraphql(doc, operation("{ constructor }")).response).toEqual(
      { data: { constructor: null } },
    );
    expect(
      rehearseGraphql(
        doc,
        operation("{ constructor }", {}, { constructor: "owned" }),
      ).response,
    ).toEqual({ data: { constructor: "owned" } });
    expect(Object.prototype).not.toHaveProperty("__typename");
    const required = readGraphqlContract(
      "type Query { echo(value: String!): String }",
    );
    expect(
      checkGraphqlRequest(
        required,
        operation(
          "query ($constructor: String!) { echo(value: $constructor) }",
        ),
      ).ready,
    ).toBe(false);
  });
  it("designs and validates subscriptions but blocks synchronous execution and ordinary HTTP exports", () => {
    const doc = contract(),
      draft = generateGraphqlOperation(doc, "subscription:itemChanged");
    expect(checkGraphqlRequest(doc, draft).ready).toBe(true);
    expect(graphqlRequestPayload(doc, draft).operationName).toBe(
      "Studio_itemChanged",
    );
    issue(() => rehearseGraphql(doc, draft), "subscription");
    issue(
      () =>
        createGraphqlHttpContract(doc, draft, "https://example.test/graphql"),
      "subscription",
    );
  });
  it("bounds alias/list work and result bytes before execution", () => {
    const doc = readGraphqlContract("type Query { values: [String!]! }");
    issue(
      () =>
        rehearseGraphql(
          doc,
          operation(
            "{ a:values b:values c:values }",
            {},
            { values: Array(4000).fill("x") },
          ),
        ),
      "limit",
    );
    const aliases = Array.from({ length: 40 }, (_, i) => `v${i}:values`).join(
      " ",
    );
    issue(
      () =>
        rehearseGraphql(
          doc,
          operation(`{ ${aliases} }`, {}, { values: ["x".repeat(60000)] }),
        ),
      "limit",
    );
  });
  it("bounds fixtures and validates fixture JSON without mutating input", () => {
    const doc = contract(),
      draft = generateGraphqlOperation(doc, "query:item"),
      before = JSON.stringify(draft);
    rehearseGraphql(doc, draft);
    expect(JSON.stringify(draft)).toBe(before);
    draft.fixtures = "[]";
    issue(() => rehearseGraphql(doc, draft), "fixtures");
    draft.fixtures = " ".repeat(MAX_GRAPHQL_FIXTURE_BYTES + 1);
    issue(() => rehearseGraphql(doc, draft), "limit");
  });
  it("reports omit query text, variables, fixture values, responses, and potentially revealing diagnostic messages", () => {
    const draft = operation(
      "query PrivateQuery($limit: Int) { items(limit:$limit) { name } }",
      { limit: "PRIVATE-VALUE" },
      { items: [{ name: "PRIVATE-RESPONSE" }] },
      "PrivateQuery",
    );
    const result = rehearseGraphql(contract(), draft),
      report = JSON.stringify(graphqlCheckReport(result.check, result));
    expect(result.check.issues[0].message).toContain("PRIVATE-VALUE");
    expect(report).not.toContain("PRIVATE-VALUE");
    expect(report).not.toContain("PRIVATE-RESPONSE");
    expect(report).not.toContain("items(limit");
    expect(report).toContain("PrivateQuery");
  });
});

describe("GraphQL saved projects and HTTP interoperability", () => {
  it("saves and updates immutable library entries, preserving all unrelated drafts and saved operations", () => {
    const original = project(),
      doc = contract(),
      one = saveGraphqlCase(original, doc, original.draft);
    const two = saveGraphqlCase(
      one,
      doc,
      generateGraphqlOperation(doc, "mutation:createItem"),
    );
    expect(two.cases.map((c) => c.id)).toEqual(["case-1", "case-2"]);
    expect(original.cases).toEqual([]);
    const changed = { ...one.cases[0], name: "Renamed" },
      updated = saveGraphqlCase(two, doc, changed, "case-1");
    expect(updated.cases[0].name).toBe("Renamed");
    expect(updated.cases[1]).toEqual(two.cases[1]);
    expect(updated.draft).toEqual(two.draft);
    issue(() => saveGraphqlCase(two, doc, changed, "case-99"), "case");
  });
  it("bounds saved operations and refuses saving invalid requests or fixtures", () => {
    const value = project(),
      doc = contract();
    value.cases = Array.from({ length: MAX_GRAPHQL_CASES }, (_, i) => ({
      ...value.draft,
      id: `case-${i + 1}`,
    }));
    issue(() => saveGraphqlCase(value, doc, value.draft), "limit");
    issue(
      () => saveGraphqlCase(project(), doc, operation("{ unknown }")),
      "request",
    );
    issue(
      () =>
        saveGraphqlCase(project(), doc, { ...project().draft, fixtures: "[]" }),
      "fixtures",
    );
  });
  it("restores schemas/drafts and saved cases while ignoring claimed checks or saved output", () => {
    const value = project(),
      saved = saveGraphqlCase(value, contract(), value.draft),
      text = serializeGraphqlProject(saved),
      raw = JSON.parse(text);
    raw.checked = true;
    raw.response = { data: "INJECTED" };
    raw.cases[0].checked = true;
    const restored = parseGraphqlProject(JSON.stringify(raw));
    expect(restored.project).toEqual(saved);
    expect(restored.contract.operations).toEqual(contract().operations);
    expect(restored.project).not.toHaveProperty("response");
    expect(
      rehearseGraphql(restored.contract, restored.project.draft).response,
    ).not.toEqual(raw.response);
  });
  it("retains saved operations across schema evolution but requires fresh validation", () => {
    const saved = saveGraphqlCase(project(), contract(), project().draft);
    saved.source = "type Query { version: Int! }";
    const restored = parseGraphqlProject(serializeGraphqlProject(saved));
    expect(restored.project.cases).toHaveLength(1);
    expect(
      checkGraphqlRequest(restored.contract, restored.project.cases[0]).ready,
    ).toBe(false);
  });
  it("rejects malformed versions, duplicate IDs, invalid JSON bodies, deep metadata, and oversized projects", () => {
    const raw = JSON.parse(
      serializeGraphqlProject(
        saveGraphqlCase(project(), contract(), project().draft),
      ),
    );
    issue(
      () => parseGraphqlProject(JSON.stringify({ ...raw, version: 2 })),
      "project",
    );
    issue(
      () =>
        parseGraphqlProject(
          JSON.stringify({ ...raw, cases: [raw.cases[0], raw.cases[0]] }),
        ),
      "project",
    );
    issue(
      () =>
        parseGraphqlProject(
          JSON.stringify({ ...raw, draft: { ...raw.draft, variables: "[]" } }),
        ),
      "variables",
    );
    issue(
      () => parseGraphqlProject("[".repeat(66) + "0" + "]".repeat(66)),
      "limit",
    );
    issue(
      () => parseGraphqlProject(" ".repeat(MAX_GRAPHQL_PROJECT_BYTES + 1)),
      "limit",
    );
  });
  it("imports standard GraphQL HTTP payloads, ignores unrelated metadata, and preserves omitted/null variables", () => {
    const request = readGraphqlRequestPayload(
      JSON.stringify({
        query: "{ items { id } }",
        operationName: null,
        variables: null,
        response: "IGNORED",
      }),
    );
    expect(request.variables).toBe("{}");
    expect(request.operationName).toBe("");
    expect(request.fixtures).toBe("{}");
    expect(graphqlRequestPayload(contract(), request)).toEqual({
      query: "{ items { id } }",
      variables: {},
    });
    issue(() => readGraphqlRequestPayload('{"query":42}'), "request");
    issue(
      () =>
        readGraphqlRequestPayload(
          '{"query":"{ items { id } }","variables":[]}',
        ),
      "request",
    );
  });
  it("exports a valid OpenAPI HTTP request contract with variable input components and a generic GraphQL response envelope", () => {
    const doc = contract(),
      draft = generateGraphqlOperation(doc, "mutation:createItem"),
      bridge = createGraphqlHttpContract(
        doc,
        draft,
        "https://example.test/api/graphql",
        "Shop GraphQL",
      ),
      parsed = parseOpenApiSchema(JSON.stringify(bridge));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value.endpoints).toHaveLength(1);
    expect(parsed.value.endpoints[0]).toMatchObject({
      path: "/api/graphql",
      method: "POST",
      serverUrl: "https://example.test",
    });
    const path = JSON.parse(JSON.stringify(bridge)).paths["/api/graphql"].post,
      body = path.requestBody.content["application/json"];
    expect(body.example).toEqual(graphqlRequestPayload(doc, draft));
    expect(
      validateExampleValue(bridge, body.schema, body.example).issues.filter(
        (i) => i.severity === "error",
      ),
    ).toEqual([]);
    expect(bridge.components).toMatchObject({
      schemas: {
        GraphQLInput_ItemInput: {
          required: ["name", "price"],
          additionalProperties: false,
        },
      },
    });
    expect(
      path.responses["200"].content["application/json"].schema.properties.data
        .type,
    ).toEqual(["object", "null"]);
    expect(bridge.info).toMatchObject({ title: "Shop GraphQL" });
  });
  it("models recursive and OneOf variable inputs without infinite schema expansion", () => {
    const doc = readGraphqlContract(
      "input Choice @oneOf { id: ID name: String } input Tree { name: String! children: [Tree!]! choice: Choice } type Query { tree(input: Tree!): String }",
    );
    const draft = generateGraphqlOperation(doc, "query:tree"),
      bridge = createGraphqlHttpContract(
        doc,
        draft,
        "http://localhost:4000/graphql",
      );
    expect(bridge.components).toMatchObject({
      schemas: {
        GraphQLInput_Tree: {
          properties: {
            children: {
              type: "array",
              items: { $ref: "#/components/schemas/GraphQLInput_Tree" },
            },
          },
        },
        GraphQLInput_Choice: { minProperties: 1, maxProperties: 1 },
      },
    });
    expect(JSON.stringify(bridge)).toContain("oneOf");
  });
  it.each([
    "not-a-url",
    "file:///graphql",
    "https://user:pass@example.test/graphql",
    "https://example.test/graphql?token=secret",
    "https://example.test/graphql#fragment",
  ])("rejects invalid or credential-bearing HTTP endpoint %s", (endpoint) =>
    issue(
      () => createGraphqlHttpContract(contract(), project().draft, endpoint),
      "endpoint",
    ),
  );
});
