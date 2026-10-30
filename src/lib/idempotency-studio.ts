import { createIdempotencyStore, idemFingerprint } from "./idempotency-engine";
import {
  IdemError,
  newIdemPolicy,
  newIdemRequest,
  newIdemScenario,
  normalizeIdemProject,
  type IdemOutcome,
  type IdemPolicy,
  type IdemProject,
  type IdemRequest,
  type IdemScenario,
} from "./idempotency-project";
import { getByteSize } from "./text-encoding";
type Reply = { sourceId: string; status: number; body: string };
export type IdemRow = {
  index: number;
  request: IdemRequest;
  outcome: IdemOutcome;
  token: number | null;
  entries: number;
  completedAt: number | null;
  status: number | null;
  response?: Reply;
  retryAfterMs: number | null;
  waited: boolean;
  handled: boolean;
  checked: boolean;
  passed: boolean;
};
export type IdemRun = {
  policyId: string;
  policyName: string;
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  total: number;
  checked: number;
  failedChecks: number;
  executions: number;
  savedExecutions: number;
  refusals: number;
  maxWaitMs: number;
  rows: IdemRow[];
  states: ReturnType<ReturnType<typeof createIdempotencyStore>["inspect"]>;
  checks: { name: string; actual: number; limit: number; passed: boolean }[];
};
const encoder = new TextEncoder();
async function simulate(
  policy: IdemPolicy,
  scenario: IdemScenario,
  cancelled?: () => boolean,
): Promise<IdemRun> {
  const store = createIdempotencyStore<Reply>(policy),
    rows: IdemRow[] = [],
    digests = new Map<string, string>(),
    waiters = new Map<number, IdemRow[]>();
  for (const [i, q] of scenario.requests.entries()) {
    if (cancelled?.()) throw new IdemError("cancelled");
    digests.set(q.id, await idemFingerprint(q, encoder.encode(q.body)));
    if (i % 20 === 19) await new Promise<void>((r) => setTimeout(r, 0));
  }
  type Event = {
    at: number;
    priority: number;
    index: number;
    kind: "arrival" | "finish" | "timeout";
    row?: IdemRow;
  };
  const events: Event[] = scenario.requests.map((q, index) => ({
    at: q.atMs,
    priority: 2,
    index,
    kind: "arrival",
  }));
  while (events.length) {
    if (cancelled?.()) throw new IdemError("cancelled");
    events.sort(
      (a, b) => a.at - b.at || a.priority - b.priority || a.index - b.index,
    );
    const e = events.shift()!,
      q = scenario.requests[e.index];
    if (e.kind === "arrival") {
      const admission = store.admit(
        { ...q, fingerprint: digests.get(q.id)!, bytes: getByteSize(q.body) },
        e.at,
      );
      const row: IdemRow = {
        index: e.index,
        request: q,
        outcome:
          admission.outcome === "execute"
            ? "executed"
            : admission.outcome === "replay"
              ? "replayed"
              : admission.outcome === "wait"
                ? "joined"
                : admission.outcome,
        token: admission.token,
        entries: admission.entries,
        completedAt: e.at,
        status: null,
        retryAfterMs: admission.retryAfterMs,
        waited: admission.outcome === "wait",
        handled:
          admission.outcome === "execute" || admission.outcome === "bypass",
        checked: Object.hasOwn(q.expect, policy.id),
        passed: true,
      };
      rows.push(row);
      if (row.handled) {
        row.completedAt = null;
        events.push({
          at: e.at + q.durationMs,
          priority: 0,
          index: e.index,
          kind: "finish",
          row,
        });
      } else if (admission.outcome === "replay") {
        row.response = store.replay(admission.token!)!;
        row.status = row.response.status;
      } else if (admission.outcome === "wait") {
        row.completedAt = null;
        waiters.set(admission.token!, [
          ...(waiters.get(admission.token!) ?? []),
          row,
        ]);
        events.push({
          at: e.at + policy.waitMs,
          priority: 1,
          index: e.index,
          kind: "timeout",
          row,
        });
      } else
        row.status =
          admission.outcome === "missing"
            ? 400
            : admission.outcome === "body-limit"
              ? 413
              : ["conflict", "in-flight"].includes(admission.outcome)
                ? 409
                : 503;
    } else if (e.kind === "timeout") {
      if (e.row!.completedAt !== null) continue;
      e.row!.outcome = "wait-timeout";
      e.row!.completedAt = e.at;
      e.row!.status = 409;
      store.release(e.row!.token!);
    } else {
      const row = e.row!,
        response: Reply = {
          sourceId: q.id,
          status: q.reply.status,
          body: q.reply.body,
        };
      row.completedAt = e.at;
      row.status = q.reply.failure ? null : q.reply.status;
      if (q.reply.failure) row.outcome = "failed";
      else row.response = response;
      if (row.token !== null) {
        const state = store.finish(row.token, e.at, {
          status: q.reply.status,
          bytes: getByteSize(q.reply.body),
          failed: q.reply.failure,
          payload: response,
        });
        for (const waiting of waiters.get(row.token) ?? [])
          if (waiting.completedAt === null) {
            waiting.completedAt = e.at;
            waiting.outcome = state === "cached" ? "joined" : "unreplayable";
            waiting.status = state === "cached" ? response.status : 503;
            if (state === "cached") waiting.response = response;
            store.release(row.token);
          }
        waiters.delete(row.token);
      }
    }
  }
  for (const row of rows)
    row.passed = !row.checked || row.request.expect[policy.id] === row.outcome;
  const executions = rows.filter((r) => r.handled).length,
    savedExecutions = rows.filter(
      (r) => r.outcome === "joined" || r.outcome === "replayed",
    ).length,
    refusals = rows.filter(
      (r) => !r.handled && r.outcome !== "joined" && r.outcome !== "replayed",
    ).length,
    maxWaitMs = Math.max(
      0,
      ...rows
        .filter((r) => r.waited)
        .map((r) => r.completedAt! - r.request.atMs),
    );
  const checks = [
    {
      name: "maxExecutions",
      actual: executions,
      limit: scenario.budgets.maxExecutions,
    },
    {
      name: "maxRefusals",
      actual: refusals,
      limit: scenario.budgets.maxRefusals,
    },
    { name: "maxWaitMs", actual: maxWaitMs, limit: scenario.budgets.maxWaitMs },
  ].map((c) => ({ ...c, passed: c.actual <= c.limit }));
  return {
    policyId: policy.id,
    policyName: policy.name,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    passed: rows.every((r) => r.passed) && checks.every((c) => c.passed),
    total: rows.length,
    checked: rows.filter((r) => r.checked).length,
    failedChecks: rows.filter((r) => !r.passed).length,
    executions,
    savedExecutions,
    refusals,
    maxWaitMs,
    rows,
    states: store.inspect(),
    checks,
  };
}
export async function runIdemMatrix(
  value: IdemProject,
  scenarioId?: string,
  cancelled?: () => boolean,
  progress?: (done: number, total: number) => void,
): Promise<IdemRun[]> {
  const p = normalizeIdemProject(value),
    scenarios = p.scenarios.filter((s) => !scenarioId || s.id === scenarioId),
    runs: IdemRun[] = [];
  if (!scenarios.length) throw new IdemError("project");
  for (const s of scenarios)
    for (const policy of p.policies) {
      if (cancelled?.()) throw new IdemError("cancelled");
      runs.push(await simulate(policy, s, cancelled));
      progress?.(runs.length, scenarios.length * p.policies.length);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  if (cancelled?.()) throw new IdemError("cancelled");
  return runs;
}
export function idemReport(runs: IdemRun[], details = false): string {
  const source = JSON.stringify(
    {
      kind: "rsswag-idempotency-report",
      version: 1,
      comparisons: runs.map(({ rows, states, ...summary }) => ({
        ...summary,
        states,
        rows: details
          ? rows.map((r) => ({
              index: r.index,
              id: r.request.id,
              name: r.request.name,
              atMs: r.request.atMs,
              outcome: r.outcome,
              token: r.token,
              entries: r.entries,
              completedAt: r.completedAt,
              status: r.status,
              retryAfterMs: r.retryAfterMs,
              waited: r.waited,
              handled: r.handled,
              checked: r.checked,
              passed: r.passed,
            }))
          : undefined,
      })),
    },
    null,
    2,
  );
  if (getByteSize(source) > 16 * 1024 * 1024) throw new IdemError("limit");
  return source;
}
export function generateIdemTraffic(
  count: number,
  spacing: number,
  keys: number,
  duration: number,
): IdemRequest[] {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 200 ||
    !Number.isSafeInteger(spacing) ||
    spacing < 0 ||
    (count - 1) * spacing > 86400000 ||
    !Number.isSafeInteger(keys) ||
    keys < 1 ||
    keys > 200 ||
    !Number.isSafeInteger(duration) ||
    duration < 0 ||
    duration > 60000
  )
    throw new IdemError("limit");
  return Array.from({ length: count }, (_, i) => ({
    ...newIdemRequest(`generated-${i + 1}`),
    atMs: i * spacing,
    key: `key-${(i % keys) + 1}`,
    durationMs: duration,
  }));
}
export function demoIdemProject(): IdemProject {
  const reject = {
      ...newIdemPolicy("reject"),
      name: "Reject in-flight duplicates",
      maxEntries: 4,
      maxWaiters: 2,
      waitMs: 200,
    },
    wait = {
      ...reject,
      id: "wait",
      name: "Join in-flight duplicates",
      inFlight: "wait" as const,
    },
    errors = {
      ...wait,
      id: "errors",
      name: "Replay errors / allow unkeyed",
      cacheErrors: true,
      missingKey: "bypass" as const,
    },
    client = {
      ...wait,
      id: "client",
      name: "Keys across client routes",
      scope: "client" as const,
    };
  const request = (
    id: string,
    atMs: number,
    outcomes: [IdemOutcome, IdemOutcome, IdemOutcome, IdemOutcome],
    patch: Partial<IdemRequest> = {},
  ): IdemRequest => ({
    ...newIdemRequest(id),
    atMs,
    ...patch,
    expect: {
      reject: outcomes[0],
      wait: outcomes[1],
      errors: outcomes[2],
      client: outcomes[3],
    },
  });
  const same = (
    v: IdemOutcome,
  ): [IdemOutcome, IdemOutcome, IdemOutcome, IdemOutcome] => [v, v, v, v];
  const scenario = (id: string, requests: IdemRequest[]): IdemScenario => ({
    ...newIdemScenario(id),
    requests,
  });
  return normalizeIdemProject({
    kind: "rsswag-idempotency-project",
    version: 1,
    name: "Duplicate orders and uncertain writes",
    policies: [reject, wait, errors, client],
    scenarios: [
      scenario("duplicate-orders", [
        request("first", 0, same("executed")),
        request("while-pending", 10, [
          "in-flight",
          "joined",
          "joined",
          "joined",
        ]),
        request("after-completion", 101, same("replayed")),
        request("changed-body", 102, same("conflict"), {
          body: '{"item":"pen"}',
        }),
        request("at-expiry", 1100, same("executed")),
      ]),
      scenario("uncertain-results", [
        request("failed-handler", 0, same("failed"), {
          durationMs: 50,
          reply: { status: 500, body: "", failure: true },
        }),
        request("retry-failed", 60, same("unreplayable")),
        request("server-error", 100, same("executed"), {
          key: "error-key",
          durationMs: 10,
          reply: { status: 500, body: "server error", failure: false },
        }),
        request(
          "retry-error",
          120,
          ["unreplayable", "unreplayable", "replayed", "unreplayable"],
          { key: "error-key" },
        ),
        request("large-response", 200, same("executed"), {
          key: "large-key",
          durationMs: 1,
          reply: { status: 200, body: "x".repeat(5000), failure: false },
        }),
        request("retry-large", 202, same("unreplayable"), { key: "large-key" }),
      ]),
      scenario("bounded-waiters", [
        request("slow-first", 0, same("executed"), { durationMs: 500 }),
        request("timeout-1", 10, [
          "in-flight",
          "wait-timeout",
          "wait-timeout",
          "wait-timeout",
        ]),
        request("timeout-2", 20, [
          "in-flight",
          "wait-timeout",
          "wait-timeout",
          "wait-timeout",
        ]),
        request("too-many-waiters", 30, [
          "in-flight",
          "wait-capacity",
          "wait-capacity",
          "wait-capacity",
        ]),
        request("completion-boundary", 300, [
          "in-flight",
          "joined",
          "joined",
          "joined",
        ]),
      ]),
      scenario("key-boundaries", [
        request("order", 0, same("executed"), { durationMs: 0 }),
        request(
          "another-route",
          1,
          ["executed", "executed", "executed", "conflict"],
          { route: "/invoices", durationMs: 0 },
        ),
        request("another-client", 2, same("executed"), {
          client: "client-b",
          durationMs: 0,
        }),
        request("no-key", 3, ["missing", "missing", "bypass", "missing"], {
          key: "",
          durationMs: 0,
        }),
        request("read-only", 4, same("bypass"), {
          method: "GET",
          body: "",
          durationMs: 0,
        }),
      ]),
      scenario("bounded-storage", [
        ...Array.from({ length: 4 }, (_, i) =>
          request(`entry-${i}`, 0, same("executed"), {
            key: `entry-${i}`,
            durationMs: 0,
          }),
        ),
        request("full-store", 1, same("capacity"), {
          key: "fresh",
          durationMs: 0,
        }),
        request("after-retention", 1000, same("executed"), {
          key: "fresh",
          durationMs: 0,
        }),
      ]),
    ],
  });
}
