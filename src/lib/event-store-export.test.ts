import { describe, expect, it, vi } from "vitest";
import {
  generateEventStoreToolkit,
  generateEventStoreOpenApi,
} from "./event-store-export";
import { createEventStore, upcastStoredEvent } from "./event-store-engine";
import { demoEventStoreProject } from "./event-store-studio";
import {
  newEventDefinition,
  type EventStoreDefinition,
} from "./event-store-model";
import { parseOpenApiSchema } from "./openapi";
async function artifact(d = newEventDefinition()) {
  const source = generateEventStoreToolkit(d),
    e = (await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )) as {
      createEventStore: (
        initial?: unknown,
      ) => ReturnType<typeof createEventStore>;
      upcastEvent: (v: unknown) => ReturnType<typeof upcastStoredEvent>;
      createEventStoreHandler: (
        s: ReturnType<typeof createEventStore>,
      ) => (r: Request) => Promise<Response>;
    };
  return { source, ...e };
}
describe("standalone event store and Fetch/OpenAPI exports", () => {
  it("preserves configured JSON keys such as __proto__ when embedding projection constants", async () => {
    const d = newEventDefinition(),
      value = JSON.parse(
        '{"__proto__":{"marker":"retained"},"constructor":"data"}',
      );
    d.projections[0].rules[0].operations.push({
      op: "set",
      field: "configuration",
      value: { source: "literal", value },
    });
    const e = await artifact(d),
      core = createEventStore(d),
      out = e.createEventStore();
    for (const c of [
      {
        type: "append",
        stream: "a",
        expectedRevision: 0,
        events: [
          { id: "one", type: "Changed", version: 1, payload: { value: 1 } },
        ],
      },
      { type: "project", projectionId: "totals", limit: 500 },
    ])
      expect(out.apply(c)).toEqual(core.apply(c));
    expect(out.view("totals")).toEqual(core.view("totals"));
    expect(
      Object.hasOwn(
        out.view("totals").rows[0].fields.configuration as object,
        "__proto__",
      ),
    ).toBe(true);
    expect(({} as { marker?: string }).marker).toBeUndefined();
  });
  it("executes native ESM with exact append, projection, failure, skip and rebuild parity for all demo commands", async () => {
    const p = demoEventStoreProject(),
      e = await artifact(p.definition);
    for (const c of p.scenarios) {
      const core = createEventStore(p.definition, c.baseLog ?? undefined),
        out = e.createEventStore(c.baseLog ?? undefined);
      for (const command of c.commands) {
        expect(out.apply(command)).toEqual(core.apply(command));
        expect(out.snapshot()).toEqual(core.snapshot());
        expect(out.summary()).toEqual(core.summary());
      }
      const restored = e.createEventStore(core.exportLog());
      expect(restored.read()).toEqual(core.read());
      for (const projection of p.definition.projections) {
        expect(
          restored.apply({
            type: "project",
            projectionId: projection.id,
            limit: 500,
          }).reason,
        ).toBe(
          projection.id === "balances" &&
            ["poison", "skip", "rebuild"].includes(c.id)
            ? "projection-error"
            : "projected",
        );
      }
    }
  });
  it("matches seeded concurrent writers, duplicate IDs, projection batches and rebuild histories", async () => {
    const d: EventStoreDefinition = { ...newEventDefinition(), capacity: 40 },
      e = await artifact(d),
      core = createEventStore(d),
      out = e.createEventStore();
    let seed = 81;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 200; i++) {
      const stream = `stream-${random() % 5}`,
        revision = core
          .snapshot()
          .events.filter((e) => e.stream === stream).length,
        kind = random() % 5,
        command =
          kind < 3
            ? {
                type: "append",
                stream,
                expectedRevision:
                  random() % 4 === 0 ? Math.max(0, revision - 1) : revision,
                events: [
                  {
                    id: `event-${random() % 70}`,
                    type: "Changed",
                    version: 1,
                    payload: { value: (random() % 100) - 50 },
                  },
                ],
              }
            : kind === 3
              ? {
                  type: "project",
                  projectionId: "totals",
                  limit: 1 + (random() % 10),
                }
              : { type: "rebuild", projectionId: "totals" };
      expect(out.apply(command)).toEqual(core.apply(command));
      expect(out.snapshot()).toEqual(core.snapshot());
    }
    expect(out.exportLog()).toEqual(core.exportLog());
  });
  it("upcasts old payloads without mutation, preserves typed keys and rejects malformed inputs atomically", async () => {
    const p = demoEventStoreProject(),
      e = await artifact(p.definition),
      old = {
        id: "old",
        type: "BalanceChanged",
        version: 1,
        payload: { account: "a", cents: 5 },
      };
    expect(e.upcastEvent(old)).toEqual(upcastStoredEvent(p.definition, old));
    expect(old.version).toBe(1);
    const store = e.createEventStore(),
      before = store.snapshot();
    expect(() =>
      store.apply({
        type: "append",
        stream: "a",
        expectedRevision: 0,
        events: new Array(1),
      }),
    ).toThrow();
    expect(store.snapshot()).toEqual(before);
    expect(() => store.read(-1)).toThrow("command");
    expect(() => store.view("missing")).toThrow("reference");
  });
  it("serves explicit command/status/event/view routes with bounded JSON, no-store responses and useful errors", async () => {
    const e = await artifact(),
      s = e.createEventStore(),
      handle = e.createEventStoreHandler(s),
      root = "https://events.example",
      post = (v: unknown) =>
        handle(
          new Request(root + "/event-store/commands", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(v),
          }),
        );
    expect(
      (
        await post({
          type: "append",
          stream: "stream-a",
          expectedRevision: 0,
          events: [
            { id: "one", type: "Changed", version: 1, payload: { value: 7 } },
          ],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post({
          type: "append",
          stream: "stream-a",
          expectedRevision: 0,
          events: [
            { id: "stale", type: "Changed", version: 1, payload: { value: 1 } },
          ],
        })
      ).status,
    ).toBe(409);
    await post({ type: "project", projectionId: "totals", limit: 500 });
    const status = await handle(new Request(root + "/event-store/status"));
    expect(status.headers.get("cache-control")).toBe("no-store");
    expect(await status.json()).toMatchObject({ events: 1, lag: 0 });
    const events = await handle(
      new Request(root + "/event-store/events?after=0&limit=1"),
    );
    expect((await events.json()).events[0].payload).toEqual({ value: 7 });
    const view = await handle(new Request(root + "/event-store/views/totals"));
    expect((await view.json()).rows[0].fields.total).toBe(7);
    expect(
      (await handle(new Request(root + "/event-store/views/missing"))).status,
    ).toBe(404);
    expect(
      (await handle(new Request(root + "/event-store/events?after=-1"))).status,
    ).toBe(400);
    expect((await handle(new Request(root + "/unknown"))).status).toBe(404);
    const method = await handle(new Request(root + "/event-store/commands"));
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("POST");
  });
  it("rejects oversized, malformed and invalid UTF-8 bodies before applying any command", async () => {
    const e = await artifact(),
      s = e.createEventStore(),
      handle = e.createEventStoreHandler(s),
      url = "https://events.example/event-store/commands",
      post = (body: BodyInit) =>
        handle(
          new Request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          }),
        );
    expect((await post("{")).status).toBe(400);
    expect((await post(new Uint8Array([255]))).status).toBe(400);
    expect((await post("x".repeat(131073))).status).toBe(413);
    expect(
      (await handle(new Request(url, { method: "POST", body: "{}" }))).status,
    ).toBe(415);
    expect(s.summary().commands).toBe(0);
  });
  it("exports parseable OpenAPI and escapes metadata without embedding captures or performing I/O", async () => {
    const d = demoEventStoreProject().definition;
    d.name = "</script>\u2028\u2029";
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    try {
      const e = await artifact(d);
      expect(e.source).not.toContain("</script>");
      expect(e.source).not.toContain("\u2028");
      expect(e.source).not.toMatch(/account-a|Ada|VIP|localStorage|fetch\(/);
      const parsed = parseOpenApiSchema(
        JSON.stringify(generateEventStoreOpenApi(d)),
      );
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.value.endpoints).toHaveLength(4);
      e.createEventStore().summary();
      expect(fetcher).not.toHaveBeenCalled();
      expect(storage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      storage.mockRestore();
    }
  });
});
