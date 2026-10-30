import { describe, expect, it } from "vitest";
import {
  analyzeJourneyModel,
  createJourneyMonitor,
  walkJourney,
} from "./journey-engine";
import {
  MAX_JOURNEY_BYTES,
  emptyJourneyProject,
  journeyJson,
  newJourneyModel,
  normalizeJourneyModel,
  normalizeJourneyProject,
  parseJourneyProject,
  serializeJourneyProject,
  type JourneyEvent,
  type JourneyModel,
} from "./journey-project";
import {
  compareJourneyModels,
  demoJourneyProject,
  generateJourneySuite,
  importJourneyHar,
  journeyActionsFromSchema,
  journeyReport,
  runJourneyMatrix,
  serializeJourneySuite,
  traceFromJourneyWitness,
} from "./journey-studio";
import { DEFAULT_OPENAPI_SCHEMA } from "./openapi";
const event = (action = "POST /orders", status = 201): JourneyEvent => ({
  action,
  status,
});
const model = (): JourneyModel => newJourneyModel();
describe("sequential API journey engine", () => {
  it("distinguishes accepted completions, incomplete prefixes and the first rejected event", () => {
    expect(walkJourney(model(), [])).toMatchObject({
      outcome: "incomplete",
      failedAt: null,
      finalState: "state-1",
    });
    expect(walkJourney(model(), [event()])).toMatchObject({
      outcome: "accepted",
      finalState: "state-2",
      coveredTransitions: ["transition-1"],
    });
    const rejected = walkJourney(model(), [event("GET /orders", 200), event()]);
    expect(rejected).toMatchObject({
      outcome: "rejected",
      failedAt: 0,
      finalState: "state-1",
    });
    expect(rejected.observations).toHaveLength(1);
  });
  it("uses exact action/status labels, supports terminal continuations and preserves state on rejected observations", () => {
    const m = model();
    m.transitions.push({
      ...m.transitions[0],
      id: "again",
      from: "state-2",
      to: "state-2",
      action: "GET /orders/{id}",
      statuses: [200],
    });
    const monitor = createJourneyMonitor(m);
    expect(monitor.observe(event("POST /orders ")).allowed).toBe(false);
    expect(monitor.snapshot().state).toBe("state-1");
    expect(monitor.observe(event()).allowed).toBe(true);
    expect(monitor.observe(event("GET /orders/{id}", 200)).canFinish).toBe(
      true,
    );
    expect(monitor.observe(event("GET /orders/1", 200)).allowed).toBe(false);
    expect(monitor.snapshot().canFinish).toBe(true);
  });
  it("checks overlapping statuses, dangling references and initial states without deleting editable definitions", () => {
    const m = model();
    m.transitions.push({
      ...m.transitions[0],
      id: "overlap",
      statuses: [201, 202],
    });
    expect(analyzeJourneyModel(m)).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "overlap",
          status: 201,
          transitionIds: ["transition-1", "overlap"],
        },
      ],
    });
    expect(walkJourney(m, [event()]).outcome).toBe("invalid");
    expect(() => createJourneyMonitor(m)).toThrow("graph");
    m.transitions[1].enabled = false;
    expect(analyzeJourneyModel(m).valid).toBe(true);
    m.transitions[0].to = "deleted";
    m.initial = "missing";
    const p = emptyJourneyProject();
    p.models = [m];
    expect(normalizeJourneyProject(p).models[0]).toEqual(m);
    const codes = analyzeJourneyModel(m).diagnostics.map((d) => d.code);
    expect(codes).toContain("initial");
    expect(codes).toContain("dangling-to");
  });
  it("reports structural reachability/dead ends without treating warnings as graph errors", () => {
    const m = model();
    m.states.push({ id: "unused", name: "Unused", terminal: false });
    m.states[1].terminal = false;
    const analysis = analyzeJourneyModel(m);
    expect(analysis.valid).toBe(true);
    expect(analysis.reachable).toEqual(["state-1", "state-2"]);
    expect(analysis.unreachable).toEqual(["unused"]);
    expect(analysis.diagnostics.map((d) => d.code)).toEqual([
      "dead-end",
      "unreachable",
      "no-terminal",
    ]);
  });
  it("supports empty accepted traces and bounded journals while protecting snapshots from caller mutation", () => {
    const m = model();
    m.states[0].terminal = true;
    m.transitions[0].to = m.initial;
    expect(walkJourney(m, []).outcome).toBe("accepted");
    const monitor = createJourneyMonitor(m);
    const first = monitor.observe(event());
    first.event.action = "changed";
    for (let i = 1; i < 205; i++) monitor.observe(event());
    const snapshot = monitor.snapshot();
    expect(snapshot).toMatchObject({ total: 205, dropped: 5 });
    expect(snapshot.journal).toHaveLength(200);
    snapshot.journal[0].to = "changed";
    expect(monitor.snapshot().journal[0].to).toBe(m.initial);
    monitor.reset();
    expect(monitor.snapshot()).toMatchObject({
      total: 0,
      dropped: 0,
      journal: [],
      state: m.initial,
    });
  });
  it("snapshots models and refuses invalid event types before changing state or history", () => {
    const m = model(),
      monitor = createJourneyMonitor(m);
    m.transitions[0].enabled = false;
    for (const input of [
      null,
      {},
      { action: "x", status: "200" },
      { action: "", status: 200 },
      { action: "x", status: 600 },
    ])
      expect(() => monitor.observe(input)).toThrow();
    expect(monitor.snapshot().total).toBe(0);
    expect(monitor.observe(event()).allowed).toBe(true);
  });
  it("validates IDs, status lists, dense collections, sizes and portable expectations", () => {
    const p = emptyJourneyProject();
    expect(
      parseJourneyProject(
        serializeJourneyProject({ ...p, runtime: {}, results: [] } as typeof p),
      ),
    ).toEqual(p);
    expect(() => journeyJson(" ".repeat(MAX_JOURNEY_BYTES + 1))).toThrow(
      "limit",
    );
    expect(() => parseJourneyProject("{")).toThrow("json");
    expect(() =>
      normalizeJourneyModel({ ...model(), states: Array(1) }),
    ).toThrow();
    expect(() =>
      normalizeJourneyModel({
        ...model(),
        transitions: [{ ...model().transitions[0], statuses: [201, 201] }],
      }),
    ).toThrow();
    expect(() =>
      normalizeJourneyProject({ ...p, models: [p.models[0], p.models[0]] }),
    ).toThrow();
    expect(() =>
      normalizeJourneyProject({
        ...p,
        traces: [{ ...p.traces[0], expect: { unknown: "accepted" } }],
      }),
    ).toThrow();
    expect(() => walkJourney(model(), Array(201).fill(event()))).toThrow(
      "limit",
    );
  });
});
describe("behavioral inclusion with shortest counterexamples", () => {
  it("identifies compatible expansions and replays a saved shortest witness against both models", async () => {
    const p = demoJourneyProject(),
      result = await compareJourneyModels(p.models[0], p.models[1]);
    expect(result.classification).toBe("expanded");
    expect(result.forward.status).toBe("included");
    expect(result.reverse).toMatchObject({
      status: "counterexample",
      reason: "missing-transition",
    });
    expect(result.reverse.steps).toHaveLength(3);
    const trace = traceFromJourneyWitness(p, result, "reverse", "witness");
    expect(trace.expect).toEqual({
      baseline: "rejected",
      expanded: "accepted",
    });
    p.traces = [trace];
    expect((await runJourneyMatrix(p)).every((r) => r.passed)).toBe(true);
  });
  it("distinguishes lost completion from a missing event and detects changes in both directions", async () => {
    const p = demoJourneyProject(),
      result = await compareJourneyModels(p.models[0], p.models[2]);
    expect(result.classification).toBe("changed");
    expect(result.forward.reason).toBe("missing-transition");
    expect(result.reverse.reason).toBe("completion-lost");
    expect(result.forward.steps).toHaveLength(2);
    expect(result.reverse.steps).toHaveLength(2);
  });
  it("does not return a two-step edge loss before a one-step completion loss in the same BFS layer", async () => {
    const a: JourneyModel = {
      id: "a",
      name: "a",
      initial: "start",
      states: [
        { id: "start", name: "start", terminal: false },
        { id: "first", name: "first", terminal: false },
        { id: "second", name: "second", terminal: true },
      ],
      transitions: [
        {
          id: "a",
          name: "a",
          enabled: true,
          from: "start",
          to: "first",
          action: "A",
          statuses: [200],
        },
        {
          id: "b",
          name: "b",
          enabled: true,
          from: "start",
          to: "second",
          action: "B",
          statuses: [200],
        },
        {
          id: "c",
          name: "c",
          enabled: true,
          from: "first",
          to: "first",
          action: "C",
          statuses: [200],
        },
      ],
    };
    const b = {
      ...a,
      id: "b",
      states: a.states.map((s) => ({ ...s, terminal: false })),
      transitions: a.transitions.slice(0, 2),
    };
    expect((await compareJourneyModels(a, b)).forward).toMatchObject({
      status: "counterexample",
      reason: "completion-lost",
      steps: [event("B", 200)],
    });
  });
  it("finds zero-event completion changes, terminates on cycles and ignores state-name/ID differences", async () => {
    const a = model(),
      b = model();
    a.states[0].terminal = true;
    expect((await compareJourneyModels(a, b)).forward.steps).toEqual([]);
    const loop: JourneyModel = {
      id: "loop",
      name: "loop",
      initial: "one",
      states: [{ id: "one", name: "One", terminal: true }],
      transitions: [
        {
          id: "t",
          name: "t",
          enabled: true,
          from: "one",
          to: "one",
          action: "A",
          statuses: [200],
        },
      ],
    };
    const alternate: JourneyModel = {
      id: "alternate",
      name: "alternate",
      initial: "left",
      states: [
        { id: "left", name: "Left", terminal: true },
        { id: "right", name: "Right", terminal: true },
      ],
      transitions: [
        { ...loop.transitions[0], from: "left", to: "right" },
        { ...loop.transitions[0], id: "t2", from: "right", to: "left" },
      ],
    };
    expect((await compareJourneyModels(loop, alternate)).classification).toBe(
      "equivalent",
    );
  });
  it("reports budget exhaustion and invalid graphs without claiming compatibility", async () => {
    expect(
      (await compareJourneyModels(model(), model(), 1)).classification,
    ).toBe("inconclusive");
    const bad = model();
    bad.initial = "absent";
    expect((await compareJourneyModels(model(), bad)).classification).toBe(
      "invalid",
    );
    await expect(compareJourneyModels(model(), model(), 0)).rejects.toThrow(
      "limit",
    );
    await expect(
      compareJourneyModels(model(), model(), 2000, () => true),
    ).rejects.toThrow("cancelled");
  });
  it("matches exhaustive bounded trace enumeration on small generated deterministic models", async () => {
    let seed = 19;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    function generated(id: string): JourneyModel {
      const states = Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`,
        name: `s${i}`,
        terminal: random() % 3 === 0,
      }));
      return {
        id,
        name: id,
        initial: "s0",
        states,
        transitions: states.flatMap((s) =>
          ["A", "B"].flatMap((action) =>
            random() % 4 === 0
              ? []
              : [
                  {
                    id: `${s.id}-${action}`,
                    name: action,
                    enabled: true,
                    from: s.id,
                    to: `s${random() % 3}`,
                    action,
                    statuses: [200],
                  },
                ],
          ),
        ),
      };
    }
    function evaluate(m: JourneyModel, steps: JourneyEvent[]) {
      let state = m.initial;
      for (const s of steps) {
        const edge = m.transitions.find(
          (t) =>
            t.from === state &&
            t.action === s.action &&
            t.statuses.includes(s.status),
        );
        if (!edge) return { legal: false, terminal: false };
        state = edge.to;
      }
      return {
        legal: true,
        terminal: m.states.find((s) => s.id === state)!.terminal,
      };
    }
    function brute(a: JourneyModel, b: JourneyModel): number | null {
      let layer: JourneyEvent[][] = [[]];
      for (let depth = 0; depth <= 9; depth++) {
        for (const steps of layer) {
          const x = evaluate(a, steps),
            y = evaluate(b, steps);
          if (x.legal && (!y.legal || (x.terminal && !y.terminal)))
            return steps.length;
        }
        layer = layer.flatMap((steps) =>
          ["A", "B"].map((action) => [...steps, event(action, 200)]),
        );
      }
      return null;
    }
    for (let i = 0; i < 8; i++) {
      const a = generated("a"),
        b = generated("b"),
        result = await compareJourneyModels(a, b);
      for (const [source, target, direction] of [
        [a, b, result.forward],
        [b, a, result.reverse],
      ] as const) {
        const length = brute(source, target);
        expect(direction.status).toBe(
          length === null ? "included" : "counterexample",
        );
        if (length !== null) expect(direction.steps).toHaveLength(length);
      }
    }
  });
});
describe("coverage suites, trace matrices and capture imports", () => {
  it("passes all thirty demo expectations and reports unchecked/invalid cases honestly", async () => {
    const p = demoJourneyProject(),
      runs = await runJourneyMatrix(p);
    expect(runs).toHaveLength(30);
    expect(runs.every((r) => r.passed && r.checked)).toBe(true);
    p.traces[0].expect = {};
    expect(
      (await runJourneyMatrix(p, p.traces[0].id)).every((r) => !r.checked),
    ).toBe(true);
    p.models[0].initial = "missing";
    expect((await runJourneyMatrix(p, p.traces[0].id))[0]).toMatchObject({
      outcome: "invalid",
      passed: false,
    });
  });
  it.each(["states", "transitions", "events"] as const)(
    "generates shortest reachable %s coverage paths with correct completion expectations",
    async (mode) => {
      const m = demoJourneyProject().models[0],
        suite = await generateJourneySuite(m, mode, 500);
      expect(suite.complete).toBe(true);
      expect(suite.covered).toBe(suite.objectives);
      expect(suite.reachableStates).toBe(5);
      expect(suite.reachableTransitions).toBe(10);
      for (const c of suite.cases)
        expect(walkJourney(m, c.steps).outcome).toBe(c.expect[m.id]);
      expect(JSON.parse(serializeJourneySuite(suite))).toEqual(suite);
    },
  );
  it("marks capped coverage partial, cancels suites and snapshots regression inputs", async () => {
    const p = demoJourneyProject();
    const partial = await generateJourneySuite(p.models[0], "events", 1);
    expect(partial.complete).toBe(false);
    expect(partial.covered).toBeLessThan(partial.objectives);
    await expect(
      generateJourneySuite(p.models[0], "states", 1, () => true),
    ).rejects.toThrow("cancelled");
    let cancel = false;
    await expect(
      runJourneyMatrix(
        p,
        undefined,
        () => cancel,
        () => {
          cancel = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    const run = runJourneyMatrix(p);
    p.models[0].initial = "changed";
    expect((await run)[0].outcome).toBe("accepted");
  });
  it("omits action labels from both report modes and counterexamples", async () => {
    const p = emptyJourneyProject();
    p.models[0].transitions[0].action = "private-action";
    p.traces[0].steps[0].action = "private-action";
    const other = { ...p.models[0], id: "other", transitions: [] };
    const comparison = await compareJourneyModels(p.models[0], other),
      runs = await runJourneyMatrix(p);
    for (const details of [false, true]) {
      const source = journeyReport(runs, details, comparison);
      expect(source).not.toContain("private-action");
      expect(JSON.parse(source).runs[0].observations === undefined).toBe(
        !details,
      );
    }
  });
  it("imports exact/template HTTP actions, preserves unknown events and strips capture values", () => {
    const m = demoJourneyProject().models[0],
      entry = (method: string, path: string, status: number) => ({
        request: {
          method,
          url: `https://private.example${path}?token=secret`,
          headers: [{ name: "authorization", value: "secret" }],
          postData: { text: "private-body" },
        },
        response: { status },
      });
    const result = importJourneyHar(
      JSON.stringify({
        log: {
          entries: [
            entry("post", "/orders", 201),
            entry("POST", "/orders/42/payments", 200),
            entry("GET", "/unknown", 404),
            entry("GET", "/orders/42", 0),
          ],
        },
      }),
      m,
      "har",
    );
    expect(result.trace.steps).toEqual([
      event(),
      event("POST /orders/{id}/payments", 200),
      event("GET /unknown", 404),
    ]);
    expect(result.skipped).toBe(1);
    const source = JSON.stringify(result);
    for (const privateValue of [
      "private.example",
      "token",
      "secret",
      "private-body",
      "/orders/42",
    ])
      expect(source).not.toContain(privateValue);
  });
  it("prioritizes exact paths and refuses ambiguous or oversized HAR imports atomically", () => {
    const m = model();
    m.transitions = [
      { ...m.transitions[0], action: "GET /orders/{id}" },
      { ...m.transitions[0], id: "two", action: "GET /orders/{order}" },
    ];
    const entry = {
        request: { method: "GET", url: "https://local.example/orders/special" },
        response: { status: 200 },
      },
      source = JSON.stringify({ log: { entries: [entry] } });
    expect(() => importJourneyHar(source, m, "har")).toThrow("har");
    m.transitions.push({
      ...m.transitions[0],
      id: "exact",
      action: "GET /orders/special",
    });
    expect(importJourneyHar(source, m, "har").trace.steps[0].action).toBe(
      "GET /orders/special",
    );
    expect(() =>
      importJourneyHar(
        JSON.stringify({ log: { entries: Array(201).fill(entry) } }),
        m,
        "har",
      ),
    ).toThrow("limit");
  });
  it("reads OpenAPI action labels without changing or executing the editor", () => {
    expect(journeyActionsFromSchema(DEFAULT_OPENAPI_SCHEMA)).toEqual(
      expect.arrayContaining(["GET /users/{id}", "POST /users/{id}"]),
    );
    expect(() => journeyActionsFromSchema("openapi: [")).toThrow("schema");
  });
});
