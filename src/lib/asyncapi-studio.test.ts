import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addAsyncChannel,
  AsyncError,
  asyncCatalogMarkdown,
  checkEventMessage,
  emptyAsyncDocument,
  eventJournalReport,
  exportAsyncDocument,
  MAX_ASYNC_BYTES,
  MAX_EVENT_BYTES,
  parseAsyncProject,
  parseEventHeaders,
  parseEventParameters,
  parseEventPayload,
  readAsyncDocument,
  rehearseEvent,
  replayEvent,
  resolveEventAddress,
  serializeAsyncProject,
  type RehearsalInput,
} from "./asyncapi-studio";

afterEach(() => vi.restoreAllMocks());
function source() {
  return {
    asyncapi: "3.1.0",
    info: { title: "Order events", version: "1.0" },
    defaultContentType: "application/json",
    servers: { broker: { host: "localhost:9092", protocol: "kafka" } },
    channels: {
      orders: {
        address: "orders/{tenant}",
        parameters: { tenant: { enum: ["alpha", "beta"], default: "alpha" } },
        messages: { created: { $ref: "#/components/messages/Created" } },
        servers: [{ $ref: "#/servers/broker" }],
      },
    },
    operations: {
      sendOrder: {
        action: "send",
        channel: { $ref: "#/channels/orders" },
        messages: [{ $ref: "#/channels/orders/messages/created" }],
      },
      receiveOrder: {
        action: "receive",
        channel: { $ref: "#/channels/orders" },
      },
    },
    components: {
      messages: {
        Created: {
          name: "Created",
          payload: { $ref: "#/components/schemas/Order" },
          headers: {
            type: "object",
            properties: { trace: { type: "string" } },
            required: ["trace"],
          },
          correlationId: { location: "$message.header#/trace" },
          examples: [
            {
              name: "Created order",
              payload: { id: 1, state: "created" },
              headers: { trace: "private-trace" },
            },
          ],
        },
      },
      schemas: {
        Order: {
          type: "object",
          properties: {
            id: { type: "integer", minimum: 1 },
            state: { enum: ["created", "updated"] },
          },
          required: ["id", "state"],
          additionalProperties: false,
        },
      },
    },
    "x-original": { keep: true },
  };
}
function doc() {
  return readAsyncDocument(JSON.stringify(source()));
}
function input(patch: Partial<RehearsalInput> = {}): RehearsalInput {
  return {
    operationKey: "sendOrder",
    messageKey: "created",
    parameters: { tenant: "alpha" },
    payload: { id: 1, state: "created" },
    headers: { trace: "private-trace" },
    ...patch,
  };
}
function check(document = doc(), body: unknown = { id: 1, state: "created" }) {
  return checkEventMessage(
    document,
    document.catalog.channels[0].messages[0],
    parseEventPayload(JSON.stringify(body)),
    { trace: "private-trace" },
  );
}

