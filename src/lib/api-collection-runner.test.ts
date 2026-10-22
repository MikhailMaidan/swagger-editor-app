import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CollectionError,
  defaultCollectionPlan,
  demoCollectionProject,
  type CollectionFixture,
} from "./api-collection";
import {
  collectionFixturesFromRun,
  collectionRunReport,
  runCollection,
} from "./api-collection-runner";

afterEach(() => vi.useRealTimers());
const plan = () => ({
  ...defaultCollectionPlan(),
  deduplicate: "none" as const,
});
const fixture = (
  body: string,
  patch: Partial<CollectionFixture> = {},
): CollectionFixture => ({
  id: "one",
  name: "One",
  url: plan().url,
  status: 200,
  headers: { "content-type": "application/json" },
  body,
  ...patch,
});
const response = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...headers },
  });
describe("API collection runner", () => {
  it("collects all five demo plans entirely offline with coverage and duplicate checks", async () => {
    const demo = demoCollectionProject(),
      fetcher = vi.fn();
    const runs = [];
    for (const p of demo.plans)
      runs.push(
        await runCollection(p, {
          mode: "offline",
          fixtures: demo.fixtures,
          fetcher,
        }),
      );
    expect(fetcher).not.toHaveBeenCalled();
    for (const run of runs) {
      expect(run).toMatchObject({
        reason: "complete",
        passed: true,
        received: 4,
        duplicates: 1,
      });
      expect(run.pages).toHaveLength(3);
      expect(run.records).toHaveLength(3);
      expect(run.checks.at(-1)).toMatchObject({
        passed: true,
        checked: 3,
        failed: 0,
      });
    }
    expect(collectionRunReport(runs)).toMatchObject({
      complete: true,
      total: 5,
      completed: 5,
      passed: 5,
      failed: 0,
    });
  });
  it.each(["first", "last", "error", "none"] as const)(
    "applies %s duplicate policy within and across pages",
    async (deduplicate) => {
      const p = { ...plan(), deduplicate },
        items = [
          { id: 1, value: "first" },
          { id: 1, value: "last" },
          { id: 2 },
        ];
      const run = await runCollection(p, {
        mode: "offline",
        fixtures: [fixture(JSON.stringify({ items }))],
      });
      if (deduplicate === "error")
        expect(run).toMatchObject({
          reason: "duplicate",
          records: [],
          received: 0,
        });
      else {
        expect(run.records).toHaveLength(deduplicate === "none" ? 3 : 2);
        expect(run.records[0]).toEqual(
          deduplicate === "last" ? items[1] : items[0],
        );
        expect(run.duplicates).toBe(deduplicate === "none" ? 0 : 1);
      }
    },
  );
  it("distinguishes typed scalar IDs, supports false/zero/null, and fails a missing ID atomically", async () => {
    const p = { ...plan(), deduplicate: "first" as const },
      items = [{ id: 1 }, { id: "1" }, { id: false }, { id: 0 }, { id: null }];
    const run = await runCollection(p, {
      mode: "offline",
      fixtures: [fixture(JSON.stringify({ items }))],
    });
    expect(run.records).toHaveLength(5);
    const invalid = await runCollection(p, {
      mode: "offline",
      fixtures: [fixture(JSON.stringify({ items: [...items, {}] }))],
    });
    expect(invalid).toMatchObject({
      reason: "identity",
      records: [],
      received: 0,
    });
  });
  it("detects loops even when query keys change order", async () => {
    const p = { ...plan(), url: "https://api.example/items?a=1&b=2" };
    const run = await runCollection(p, {
      mode: "offline",
      fixtures: [fixture('{"items":[1],"next":"?b=2&a=1"}', { url: p.url })],
    });
    expect(run).toMatchObject({ reason: "loop", records: [1], passed: false });
    expect(run.pages).toHaveLength(1);
  });
  it("blocks cross-origin links before any second request or header disclosure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ items: [1], next: "https://other.example/items" }),
      );
    const run = await runCollection(plan(), {
      mode: "live",
      headers: '{"Authorization":"Bearer private"}',
      fetcher,
    });
    expect(run.reason).toBe("origin");
    expect(run.records).toEqual([1]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0][1]!;
    expect(init).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      mode: "cors",
    });
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer private",
    );
  });
  it("uses relative Link navigation in live mode and permits empty intermediate pages", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ items: [] }, { Link: '<?page=2>; rel="next"' }),
      )
      .mockResolvedValueOnce(response({ items: [1] }));
    const run = await runCollection(
      { ...plan(), strategy: "link" },
      { mode: "live", fetcher },
    );
    expect(run).toMatchObject({
      reason: "complete",
      passed: true,
      records: [1],
    });
    expect(fetcher.mock.calls[1][0]).toBe("https://api.example/items?page=2");
  });
  it.each([
    { patch: { maxPages: 1 }, reason: "max-pages", count: 1 },
    { patch: { maxRecords: 1 }, reason: "max-records", count: 1 },
    { patch: { maxRecords: 1 }, reason: "max-records", count: 2 },
    { patch: { maxBytes: 10 }, reason: "max-bytes", count: 1 },
  ])(
    "enforces limits without treating truncated traversal as passing: $reason $count",
    async ({ patch, reason, count }) => {
      const run = await runCollection(
        { ...plan(), ...patch },
        {
          mode: "offline",
          fixtures: [
            fixture(
              JSON.stringify({
                items: Array.from({ length: count }, (_, i) => i),
                next: "?page=2",
              }),
            ),
          ],
        },
      );
      expect(run.reason).toBe(reason);
      expect(run.passed).toBe(false);
      expect(run.pages).toHaveLength(1);
      if (reason === "max-records" && count === 2)
        expect(run.records).toEqual([]);
    },
  );
  it("allows exact record/page caps when continuation ends", async () => {
    const run = await runCollection(
      { ...plan(), maxPages: 1, maxRecords: 1 },
      { mode: "offline", fixtures: [fixture('{"items":[1]}')] },
    );
    expect(run).toMatchObject({
      reason: "complete",
      passed: true,
      records: [1],
    });
  });
  it.each([
    ["status", fixture("{}", { status: 500 })],
    [
      "content-type",
      fixture("{}", { headers: { "content-type": "text/html" } }),
    ],
    ["json", fixture("{broken")],
    ["items", fixture('{"items":{}}')],
    ["cursor", fixture('{"items":[],"next":42}')],
  ] as const)("reports %s failures with a rejected page", async (reason, f) => {
    const run = await runCollection(plan(), { mode: "offline", fixtures: [f] });
    expect(run.reason).toBe(reason);
    expect(run.passed).toBe(false);
    expect(run.pages[0].issue).toBe(reason);
  });
  it("reports a missing offline fixture instead of falling back to live traffic", async () => {
    const fetcher = vi.fn();
    const run = await runCollection(plan(), {
      mode: "offline",
      fixtures: [],
      fetcher,
    });
    expect(run.reason).toBe("fixture");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("checks each record and rejects empty selections for record assertions", async () => {
    const p = {
      ...plan(),
      minRecords: 0,
      assertions: [
        {
          name: "ID number",
          target: "body" as const,
          path: "/id",
          operator: "type" as const,
          expected: "number",
        },
      ],
    };
    const run = await runCollection(p, {
      mode: "offline",
      fixtures: [fixture('{"items":[{"id":1},{"id":"wrong"}]}')],
    });
    expect(run.reason).toBe("complete");
    expect(run.passed).toBe(false);
    expect(run.checks.at(-1)).toMatchObject({
      checked: 2,
      failed: 1,
      passed: false,
    });
    const empty = await runCollection(p, {
      mode: "offline",
      fixtures: [fixture('{"items":[]}')],
    });
    expect(empty.checks.at(-1)).toMatchObject({ checked: 0, passed: false });
  });
  it("validates unique-count and duplicate acceptance budgets separately from safety caps", async () => {
    const p = {
      ...plan(),
      deduplicate: "first" as const,
      minRecords: 3,
      maxDuplicates: 0,
    };
    const run = await runCollection(p, {
      mode: "offline",
      fixtures: [fixture('{"items":[{"id":1},{"id":1}]}')],
    });
    expect(run.reason).toBe("complete");
    expect(run.checks.slice(1, 3).map((c) => c.passed)).toEqual([false, false]);
  });
  it("cancels an uncooperative fetch and disposes any late response", async () => {
    const abort = new AbortController(),
      cancel = vi.fn();
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = runCollection(plan(), {
      mode: "live",
      fetcher,
      signal: abort.signal,
    });
    await Promise.resolve();
    abort.abort();
    expect((await pending).reason).toBe("cancelled");
    resolve(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
  it("cancels stalled body reads promptly and preserves previously completed pages", async () => {
    const abort = new AbortController(),
      cancel = vi.fn(),
      onPage = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ items: [1], next: "?page=2" }))
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    const pending = runCollection(plan(), {
      mode: "live",
      fetcher,
      signal: abort.signal,
      onPage,
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    abort.abort();
    const run = await pending;
    expect(run).toMatchObject({
      reason: "cancelled",
      records: [1],
      received: 1,
    });
    expect(run.pages).toHaveLength(2);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("times out stalled requests and cleans up timers", async () => {
    vi.useFakeTimers();
    const pending = runCollection(
      { ...plan(), requestTimeoutMs: 100, durationMs: 500 },
      {
        mode: "live",
        fetcher: vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
      },
    );
    await vi.advanceTimersByTimeAsync(110);
    expect((await pending).reason).toBe("timeout");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not issue an initial request when already cancelled", async () => {
    const abort = new AbortController();
    abort.abort();
    const fetcher = vi.fn();
    const run = await runCollection(plan(), {
      mode: "live",
      fetcher,
      signal: abort.signal,
    });
    expect(run.reason).toBe("cancelled");
    expect(run.pages).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancels rejected HTTP and MIME response bodies", async () => {
    for (const opts of [
      { status: 503 },
      { headers: { "Content-Type": "text/html" } },
    ]) {
      const cancel = vi.fn(),
        fetcher = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            new Response(new ReadableStream({ cancel }), opts),
          );
      const run = await runCollection(plan(), { mode: "live", fetcher });
      expect(["status", "content-type"]).toContain(run.reason);
      expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it("bounds response bytes while streaming and cancels oversized reads", async () => {
    const cancel = vi.fn(),
      fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(" ".repeat(32)));
            },
            cancel,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    const run = await runCollection(
      { ...plan(), maxBytes: 10 },
      { mode: "live", fetcher },
    );
    expect(run.reason).toBe("max-bytes");
    expect(run.bytes).toBe(32);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects invalid UTF-8 and preserves native network failures", async () => {
    const invalid = new Response(new Uint8Array([255]), {
      headers: { "Content-Type": "application/json" },
    });
    expect(
      (
        await runCollection(plan(), {
          mode: "live",
          fetcher: vi.fn().mockResolvedValueOnce(invalid),
        })
      ).reason,
    ).toBe("json");
    expect(
      (
        await runCollection(plan(), {
          mode: "live",
          fetcher: vi.fn().mockRejectedValueOnce(new Error("secret URL")),
        })
      ).reason,
    ).toBe("network");
  });
  it("exports value-free reports and replays recorded pages without response credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          { items: [{ id: "secret-payload" }] },
          { "Set-Cookie": "session=secret", "X-Private": "secret" },
        ),
      );
    const live = await runCollection(
      { ...plan(), url: plan().url + "?token=secret-query" },
      { mode: "live", headers: '{"Authorization":"secret-header"}', fetcher },
    );
    const report = collectionRunReport([live], 2);
    expect(report.complete).toBe(false);
    expect(JSON.stringify(report)).not.toContain("secret");
    const fixtures = collectionFixturesFromRun(live);
    expect(fixtures[0].headers).toEqual({ "content-type": "application/json" });
    const replay = await runCollection(
      { ...plan(), url: live.pages[0].url },
      { mode: "offline", fixtures },
    );
    expect(replay.records).toEqual(live.records);
    expect(replay.passed).toBe(true);
  });
  it("rejects invalid plans, headers, and duplicate fixtures before execution", async () => {
    await expect(
      runCollection({ ...plan(), maxPages: 0 }, { mode: "live" }),
    ).rejects.toThrow(CollectionError);
    await expect(
      runCollection(plan(), { mode: "live", headers: "[]" }),
    ).rejects.toThrow(CollectionError);
    await expect(
      runCollection(plan(), {
        mode: "offline",
        fixtures: [fixture("{}"), fixture("{}")],
      }),
    ).rejects.toThrow(CollectionError);
  });
});
