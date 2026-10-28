import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpCachePanel } from "./http-cache-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  emptyCacheProject,
  defaultCacheStep,
  MAX_CACHE_PROJECT_BYTES,
  serializeCacheProject,
} from "@/lib/http-cache-project";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const fetcher = vi.fn();
beforeEach(() => {
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  fetcher.mockReset().mockRejectedValue(new Error("Unexpected traffic"));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
async function setup(demo = false) {
  const user = userEvent.setup(),
    view = render(<HttpCachePanel />);
  await user.click(
    screen.getByText("HTTP cache studio", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load HTTP cache lifecycle demo"));
  return { user, ...view };
}
function importFile(
  source: string,
  label = "Import HTTP cache project",
  text?: () => Promise<string>,
) {
  const file = new File([source], "cache.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}
describe("HTTP cache studio", () => {
  it("rejects a structural change atomically when the saved project is at its byte limit", async () => {
    const { user } = await setup(),
      p = emptyCacheProject();
    p.scenarios[0].steps = Array.from({ length: 16 }, (_, i) => {
      const step = defaultCacheStep(`large-${i}`);
      if (step.origin?.kind === "response")
        step.origin.body = "x".repeat(128 * 1024);
      return step;
    });
    const last = p.scenarios[0].steps.at(-1)!.origin;
    if (last?.kind !== "response") throw new Error("fixture");
    const excess = JSON.stringify(p).length - MAX_CACHE_PROJECT_BYTES + 10;
    last.body = last.body.slice(0, -excess);
    importFile(JSON.stringify(p));
    await screen.findByText(
      "Cache project loaded. Run replay to calculate fresh results.",
    );
    await user.click(button("Add cache policy"));
    expect(screen.getByRole("alert")).toHaveTextContent("exceeds");
    expect(
      screen.getByLabelText("Cache policy").querySelectorAll("option"),
    ).toHaveLength(2);
    expect(
      screen.getByLabelText("Cache request").querySelectorAll("option"),
    ).toHaveLength(16);
    expect(screen.getByLabelText("Cache policy")).toHaveValue("private");
    await user.click(button("Export HTTP cache project"));
    expect(exported().length).toBeLessThanOrEqual(MAX_CACHE_PROJECT_BYTES);
    expect(JSON.parse(exported()).policies).toHaveLength(2);
  });
  it("runs every demo offline and exports value-free reports without writing browser storage", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem"),
      { user } = await setup(true);
    await user.click(button("Run all cache scenarios and policies"));
    expect(screen.getByRole("status")).toHaveTextContent("10/10");
    expect(screen.getByLabelText("Effective cached / origin body")).toHaveValue(
      '{"version":1}',
    );
    await user.click(button("Download cache decision report"));
    const report = JSON.parse(exported());
    expect(report.simulations).toHaveLength(10);
    expect(exported()).not.toContain("cache.example");
    expect(exported()).not.toContain("DEMO-ONLY");
    expect(exported()).not.toContain('"headers"');
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("guards pending edits and retains invalid field text until save or discard", async () => {
    const { user } = await setup();
    change("Cache entry capacity (1–100)", "");
    expect(button("Compare policies for selected scenario")).toBeDisabled();
    expect(button("New HTTP cache project")).toBeDisabled();
    expect(screen.getByLabelText("Cache scenario")).toBeDisabled();
    await user.click(button("Save cache edits"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid cache project",
    );
    expect(screen.getByLabelText("Cache entry capacity (1–100)")).toHaveValue(
      "",
    );
    await user.click(button("Discard cache edits"));
    expect(screen.getByLabelText("Cache entry capacity (1–100)")).toHaveValue(
      "20",
    );
    expect(button("Compare policies for selected scenario")).toBeEnabled();
  });
  it("authors requests and expectations, checks failures, and exports effective data explicitly", async () => {
    const { user } = await setup();
    await user.click(button("Add cache request"));
    change("Origin fixture type", "none");
    change("Expected cache decision", "miss");
    await user.click(button("Save cache edits"));
    await user.click(button("Compare policies for selected scenario"));
    expect(screen.getByRole("status")).toHaveTextContent("0/2");
    await user.click(button("Inspect cache decision: request-2"));
    expect(screen.getByLabelText("Effective cached / origin body")).toHaveValue(
      '{"items":[1,2,3]}',
    );
    await user.click(button("Download effective cache response"));
    expect(JSON.parse(exported())).toMatchObject({
      status: 200,
      body: '{"items":[1,2,3]}',
    });
    await user.click(button("Export HTTP cache project"));
    expect(JSON.parse(exported()).scenarios[0].steps[1]).toMatchObject({
      origin: null,
      expect: { outcome: "miss" },
    });
  });
  it("compares a copied policy with a server header override and supports scenario/policy deletion", async () => {
    const { user } = await setup();
    change(
      "Origin response headers (JSON object)",
      '{"cache-control":"no-store"}',
    );
    await user.click(button("Save cache edits"));
    await user.click(button("Add cache request"));
    await user.click(button("Add cache policy"));
    await user.click(
      screen.getByLabelText(
        "Override origin Cache-Control for this policy comparison",
      ),
    );
    change(
      "Replacement response Cache-Control (empty removes directives)",
      "max-age=60",
    );
    await user.click(button("Save cache edits"));
    await user.click(button("Compare policies for selected scenario"));
    await user.click(button("Download cache decision report"));
    expect(
      JSON.parse(exported()).simulations.map(
        (s: { metrics: { hits: number } }) => s.metrics.hits,
      ),
    ).toEqual([0, 0, 1]);
    await user.click(button("Delete cache policy"));
    await user.click(button("Add cache scenario"));
    await user.click(button("Delete cache scenario"));
    expect(screen.getByLabelText("Cache scenario")).toHaveValue("scenario-1");
  });
  it("restores projects atomically, ignores imported results, and retains work on a failed import", async () => {
    await setup();
    const p = emptyCacheProject();
    p.name = "Imported project";
    importFile(JSON.stringify({ ...p, results: { passed: true } }));
    await screen.findByText(
      "Cache project loaded. Run replay to calculate fresh results.",
    );
    expect(screen.getByLabelText("Cache project name")).toHaveValue(
      "Imported project",
    );
    expect(button("Download cache decision report")).toBeDisabled();
    importFile("{");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Cache project name")).toHaveValue(
      "Imported project",
    );
    importFile(" ".repeat(MAX_CACHE_PROJECT_BYTES + 1));
    expect(screen.getByRole("alert")).toHaveTextContent("exceeds");
  });
  it("imports a HAR capture with explicit missing-body feedback", async () => {
    const { user } = await setup();
    importFile(
      JSON.stringify({
        log: {
          entries: [
            {
              startedDateTime: "2026-01-01T00:00:00Z",
              time: 5,
              request: {
                method: "GET",
                url: "https://har.test/items",
                headers: [],
              },
              response: { status: 200, headers: [], content: {} },
            },
          ],
        },
      }),
      "Import HAR as cache project",
    );
    await screen.findByText(
      /HAR imported: 1 requests, 0 unsupported methods skipped, 1 bodies absent/,
    );
    expect(screen.getByLabelText("Cache request URL")).toHaveValue(
      "https://har.test/items",
    );
    await user.click(button("Compare policies for selected scenario"));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("filters and searches decisions, clears search with Escape, and retains the decision filter", async () => {
    const { user } = await setup(true);
    await user.click(button("Compare policies for selected scenario"));
    change("Cache decision filter", "fresh");
    change("Search cache decisions", "unmatched");
    expect(
      screen.getByText("No decisions match the current filter."),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search cache decisions"), {
      key: "Escape",
    });
    expect(screen.getByLabelText("Search cache decisions")).toHaveValue("");
    expect(screen.getByLabelText("Cache decision filter")).toHaveValue("fresh");
    expect(button("Inspect cache decision: renewed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Inspect cache decision: prime" }),
    ).not.toBeInTheDocument();
  });
  it("keeps replay work when closed and reports blocked downloads", async () => {
    const { user } = await setup(true);
    await user.click(button("Compare policies for selected scenario"));
    const summary = screen.getByText("HTTP cache studio", {
      selector: "summary",
    });
    await user.click(summary);
    await user.click(summary);
    expect(screen.getByLabelText("Cache project name")).toHaveValue(
      "HTTP cache lifecycle examples",
    );
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download cache decision report"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Could not start the download.",
    );
  });
  it("locks edits during file reads and discards late results after unmount", async () => {
    const { unmount } = await setup();
    let finish!: (source: string) => void;
    importFile(
      "{}",
      "Import HTTP cache project",
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    expect(screen.getByLabelText("Cache project name")).toBeDisabled();
    expect(button("Load HTTP cache lifecycle demo")).toBeDisabled();
    unmount();
    await act(async () => finish(serializeCacheProject(emptyCacheProject())));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("localizes the complete studio in Russian", async () => {
    const user = userEvent.setup();
    render(<HttpCachePanel />);
    act(() => setAppLanguage("ru"));
    await user.click(
      screen.getByText("Студия HTTP-кеша", { selector: "summary" }),
    );
    await user.click(button("Загрузить примеры жизненного цикла HTTP-кеша"));
    await user.click(button("Запустить все сценарии и политики кеша"));
    expect(screen.getByRole("status")).toHaveTextContent("10/10");
    expect(screen.getByLabelText("Поиск решений кеша")).toBeInTheDocument();
  });
});
