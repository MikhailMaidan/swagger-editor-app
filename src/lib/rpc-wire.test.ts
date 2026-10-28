import { describe, expect, it } from "vitest";
import {
  appendRpcRequest,
  buildRpcRequest,
  inspectRpcExchange,
  readRpcRequests,
} from "./rpc-wire";
import {
  checkRpcSchema,
  readRpcContract,
  resolveRpcRef,
  saveRpcMethod,
} from "./rpc-contract";
import {
  RPC_DEMO_CONTRACT,
  demoRpcProject,
  mockRpcResponse,
  runRpcCases,
} from "./rpc-studio";
const contract = readRpcContract(RPC_DEMO_CONTRACT);
const request = (id: unknown = 1) =>
  JSON.stringify({ jsonrpc: "2.0", method: "math.add", params: [1, 2], id });
const inspect = (response: unknown, source = request()) =>
  inspectRpcExchange(contract, source, JSON.stringify(response));
describe("JSON-RPC wire envelopes and correlation", () => {
  it("runs all seven demo regressions, including negative protocol cases", () => {
    const results = runRpcCases(demoRpcProject());
    expect(results).toHaveLength(7);
    expect(results.map((r) => [r.id, r.passed])).toEqual(
      results.map((r) => [r.id, true]),
    );
  });
  it.each([0, false, null, "", [], {}])(
    "retains a falsy or structured result: %j",
    (result) => {
      expect(inspect({ jsonrpc: "2.0", result, id: 1 }).rows[0]).toMatchObject({
        outcome: "result",
        result,
      });
    },
  );
  it("matches out-of-order responses using typed IDs rather than batch order", () => {
    const input = `[${request(1)},${request("1")}]`;
    const result = inspect(
      [
        { jsonrpc: "2.0", id: "1", result: 2 },
        { jsonrpc: "2.0", id: 1, result: 3 },
      ],
      input,
    );
    expect(result.valid).toBe(true);
    expect(result.rows.map((r) => r.result)).toEqual([3, 2]);
  });
  it("treats omitted ID as a notification and an explicit null ID as a call", () => {
    const noId =
      '{"jsonrpc":"2.0","method":"events.log","params":{"message":"hello"}}';
    expect(inspectRpcExchange(contract, noId, "", 204)).toMatchObject({
      valid: true,
      notifications: 1,
      responses: 0,
    });
    const nullId = inspect(
      { jsonrpc: "2.0", id: null, result: 3 },
      request(null),
    );
    expect(nullId.valid).toBe(true);
    expect(nullId.notifications).toBe(0);
    expect(nullId.findings[0].code).toBe("null-id");
  });
  it.each([[], null, {}])(
    "rejects notification response payload %j",
    (response) => {
      const notification = '{"jsonrpc":"2.0","method":"events.log"}';
      expect(inspect(response, notification).valid).toBe(false);
    },
  );
  it("does not treat an HTTP error with an empty notification body as successful delivery", () => {
    expect(
      inspectRpcExchange(
        contract,
        '{"jsonrpc":"2.0","method":"events.log"}',
        "",
        500,
      ).valid,
    ).toBe(false);
  });
  it("requires an empty notification entity and cannot complete result checks for missing responses", () => {
    const notification = '{"jsonrpc":"2.0","method":"events.log"}';
    expect(inspectRpcExchange(contract, notification, " \n ", 200).valid).toBe(
      false,
    );
    expect(inspectRpcExchange(contract, request(), "", 200)).toMatchObject({
      valid: false,
      contractValid: false,
    });
  });
  it.each([
    { jsonrpc: "2.0", id: 1 },
    { jsonrpc: "2.0", id: 1, result: null, error: { code: 1, message: "bad" } },
    { jsonrpc: "1.0", id: 1, result: 3 },
    { jsonrpc: "2.0", result: 3 },
    { jsonrpc: "2.0", id: 1, error: { code: 1.5, message: "bad" } },
    { jsonrpc: "2.0", id: 1, error: { code: 1, message: 2 } },
  ])("rejects malformed response envelopes: %j", (response) =>
    expect(inspect(response).valid).toBe(false),
  );
  it("accepts integer error codes, empty error messages, and optional error data without requiring a result", () => {
    expect(
      inspect({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: "", data: false },
      }).rows[0],
    ).toMatchObject({ outcome: "error", errorCode: -32602 });
  });
  it("finds missing, duplicate and unexpected response IDs", () => {
    const input = `[${request(1)},${request(2)}]`,
      result = inspect(
        [
          { jsonrpc: "2.0", id: 1, result: 3 },
          { jsonrpc: "2.0", id: 1, result: 3 },
          { jsonrpc: "2.0", id: "2", result: 3 },
        ],
        input,
      );
    expect(result.findings.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "duplicate-response",
        "unknown-id",
        "missing-response",
      ]),
    );
  });
  it("requires matching single/batch framing even when there is only one call", () => {
    expect(inspect([{ jsonrpc: "2.0", id: 1, result: 3 }]).valid).toBe(false);
    expect(
      inspect({ jsonrpc: "2.0", id: 1, result: 3 }, `[${request()}]`).valid,
    ).toBe(false);
  });
  it.each([
    "[]",
    '{"jsonrpc":"2.0","method":"m","params":null}',
    '{"jsonrpc":"2.0","method":"m","id":true}',
    '{"jsonrpc":"2.0","method":"m","id":1.5}',
    '{"jsonrpc":"2.0","method":"m","id":9007199254740993}',
  ])("refuses invalid/unsupported request frame %s", (source) =>
    expect(() => readRpcRequests(source)).toThrow(),
  );
  it("rejects duplicate client IDs, allows distinct typed IDs, and builds notifications without ID or absent params", () => {
    expect(() => readRpcRequests(`[${request()},${request()}]`)).toThrow(
      "request",
    );
    expect(
      readRpcRequests(`[${request()},${request("1")}]`).requests,
    ).toHaveLength(2);
    expect(JSON.parse(buildRpcRequest("events.log", "", "1", true))).toEqual({
      jsonrpc: "2.0",
      method: "events.log",
    });
    expect(JSON.parse(appendRpcRequest(request(1), request(2)))).toHaveLength(
      2,
    );
  });
  it("generates correct mock parse/invalid-request/unknown-method errors and suppresses notifications", () => {
    expect(JSON.parse(mockRpcResponse("{", []).body).error.code).toBe(-32700);
    expect(JSON.parse(mockRpcResponse("[]", []).body).error.code).toBe(-32600);
    expect(JSON.parse(mockRpcResponse("[1]", []).body)[0].error.code).toBe(
      -32600,
    );
    expect(JSON.parse(mockRpcResponse(request(), []).body).error.code).toBe(
      -32601,
    );
    expect(
      mockRpcResponse('[{"jsonrpc":"2.0","method":"unknown"}]', []),
    ).toEqual({ body: "", status: 204 });
  });
});
describe("OpenRPC contracts and bounded advisory schema checks", () => {
  it("retains original method metadata when updating a method entry", () => {
    const root = JSON.parse(RPC_DEMO_CONTRACT);
    root["x-private-meta"] = { keep: true };
    root.methods[0]["x-method"] = "keep";
    const method = { ...root.methods[0], summary: "Updated" };
    const next = JSON.parse(
      saveRpcMethod(JSON.stringify(root), "math.add", JSON.stringify(method)),
    );
    expect(next["x-private-meta"]).toEqual({ keep: true });
    expect(next.methods[0]["x-method"]).toBe("keep");
  });
  it("resolves local content-descriptor and schema refs, but never fetches external or cyclic refs", () => {
    expect(
      resolveRpcRef(contract.root, { $ref: "#/components/schemas/Number" }),
    ).toEqual({ type: "number" });
    expect(() =>
      resolveRpcRef({ a: { $ref: "#/a" } }, { $ref: "#/a" }),
    ).toThrow("reference");
    expect(() =>
      resolveRpcRef({}, { $ref: "https://remote.test/schema" }),
    ).toThrow("reference");
    const root = JSON.parse(RPC_DEMO_CONTRACT);
    root.methods.unshift({ $ref: "remote.json#/method" });
    expect(readRpcContract(JSON.stringify(root)).issues).toContainEqual({
      index: 0,
      code: "reference",
    });
  });
  it("rejects duplicate methods, parameter names and optional-before-required parameter ordering", () => {
    const root = JSON.parse(RPC_DEMO_CONTRACT);
    expect(() =>
      readRpcContract(
        JSON.stringify({
          ...root,
          methods: [root.methods[0], root.methods[0]],
        }),
      ),
    ).toThrow("contract");
    root.methods[0].params[1].name = "a";
    expect(() => readRpcContract(JSON.stringify(root))).toThrow("contract");
    root.methods[0].params[1].name = "b";
    root.methods[0].params[0].required = false;
    expect(() => readRpcContract(JSON.stringify(root))).toThrow("contract");
  });
  it("checks named/positional parameters, required values, notification-only methods and result shapes", () => {
    const response = '{"jsonrpc":"2.0","id":1,"result":"wrong"}';
    const output = inspectRpcExchange(contract, request(), response);
    expect(output.valid).toBe(true);
    expect(output.contractValid).toBe(false);
    const missing = inspectRpcExchange(
      contract,
      '{"jsonrpc":"2.0","method":"math.add","params":{"a":1},"id":1}',
      response,
    );
    expect(missing.rows[0].input.code).toBe("params-required");
    expect(
      inspectRpcExchange(
        contract,
        '{"jsonrpc":"2.0","method":"events.log","params":{"message":"hi"},"id":1}',
        response,
      ).rows[0].input.code,
    ).toBe("notification-only");
  });
  it("checks objects, arrays, numeric/string bounds and order-independent enum values", () => {
    const schema = {
      type: "object",
      required: ["x"],
      additionalProperties: false,
      properties: {
        x: {
          type: "array",
          minItems: 1,
          items: { type: "integer", minimum: 1 },
        },
      },
    };
    expect(checkRpcSchema({}, schema, { x: [1] })).toEqual([]);
    expect(
      checkRpcSchema({}, schema, { x: [0], extra: true }).map((i) => i.code),
    ).toEqual(expect.arrayContaining(["bounds", "additional"]));
    expect(
      checkRpcSchema({}, { enum: [{ a: 1, b: 2 }] }, { b: 2, a: 1 }),
    ).toEqual([]);
    expect(checkRpcSchema({}, { type: "string", maxLength: 1 }, "😀")).toEqual(
      [],
    );
  });
  it("marks regex, compositions and unresolved schemas partial instead of claiming full validation", () => {
    expect(
      checkRpcSchema({}, { type: "string", pattern: "(a+)+$" }, "x"),
    ).toContainEqual({ code: "unsupported", path: "", error: false });
    expect(checkRpcSchema({}, { $ref: "remote.json" }, 1)[0]).toMatchObject({
      code: "reference",
      error: false,
    });
    expect(checkRpcSchema({}, { allOf: [] }, 1)[0]).toMatchObject({
      code: "unsupported",
      error: false,
    });
  });
  it("does not lose an error after many warnings and does not turn exhausted enum work into a mismatch", () => {
    const props = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [
        `p${i}`,
        i === 59 ? { type: "number" } : { pattern: ".*" },
      ]),
    );
    const data = Object.fromEntries(Object.keys(props).map((k) => [k, "x"]));
    expect(
      checkRpcSchema({}, { properties: props }, data).some((i) => i.error),
    ).toBe(true);
    expect(checkRpcSchema({}, { enum: [1] }, 2, { steps: 9999 })).toEqual([
      { path: "", code: "limit", error: false },
    ]);
  });
});
