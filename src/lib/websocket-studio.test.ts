import { describe, expect, it, vi, afterEach } from "vitest";
import {
  appendWsMessage,
  conversationFromWsTranscript,
  createWsReplay,
  decodeWsBinary,
  demoWsProject,
  emptyWsProject,
  encodeWsBinary,
  MAX_WS_HISTORY_BYTES,
  MAX_WS_MESSAGE_BYTES,
  MAX_WS_MESSAGES,
  MAX_WS_PROJECT_BYTES,
  newWsStep,
  parseWsFixtures,
  parseWsProject,
  parseWsStep,
  parseWsTranscript,
  parseWsVariables,
  runWsConversation,
  serializeWsProject,
  serializeWsTranscript,
  validateWsConnection,
  validateWsConversation,
  validateWsStep,
  WsError,
  wsError,
  wsIncoming,
  wsPause,
  wsPayload,
  wsPayloadBytes,
  wsRunReport,
  wsSendTemplate,
  wsTextTemplate,
  type WsConversation,
  type WsMessage,
  type WsPayload,
  type WsStep,
  type WsTransport,
} from "./websocket-studio";
import { translations } from "./translations";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const expectCode = (action: () => unknown, code: string) =>
  expect(action).toThrowError(expect.objectContaining({ code }));
const receive = (
  patch: Partial<Extract<WsStep, { type: "expect" }>> = {},
): Extract<WsStep, { type: "expect" }> =>
  ({ ...newWsStep("expect"), ...patch }) as Extract<WsStep, { type: "expect" }>;
const send = (data: string): WsStep => ({
  ...newWsStep("send"),
  type: "send",
  format: "json",
  data,
});
const conversation = (...steps: WsStep[]): WsConversation => ({
  id: "test",
  name: "Test conversation",
  steps,
});
const check = (expected = '"task"', path = "/type") => ({
  name: "JSON check",
  target: "body" as const,
  path,
  operator: "equals" as const,
  expected,
});
const message = (data: string, sequence = 1): WsMessage => ({
  ...wsIncoming(data),
  direction: "receive",
  sequence,
  atMs: sequence,
  bytes: new TextEncoder().encode(data).length,
});
async function replay(
  steps: WsStep[],
  fixtures: WsPayload[] = [],
  variables = {},
) {
  const messages: WsMessage[] = [];
  const result = await runWsConversation(
    conversation(...steps),
    variables,
    createWsReplay(fixtures, (m) => messages.push(m)),
    "replay",
  );
  return { result, messages };
}

describe("WebSocket connection and payload definitions", () => {
  it("accepts explicit WebSocket URLs and preserves literal query parameters and subprotocol order", () => {
    const config = {
      url: "wss://example.com/socket?room=tasks",
      protocols: ["chat.v2", "json"],
      timeoutMs: 1000,
    };
    expect(validateWsConnection(config)).toEqual(config);
    expect(
      validateWsConnection({ ...config, url: "ws://localhost:8000" }).url,
    ).toContain("localhost");
  });
  it.each([
    "https://example.com",
    "//example.com",
    "wss://user:pass@example.com",
    "wss://example.com#",
    " wss://example.com",
    "wss://example.com/ white",
    "wss://",
  ])("rejects invalid WebSocket URL %s", (url) =>
    expectCode(
      () => validateWsConnection({ url, protocols: [], timeoutMs: 1000 }),
      "url",
    ),
  );
  it("rejects duplicate, invalid and excessive subprotocols and invalid deadlines", () => {
    const c = emptyWsProject().connection;
    for (const protocols of [
      ["chat", "chat"],
      ["not a token"],
      [""],
      Array(11).fill("chat"),
    ])
      expectCode(() => validateWsConnection({ ...c, protocols }), "protocol");
    for (const timeoutMs of [0, 99, 30001, NaN, 1.5])
      expectCode(() => validateWsConnection({ ...c, timeoutMs }), "connection");
  });
  it("validates bounded JSON without silently rounding unsafe numeric values", () => {
    expect(wsPayload({ format: "json", data: ' {"n":1} ' })).toEqual({
      format: "json",
      data: ' {"n":1} ',
    });
    for (const data of ["{", "1e999", "9007199254740993"])
      expectCode(() => wsPayload({ format: "json", data }), "json");
    expect(wsIncoming("9007199254740993").format).toBe("text");
    expect(wsIncoming("null").format).toBe("json");
    expect(wsIncoming("hello").format).toBe("text");
    expectCode(() => wsIncoming({}), "message");
    expectCode(
      () =>
        wsPayload({
          format: "text",
          data: "😀".repeat(MAX_WS_MESSAGE_BYTES / 4 + 1),
        }),
      "limit",
    );
  });
  it("round-trips canonical base64, empty binary and every byte value", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const encoded = encodeWsBinary(bytes.buffer);
    expect(decodeWsBinary(encoded)).toEqual(bytes);
    expect(wsPayloadBytes({ format: "binary", data: encoded })).toBe(256);
    expect(decodeWsBinary("")).toHaveLength(0);
    expect(wsIncoming(bytes.buffer)).toEqual({
      format: "binary",
      data: encoded,
    });
    expect(wsPayloadBytes({ format: "text", data: "😀" })).toBe(4);
  });
  it.each(["A", "AA", "AA=", "AB==", "AAB=", " AA==", "AA-_", "{{value}}"])(
    "rejects noncanonical binary %s",
    (data) => expectCode(() => decodeWsBinary(data), "binary"),
  );
  it("bounds binary decoding and encoding", () => {
    expectCode(
      () => encodeWsBinary(new ArrayBuffer(MAX_WS_MESSAGE_BYTES + 1)),
      "limit",
    );
    expectCode(
      () =>
        decodeWsBinary("A".repeat(Math.ceil(MAX_WS_MESSAGE_BYTES / 3) * 4 + 4)),
      "limit",
    );
  });
});

