import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoutingPanel } from "./routing-panel";
import { routingTranslations } from "@/lib/routing-translations";
import { demoRTProject } from "@/lib/routing-demo";
import { emptyRTProject, RT_LIMITS, type RTProject } from "@/lib/routing-model";
import { downloadTextFile } from "@/lib/schema-download";
import { setAppLanguage } from "./i18n-provider";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = routingTranslations.en;
type Key = keyof typeof en;
const click = (key: Key) =>
  fireEvent.click(screen.getByRole("button", { name: en[key] }));
const change = (key: Key, value: string) =>
  fireEvent.change(screen.getByLabelText(en[key]), { target: { value } });
function expand(key: Key) {
  const summary = screen.getByText(en[key], { selector: "summary" });
  if (!(summary.parentElement as HTMLDetailsElement).open)
    fireEvent.click(summary);
}
async function setup(demo = true) {
  const view = render(<RoutingPanel />);
  expand("rt.title");
  await screen.findByRole("button", { name: en["rt.demo"] });
  if (demo) click("rt.demo");
  return view;
}
async function job(key: Key = "rt.run") {
  click(key);
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: en["rt.cancel"] }),
    ).not.toBeInTheDocument(),
  );
}
function exported() {
  return vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
}
function snapshot() {
  click("rt.exportProject");
  return JSON.parse(exported()) as RTProject;
}
function report() {
  click("rt.exportReport");
  return JSON.parse(exported());
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("API routing and load-balancing studio", () => {
  it("replays five scenarios without requests, persistent writes or project changes", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup();
    const before = snapshot();
    await job("rt.runAll");
    const results = report();
    expect(results.runs).toHaveLength(5);
    expect(results.runs[0].backendCounts).toMatchObject({
      "stable-a": 6,
      "stable-b": 2,
    });
    expect(
      results.runs.find(
        (r: { caseId: string }) => r.caseId === "canary-capacity",
      ).rejected,
    ).toBe(1);
    expect(exported()).not.toMatch(
      /upstreamUrl|"headers"\s*:|client\.example|x-client-id/,
    );
    expect(snapshot()).toEqual(before);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("inspects rewritten requests, rule failures and the in-flight replay timeline", async () => {
    await setup();
    await job();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Inspect routing request balanced-1",
      }),
    );
    const inspector = within(
      screen.getByRole("region", { name: en["rt.inspector"] }),
    );
    expect(
      inspector.getByRole("region", { name: en["rt.destination"] }),
    ).toHaveTextContent(
      "https://stable-a.example.test/base/items/1?page=1&tag=a&tag=b",
    );
    expect(inspector.getByText("canary-route: filter mismatch")).toBeVisible();
    fireEvent.change(screen.getByLabelText(en["rt.playhead"]), {
      target: { value: "0" },
    });
    const timeline = within(
        screen.getByRole("region", { name: en["rt.timeline"] }),
      ),
      row = timeline.getByText("Stable A").closest("tr")!;
    expect(within(row).getAllByRole("cell")[1]).toHaveTextContent("1");
  });
  it("filters local rejections and clears search with Escape while preserving filters", async () => {
    await setup();
    change("rt.case", "canary-capacity");
    await job();
    change("rt.filter", "rejected");
    expect(
      screen.getByRole("button", { name: "Inspect routing request canary-2" }),
    ).toBeVisible();
    change("rt.search", "nothing-matches");
    expect(screen.getByText(en["rt.none"])).toBeVisible();
    for (const modifier of [
      "ctrlKey",
      "metaKey",
      "altKey",
      "shiftKey",
      "isComposing",
    ]) {
      fireEvent.keyDown(screen.getByLabelText(en["rt.search"]), {
        key: "Escape",
        [modifier]: true,
      });
      expect(screen.getByLabelText(en["rt.search"])).toHaveValue(
        "nothing-matches",
      );
    }
    fireEvent.keyDown(screen.getByLabelText(en["rt.search"]), {
      key: "Escape",
    });
    expect(screen.getByLabelText(en["rt.search"])).toHaveValue("");
    expect(screen.getByLabelText(en["rt.filter"])).toHaveValue("rejected");
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect routing request canary-2" }),
    );
    expect(
      screen.getByRole("region", { name: en["rt.inspector"] }),
    ).toHaveTextContent("capacity exhausted");
  });
  it.each(["en", "ru"] as const)(
    "searches displayed decision labels in %s while retaining ID, status and internal-code searches",
    async (language) => {
      await setup();
      change("rt.case", "canary-capacity");
      await job();
      act(() => setAppLanguage(language));
      const labels = routingTranslations[language],
        search = screen.getByLabelText(labels["rt.search"]),
        requests = within(
          screen.getByRole("region", { name: labels["rt.requests"] }),
        );
      for (const query of [
        labels["rt.reason.capacity"].toUpperCase(),
        "capacity",
        "canary-2 503",
      ]) {
        fireEvent.change(search, { target: { value: query } });
        expect(
          requests.getByRole("button", { name: /canary-2/ }),
        ).toBeVisible();
        expect(
          requests.queryByRole("button", { name: /canary-1/ }),
        ).not.toBeInTheDocument();
        expect(requests.getAllByRole("row")).toHaveLength(2);
      }
    },
  );
  it("records all routing expectations and detects changed backend weights", async () => {
    await setup();
    await job("rt.runAll");
    click("rt.recordAll");
    const project = snapshot();
    expect(project.cases.every((scenario) => scenario.expected !== null)).toBe(
      true,
    );
    await job("rt.runAll");
    expect(
      report().runs.every((run: { matched: boolean }) => run.matched),
    ).toBe(true);
    expand("rt.backendSource");
    change(
      "rt.backendSource",
      JSON.stringify({ ...project.backends[0], weight: 1 }),
    );
    click("rt.applyBackend");
    await job();
    expect(report().runs[0].matched).toBe(false);
  });
  it("compares candidate policies without replacing the saved project or leaking request values", async () => {
    await setup();
    const before = snapshot(),
      candidate = {
        ...before,
        backends: before.backends.map((backend) => ({
          ...backend,
          healthy: false,
        })),
      };
    expand("rt.candidate");
    change("rt.candidateSource", JSON.stringify(candidate));
    await job("rt.compare");
    expect(screen.getByTestId("rt-comparison-summary")).toHaveTextContent(
      "8 requests changed",
    );
    click("rt.exportComparison");
    expect(exported()).not.toMatch(/upstreamUrl|"headers"\s*:|client\.example/);
    expect(snapshot()).toEqual(before);
    change("rt.candidateSource", "{");
    await job("rt.compare");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rt.error.project"]);
    expect(snapshot()).toEqual(before);
  });
  it("authors first-priority routes and supports reordering, disabling, undo and redo", async () => {
    await setup(false);
    change("rt.routeName", "Special route");
    change("rt.path", "/special");
    change("rt.rewrite", "/internal");
    click("rt.addRoute");
    expect(snapshot().routes[0].name).toBe("Special route");
    fireEvent.click(screen.getByRole("button", { name: "Move route all up" }));
    expect(snapshot().routes[0].id).toBe("all");
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable route all" }));
    expect(snapshot().routes[0].enabled).toBe(false);
    click("rt.undo");
    expect(snapshot().routes[0].enabled).toBe(true);
    click("rt.redo");
    expect(snapshot().routes[0].enabled).toBe(false);
  });
  it("protects referenced definitions and appends traffic with explicit expectation invalidation", async () => {
    await setup();
    click("rt.removeBackend");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rt.error.reference"],
    );
    await job();
    click("rt.record");
    expect(snapshot().cases[0].expected).not.toBeNull();
    change("rt.requestUrl", "/v1/items/new");
    change("rt.arrival", "2000");
    click("rt.addRequest");
    expect(snapshot().cases[0].requests).toHaveLength(9);
    expect(snapshot().cases[0].expected).toBeNull();
    await job();
    expect(report().runs[0].forwarded).toBe(9);
  });
  it("rejects URLs that exceed stored limits after encoding without replacing the saved policy", async () => {
    await setup();
    const before = snapshot();
    expand("rt.backendSource");
    change(
      "rt.backendSource",
      JSON.stringify({
        ...before.backends[0],
        url: `https://backend.test/${"é".repeat(340)}`,
      }),
    );
    click("rt.applyBackend");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rt.error.limit"]);
    expect(snapshot()).toEqual(before);
    change("rt.requestUrl", `/${"é".repeat(700)}`);
    click("rt.addRequest");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rt.error.limit"]);
    expect(snapshot()).toEqual(before);
    await job();
    expect(report().runs[0].forwarded).toBe(8);
  });
  it("imports HAR traffic with original metadata and rejects ambiguous captures atomically", async () => {
    await setup(false);
    expand("rt.importHar");
    const entry = {
      startedDateTime: "2026-11-18T12:00:00Z",
      time: 10.2,
      request: {
        method: "GET",
        url: "https://client.test/private?q=secret",
        headers: [{ name: "X-Key", value: "private" }],
      },
      response: { status: 201, content: { text: "PRIVATE_BODY" } },
    };
    change("rt.harSource", JSON.stringify({ log: { entries: [entry] } }));
    click("rt.importHarText");
    const project = snapshot();
    expect(project.cases).toHaveLength(2);
    expect(project.cases[1].requests[0].outcome).toEqual({
      status: 201,
      durationMs: 11,
    });
    expect(JSON.stringify(project)).not.toContain("PRIVATE_BODY");
    entry.request.headers.push({ name: "x-key", value: "other" });
    change("rt.harSource", JSON.stringify({ log: { entries: [entry] } }));
    click("rt.importHarText");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rt.error.duplicate"],
    );
    expect(snapshot()).toEqual(project);
  });
  it("guards pending source edits and retains the committed policy after invalid applies", async () => {
    await setup();
    const before = snapshot(),
      calls = vi.mocked(downloadTextFile).mock.calls.length;
    expand("rt.source");
    change("rt.source", "{");
    click("rt.run");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rt.dirty"]);
    click("rt.exportRunner");
    expect(vi.mocked(downloadTextFile)).toHaveBeenCalledTimes(calls);
    click("rt.apply");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rt.error.project"]);
    click("rt.discard");
    expect(snapshot()).toEqual(before);
  });
  it("cancels replay and delayed restores while retaining previous results", async () => {
    await setup();
    await job();
    const before = report();
    click("rt.run");
    click("rt.cancel");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByRole("status")).toHaveTextContent(en["rt.cancelled"]);
    expect(report()).toEqual(before);
    let resolve!: (value: string) => void;
    const file = new File(["{}"], "project.json");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    fireEvent.change(screen.getByLabelText(en["rt.restore"]), {
      target: { files: [file] },
    });
    click("rt.cancel");
    await act(async () => resolve(JSON.stringify(emptyRTProject())));
    expect(snapshot()).toEqual(demoRTProject());
    const large = new File(["{}"], "big.json"),
      read = vi.fn();
    Object.defineProperty(large, "size", { value: RT_LIMITS.bytes + 1 });
    Object.defineProperty(large, "text", { value: read });
    fireEvent.change(screen.getByLabelText(en["rt.restore"]), {
      target: { files: [large] },
    });
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(en["rt.error.limit"]);
  });
  it("imports an OpenAPI operation as the first route without changing the editor", async () => {
    const getter = vi.fn().mockReturnValue("openapi: [");
    render(<RoutingPanel getSchemaText={getter} />);
    expand("rt.title");
    await screen.findByRole("button", { name: en["rt.demo"] });
    expand("rt.schema");
    click("rt.readSchema");
    expect(screen.getByRole("alert")).toHaveTextContent(en["rt.error.schema"]);
    getter.mockReturnValue(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "API", version: "1" },
        paths: {
          "/items/{id}": {
            get: { responses: { "200": { description: "OK" } } },
          },
        },
      }),
    );
    click("rt.readSchema");
    click("rt.importRoute");
    const project = snapshot();
    expect(project.routes[0]).toMatchObject({
      methods: ["GET"],
      path: "/items/{id}",
      pool: "api",
    });
    expect(project.routes).toHaveLength(2);
    expect(getter).toHaveBeenCalledTimes(2);
  });
  it("retries downloads and provides matching Russian labels", async () => {
    await setup(false);
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    click("rt.exportToolkit");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["rt.downloadFailed"],
    );
    click("rt.exportToolkit");
    expect(screen.getByRole("status")).toHaveTextContent(en["rt.downloaded"]);
    expect(exported()).toContain("createRTRouter");
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText(routingTranslations.ru["rt.title"], {
        selector: "summary",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: routingTranslations.ru["rt.run"] }),
    ).toBeVisible();
    expect(Object.keys(routingTranslations.ru).sort()).toEqual(
      Object.keys(routingTranslations.en).sort(),
    );
  });
});
