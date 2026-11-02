import { describe, expect, it, vi } from "vitest";
import { generateSyncOpenApi, generateSyncToolkit } from "./sync-export";
import {
  emptySyncState,
  mergeSyncStates,
  mutateSyncState,
  projectSyncState,
} from "./sync-engine";
import {
  newSyncDefinition,
  type SyncState,
  type SyncStep,
  MAX_SYNC_STATE,
} from "./sync-model";
import { parseOpenApiSchema } from "./openapi";
type Replica = {
  snapshot: () => SyncState;
  view: () => ReturnType<typeof projectSyncState>;
  apply: (op: unknown) => SyncState;
  merge: (s: unknown) => SyncState;
};
type Transport = {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: HeadersInit;
};
async function artifact() {
  const source = generateSyncToolkit(newSyncDefinition()),
    exported = (await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )) as {
      createReplica: (actor: string, initial?: unknown) => Replica;
      mergeStates: (a: unknown, b: unknown) => SyncState;
      normalizeState: (s: unknown) => SyncState;
      projectState: (s: unknown) => ReturnType<typeof projectSyncState>;
      createSyncResponder: (a: {
        read: () => unknown | Promise<unknown>;
        transact: (
          update: (s: SyncState | null) => SyncState,
        ) => SyncState | Promise<SyncState>;
      }) => (r: Request) => Promise<Response>;
      synchronizeReplica: (
        r: Replica,
        url: string,
        o?: Transport,
      ) => Promise<SyncState>;
    };
  return { source, ...exported };
}
describe("standalone synchronization toolkit", () => {
  it("executes native ESM with core parity across independent mutation and merge histories", async () => {
    const e = await artifact(),
      d = newSyncDefinition(),
      replicas = d.actors.map((a) => e.createReplica(a.id)),
      states = d.actors.map(() => emptySyncState(d));
    let seed = 123;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 100; i++) {
      const who = rand() % 3,
        actor = d.actors[who].id,
        kind = rand() % 6;
      if (kind === 0) {
        const from = (who + 1) % 3;
        states[who] = mergeSyncStates(d, states[who], states[from]);
        replicas[who].merge(replicas[from].snapshot());
      } else {
        const step: SyncStep =
          kind === 1
            ? {
                type: "increment",
                actor,
                field: "count",
                amount: (rand() % 7) + 1,
              }
            : kind === 2
              ? {
                  type: "assign",
                  actor,
                  field: "status",
                  value: { n: rand() % 5 },
                }
              : kind === 3
                ? { type: "clear", actor, field: "status" }
                : {
                    type: kind === 4 ? "add" : "remove",
                    actor,
                    field: "labels",
                    value: String(rand() % 8),
                  };
        states[who] = mutateSyncState(d, states[who], step);
        replicas[who].apply(step);
      }
      for (let n = 0; n < 3; n++) {
        expect(replicas[n].snapshot()).toEqual(states[n]);
        expect(replicas[n].view()).toEqual(projectSyncState(d, states[n]));
      }
    }
    expect(e.mergeStates(states[0], states[1])).toEqual(
      mergeSyncStates(d, states[0], states[1]),
    );
  });
  it("protects internal snapshots, actor ownership and atomic mutation/merge failures", async () => {
    const e = await artifact(),
      r = e.createReplica("alpha"),
      initial = r.snapshot();
    r.apply({ type: "increment", field: "count", amount: 2, actor: "beta" });
    expect(r.view().count).toEqual({ type: "counter", value: 2 });
    expect(r.snapshot().fields.count).toMatchObject({ positive: { alpha: 2 } });
    expect(initial).toEqual(e.createReplica("alpha").snapshot());
    const snapshot = r.snapshot();
    snapshot.fields.count = {
      type: "counter",
      positive: { alpha: 500 },
      negative: {},
    };
    expect(r.view().count).toEqual({ type: "counter", value: 2 });
    r.apply({ type: "assign", field: "status", value: "one" });
    const before = r.snapshot(),
      fork = e.createReplica("alpha");
    fork.apply({ type: "assign", field: "status", value: "other" });
    expect(() => r.merge(fork.snapshot())).toThrow("equivocation");
    expect(r.snapshot()).toEqual(before);
    for (const value of ["x".repeat(2048), "\n".repeat(1024), NaN, new Date()])
      expect(() =>
        r.apply({ type: "assign", field: "status", value }),
      ).toThrow();
    expect(r.snapshot()).toEqual(before);
  });
  it("serves an atomic merge endpoint and converges under duplicate concurrent POSTs", async () => {
    const e = await artifact();
    let stored: SyncState | null = null,
      tail = Promise.resolve();
    let commits = 0;
    const handler = e.createSyncResponder({
      read: () => stored,
      transact: (updater) => {
        const result = tail.then(() => {
          const next = updater(stored);
          stored = next;
          commits++;
          return next;
        });
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    });
    const a = e.createReplica("alpha"),
      b = e.createReplica("beta");
    a.apply({ type: "increment", field: "count", amount: 3 });
    b.apply({ type: "increment", field: "count", amount: 5 });
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        handler(
          new Request("https://example.test/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(i % 2 ? a.snapshot() : b.snapshot()),
          }),
        ),
      ),
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(commits).toBe(20);
    const response = await handler(new Request("https://example.test/sync"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(e.projectState(await response.json()).count).toEqual({
      type: "counter",
      value: 8,
    });
  });
  it("refuses malformed/equivocating/oversized HTTP input and does not expose storage errors", async () => {
    const e = await artifact(),
      a = e.createReplica("alpha"),
      b = e.createReplica("alpha");
    a.apply({ type: "assign", field: "status", value: "one" });
    b.apply({ type: "assign", field: "status", value: "two" });
    let stored = a.snapshot();
    const before = JSON.stringify(stored),
      transaction = vi.fn((fn: (s: SyncState | null) => SyncState) => {
        stored = fn(stored);
        return stored;
      });
    const handler = e.createSyncResponder({
      read: () => stored,
      transact: transaction,
    });
    const post = (
      body: string,
      headers: HeadersInit = { "Content-Type": "application/json" },
    ) =>
      handler(
        new Request("https://example.test/sync", {
          method: "POST",
          headers,
          body,
        }),
      );
    expect((await post(JSON.stringify(b.snapshot()))).status).toBe(409);
    expect(JSON.stringify(stored)).toBe(before);
    expect((await post("{")).status).toBe(400);
    expect((await post("{}", { "Content-Type": "text/plain" })).status).toBe(
      415,
    );
    expect(
      (
        await post("{}", {
          "Content-Type": "application/json",
          "Content-Length": String(MAX_SYNC_STATE + 1),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await handler(
          new Request("https://example.test/sync", { method: "DELETE" }),
        )
      ).status,
    ).toBe(405);
    const failed = e.createSyncResponder({
        read: () => {
          throw new Error("private database token");
        },
        transact: transaction,
      }),
      response = await failed(new Request("https://example.test/sync"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private");
  });
  it("merges transport responses into current local state instead of overwriting concurrent local edits", async () => {
    const e = await artifact(),
      a = e.createReplica("alpha"),
      b = e.createReplica("beta");
    a.apply({ type: "increment", field: "count", amount: 2 });
    b.apply({ type: "increment", field: "count", amount: 5 });
    let resolve!: (r: Response) => void;
    const fetcher = vi.fn<NonNullable<Transport["fetch"]>>(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    const promise = e.synchronizeReplica(a, "https://example.test/sync", {
      fetch: fetcher,
    });
    const sent = JSON.parse(fetcher.mock.calls[0][1].body as string);
    a.apply({ type: "increment", field: "count", amount: 4 });
    resolve(
      new Response(JSON.stringify(e.mergeStates(sent, b.snapshot())), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await promise;
    expect(a.view().count).toEqual({ type: "counter", value: 11 });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
    });
  });
  it("leaves replicas intact after invalid transport responses, cancellation, timeout or response overflow", async () => {
    const e = await artifact(),
      r = e.createReplica("alpha"),
      before = r.snapshot(),
      calls = vi.fn();
    const stop = new AbortController();
    stop.abort(new Error("stopped"));
    await expect(
      e.synchronizeReplica(r, "https://example.test/sync", {
        fetch: calls,
        signal: stop.signal,
      }),
    ).rejects.toThrow("stopped");
    expect(calls).not.toHaveBeenCalled();
    await expect(e.synchronizeReplica(r, "file:///secret")).rejects.toThrow(
      "url",
    );
    await expect(
      e.synchronizeReplica(r, "https://u:p@example.test"),
    ).rejects.toThrow("url");
    await expect(
      e.synchronizeReplica(r, "https://example.test/sync", {
        fetch: async () =>
          new Response("{}", {
            headers: { "Content-Type": "application/json" },
          }),
      }),
    ).rejects.toThrow("state");
    await expect(
      e.synchronizeReplica(r, "https://example.test/sync", {
        timeoutMs: 5,
        fetch: async (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener(
              "abort",
              () => reject(init.signal!.reason),
              { once: true },
            ),
          ),
      }),
    ).rejects.toThrow("deadline");
    let cancelled = false;
    await expect(
      e.synchronizeReplica(r, "https://example.test/sync", {
        fetch: async () =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new Uint8Array(MAX_SYNC_STATE + 1));
              },
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      }),
    ).rejects.toThrow("limit");
    expect(cancelled).toBe(true);
    expect(r.snapshot()).toEqual(before);
  });
  it("generates usable OpenAPI and serializes definitions without playground fixtures or import side effects", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      const e = await artifact();
      expect(fetcher).not.toHaveBeenCalled();
      expect(e.source).not.toContain("approved");
      expect(e.source).not.toContain("scenario-1");
      expect(e.source).not.toMatch(/localStorage|sessionStorage|eval\(/);
      const api = generateSyncOpenApi(newSyncDefinition()),
        parsed = parseOpenApiSchema(JSON.stringify(api));
      expect(parsed.ok).toBe(true);
      if (parsed.ok)
        expect(parsed.value.endpoints.map((e) => e.method)).toEqual([
          "GET",
          "POST",
        ]);
      expect(api.components.schemas.SyncState.properties.schema.const).toBe(
        e.createReplica("alpha").snapshot().schema,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