describe("portable WebSocket projects", () => {
  it("keeps localized assertion examples valid for pasting into the expect-step editor", () => {
    for (const language of ["en", "ru"] as const) {
      const help = translations[language]["wsStudio.checksHelp"];
      const checks = JSON.parse(
        help.slice(help.indexOf("["), help.indexOf("]") + 1),
      );
      expect(() => validateWsStep(receive({ checks }))).not.toThrow();
    }
  });
  it("round-trips demo projects and discards claimed connection/results metadata", () => {
    const p = demoWsProject();
    const raw = JSON.parse(serializeWsProject(p));
    raw.socket = { readyState: 1 };
    raw.result = { status: "passed" };
    raw.conversations[0].steps[0].claimed = true;
    const restored = parseWsProject(JSON.stringify(raw));
    expect(restored).toEqual(p);
    expect(restored).not.toHaveProperty("result");
    expect(restored.conversations[0].steps[0]).not.toHaveProperty("claimed");
  });
  it("rejects invalid identities, duplicate steps/conversations, and malformed definitions", () => {
    const p = demoWsProject();
    for (const patch of [
      { kind: "other" },
      { version: 2 },
      { name: " " },
      { variables: null },
      { conversations: [] },
      { conversations: [p.conversations[0], p.conversations[0]] },
    ])
      expectCode(
        () => parseWsProject(JSON.stringify({ ...p, ...patch })),
        "project",
      );
    const s = newWsStep("send");
    expectCode(() => validateWsConversation(conversation(s, s)), "limit");
    expectCode(
      () =>
        validateWsConversation(
          conversation(...Array.from({ length: 41 }, () => newWsStep("send"))),
        ),
      "step",
    );
    expectCode(() => parseWsStep("{"), "step");
    expectCode(() => validateWsStep({ ...s, type: "execute-code" }), "step");
    expectCode(
      () => parseWsProject("x".repeat(MAX_WS_PROJECT_BYTES + 1)),
      "limit",
    );
  });
  it("enforces duration budgets, capture/check constraints, and strict JSON pointers", () => {
    expectCode(() => validateWsStep({ ...receive(), match: ["next"] }), "step");
    expectCode(
      () => validateWsStep({ ...receive(), textMode: ["any"] }),
      "step",
    );
    expectCode(
      () =>
        validateWsConversation(
          conversation(
            ...Array.from({ length: 5 }, () => receive({ timeoutMs: 30000 })),
          ),
        ),
      "limit",
    );
    for (const step of [
      receive({ timeoutMs: 0 }),
      receive({ match: "bad" as "next" }),
      receive({ checks: Array(21).fill(check()) }),
      receive({ captures: [{ name: "1bad", pointer: "" }] }),
      receive({ captures: [{ name: "x", pointer: "/bad~2" }] }),
    ])
      expect(() => validateWsStep(step)).toThrow(WsError);
    expectCode(
      () =>
        validateWsStep(receive({ checks: [{ ...check(), target: "header" }] })),
      "check",
    );
    expectCode(
      () =>
        validateWsStep(receive({ checks: [{ ...check(), path: "/bad~2" }] })),
      "check",
    );
    expectCode(
      () =>
        validateWsStep(
          receive({
            captures: [
              { name: "x", pointer: "" },
              { name: "x", pointer: "/id" },
            ],
          }),
        ),
      "variable",
    );
  });
  it("validates variables/fixtures and handles prototype-related names as own data", () => {
    const vars = parseWsVariables('{"__proto__":{"value":1},"constructor":2}');
    expect(Object.hasOwn(vars, "__proto__")).toBe(true);
    expect(
      wsSendTemplate(
        {
          format: "json",
          data: '{"value":"{{__proto__}}","constructor":"{{constructor}}"}',
        },
        vars,
      ).data,
    ).toBe('{"value":{"value":1},"constructor":2}');
    expect({}).not.toHaveProperty("value");
    for (const data of [
      "[]",
      '{"bad-name":1}',
      JSON.stringify(
        Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`v${i}`, i])),
      ),
    ])
      expectCode(() => parseWsVariables(data), "variable");
    expectCode(
      () =>
        parseWsFixtures(
          JSON.stringify(Array(201).fill({ format: "text", data: "" })),
        ),
      "limit",
    );
    expectCode(
      () => parseWsFixtures('[{"format":"binary","data":"bad"}]'),
      "binary",
    );
  });
});

