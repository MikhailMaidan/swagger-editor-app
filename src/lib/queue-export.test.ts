import { describe, expect, it, vi } from "vitest";
import { generateQueueToolkit, generateQueueOpenApi } from "./queue-export";
import { createJobQueue } from "./queue-engine";
import {
  newQueueDefinition,
  newQueueInput,
  type QueueDefinition,
  MAX_QUEUE_SPAN,
  MAX_QUEUE_TIME,
} from "./queue-model";
import { demoQueueProject } from "./queue-studio";
import { parseOpenApiSchema } from "./openapi";
async function artifact(d = newQueueDefinition()) {
  const source = generateQueueToolkit(d),
    e = (await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )) as {
      createQueue: (id: string) => ReturnType<typeof createJobQueue>;
      createQueueHandler: (
        q: ReturnType<typeof createJobQueue>,
      ) => (r: Request) => Promise<Response>;
    };
  return { source, ...e };
}
describe("standalone job queue and HTTP command toolkit", () => {
  it("executes native ESM with exact core parity across all demo transitions, journals and summaries", async () => {
    const horizonPolicy = {
        ...newQueueDefinition(),
        retentionMs: 100,
        visibilityMs: 1000,
      },
      horizon = await artifact(horizonPolicy),
      coreHorizon = createJobQueue(horizonPolicy, "horizon"),
      outHorizon = horizon.createQueue("horizon");
    for (const queue of [coreHorizon, outHorizon]) {
      for (let i = 0; i < 128; i++)
        queue.apply({ type: "advance", ms: MAX_QUEUE_SPAN });
      queue.apply({
        type: "advance",
        ms: MAX_QUEUE_TIME - queue.summary().nowMs - 100,
      });
      queue.apply({ type: "enqueue", job: newQueueInput() });
      expect(
        queue.apply({ type: "poll", worker: "worker", limit: 1 }).jobs[0].lease
          ?.untilMs,
      ).toBe(MAX_QUEUE_TIME);
      expect(
        queue.apply({
          type: "heartbeat",
          job: "job-1",
          worker: "worker",
          receipt: "horizon:1",
        }).jobs[0].lease?.untilMs,
      ).toBe(MAX_QUEUE_TIME);
      queue.apply({ type: "advance", ms: 100 });
    }
    expect(outHorizon.snapshot()).toEqual(coreHorizon.snapshot());
    const p = demoQueueProject(),
      e = await artifact(p.definition);
    for (const c of p.scenarios) {
      const core = createJobQueue(p.definition, "replay"),
        out = e.createQueue("replay");
      for (const s of c.steps) {
        expect(out.apply(s)).toEqual(core.apply(s));
        expect(out.snapshot()).toEqual(core.snapshot());
        expect(out.summary()).toEqual(core.summary());
      }
    }
  });
  it("matches seeded mixed operations, group/priority policies and malformed command transactions", async () => {
    let seed = 42;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (const order of ["fifo", "priority"] as const) {
      const d: QueueDefinition = {
          ...newQueueDefinition(),
          order,
          serialGroups: true,
          capacity: 8,
          retentionMs: 4000,
        },
        e = await artifact(d),
        core = createJobQueue(d, "native"),
        out = e.createQueue("native");
      for (let i = 0; i < 220; i++) {
        const jobs = core.snapshot().jobs,
          j = jobs[random() % Math.max(1, jobs.length)],
          kind = random() % 9;
        const command =
          kind < 2
            ? {
                type: "enqueue",
                job: {
                  ...newQueueInput(`job-${random() % 12}`),
                  group: `g-${random() % 3}`,
                  priority: random() % 5,
                  delayMs: random() % 100,
                },
              }
            : kind === 2
              ? { type: "poll", worker: `w-${random() % 3}`, limit: 3 }
              : kind === 3
                ? { type: "advance", ms: random() % 1000 }
                : kind === 4
                  ? { type: "purge" }
                  : kind === 5
                    ? { type: "redrive", job: j?.id ?? "missing", delayMs: 0 }
                    : kind === 6
                      ? { type: "cancel", job: j?.id ?? "missing" }
                      : {
                          type: kind === 7 ? "ack" : "nack",
                          job: j?.id ?? "missing",
                          worker: j?.lease?.worker ?? "w-0",
                          receipt: j?.lease?.receipt ?? "stale",
                        };
        expect(out.apply(command)).toEqual(core.apply(command));
        expect(out.snapshot()).toEqual(core.snapshot());
      }
      for (const q of [core, out]) {
        const before = q.snapshot();
        expect(() => q.apply({ type: "advance", ms: -1 })).toThrow("step");
        expect(q.snapshot()).toEqual(before);
      }
    }
  });
  it("exports metadata safely without fixtures and performs no network or persistent writes", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    try {
      const d = newQueueDefinition();
      d.name = "</script>\u2028\u2029";
      const e = await artifact(d);
      expect(e.source).not.toContain("</script>");
      expect(e.source).not.toContain("\u2028");
      expect(e.source).not.toMatch(
        /send-email|poison|account-a|localStorage|fetch\(/,
      );
      expect(() => e.createQueue("")).toThrow("definition");
      e.createQueue("safe").apply({ type: "advance", ms: 1 });
      expect(fetcher).not.toHaveBeenCalled();
      expect(storage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      storage.mockRestore();
    }
  });
  it("serves only explicit status and command routes with useful response codes and no payloads in status", async () => {
    const e = await artifact(),
      q = e.createQueue("api"),
      handle = e.createQueueHandler(q),
      url = "https://queue.example/queue/commands",
      post = (v: unknown) =>
        handle(
          new Request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(v),
          }),
        );
    expect(
      (await handle(new Request("https://queue.example/unknown"))).status,
    ).toBe(404);
    const method = await handle(new Request(url));
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("POST");
    expect(
      (await handle(new Request(url, { method: "POST", body: "{}" }))).status,
    ).toBe(415);
    expect((await post({ type: "enqueue", job: newQueueInput() })).status).toBe(
      200,
    );
    const leased = await (
      await post({ type: "poll", worker: "worker", limit: 1 })
    ).json();
    expect(leased.jobs[0].lease.receipt).toBe("api:1");
    expect(
      (
        await post({
          type: "ack",
          job: "job-1",
          worker: "worker",
          receipt: "stale",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post({
          type: "ack",
          job: "job-1",
          worker: "worker",
          receipt: "api:1",
        })
      ).status,
    ).toBe(200);
    const status = await handle(
      new Request("https://queue.example/queue/status"),
    );
    expect(await status.json()).toMatchObject({
      done: 1,
      metrics: { acked: 1 },
    });
    expect(status.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(q.summary())).not.toMatch(
      /send-email|worker|receipt|payload/,
    );
  });
  it("bounds incoming bodies before mutation, validates JSON/UTF-8 and never consumes an oversized command", async () => {
    const e = await artifact(),
      q = e.createQueue("api"),
      handle = e.createQueueHandler(q),
      post = (body: BodyInit) =>
        handle(
          new Request("https://queue.example/queue/commands", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          }),
        );
    expect((await post("{")).status).toBe(400);
    expect((await post(new Uint8Array([255]))).status).toBe(400);
    expect((await post("x".repeat(16385))).status).toBe(413);
    expect(q.summary().commands).toBe(0);
  });
  it("exports a usable independent OpenAPI 3.1 contract with every command and documented failures", () => {
    const source = generateQueueOpenApi(newQueueDefinition()),
      parsed = parseOpenApiSchema(JSON.stringify(source));
    expect(parsed.ok).toBe(true);
    if (parsed.ok)
      expect(
        parsed.value.endpoints.map((e) => `${e.method} ${e.path}`),
      ).toEqual(
        expect.arrayContaining(["GET /queue/status", "POST /queue/commands"]),
      );
    const post = source.paths["/queue/commands"].post;
    expect(
      post.requestBody.content["application/json"].schema.oneOf,
    ).toHaveLength(9);
    expect(post.responses["409"].description).toContain("stale");
    expect(JSON.stringify(source)).not.toMatch(/send-email|worker-a|replay:1/);
  });
});