describe("AsyncAPI document inspection", () => {
  it("rejects non-string YAML map keys instead of silently changing contract identifiers", () => {
    expect(() =>
      readAsyncDocument(
        'asyncapi: 3.1.0\ninfo: {title: Events, version: "1"}\nchannels:\n  1: {address: one}\n  "1": {address: two}\n',
      ),
    ).toThrow("document");
  });
  it("loads JSON and YAML without requests or mutation, preserving extensions and references", () => {
    const network = vi.spyOn(globalThis, "fetch"),
      original = source(),
      text = JSON.stringify(original);
    const json = readAsyncDocument(text),
      yaml = readAsyncDocument(YAML.stringify(original));
    expect(json.catalog).toEqual(yaml.catalog);
    expect(json.catalog.operations.map((o) => o.action)).toEqual([
      "send",
      "receive",
    ]);
    expect(json.catalog.channels[0]).toMatchObject({
      address: "orders/{tenant}",
      serverKeys: ["broker"],
      parameters: [
        {
          name: "tenant",
          defaultValue: "alpha",
          enumValues: ["alpha", "beta"],
        },
      ],
    });
    expect(json.catalog.servers[0]).toMatchObject({
      protocol: "kafka",
      address: "localhost:9092",
    });
    expect(json.catalog.channels[0].messages[0].examples[0].headers.trace).toBe(
      "private-trace",
    );
    expect(JSON.parse(exportAsyncDocument(json, "json"))).toEqual(original);
    expect(readAsyncDocument(exportAsyncDocument(json, "yaml")).root).toEqual(
      original,
    );
    expect(JSON.stringify(original)).toBe(text);
    expect(network).not.toHaveBeenCalled();
  });
  it("uses the application perspective for AsyncAPI 2.x publish/subscribe and oneOf message variants", () => {
    const document = readAsyncDocument(
      JSON.stringify({
        asyncapi: "2.6.0",
        info: { title: "Legacy events", version: "1" },
        servers: { local: { url: "localhost:1883", protocol: "mqtt" } },
        channels: {
          "sensor/{id}": {
            parameters: { id: { schema: { type: "string", default: "42" } } },
            servers: ["local"],
            publish: {
              operationId: "consume",
              message: {
                oneOf: [
                  { name: "A", payload: { type: "string" } },
                  { name: "B", payload: { type: "number" } },
                ],
              },
            },
            subscribe: {
              operationId: "produce",
              message: { payload: { type: "string" } },
            },
          },
        },
      }),
    );
    expect(
      document.catalog.operations.map((o) => ({
        name: o.name,
        action: o.action,
      })),
    ).toEqual([
      { name: "produce", action: "send" },
      { name: "consume", action: "receive" },
    ]);
    expect(document.catalog.operations[1].messageKeys).toEqual([
      "publish-1",
      "publish-2",
    ]);
    expect(document.catalog.channels[0].parameters[0].defaultValue).toBe("42");
    expect(document.catalog.servers[0].address).toBe("localhost:1883");
    expect(JSON.parse(exportAsyncDocument(document, "json")).asyncapi).toBe(
      "2.6.0",
    );
  });
  it("handles escaped/percent-encoded local references and prototype-looking names as own data", () => {
    const original = source() as Record<string, unknown>;
    const components = original.components as ReturnType<
      typeof source
    >["components"];
    components.schemas = JSON.parse(
      '{"a/b~":{"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"]}}',
    );
    components.messages.Created.payload.$ref = "#/components/schemas/a~1b%7E0";
    const document = readAsyncDocument(JSON.stringify(original));
    expect(check(document, JSON.parse('{"__proto__":"data"}')).status).toBe(
      "valid",
    );
    expect({}).not.toHaveProperty("data");
  });
  it("reports broken, cyclic and external references without fetching them", () => {
    const original = source() as Record<string, unknown>;
    original.channels = {
      broken: { $ref: "#/channels/absent" },
      external: { $ref: "https://example.test/channel.json" },
      cyclic: { $ref: "#/channels/cyclic" },
    };
    original.operations = {};
    const network = vi.spyOn(globalThis, "fetch");
    const document = readAsyncDocument(JSON.stringify(original));
    expect(document.catalog.channels).toEqual([]);
    expect(document.catalog.findings.map((f) => f.code)).toEqual([
      "reference",
      "external-reference",
      "reference",
    ]);
    expect(network).not.toHaveBeenCalled();
  });
  it("rejects operation message references that do not belong to its channel", () => {
    const original = source();
    original.operations.sendOrder.messages = [
      { $ref: "#/components/messages/Created" },
    ];
    const document = readAsyncDocument(JSON.stringify(original));
    expect(document.catalog.operations[0].messageKeys).toEqual([]);
    expect(() => rehearseEvent(document, [], input())).toThrow("selection");
  });
  it.each(["1.0.0", "2.7.0", "3.2.0", "4.0.0", "3.1"])(
    "rejects unsupported versions %s",
    (asyncapi) => {
      expect(() =>
        readAsyncDocument(JSON.stringify({ ...source(), asyncapi })),
      ).toThrow("version");
    },
  );
  it.each([
    "{}",
    "[]",
    '{"asyncapi":"3.1.0","info":{"title":"","version":"1"}}',
    "asyncapi: [",
    'asyncapi: 3.1.0\nasyncapi: 3.1.0\ninfo: {title: Duplicate, version: "1"}',
    '{"asyncapi":"3.1.0","info":{"title":"A","version":"1"},"channels":[]}',
  ])("rejects invalid sources without replacing prior documents: %s", (text) =>
    expect(() => readAsyncDocument(text)).toThrow(AsyncError),
  );
  it("enforces document bytes, channel, operation and message limits", () => {
    expect(() => readAsyncDocument(" ".repeat(MAX_ASYNC_BYTES + 1))).toThrow(
      "limit",
    );
    const original = source() as Record<string, unknown>;
    original.channels = Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [
        `c${i}`,
        { address: `c${i}`, messages: {} },
      ]),
    );
    expect(() => readAsyncDocument(JSON.stringify(original))).toThrow("limit");
    original.channels = {};
    original.operations = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => [`op${i}`, {}]),
    );
    expect(() => readAsyncDocument(JSON.stringify(original))).toThrow("limit");
    original.operations = {};
    original.channels = {
      one: {
        address: "one",
        messages: Object.fromEntries(
          Array.from({ length: 101 }, (_, i) => [`m${i}`, { payload: {} }]),
        ),
      },
    };
    expect(() => readAsyncDocument(JSON.stringify(original))).toThrow("limit");
  });
});

