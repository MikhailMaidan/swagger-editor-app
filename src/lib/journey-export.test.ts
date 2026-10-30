import { describe, expect, it, vi } from "vitest";
import { createJourneyMonitor } from "./journey-engine";
import {
  generateJourneyMonitor,
  generateJourneySvg,
  journeyGraphLayout,
} from "./journey-export";
import { demoJourneyProject } from "./journey-studio";
import { newJourneyModel, type JourneyModel } from "./journey-project";
async function artifact(model: JourneyModel) {
  const source = generateJourneyMonitor(model);
  const exported = (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  )) as {
    createJourneyMonitor: typeof createJourneyMonitor extends (
      value: JourneyModel,
    ) => infer T
      ? () => T
      : never;
  };
  return { source, ...exported };
}
describe("standalone journey monitor and graph exports", () => {
  it.each(["baseline", "expanded", "changed"])(
    "executes native %s ESM with full observation and snapshot parity",
    async (id) => {
      const p = demoJourneyProject(),
        m = p.models.find((m) => m.id === id)!,
        exported = await artifact(m);
      for (const trace of p.traces) {
        const browser = createJourneyMonitor(m),
          server = exported.createJourneyMonitor();
        for (const step of trace.steps)
          expect(server.observe(step)).toEqual(browser.observe(step));
        expect(server.snapshot()).toEqual(browser.snapshot());
        server.reset();
        browser.reset();
        expect(server.snapshot()).toEqual(browser.snapshot());
      }
      expect(exported.source).not.toContain("fulfilled");
      expect(exported.source).not.toContain("paid-prefix");
    },
  );
  it("keeps independent workflows, retains only 200 observations and exposes safe copies", async () => {
    const m = newJourneyModel();
    m.transitions[0].to = m.initial;
    const { createJourneyMonitor: create } = await artifact(m),
      one = create(),
      two = create();
    one.observe({ action: "unknown", status: 400 });
    for (let i = 0; i < 205; i++)
      one.observe({ action: "POST /orders", status: 201 });
    expect(one.snapshot()).toMatchObject({
      total: 206,
      dropped: 6,
      rejected: 1,
    });
    expect(one.snapshot().journal.every((r) => r.allowed)).toBe(true);
    expect(two.snapshot().total).toBe(0);
    const snapshot = one.snapshot();
    snapshot.journal[0].event.action = "changed";
    expect(one.snapshot().journal[0].event.action).toBe("POST /orders");
    one.reset();
    expect(one.snapshot()).toMatchObject({ total: 0, rejected: 0, dropped: 0 });
  });
  it("rejects invalid observations without state changes and refuses exporting ambiguous models", async () => {
    const m = newJourneyModel(),
      { createJourneyMonitor: create } = await artifact(m),
      monitor = create();
    const callable = Object.assign(() => {}, {
      action: "POST /orders",
      status: 201,
    });
    for (const value of [
      null,
      {},
      [],
      callable,
      { action: "x", status: "200" },
      { action: "x".repeat(257), status: 200 },
    ])
      expect(() => monitor.observe(value)).toThrow();
    expect(monitor.snapshot().total).toBe(0);
    m.transitions.push({ ...m.transitions[0], id: "overlap" });
    expect(() => generateJourneyMonitor(m)).toThrow("graph");
  });
  it("escapes source-sensitive actions without executing network or storage work", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    try {
      const m = newJourneyModel();
      m.transitions[0].action = 'POST /"</script>`\u2028\u2029';
      const exported = await artifact(m);
      expect(exported.source).not.toContain("</script>");
      expect(exported.source).not.toContain("\u2028");
      expect(
        exported
          .createJourneyMonitor()
          .observe({ action: m.transitions[0].action, status: 201 }).allowed,
      ).toBe(true);
      expect(fetcher).not.toHaveBeenCalled();
      expect(storage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
  it("exports a standalone SVG with escaped metadata and no active content", () => {
    const m = newJourneyModel();
    m.name = "Model <script>alert(1)</script>";
    m.states[0].name = '\u0000"><image href="https://bad.example"/>';
    m.transitions[0].action = 'POST /<script>alert("x")</script>';
    const svg = generateJourneySvg(m),
      doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.namespaceURI).toBe("http://www.w3.org/2000/svg");
    for (const selector of ["script", "image", "foreignObject", "a"])
      expect(doc.querySelector(selector)).toBeNull();
    expect(doc.querySelectorAll("g")).toHaveLength(3);
    expect(svg).not.toContain("\u0000");
  });
  it("retains disabled edges in diagrams and renders dangling-reference drafts without fabricating nodes", () => {
    const m = newJourneyModel();
    m.transitions[0].enabled = false;
    m.transitions.push({ ...m.transitions[0], id: "missing", to: "deleted" });
    const layout = journeyGraphLayout(m);
    expect(layout.states).toHaveLength(2);
    expect(layout.edges).toHaveLength(1);
    expect(generateJourneySvg(m)).toContain('stroke-dasharray="5 4"');
  });
});
