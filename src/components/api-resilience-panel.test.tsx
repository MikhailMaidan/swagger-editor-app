import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiResiliencePanel } from "./api-resilience-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import * as resilience from "@/lib/api-resilience";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
beforeEach(() => {
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
});
afterEach(() => vi.restoreAllMocks());
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
function file(text: string) {
  const f = new File([text], "resilience.json", { type: "application/json" });
  Object.defineProperty(f, "text", { value: async () => text });
  return f;
}
async function setup(demo = true) {
  const user = userEvent.setup(),
    view = render(<ApiResiliencePanel />);
  await user.click(
    screen.getByText("API resilience lab", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load resilience comparison demo"));
  return { user, ...view };
}
async function run(user: ReturnType<typeof userEvent.setup>, all = false) {
  await user.click(
    button(
      all
        ? "Run resilience regression matrix"
        : "Compare policies for selected scenario",
    ),
  );
  await screen.findByRole("table", { name: "Resilience experiment results" });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Cancel resilience work" }),
    ).not.toBeInTheDocument(),
  );
}
describe("ApiResiliencePanel", () => {
  it("compares real policy simulations, runs the full matrix and exports reports without network or storage writes", async () => {
    document.cookie = "auth=keep-existing-credentials; path=/";
    const cookies = document.cookie,
      fetch = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    const { user } = await setup();
    await run(user);
    expect(
      within(
        screen.getByRole("table", { name: "Resilience experiment results" }),
      ).getAllByRole("row"),
    ).toHaveLength(4);
    await user.click(button("Download resilience simulation report"));
    const report = JSON.parse(exported()) as resilience.ResilienceRun;
    expect(report).toMatchObject({ complete: true, completed: 3, total: 3 });
    expect(
      report.simulations.find((s) => s.policyId === "retry")!.metrics.succeeded,
    ).toBeGreaterThan(report.simulations[0].metrics.succeeded);
    await run(user, true);
    expect(
      within(
        screen.getByRole("table", { name: "Resilience experiment results" }),
      ).getAllByRole("row"),
    ).toHaveLength(10);
    await user.click(button("Download resilience simulation report"));
    expect(JSON.parse(exported())).toMatchObject({
      complete: true,
      completed: 9,
      total: 9,
    });
    await user.click(button("Copy resilience simulation report"));
    await screen.findByText("Report copied to clipboard.");
    expect(
      JSON.parse(vi.mocked(writeTextToClipboard).mock.calls.at(-1)![0]).total,
    ).toBe(9);
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(document.cookie).toBe(cookies);
  });

  it("generates arrivals, saves a scenario and explicitly enables retries for POST in a candidate policy", async () => {
    const { user } = await setup(false);
    change("Generated request count (1–200)", "3");
    change("Arrival spacing (milliseconds)", "20");
    change("Arrival HTTP method", "POST");
    await user.click(button("Replace draft arrivals with generated schedule"));
    change("Scenario name", "POST retry experiment");
    change(
      "Default upstream response (JSON)",
      JSON.stringify({
        kind: "http",
        status: 503,
        latencyMs: 10,
        retryAfterMs: null,
      }),
    );
    expect(button("Compare policies for selected scenario")).toBeDisabled();
    await user.click(button("Save resilience scenario"));
    change("Resilience policy", "retry");
    expect(screen.getByRole("checkbox", { name: "POST" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "POST" }));
    await user.click(button("Save resilience policy"));
    await run(user);
    await user.click(button("Download resilience simulation report"));
    const report = JSON.parse(exported()) as resilience.ResilienceRun;
    expect(report.simulations[0].metrics.attempts).toBe(3);
    expect(report.simulations[1].metrics.attempts).toBe(12);
    expect(
      report.simulations[1].requests.every((r) => r.method === "POST"),
    ).toBe(true);
    await user.click(button("Download resilience project"));
    const saved = resilience.parseResilienceProject(exported());
    expect(saved.scenarios[0].name).toBe("POST retry experiment");
    expect(saved.scenarios[0].arrivals.map((a) => a.atMs)).toEqual([0, 20, 40]);
    expect(saved.policies[1].retryMethods).toContain("POST");
  });

  it("keeps invalid policy text editable, blocks context changes and clears stale results until save/discard", async () => {
    const { user } = await setup();
    await run(user);
    change("Per-attempt timeout (ms)", "not-a-number");
    expect(screen.getByLabelText("Per-attempt timeout (ms)")).toHaveValue(
      "not-a-number",
    );
    expect(
      screen.queryByRole("table", { name: "Resilience experiment results" }),
    ).not.toBeInTheDocument();
    expect(button("Download resilience project")).toBeDisabled();
    expect(screen.getByLabelText("Resilience scenario")).toBeDisabled();
    expect(screen.getByLabelText("Resilience policy")).toBeDisabled();
    await user.click(button("Save resilience policy"));
    expect(screen.getByRole("alert")).toHaveTextContent("Use a valid policy");
    await user.click(button("Discard resilience policy edits"));
    expect(button("Compare policies for selected scenario")).toBeEnabled();
    change("Resilience policy", "retry");
    change("Policy name", "Tuned policy");
    change("Base retry delay (ms)", "75");
    change("Maximum backoff delay (ms)", "300");
    change("Retry backoff strategy", "fixed");
    change("Retry jitter", "none");
    await user.click(screen.getByLabelText("Enable circuit breaker"));
    await user.click(button("Save resilience policy"));
    await user.click(button("Download resilience project"));
    expect(
      resilience.parseResilienceProject(exported()).policies[1],
    ).toMatchObject({
      name: "Tuned policy",
      baseDelayMs: 75,
      maxDelayMs: 300,
      backoff: "fixed",
      jitter: "none",
      breakerEnabled: true,
    });
  });

  it("retains malformed scenario JSON and rejects overlapping windows without changing saved definitions", async () => {
    const { user } = await setup();
    change("Fault windows (JSON array)", "invalid JSON");
    await user.click(button("Save resilience scenario"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use valid bounded JSON",
    );
    expect(screen.getByLabelText("Fault windows (JSON array)")).toHaveValue(
      "invalid JSON",
    );
    expect(button("Load resilience comparison demo")).toBeDisabled();
    await user.click(button("Discard scenario edits"));
    const f = { kind: "http", status: 503, latencyMs: 10, retryAfterMs: null };
    change(
      "Fault windows (JSON array)",
      JSON.stringify([
        { startMs: 0, endMs: 100, fault: f },
        { startMs: 50, endMs: 150, fault: f },
      ]),
    );
    await user.click(button("Save resilience scenario"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "non-overlapping fault windows",
    );
    await user.click(button("Discard scenario edits"));
    await user.click(button("Download resilience project"));
    expect(resilience.parseResilienceProject(exported())).toEqual(
      resilience.demoResilienceProject(),
    );
    change("Generated request count (1–200)", "201");
    await user.click(button("Replace draft arrivals with generated schedule"));
    expect(screen.getByRole("alert")).toHaveTextContent("1–200 requests");
  });

  it("adds, duplicates and deletes independent scenarios and policies while retaining at least one", async () => {
    const { user } = await setup(false);
    await user.click(button("Duplicate resilience scenario"));
    expect(screen.getByLabelText("Scenario name")).toHaveValue(
      "Healthy upstream (copy)",
    );
    change("Scenario name", "Independent scenario");
    await user.click(button("Save resilience scenario"));
    await user.click(button("Duplicate resilience policy"));
    change("Policy name", "Independent policy");
    await user.click(button("Save resilience policy"));
    await user.click(button("Download resilience project"));
    const p = resilience.parseResilienceProject(exported());
    expect(p.scenarios.map((s) => s.name)).toEqual([
      "Healthy upstream",
      "Independent scenario",
    ]);
    expect(p.policies.map((p) => p.name)).toEqual([
      "No retries",
      "Bounded retries",
      "Independent policy",
    ]);
    expect(new Set(p.scenarios.map((s) => s.id)).size).toBe(2);
    await user.click(button("Remove resilience scenario"));
    expect(button("Remove resilience scenario")).toBeDisabled();
    await user.click(button("Remove resilience policy"));
    await user.click(button("Remove resilience policy"));
    expect(button("Remove resilience policy")).toBeDisabled();
    await user.click(button("Add resilience scenario"));
    await user.click(button("Add resilience policy"));
    expect(screen.getByLabelText("Scenario name")).toHaveValue("Scenario 2");
    expect(screen.getByLabelText("Policy name")).toHaveValue("Policy 2");
  });

  it("restores portable definitions without importing run results and retains work after malformed imports", async () => {
    const { user } = await setup();
    await run(user);
    await user.click(button("Download resilience project"));
    const p = resilience.parseResilienceProject(exported());
    expect(exported()).not.toContain('"simulations"');
    fireEvent.change(
      screen.getByLabelText("Restore resilience project (JSON)"),
      {
        target: {
          files: [
            file(JSON.stringify({ ...p, simulations: [{ passed: true }] })),
          ],
        },
      },
    );
    await screen.findByText(/Project restored/);
    expect(
      screen.queryByLabelText("Resilience experiment results"),
    ).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Restore resilience project (JSON)"),
      { target: { files: [file('{"kind":"wrong"}')] } },
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Resilience project name")).toHaveValue(
      p.name,
    );
    expect(screen.getByLabelText("Scenario name")).toHaveValue(
      p.scenarios[0].name,
    );
    await run(user);
  });

  it("imports HAR arrival schedules without retaining URLs, credentials, bodies or responses", async () => {
    const { user } = await setup(false);
    const har = {
      log: {
        entries: [0, 250].map((ms, i) => ({
          startedDateTime: new Date(Date.UTC(2026, 0, 1) + ms).toISOString(),
          request: {
            method: i ? "POST" : "GET",
            url: "https://private.example/?secret=token",
            headers: [{ name: "Authorization", value: "private-secret" }],
            postData: { text: "private-body" },
          },
          response: { status: 500 },
        })),
      },
    };
    fireEvent.change(screen.getByLabelText("Import HAR arrival schedule"), {
      target: { files: [file(JSON.stringify(har))] },
    });
    await screen.findByText(/HAR arrivals added/);
    expect(screen.getByLabelText("Scenario name")).toHaveValue(
      "Recorded HAR arrivals",
    );
    await user.click(button("Download resilience project"));
    expect(exported()).not.toMatch(/private|Authorization|secret/);
    const s = resilience.parseResilienceProject(exported()).scenarios[1];
    expect(s.arrivals.map((a) => [a.method, a.atMs])).toEqual([
      ["GET", 0],
      ["POST", 250],
    ]);
    expect(s.defaultFault.status).toBe(200);
    expect(s.windows).toEqual([]);
  });

  it("provides paginated request timelines, multiword search, outcome filters, request events and full attempt CSV", async () => {
    const { user } = await setup(false);
    change("Generated request count (1–200)", "45");
    change("Arrival spacing (milliseconds)", "0");
    await user.click(button("Replace draft arrivals with generated schedule"));
    await user.click(button("Save resilience scenario"));
    await run(user);
    expect(button("Inspect request Request 20")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Inspect request Request 21" }),
    ).not.toBeInTheDocument();
    await user.click(button("Next request page"));
    await user.click(button("Inspect request Request 21"));
    expect(
      screen.getByText(/Selected request: Request 21; attempts 1; queue/),
    ).toBeInTheDocument();
    const table = within(
      screen.getByRole("table", { name: "Upstream attempt timeline" }),
    );
    expect(table.getAllByRole("row")).toHaveLength(2);
    change("Search simulated requests", "request-12 GET");
    expect(button("Inspect request Request 12")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Inspect request Request 11" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search simulated requests"), {
      key: "Escape",
    });
    expect(screen.getByLabelText("Search simulated requests")).toHaveValue("");
    change("Simulated request outcome", "queue-full");
    expect(button("Inspect request Request 45")).toBeInTheDocument();
    await user.click(button("Download selected attempt timeline (CSV)"));
    expect(exported().trim().split("\r\n")).toHaveLength(45); // 44 attempts + header; one request was rejected.
    expect(exported()).toContain("startedAtMs,completedAtMs");
  });

  it("cancels a matrix after completed policies and clearly exports incomplete coverage", async () => {
    const { user } = await setup();
    const nativeRun = resilience.runResilienceExperiment;
    let release!: () => void, first!: resilience.ResilienceRun;
    vi.spyOn(resilience, "runResilienceExperiment").mockImplementationOnce(
      async (project, scenarioId, signal, progress) => {
        const partial = new AbortController();
        first = await nativeRun(
          project,
          scenarioId,
          partial.signal,
          (count, total) => {
            progress?.(count, total);
            partial.abort();
          },
        );
        await new Promise<void>((done) => {
          release = done;
        });
        expect(signal?.aborted).toBe(true);
        return first;
      },
    );
    await user.click(button("Run resilience regression matrix"));
    await waitFor(() => expect(release).toBeTypeOf("function"));
    expect(button("New resilience project")).toBeDisabled();
    await user.click(button("Cancel resilience work"));
    await act(async () => release());
    await screen.findByText(/Incomplete experiment/);
    await user.click(button("Download resilience simulation report"));
    expect(JSON.parse(exported())).toMatchObject({
      complete: false,
      total: 9,
      completed: 1,
    });
    expect(
      within(
        screen.getByRole("table", { name: "Resilience experiment results" }),
      ).getAllByRole("row"),
    ).toHaveLength(2);
  });

  it("ignores cancelled or unmounted late file reads without overwriting subsequent work", async () => {
    const { user, unmount } = await setup(false);
    let release!: (source: string) => void;
    const delayed = new File([], "late.json");
    Object.defineProperty(delayed, "text", {
      value: () =>
        new Promise((done) => {
          release = done;
        }),
    });
    fireEvent.change(
      screen.getByLabelText("Restore resilience project (JSON)"),
      { target: { files: [delayed] } },
    );
    await user.click(button("Cancel resilience work"));
    change("Resilience project name", "Keep my work");
    await act(async () =>
      release(
        resilience.serializeResilienceProject(
          resilience.demoResilienceProject(),
        ),
      ),
    );
    expect(screen.getByLabelText("Resilience project name")).toHaveValue(
      "Keep my work",
    );
    fireEvent.change(
      screen.getByLabelText("Restore resilience project (JSON)"),
      { target: { files: [delayed] } },
    );
    unmount();
    await act(async () =>
      release(
        resilience.serializeResilienceProject(
          resilience.demoResilienceProject(),
        ),
      ),
    );
    expect(screen.queryByText("Resilience experiment")).not.toBeInTheDocument();
  });

  it("shows blocked download and clipboard feedback without discarding results", async () => {
    const { user } = await setup();
    await run(user);
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(button("Download resilience simulation report"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Download was blocked.",
    );
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(button("Copy resilience simulation report"));
    await screen.findByText("Could not copy the report.");
    expect(
      screen.getByRole("table", { name: "Resilience experiment results" }),
    ).toBeInTheDocument();
  });

  it("retains projects and results when collapsed and localizes all controls into Russian", async () => {
    const { user } = await setup();
    await run(user);
    await user.click(
      screen.getByText("API resilience lab", { selector: "summary" }),
    );
    expect(
      screen.queryByLabelText("Resilience project name"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByText("API resilience lab", { selector: "summary" }),
    );
    expect(
      screen.getByRole("table", { name: "Resilience experiment results" }),
    ).toBeInTheDocument();
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Лаборатория устойчивости API", { selector: "summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Запустить матрицу проверок устойчивости",
      }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("resilience.");
  });
});