describe("AsyncAPI message checks and rehearsal", () => {
  it("evaluates a locally referenced false payload schema", () => {
    const original = source() as Record<string, unknown>;
    (original.components as Record<string, unknown>).schemas = { Order: false };
    expect(check(readAsyncDocument(JSON.stringify(original))).status).toBe(
      "invalid",
    );
  });
  it("flags malformed constraints, unsupported formats and invalid patterns for review", () => {
    const original = source() as Record<string, unknown>;
    (original.components as Record<string, unknown>).messages = {
      Created: {
        payload: {
          type: "object",
          required: "wrong",
          properties: {
            x: { type: "string", format: "custom-format", pattern: "[" },
          },
        },
      },
    };
    const result = check(readAsyncDocument(JSON.stringify(original)), {
      x: "value",
    });
    expect(result.status).toBe("partial");
    expect(result.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["structure", "schema-keyword"]),
    );
  });
  it("marks arrays beyond bounded uniqueness checks as partial", () => {
    const original = source() as Record<string, unknown>;
    (original.components as Record<string, unknown>).messages = {
      Created: { payload: { type: "array", uniqueItems: true } },
    };
    expect(
      check(
        readAsyncDocument(JSON.stringify(original)),
        Array.from({ length: 1001 }, (_, i) => i),
      ).status,
    ).toBe("partial");
  });
  it("validates referenced nested payloads, required headers and correlation IDs", () => {
    expect(check().status).toBe("valid");
    expect(check().correlation).toBe("private-trace");
    const invalid = check(doc(), { id: 0, state: "other", extra: 1 });
    expect(invalid.status).toBe("invalid");
    expect(invalid.issues.map((i) => i.keyword)).toEqual(
      expect.arrayContaining(["minimum", "enum", "additionalProperties"]),
    );
    const document = doc(),
      message = document.catalog.channels[0].messages[0];
    const missing = checkEventMessage(
      document,
      message,
      { id: 1, state: "created" },
      {},
    );
    expect(missing.status).toBe("invalid");
    expect(missing.issues.map((i) => i.part)).toContain("correlation");
  });
  it("preserves scalar types and treats boolean false schemas as rejecting everything", () => {
    const original = source() as Record<string, unknown>;
    (original.components as Record<string, unknown>).messages = {
      Created: { payload: false },
    };
    const document = readAsyncDocument(JSON.stringify(original));
    expect(check(document, null).status).toBe("invalid");
    (original.components as Record<string, unknown>).messages = {
      Created: { payload: { type: ["integer", "null"] } },
    };
    const union = readAsyncDocument(JSON.stringify(original));
    expect(check(union, null).status).toBe("valid");
    expect(check(union, "2").status).toBe("invalid");
  });
  it("extracts correlation from escaped payload pointers and rejects non-scalar values", () => {
    const original = source() as Record<string, unknown>;
    (original.components as Record<string, unknown>).messages = {
      Created: {
        payload: {},
        correlationId: { location: "$message.payload#/a~1b%7E0" },
      },
    };
    const document = readAsyncDocument(JSON.stringify(original));
    expect(check(document, { "a/b~": 42 }).correlation).toBe(42);
    expect(check(document, { "a/b~": { nested: 1 } }).status).toBe("invalid");
  });
  it("supports a JSON Schema draft-07 multi-format envelope and flags Avro as partial", () => {
    const original = source() as Record<string, unknown>;
    (original.components as Record<string, unknown>).messages = {
      Created: {
        payload: {
          schemaFormat: "application/schema+json;version=draft-07",
          schema: { type: "string", minLength: 3 },
        },
      },
    };
    const document = readAsyncDocument(JSON.stringify(original));
    expect(check(document, "abcd").status).toBe("valid");
    expect(check(document, "x").status).toBe("invalid");
    (original.components as Record<string, unknown>).messages = {
      Created: {
        payload: {
          schemaFormat: "application/vnd.apache.avro;version=1.9.0",
          schema: { type: "record" },
        },
      },
    };
    const avro = readAsyncDocument(JSON.stringify(original));
    expect(check(avro, {}).status).toBe("partial");
    expect(check(avro, {}).findings.map((f) => f.code)).toContain(
      "schema-format",
    );
  });
  it("marks unknown schema keywords, traits, non-JSON media and unresolved refs for review", () => {
    const original = source() as Record<string, unknown>;
    (original.components as Record<string, unknown>).messages = {
      Created: {
        contentType: "application/xml",
        traits: [{ $ref: "#/components/messageTraits/Extra" }],
        payload: {
          type: "object",
          if: {},
          patternProperties: {},
          properties: { x: { $ref: "https://example.test/schema.json" } },
        },
      },
    };
    const document = readAsyncDocument(JSON.stringify(original));
    const result = check(document, {});
    expect(result.status).toBe("partial");
    expect(result.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining([
        "schema-keyword",
        "traits",
        "content-type",
        "external-reference",
      ]),
    );
  });
  it("treats multiple oneOf matches as an invalid message instead of a success", () => {
    const original = source() as Record<string, unknown>;
    (original.components as Record<string, unknown>).messages = {
      Created: {
        payload: { oneOf: [{ type: "integer" }, { type: "number" }] },
      },
    };
    expect(check(readAsyncDocument(JSON.stringify(original)), 1)).toMatchObject(
      {
        status: "invalid",
        issues: [{ keyword: "oneOfMultiple", severity: "error" }],
      },
    );
  });
  it("bounds recursive schema traversal and reports a partial result", () => {
    const original = source() as Record<string, unknown>;
    (original.components as Record<string, unknown>).schemas = {
      Order: {
        type: "object",
        properties: { next: { $ref: "#/components/schemas/Order" } },
      },
    };
    const result = check(readAsyncDocument(JSON.stringify(original)), {
      next: { next: {} },
    });
    expect(result.status).toBe("partial");
    expect(result.findings.map((f) => f.code)).toContain("schema-limit");
  });
  it("resolves parameter defaults, validates enums and rejects unresolved or dynamic addresses", () => {
    const channel = doc().catalog.channels[0];
    expect(resolveEventAddress(channel, {})).toBe("orders/alpha");
    expect(resolveEventAddress(channel, { tenant: "beta" })).toBe(
      "orders/beta",
    );
    for (const value of ["", "gamma", "bad\nvalue", "{alpha}"])
      expect(() => resolveEventAddress(channel, { tenant: value })).toThrow(
        "parameters",
      );
    expect(() =>
      resolveEventAddress({ ...channel, address: null }, {}),
    ).toThrow("parameters");
    expect(() =>
      resolveEventAddress({ ...channel, parameters: [] }, {}),
    ).toThrow("parameters");
  });
  it("records valid and invalid attempts with ordered IDs without mutating inputs", () => {
    const document = doc(),
      first = input(),
      before = JSON.stringify(first);
    const original = JSON.stringify(document.root);
    const one = rehearseEvent(document, [], first),
      two = rehearseEvent(
        document,
        one,
        input({
          operationKey: "receiveOrder",
          payload: { id: -1, state: "created" },
        }),
      );
    expect(one).toHaveLength(1);
    expect(two.map((e) => e.sequence)).toEqual([1, 2]);
    expect(two.map((e) => e.check.status)).toEqual(["valid", "invalid"]);
    expect(two.map((e) => e.action)).toEqual(["send", "receive"]);
    expect(JSON.stringify(first)).toBe(before);
    expect(JSON.stringify(document.root)).toBe(original);
  });
  it("replays a previous envelope as a separate attempt and rechecks it", () => {
    const document = doc(),
      one = rehearseEvent(document, [], input());
    const replay = replayEvent(document, one, 1);
    expect(replay[1]).toMatchObject({
      sequence: 2,
      replayOf: 1,
      check: { status: "valid" },
    });
    expect(replay[1].payload).toEqual(one[0].payload);
    expect(replay[1].payload).not.toBe(one[0].payload);
    expect(() => replayEvent(document, one, 999)).toThrow("selection");
  });
  it("marks unsupported reply routing and operation traits as partial", () => {
    const original = source() as Record<string, unknown>;
    (original.operations as Record<string, unknown>).sendOrder = {
      ...source().operations.sendOrder,
      traits: [{}],
      reply: { address: { location: "$message.header#/replyTo" } },
    };
    const document = readAsyncDocument(JSON.stringify(original));
    const journal = rehearseEvent(document, [], input());
    expect(journal[0].check.status).toBe("partial");
    expect(journal[0].check.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["traits", "reply"]),
    );
  });
  it("enforces JSON type, byte and journal limits", () => {
    expect(() => parseEventHeaders("[]")).toThrow("json");
    expect(() => parseEventParameters('{"tenant":1}')).toThrow("parameters");
    expect(() => parseEventPayload("9007199254740993")).toThrow("json");
    expect(() =>
      parseEventPayload(JSON.stringify("x".repeat(MAX_EVENT_BYTES))),
    ).toThrow("limit");
    const document = doc();
    let journal = rehearseEvent(document, [], input());
    journal = Array.from({ length: 200 }, (_, i) => ({
      ...journal[0],
      sequence: i + 1,
    }));
    expect(() => rehearseEvent(document, journal, input())).toThrow("journal");
  });
});

