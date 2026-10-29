import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { analyzeTraceData } from "./trace-analysis";
import { DEMO_TRACE_A, DEMO_TRACE_B, demoTraceProject } from "./trace-demo";
import { readTraceData } from "./trace-data";
import { sliceTraceSource, traceViewerHtml } from "./trace-export";
// jsdom is installed by the test environment; use its DOM surface without adding a type-only dependency.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { runScripts: "dangerously" },
  ) => { window: Window & typeof globalThis };
};
describe("trace exports", () => {
  it("slices a trace without losing resource/scope/unknown metadata or leaking other traces", () => {
    const source = sliceTraceSource(demoTraceProject().source, DEMO_TRACE_A),
      data = readTraceData(source);
    expect(data.spans).toHaveLength(9);
    expect(data.spans.every((s) => s.traceId === DEMO_TRACE_A)).toBe(true);
    expect(source).toContain("x-demo-metadata");
    expect(source).not.toContain(DEMO_TRACE_B);
  });
  it("executes a standalone offline viewer with search, service/error filters and span details", () => {
    const a = analyzeTraceData(demoTraceProject().source),
      html = traceViewerHtml(a, DEMO_TRACE_A),
      dom = new JSDOM(html, { runScripts: "dangerously" });
    try {
      const doc = dom.window.document;
      expect(doc.querySelectorAll("tbody tr")).toHaveLength(9);
      (doc.querySelector("tbody button") as HTMLButtonElement).click();
      expect(doc.querySelector("#details")!.textContent).toContain(
        "POST /checkout",
      );
      const search = doc.querySelector("#search") as HTMLInputElement;
      search.value = "insert order";
      search.dispatchEvent(new dom.window.Event("input"));
      expect(doc.querySelectorAll("tbody tr")).toHaveLength(1);
      search.value = "";
      const error = doc.querySelector("#errors") as HTMLInputElement;
      error.checked = true;
      error.dispatchEvent(new dom.window.Event("change"));
      expect(doc.querySelectorAll("tbody tr")).toHaveLength(1);
      expect(doc.querySelector("tbody")!.textContent).toContain(
        "payment provider",
      );
      const service = doc.querySelector("#service") as HTMLSelectElement;
      service.value = "demo / gateway";
      service.dispatchEvent(new dom.window.Event("change"));
      expect(doc.querySelectorAll("tbody tr")).toHaveLength(0);
    } finally {
      dom.window.close();
    }
  });
  it("renders untrusted operation labels as data and omits raw IDs, timestamps, attributes and status messages", () => {
    const root = JSON.parse(demoTraceProject().source);
    root.resourceSpans[0].scopeSpans[0].spans[0].name =
      "</script><script>globalThis.injected=true</script><img src=x onerror=alert(1)>";
    const html = traceViewerHtml(
      analyzeTraceData(JSON.stringify(root)),
      DEMO_TRACE_A,
    );
    for (const secret of [
      "PRIVATE",
      "private.example",
      "1700000000",
      DEMO_TRACE_A,
    ])
      expect(html).not.toContain(secret);
    const dom = new JSDOM(html, { runScripts: "dangerously" });
    try {
      expect(
        (dom.window as unknown as { injected?: boolean }).injected,
      ).toBeUndefined();
      expect(dom.window.document.querySelector("img")).toBeNull();
      expect(dom.window.document.querySelector("tbody")!.textContent).toContain(
        "</script>",
      );
    } finally {
      dom.window.close();
    }
  });
});