describe("WebSocket conversation execution", () => {
  it("replays a complete subscribe/capture/ack flow with typed captures and skipped unrelated messages", async () => {
    const p = demoWsProject(),
      messages: WsMessage[] = [];
    const result = await runWsConversation(
      p.conversations[0],
      p.variables,
      createWsReplay(p.fixtures, (m) => messages.push(m)),
      "replay",
    );
    expect(result.status).toBe("passed");
    expect(result.steps.map((s) => s.status)).toEqual(Array(4).fill("passed"));
    expect(result.steps[2]).toMatchObject({
      received: 2,
      skippedMessages: 1,
      messageSequence: 4,
    });
    expect(messages).toHaveLength(5);
    expect(JSON.parse(messages.at(-1)!.data)).toEqual({ type: "ack", id: 42 });
    expect(messages[1].data).toContain('"room":"tasks"');
    expect(p.variables).toEqual({ room: "tasks" });
  });
  it("compares JSON structurally and treats valid JSON text messages as text when requested", async () => {
    const first = await replay(
      [receive({ checks: [check('{"a":1,"b":2}', "")] })],
      [{ format: "json", data: '{"b":2,"a":1}' }],
    );
    expect(first.result.status).toBe("passed");
    const second = await replay(
      [receive({ format: "text", textMode: "contains", textValue: '"a"' })],
      [{ format: "json", data: '{"a":1}' }],
    );
    expect(second.result.status).toBe("passed");
  });
  it("fails on the next mismatch, skips remaining steps, and never sends later messages", async () => {
    const { result, messages } = await replay(
      [receive({ checks: [check()] }), send('{"must":"not send"}')],
      [{ format: "text", data: "unexpected" }],
    );
    expect(result.status).toBe("failed");
    expect(result.steps[0].error).toBe("mismatch");
    expect(result.steps[1].status).toBe("skipped");
    expect(messages.map((m) => m.direction)).toEqual(["receive"]);
  });
  it("reports fixture exhaustion and empty conversations", async () => {
    expect((await replay([receive()])).result.steps[0].error).toBe("exhausted");
    await expect(
      runWsConversation(
        conversation(),
        {},
        createWsReplay([], vi.fn()),
        "replay",
      ),
    ).rejects.toMatchObject({ code: "step" });
  });
  it("shares a single receive deadline while skipping unrelated messages", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const deadlines: number[] = [];
    const transport: WsTransport = {
      send: vi.fn(),
      pause: vi.fn(),
      receive: async (timeout) => {
        deadlines.push(timeout);
        now += 4;
        return message("noise");
      },
    };
    const result = await runWsConversation(
      conversation(
        receive({ timeoutMs: 10, match: "matching", format: "json" }),
      ),
      {},
      transport,
      "live",
    );
    expect(deadlines).toEqual([10, 6, 2]);
    expect(result.steps[0]).toMatchObject({
      error: "timeout",
      received: 3,
      skippedMessages: 3,
    });
  });
  it("bounds a busy stream even when its messages resolve immediately", async () => {
    const transport: WsTransport = {
      send: vi.fn(),
      pause: vi.fn(),
      receive: async () => message("noise"),
    };
    const result = await runWsConversation(
      conversation(receive({ match: "matching", format: "json" })),
      {},
      transport,
      "live",
    );
    expect(result.steps[0]).toMatchObject({
      error: "limit",
      received: MAX_WS_MESSAGES,
    });
  });
  it("captures escaped JSON pointers, nulls and objects without using inherited properties", async () => {
    const captures = [
      { name: "object", pointer: "/a~1b~0c" },
      { name: "nothing", pointer: "/nil" },
      { name: "__proto__", pointer: "/constructor" },
    ];
    const { result, messages } = await replay(
      [
        receive({ captures }),
        send(
          '{"value":"{{object}}","nil":"{{nothing}}","own":"{{__proto__}}"}',
        ),
      ],
      [
        {
          format: "json",
          data: '{"a/b~c":{"id":9},"nil":null,"constructor":7}',
        },
      ],
    );
    expect(result.status).toBe("passed");
    expect(JSON.parse(messages[1].data)).toEqual({
      value: { id: 9 },
      nil: null,
      own: 7,
    });
    const failed = await replay(
      [
        receive({ captures: [{ name: "x", pointer: "/constructor" }] }),
        send("null"),
      ],
      [{ format: "json", data: "{}" }],
    );
    expect(failed.result.steps[0].error).toBe("pointer");
    expect({}).not.toHaveProperty("id");
  });
  it("supports exact base64 matches and rejects JSON captures from binary", async () => {
    const payload: WsPayload = { format: "binary", data: "AAEC" };
    expect(
      (
        await replay(
          [
            receive({
              format: "binary",
              textMode: "equals",
              textValue: "AAEC",
            }),
          ],
          [payload],
        )
      ).result.status,
    ).toBe("passed");
    expect(
      (
        await replay(
          [receive({ captures: [{ name: "id", pointer: "" }] })],
          [payload],
        )
      ).result.steps[0].error,
    ).toBe("json");
  });
  it("substitutes variables in equality checks and ignores unused text literals", async () => {
    const { result } = await replay(
      [
        receive({
          textValue: "{{unused}}",
          checks: [
            check('"{{id}}"', "/id"),
            {
              ...check(),
              path: "/missing",
              operator: "absent",
              expected: "{{unused}}",
            },
          ],
        }),
      ],
      [{ format: "json", data: '{"id":7}' }],
      { id: 7 },
    );
    expect(result.status).toBe("passed");
  });
  it("advances offline pause times without timers", async () => {
    const { messages, result } = await replay([
      { ...newWsStep("pause"), type: "pause", durationMs: 1000 },
      send("null"),
    ]);
    expect(result.status).toBe("passed");
    expect(messages[0].atMs).toBe(1000);
  });
  it("cancels a pending pause and marks later steps skipped", async () => {
    const controller = new AbortController();
    const pending = runWsConversation(
      conversation(
        { ...newWsStep("pause"), type: "pause", durationMs: 10000 },
        send("null"),
      ),
      {},
      { send: vi.fn(), receive: vi.fn(), pause: wsPause },
      "live",
      controller.signal,
    );
    controller.abort();
    const result = await pending;
    expect(result.status).toBe("cancelled");
    expect(result.steps.map((s) => s.status)).toEqual(["cancelled", "skipped"]);
  });
  it("does no work after an already-cancelled run", async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = { send: vi.fn(), receive: vi.fn(), pause: vi.fn() };
    const result = await runWsConversation(
      conversation(send("null")),
      {},
      transport,
      "live",
      controller.signal,
    );
    expect(result.status).toBe("cancelled");
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("keeps reports free of payloads, connection URLs, initial/captured variables and expected literals", async () => {
    const p = demoWsProject();
    const { result } = await replay(
      p.conversations[0].steps,
      p.fixtures,
      p.variables,
    );
    const report = JSON.stringify(wsRunReport(result));
    for (const value of [
      "wss://",
      '"variables"',
      '"payload"',
      '"data"',
      '"expected"',
      "Ship realtime support",
      '"room"',
    ])
      expect(report).not.toContain(value);
    expect(JSON.parse(report).steps).toHaveLength(4);
    expect(wsError(new Error()).code).toBe("connection");
  });
});