describe("AsyncAPI authoring and exports", () => {
  it("adds an inferred channel without deleting existing contract fields or colliding operation IDs", () => {
    const document = doc(),
      before = JSON.stringify(document.root);
    const next = addAsyncChannel(document, {
      key: "updates",
      address: "orders.updated",
      messageName: "Updated",
      action: "receive",
      example: '{"id":2,"tags":["a"],"active":false}',
    });
    expect(next.catalog.channels).toHaveLength(2);
    expect(next.catalog.operations).toHaveLength(3);
    expect(next.root["x-original"]).toEqual({ keep: true });
    expect(JSON.stringify(document.root)).toBe(before);
    const channel = next.catalog.channels.find((c) => c.key === "updates")!;
    expect(
      checkEventMessage(
        next,
        channel.messages[0],
        { id: 3, tags: ["b"], active: true },
        {},
      ).status,
    ).toBe("valid");
    expect(
      checkEventMessage(
        next,
        channel.messages[0],
        { id: "bad", tags: [], active: true },
        {},
      ).status,
    ).toBe("invalid");
    expect(() =>
      addAsyncChannel(next, {
        key: "updates",
        address: "x",
        messageName: "X",
        action: "send",
        example: "{}",
      }),
    ).toThrow("builder");
  });
  it("starts an empty editable 3.1 contract and rejects invalid builder input", () => {
    const document = emptyAsyncDocument();
    expect(document.catalog.version).toBe("3.1.0");
    expect(document.catalog.channels).toEqual([]);
    for (const key of ["bad/key", "", "a".repeat(65)])
      expect(() =>
        addAsyncChannel(document, {
          key,
          address: "orders",
          messageName: "X",
          action: "send",
          example: "{}",
        }),
      ).toThrow("builder");
    expect(() =>
      addAsyncChannel(document, {
        key: "orders",
        address: "orders/{id}",
        messageName: "X",
        action: "send",
        example: "{}",
      }),
    ).toThrow("builder");
    expect(() =>
      addAsyncChannel(document, {
        key: "orders",
        address: "orders",
        messageName: "X",
        action: "send",
        example: "bad-json",
      }),
    ).toThrow("json");
  });
  it("round-trips projects with a replay journal and recomputes imported checks instead of trusting them", () => {
    const document = doc(),
      journal = replayEvent(document, rehearseEvent(document, [], input()), 1);
    const serialized = serializeAsyncProject(document, journal, "Order test");
    const raw = JSON.parse(serialized);
    raw.journal[0].check = {
      status: "invalid",
      issues: [{ secret: "forged" }],
    };
    raw.journal[0].address = "forged-address";
    const parsed = parseAsyncProject(JSON.stringify(raw));
    expect(parsed.project.journal).toEqual(journal);
    expect(parsed.project.name).toBe("Order test");
    expect(parsed.doc.root).toEqual(document.root);
    expect(parsed.project.journal[0].check.status).toBe("valid");
  });
  it("rejects missing payloads, invalid journal order, future replay references and invalid selections", () => {
    const document = doc(),
      journal = rehearseEvent(document, [], input()),
      raw = JSON.parse(serializeAsyncProject(document, journal, "Order test"));
    for (const patch of [
      { sequence: 2 },
      { replayOf: 2 },
      { operationKey: "absent" },
      { parameters: { tenant: 1 } },
    ]) {
      const bad = structuredClone(raw);
      Object.assign(bad.journal[0], patch);
      expect(() => parseAsyncProject(JSON.stringify(bad))).toThrow(AsyncError);
    }
    const missing = structuredClone(raw);
    delete missing.journal[0].payload;
    expect(() => parseAsyncProject(JSON.stringify(missing))).toThrow("project");
  });
  it("exports reports without payload/header/correlation/address values and separate full projects with them", () => {
    const document = doc(),
      journal = rehearseEvent(
        document,
        [],
        input({ parameters: { tenant: "beta" } }),
      );
    const report = JSON.stringify(eventJournalReport(document, journal));
    expect(report).not.toMatch(
      /private-trace|orders\/beta|"payload":|"headers":|"correlation":/,
    );
    expect(JSON.parse(report).counts).toEqual({
      valid: 1,
      invalid: 0,
      partial: 0,
    });
    expect(serializeAsyncProject(document, journal, "Project")).toContain(
      "private-trace",
    );
  });
  it("exports a readable Markdown operation inventory and escapes table-breaking labels", () => {
    const original = source();
    original.info.title = "Order | events <tag>";
    const text = asyncCatalogMarkdown(
      readAsyncDocument(JSON.stringify(original)),
    );
    expect(text).toContain(
      "| Channel | Address | Action | Operation | Message |",
    );
    expect(text).toContain("sendOrder");
    expect(text).toContain("receiveOrder");
    expect(text).not.toContain("<tag>");
    expect(text).not.toContain("private-trace");
  });
});
