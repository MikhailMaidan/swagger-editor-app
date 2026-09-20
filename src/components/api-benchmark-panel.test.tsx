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
import { ApiBenchmarkPanel } from "./api-benchmark-panel";
import { setAppLanguage } from "./i18n-provider";
import {
  createBenchmarkCase,
  createBenchmarkPlan,
  MAX_BENCHMARK_BYTES,
  parseBenchmarkReport,
  serializeBenchmarkPlan,
} from "@/lib/api-benchmark";
import type { EndpointSummary } from "@/lib/openapi";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const read: EndpointSummary = {
  method: "GET",
  path: "/items/{id}",
  summary: "Read item",
  description: "",
  operationId: "",
  tags: [],
  deprecated: false,
  secured: false,
  securityRequirements: [],
  serverUrl: "https://schema.example.com",
  parameters: [
    {
      location: "path",
      name: "id",
      example: "7",
      required: true,
      description: "",
    },
  ],
  requestBodies: [],
  responses: [
    {
      status: "200",
      description: "OK",
      contentTypes: ["application/json"],
      schema: {
        type: "object",
        properties: ["id"],
        example: '{"id":7,"token":"private-response"}',
        exampleName: "",
        hasExplicitExample: true,
      },
    },
    {
      status: "503",
      description: "Unavailable",
      contentTypes: [],
      schema: null,
    },
  ],
};
const head = {
  ...read,
  method: "HEAD",
  path: "/health",
  summary: "Check health",
  parameters: [],
};
const post = { ...read, method: "POST", path: "/items" };
const all = [read, head, post];
const navigate = vi.fn();
const button = (name: string) => screen.getByRole("button", { name });
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
async function setup() {
  const user = userEvent.setup();
  const view = render(
    <ApiBenchmarkPanel
      allEndpoints={all}
      visibleEndpoints={[read, post]}
      onSelectEndpoint={navigate}
    />,
  );
  await user.click(screen.getByText("API performance lab"));
  await screen.findByLabelText("Benchmark plan name");
  return { user, ...view };
}
async function quickPlan(user: ReturnType<typeof userEvent.setup>, count = 3) {
  await user.click(button("Add benchmark case"));
  change("Measured requests", String(count));
  change("Warm-up requests", "0");
  change("Maximum launches per second", "10");
  change("Simulated response delay (ms)", "5");
}
async function runMock(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Run Mock benchmark"));
  return screen.findByRole(
    "region",
    { name: "Benchmark results" },
    { timeout: 5000 },
  );
}
async function openImport(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.getByLabelText("Benchmark import JSON").closest("details")!.open)
    await user.click(screen.getByText("Benchmark plan and baseline import"));
}
beforeEach(() => {
  vi.mocked(downloadTextFile).mockReturnValue(true);
  vi.mocked(writeTextToClipboard).mockResolvedValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "200",
            durationMs: 12,
            body: '{"secret":"private-response"}',
            headers: { authorization: "private-header" },
          }),
          { status: 200 },
        ),
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("API performance lab", () => {
  it("runs Mock workloads, presents metrics and charts, and exports metadata-only reports", async () => {
    const { user } = await setup();
    expect(fetch).not.toHaveBeenCalled();
    await quickPlan(user);
    change("Warm-up requests", "1");
    const results = within(await runMock(user));
    expect(fetch).not.toHaveBeenCalled();
    expect(results.getByText("3/3")).toBeInTheDocument();
    expect(
      results.getByRole("img", { name: "Latency by measured request number" }),
    ).toBeInTheDocument();
    expect(results.getByText(/Mock rehearsal: timings/)).toBeInTheDocument();
    expect(
      results.getByRole("table", { name: "Benchmark metrics by case" }),
    ).toHaveTextContent("GET /items/{id}");
    await user.click(button("Download benchmark JSON"));
    const json = vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
    const report = parseBenchmarkReport(json);
    expect(report.samples).toHaveLength(4);
    expect(
      report.samples.filter((sample) => sample.phase === "measured"),
    ).toHaveLength(3);
    expect(json).not.toMatch(/private-response|targetUrl|parameters/);
    await user.click(button("Download benchmark CSV"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).toContain(
      '"durationMs"',
    );
    await user.click(button("Copy benchmark report"));
    expect(writeTextToClipboard).toHaveBeenLastCalledWith(json);
    await user.click(screen.getByText("Benchmark request samples"));
    expect(screen.getByText("Matching samples: 3")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Include warm-up samples"));
    expect(screen.getByText("Matching samples: 4")).toBeInTheDocument();
    change("Filter sample outcome", "error");
    expect(screen.getByText("Matching samples: 0")).toBeInTheDocument();
  });
  it("builds and reorders a weighted workload using only visible read operations", async () => {
    const { user } = await setup();
    await user.click(button("Add visible benchmark endpoints"));
    expect(screen.getByText("Benchmark cases: 1/10")).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /POST \/items/ }),
    ).not.toBeInTheDocument();
    change("Search benchmark endpoints", "health");
    await user.click(button("Add benchmark case"));
    change("Traffic weight (1–10)", "3");
    await user.click(button("View benchmark endpoint"));
    expect(navigate).toHaveBeenLastCalledWith("HEAD", "/health");
    await user.click(button("Move benchmark case up"));
    await user.click(button("Download benchmark plan"));
    const exported = JSON.parse(
      vi.mocked(downloadTextFile).mock.calls.at(-1)![0],
    ).plan;
    expect(
      exported.cases.map((entry: { method: string }) => entry.method),
    ).toEqual(["HEAD", "GET"]);
    expect(exported.cases[0].weight).toBe(3);
    await user.click(button("Remove benchmark case"));
    expect(screen.getByText("Benchmark cases: 1/10")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search benchmark endpoints"), {
      key: "Escape",
    });
    expect(screen.getByLabelText("Search benchmark endpoints")).toHaveValue("");
  });
  it("pins a baseline, compares later runs, and highlights changed workload settings", async () => {
    const { user } = await setup();
    await quickPlan(user, 2);
    await runMock(user);
    await user.click(button("Pin benchmark as baseline"));
    expect(
      screen.getByRole("table", { name: "Benchmark baseline comparison" }),
    ).toBeInTheDocument();
    change("Simulated response delay (ms)", "100");
    expect(
      screen.queryByRole("region", { name: "Benchmark results" }),
    ).not.toBeInTheDocument();
    expect(button("Clear benchmark baseline")).toBeInTheDocument();
    await runMock(user);
    expect(
      screen.getByText(/Run modes, workload settings/),
    ).toBeInTheDocument();
    await user.click(button("Clear benchmark baseline"));
    expect(
      screen.queryByRole("table", { name: "Benchmark baseline comparison" }),
    ).not.toBeInTheDocument();
  });
  it("sends explicit Live runs through the existing proxy and clears session headers on target changes", async () => {
    const { user } = await setup();
    await quickPlan(user, 2);
    change("Benchmark execution mode", "live");
    change("Benchmark target server URL", "https://live.example.com/api");
    change(
      "Benchmark session headers (JSON)",
      '{"Authorization":"private-session"}',
    );
    expect(fetch).not.toHaveBeenCalled();
    await user.click(button("Run Live benchmark"));
    await screen.findByRole("region", { name: "Benchmark results" });
    expect(fetch).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(fetch).mock.calls;
    const payload = JSON.parse(calls[0][1]!.body as string);
    expect(payload).toMatchObject({
      method: "GET",
      serverUrl: "https://live.example.com/api",
      requireLive: true,
    });
    expect(payload.requestParameters).toContainEqual({
      location: "header",
      name: "Authorization",
      value: "private-session",
    });
    await user.click(button("Download benchmark JSON"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).not.toMatch(
      /private-session|private-response|private-header|live.example/,
    );
    change("Benchmark target server URL", "https://other.example.com");
    expect(
      screen.getByLabelText("Benchmark session headers (JSON)"),
    ).toHaveValue("{}");
  });
  it("validates live inputs and plan limits before starting any traffic", async () => {
    const { user } = await setup();
    await quickPlan(user);
    change("Measured requests", "200");
    change("Warm-up requests", "20");
    await user.click(button("Run Mock benchmark"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid benchmark plan",
    );
    change("Measured requests", "2");
    change("Warm-up requests", "0");
    change("Benchmark execution mode", "live");
    change("Benchmark target server URL", "https://api.example.com");
    change("Benchmark session headers (JSON)", "{");
    await user.click(button("Run Live benchmark"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session headers must",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("stops in-flight work, exports partial reports, and allows a new run", async () => {
    const { user } = await setup();
    await quickPlan(user);
    change("Simulated response delay (ms)", "5000");
    fireEvent.click(button("Run Mock benchmark"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/active/),
    );
    expect(button("Add benchmark case")).toBeDisabled();
    await user.click(button("Stop benchmark"));
    await screen.findByRole("region", { name: "Benchmark results" });
    expect(screen.getByText("Stopped by user")).toBeInTheDocument();
    await user.click(button("Download benchmark JSON"));
    const report = parseBenchmarkReport(
      vi.mocked(downloadTextFile).mock.calls.at(-1)![0],
    );
    expect(report.stopReason).toBe("cancelled");
    expect(
      report.samples.some((sample) => sample.outcome === "cancelled"),
    ).toBe(true);
    change("Simulated response delay (ms)", "5");
    await runMock(user);
    expect(screen.getByText("Completed", { exact: true })).toBeInTheDocument();
  });
  it("imports plans in Mock mode, clears credentials, and preserves state on invalid imports", async () => {
    const { user } = await setup();
    await quickPlan(user);
    change("Benchmark execution mode", "live");
    change("Benchmark target server URL", "https://api.example.com");
    change(
      "Benchmark session headers (JSON)",
      '{"Authorization":"private-session"}',
    );
    await openImport(user);
    change(
      "Benchmark import JSON",
      serializeBenchmarkPlan({
        ...createBenchmarkPlan(),
        name: "Imported workload",
        requests: 1,
        warmup: 0,
        cases: [createBenchmarkCase(read, "imported")],
      }),
    );
    await user.click(button("Import benchmark JSON"));
    expect(screen.getByLabelText("Benchmark execution mode")).toHaveValue(
      "mock",
    );
    expect(screen.getByLabelText("Benchmark plan name")).toHaveValue(
      "Imported workload",
    );
    expect(fetch).not.toHaveBeenCalled();
    change("Benchmark execution mode", "live");
    expect(
      screen.getByLabelText("Benchmark session headers (JSON)"),
    ).toHaveValue("{}");
    change("Benchmark import JSON", "{}");
    await user.click(button("Import benchmark JSON"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid benchmark plan",
    );
    expect(screen.getByLabelText("Benchmark plan name")).toHaveValue(
      "Imported workload",
    );
  });
  it("imports a report as baseline without replacing the workload or current results", async () => {
    const { user } = await setup();
    await quickPlan(user, 1);
    await runMock(user);
    await user.click(button("Download benchmark JSON"));
    const json = vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
    await openImport(user);
    change("Benchmark import type", "baseline");
    change("Benchmark import JSON", json);
    await user.click(button("Import benchmark JSON"));
    expect(
      screen.getByRole("region", { name: "Benchmark results" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Benchmark baseline comparison" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Measured requests")).toHaveValue(1);
  });
  it("handles file limits and cancellation without stale updates or conflicting exports", async () => {
    const { user } = await setup();
    await quickPlan(user, 1);
    await runMock(user);
    await openImport(user);
    const huge = new File(["{}"], "huge.json");
    Object.defineProperty(huge, "size", { value: MAX_BENCHMARK_BYTES + 1 });
    fireEvent.change(screen.getByLabelText("Import benchmark file"), {
      target: { files: [huge] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "exceeds its size",
    );
    let resolve!: (text: string) => void;
    const file = new File(["{}"], "plan.json");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    fireEvent.change(screen.getByLabelText("Import benchmark file"), {
      target: { files: [file] },
    });
    expect(button("Download benchmark JSON")).toBeDisabled();
    expect(button("Pin benchmark as baseline")).toBeDisabled();
    fireEvent.click(button("Cancel benchmark import"));
    await act(async () => {
      resolve(
        serializeBenchmarkPlan({ ...createBenchmarkPlan(), name: "Stale" }),
      );
    });
    expect(screen.getByLabelText("Benchmark plan name")).toHaveValue(
      "API benchmark",
    );
    expect(button("Run Mock benchmark")).toBeEnabled();
  });
  it("ignores late clipboard completion after configuration changes and reports failed exports", async () => {
    const { user } = await setup();
    await quickPlan(user, 1);
    await runMock(user);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download benchmark JSON"));
    expect(screen.getByRole("alert")).toHaveTextContent("Export failed");
    let resolve!: (ok: boolean) => void;
    vi.mocked(writeTextToClipboard).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    fireEvent.click(button("Copy benchmark report"));
    change("Benchmark plan name", "Updated");
    await act(async () => {
      resolve(true);
    });
    expect(
      screen.queryByText("Benchmark report copied."),
    ).not.toBeInTheDocument();
  });
  it("retains plans and results when closed or when operations disappear", async () => {
    const { user, rerender } = await setup();
    await quickPlan(user, 1);
    await runMock(user);
    await user.click(screen.getByText("API performance lab"));
    await user.click(screen.getByText("API performance lab"));
    expect(
      await screen.findByRole("region", { name: "Benchmark results" }),
    ).toBeInTheDocument();
    rerender(
      <ApiBenchmarkPanel
        allEndpoints={[]}
        visibleEndpoints={[]}
        onSelectEndpoint={navigate}
      />,
    );
    expect(button("Run Mock benchmark")).toBeDisabled();
    expect(
      screen.getByRole("region", { name: "Benchmark results" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("operation is missing");
  });
  it("localizes configuration, reports, and budgets in Russian", async () => {
    act(() => setAppLanguage("ru"));
    const user = userEvent.setup();
    render(
      <ApiBenchmarkPanel
        allEndpoints={all}
        visibleEndpoints={all}
        onSelectEndpoint={navigate}
      />,
    );
    await user.click(screen.getByText("Лаборатория производительности API"));
    await user.click(
      await screen.findByRole("button", { name: "Добавить тест нагрузки" }),
    );
    change("Измеряемые запросы", "1");
    change("Запросы прогрева", "0");
    await user.click(button("Запустить тест Mock"));
    await screen.findByRole("region", { name: "Результаты тестирования" });
    expect(screen.getByText("Завершено", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Репетиция Mock:/)).toBeInTheDocument();
  });
});