describe("typed templates and transcript reuse", () => {
  it("replays recorded placeholder text literally and supports large JSON messages without oversized assertion literals", async () => {
    const data = JSON.stringify({
      literal: "{{notAVariable}}",
      large: "x".repeat(5000),
    });
    const recorded: WsMessage[] = [
      { ...message('{"literal":"{{notAVariable}}"}'), direction: "send" },
      { ...message(data, 2), direction: "receive" },
      { ...message('{"literal":"{{notAVariable}}"}', 3), direction: "receive" },
    ];
    const c = conversationFromWsTranscript(recorded);
    expect(c.steps.every((s) => s.type === "pause" || !s.template)).toBe(true);
    const { result, messages } = await replay(
      c.steps,
      recorded.filter((m) => m.direction === "receive"),
    );
    expect(result.status).toBe("passed");
    expect(messages[0].data).toBe(recorded[0].data);
    expect(messages[1].data).toBe(data);
  });
  it("substitutes typed JSON values once and never templates JSON property names", () => {
    const output = wsSendTemplate(
      {
        format: "json",
        data: '{"{{key}}":"{{obj}}","arr":"{{list}}","text":"id={{id}}","literal":"{{text}}"}',
      },
      { obj: { id: 1 }, list: [1, 2], id: 4, text: "{{id}}" },
    );
    expect(JSON.parse(output.data)).toEqual({
      "{{key}}": { id: 1 },
      arr: [1, 2],
      text: "id=4",
      literal: "{{id}}",
    });
    expect(wsTextTemplate("{{flag}}/{{nil}}", { flag: false, nil: null })).toBe(
      "false/null",
    );
    expectCode(() => wsTextTemplate("{{missing}}", {}), "variable");
    expectCode(
      () => wsTextTemplate("prefix{{object}}", { object: {} }),
      "variable",
    );
  });
  it("bounds expansion before concatenating large repeated values", () => {
    const vars = { large: "x".repeat(30000) };
    expectCode(() => wsTextTemplate("{{large}}".repeat(1000), vars), "limit");
    expectCode(
      () =>
        wsSendTemplate(
          {
            format: "json",
            data: JSON.stringify(Array(1000).fill("{{large}}")),
          },
          vars,
        ),
      "limit",
    );
  });
  it("retains bounded messages, counts drops and keeps original sequence numbers", () => {
    let messages: WsMessage[] = [],
      dropped = 0;
    for (let i = 1; i <= MAX_WS_MESSAGES + 3; i++) {
      const next = appendWsMessage(messages, message("small", i));
      messages = next.messages;
      dropped += next.dropped;
    }
    expect(messages).toHaveLength(MAX_WS_MESSAGES);
    expect(messages[0].sequence).toBe(4);
    expect(dropped).toBe(3);
    for (let i = 0; i < 10; i++)
      messages = appendWsMessage(
        messages,
        message("x".repeat(MAX_WS_MESSAGE_BYTES), 500 + i),
      ).messages;
    expect(messages.reduce((n, m) => n + m.bytes, 0)).toBeLessThanOrEqual(
      MAX_WS_HISTORY_BYTES,
    );
  });
  it("exports and imports full retained values while recalculating untrusted metadata", () => {
    const messages = [
      message('{"secret":"kept intentionally"}'),
      {
        ...message("AAEC", 2),
        format: "binary" as const,
        data: "AAEC",
        bytes: 3,
      },
    ];
    const raw = JSON.parse(serializeWsTranscript(messages));
    expectCode(
      () =>
        parseWsTranscript(
          JSON.stringify({
            ...raw,
            messages: [{ ...raw.messages[0], direction: ["receive"] }],
          }),
        ),
      "message",
    );
    raw.messages[0].bytes = -9;
    raw.messages[0].sequence = 999;
    raw.messages[0].passed = true;
    const parsed = parseWsTranscript(JSON.stringify(raw));
    expect(parsed[0].sequence).toBe(1);
    expect(parsed[0].bytes).toBe(messages[0].bytes);
    expect(parsed[0]).not.toHaveProperty("passed");
    expect(parsed[0].data).toContain("kept intentionally");
    expectCode(
      () =>
        parseWsTranscript(
          JSON.stringify({
            ...raw,
            messages: [{ ...raw.messages[0], atMs: -1 }],
          }),
        ),
      "message",
    );
  });
  it("turns a captured transcript into exact checks and replays it without network activity", async () => {
    const input: WsMessage[] = [
      { ...message('{"subscribe":"tasks"}'), direction: "send" },
      { ...message('{"a":1,"b":2}', 2), direction: "receive" },
    ];
    const c = conversationFromWsTranscript(input);
    const { result, messages } = await replay(c.steps, [
      { format: "json", data: '{"b":2,"a":1}' },
    ]);
    expect(result.status).toBe("passed");
    expect(messages.map((m) => m.direction)).toEqual(["send", "receive"]);
    expectCode(() => conversationFromWsTranscript([]), "limit");
    expectCode(
      () =>
        conversationFromWsTranscript(
          Array.from({ length: 41 }, (_, i) => message("x", i + 1)),
        ),
      "limit",
    );
  });
});
