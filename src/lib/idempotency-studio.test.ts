import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdempotencyStore, idemFingerprint } from "./idempotency-engine";
import {
  MAX_IDEM_BYTES,
  emptyIdemProject,
  idemJson,
  newIdemPolicy,
  newIdemRequest,
  normalizeIdemProject,
  parseIdemProject,
  serializeIdemProject,
} from "./idempotency-project";
import {
  demoIdemProject,
  generateIdemTraffic,
  idemReport,
  runIdemMatrix,
} from "./idempotency-studio";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
const input = (patch = {}) => ({
  ...newIdemRequest(),
  fingerprint: "a".repeat(64),
  bytes: 3,
  ...patch,
});
const finish = (
  store: ReturnType<typeof createIdempotencyStore>,
  token: number,
  now = 100,
  patch = {},
) =>
  store.finish(token, now, {
    status: 201,
    bytes: 2,
    payload: "OK",
    failed: false,
    ...patch,
  });
describe("idempotency reservation state machine", () => {
  it("reserves once, rejects conflicts, replays the original and expires from completion without refresh", () => {
    const store = createIdempotencyStore(newIdemPolicy()),
      first = store.admit(input(), 0);
    expect(first.outcome).toBe("execute");
    expect(store.admit(input(), 1).outcome).toBe("in-flight");
    expect(store.admit(input({ fingerprint: "b".repeat(64) }), 2).outcome).toBe(
      "conflict",
    );
    finish(store, first.token!);
    expect(store.admit(input(), 1099).outcome).toBe("replay");
    expect(store.replay(first.token!)).toBe("OK");
    expect(store.admit(input(), 1100).outcome).toBe("execute");
    expect(store.replay(first.token!)).toBeUndefined();
  });
  it("never expires or evicts pending work, and reports finite capacity waits only for completed entries", () => {
    const store = createIdempotencyStore({
      ...newIdemPolicy(),
      maxEntries: 1,
      ttlMs: 1,
    });
    const first = store.admit(input(), 0);
    expect(store.admit(input({ key: "new" }), 10000)).toMatchObject({
      outcome: "capacity",
      retryAfterMs: null,
    });
    expect(store.admit(input(), 10001).outcome).toBe("in-flight");
    finish(store, first.token!, 10002);
    expect(store.admit(input({ key: "new" }), 10002)).toMatchObject({
      outcome: "capacity",
      retryAfterMs: 1,
    });
    expect(store.admit(input({ key: "new" }), 10003).outcome).toBe("execute");
  });
  it("bounds waiter slots and releases only the selected reservation", () => {
    const store = createIdempotencyStore({
        ...newIdemPolicy(),
        inFlight: "wait",
        maxWaiters: 1,
      }),
      token = store.admit(input(), 0).token!;
    expect(store.admit(input(), 1).outcome).toBe("wait");
    expect(store.admit(input(), 2).outcome).toBe("wait-capacity");
    store.release(token);
    expect(store.admit(input(), 3).outcome).toBe("wait");
    store.release(token);
    store.release(token);
    expect(store.inspect()[0].waiters).toBe(0);
  });
  it.each([{ failed: true }, { status: 500 }, { bytes: 4097 }])(
    "retains an unreplayable reservation for %j",
    (patch) => {
      const store = createIdempotencyStore(newIdemPolicy()),
        token = store.admit(input(), 0).token!;
      expect(finish(store, token, 1, patch)).toBe("unreplayable");
      expect(store.admit(input(), 2)).toMatchObject({
        outcome: "unreplayable",
        retryAfterMs: 999,
      });
      expect(store.replay(token)).toBeUndefined();
    },
  );
  it("can cache non-2xx responses explicitly while failed handlers remain unreplayable", () => {
    const store = createIdempotencyStore({
        ...newIdemPolicy(),
        cacheErrors: true,
      }),
      token = store.admit(input(), 0).token!;
    expect(finish(store, token, 1, { status: 503 })).toBe("cached");
    expect(store.admit(input(), 2).outcome).toBe("replay");
  });
  it("isolates clients/routes with tuple keys, and client-wide keys conflict across route fingerprints", () => {
    const q = input(),
      store = createIdempotencyStore(newIdemPolicy());
    store.admit(q, 0);
    expect(store.admit({ ...q, client: "other" }, 0).outcome).toBe("execute");
    expect(store.admit({ ...q, route: "/other" }, 0).outcome).toBe("execute");
    const broad = createIdempotencyStore({
      ...newIdemPolicy(),
      scope: "client",
    });
    broad.admit(q, 0);
    expect(
      broad.admit({ ...q, route: "/other", fingerprint: "b".repeat(64) }, 0)
        .outcome,
    ).toBe("conflict");
    const a = input({ client: "a,b", key: "c" }),
      b = input({ client: "a", key: "b,c" });
    const separate = createIdempotencyStore(newIdemPolicy());
    expect(separate.admit(a, 0).token).not.toBe(separate.admit(b, 0).token);
  });
  it("handles missing keys, read-only bypass and request byte limits before reserving anything", () => {
    const store = createIdempotencyStore({
      ...newIdemPolicy(),
      maxRequestBytes: 2,
    });
    expect(store.admit(input({ key: "" }), 0).outcome).toBe("missing");
    expect(store.admit(input({ method: "GET" }), 0).outcome).toBe("bypass");
    expect(store.admit(input(), 0).outcome).toBe("body-limit");
    expect(store.inspect()).toEqual([]);
    expect(
      createIdempotencyStore({
        ...newIdemPolicy(),
        missingKey: "bypass",
      }).admit(input({ key: "" }), 0).outcome,
    ).toBe("bypass");
  });
  it("rejects invalid clocks/identities/finishes and snapshots policy settings", () => {
    const policy = newIdemPolicy(),
      store = createIdempotencyStore(policy),
      token = store.admit(input(), 10).token!;
    policy.inFlight = "wait";
    expect(store.admit(input(), 11).outcome).toBe("in-flight");
    expect(() => store.admit(input(), 9)).toThrow("clock");
    expect(() => store.admit(input({ key: "bad key" }), 12)).toThrow("input");
    expect(() => finish(store, token, 12, { status: 100 })).toThrow();
    finish(store, token, 12);
    expect(() => finish(store, token, 13)).toThrow();
  });
  it("fingerprints exact bytes and method/route/content-type boundaries without client/key values", async () => {
    const q = newIdemRequest(),
      bytes = new TextEncoder().encode(q.body),
      digest = await idemFingerprint(q, bytes);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await idemFingerprint({ ...q, key: "another", client: "another" }, bytes),
    ).toBe(digest);
    for (const changed of [
      { ...q, method: "PUT" },
      { ...q, route: "/other" },
      { ...q, contentType: "text/plain" },
    ])
      expect(await idemFingerprint(changed, bytes)).not.toBe(digest);
    expect(
      await idemFingerprint(q, new TextEncoder().encode(q.body + " ")),
    ).not.toBe(digest);
  });
});
describe("duplicate-write rehearsals", () => {
  it("passes all twenty demo comparisons with distinct concurrent/replay/error/scoping outcomes", async () => {
    const runs = await runIdemMatrix(demoIdemProject());
    expect(runs).toHaveLength(20);
    expect(runs.every((r) => r.passed)).toBe(true);
    const wait = runs.find(
      (r) => r.policyId === "wait" && r.scenarioId === "duplicate-orders",
    )!;
    expect(wait.rows.map((r) => r.outcome)).toEqual([
      "executed",
      "joined",
      "replayed",
      "conflict",
      "executed",
    ]);
    expect(wait.executions).toBe(2);
    expect(wait.rows[1].response?.sourceId).toBe("first");
  });
  it("resolves completions before equal-time deadlines and new arrivals", async () => {
    const p = emptyIdemProject();
    p.policies[0].inFlight = "wait";
    p.policies[0].waitMs = 50;
    const first = { ...newIdemRequest(), durationMs: 100 };
    p.scenarios[0].requests = [
      first,
      { ...first, id: "wait", name: "wait", atMs: 50 },
      { ...first, id: "boundary", name: "boundary", atMs: 100 },
    ];
    expect((await runIdemMatrix(p))[0].rows.map((r) => r.outcome)).toEqual([
      "executed",
      "joined",
      "replayed",
    ]);
  });
  it("enforces budgets including zero and distinguishes unchecked expectations", async () => {
    const p = emptyIdemProject();
    p.scenarios[0].budgets.maxExecutions = 0;
    const r = (await runIdemMatrix(p))[0];
    expect(r.passed).toBe(false);
    expect(r.checked).toBe(0);
    expect(r.checks[0]).toMatchObject({ actual: 1, limit: 0, passed: false });
    p.scenarios[0].requests[0].expect["policy-1"] = "replayed";
    expect((await runIdemMatrix(p))[0].failedChecks).toBe(1);
  });
  it("reports metrics/optional decisions without captured bodies, fingerprints or identities", async () => {
    const runs = await runIdemMatrix(emptyIdemProject());
    for (const details of [true, false]) {
      const report = idemReport(runs, details);
      for (const secret of [
        "client-a",
        "/orders",
        "order-1",
        "application/json",
        "order-created",
        "book",
      ])
        expect(report).not.toContain(secret);
      expect(JSON.parse(report).comparisons[0].rows === undefined).toBe(
        !details,
      );
    }
  });
  it("cancels atomically, snapshots projects and supports empty arrival schedules", async () => {
    const p = emptyIdemProject();
    let cancelled = false;
    await expect(
      runIdemMatrix(
        p,
        undefined,
        () => cancelled,
        () => {
          cancelled = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    const run = runIdemMatrix(p);
    p.scenarios[0].requests = [];
    expect((await run)[0].total).toBe(1);
    expect((await runIdemMatrix(p))[0].total).toBe(0);
    await expect(runIdemMatrix(p, "missing")).rejects.toThrow();
  });
  it("validates portable projects and generator limits without trusting imported state", () => {
    const p = emptyIdemProject();
    expect(
      parseIdemProject(
        JSON.stringify({
          ...p,
          runtime: { tokens: ["secret"] },
          results: [{}],
        }),
      ),
    ).toEqual(p);
    expect(parseIdemProject(serializeIdemProject(p))).toEqual(p);
    expect(() => idemJson(" ".repeat(MAX_IDEM_BYTES + 1))).toThrow();
    expect(() => parseIdemProject("{")).toThrow();
    expect(() =>
      normalizeIdemProject({ ...p, policies: [p.policies[0], p.policies[0]] }),
    ).toThrow();
    p.scenarios[0].requests[0].expect.unknown = "executed";
    expect(() => normalizeIdemProject(p)).toThrow();
    const generated = generateIdemTraffic(4, 10, 2, 100);
    expect(generated.map((r) => r.key)).toEqual([
      "key-1",
      "key-2",
      "key-1",
      "key-2",
    ]);
    expect(generated.map((r) => r.atMs)).toEqual([0, 10, 20, 30]);
    expect(() => generateIdemTraffic(201, 0, 1, 0)).toThrow();
    expect(() => generateIdemTraffic(2, 86400001, 1, 0)).toThrow();
  });
});
