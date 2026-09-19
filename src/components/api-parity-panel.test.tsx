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
import { ApiParityPanel } from "./api-parity-panel";
import { setAppLanguage } from "./i18n-provider";
import {
  createParityCase,
  createParityPlan,
  MAX_PARITY_BYTES,
  serializeParityPlan,
  type ParityPlan,
} from "@/lib/api-parity";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import type { EndpointSummary } from "@/lib/openapi";

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
        requiredProperties: ["id"],
        example: '{"id":7,"token":"secret-response"}',
        exampleName: "",
        hasExplicitExample: true,
      },
    },
    { status: "404", description: "Missing", contentTypes: [], schema: null },
  ],
};
const head = { ...read, method: "HEAD", path: "/health", parameters: [] };
const post = { ...read, method: "POST", path: "/items", parameters: [] };
const endpoints = [read, head, post];
const navigate = vi.fn();
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const makePlan = (): ParityPlan => ({
  ...createParityPlan(),
  cases: [createParityCase(read, "one")],
});
async function setup() {
  const user = userEvent.setup();
  const view = render(
    <ApiParityPanel
      allEndpoints={endpoints}
      visibleEndpoints={endpoints}
      onSelectEndpoint={navigate}
    />,
  );
  await user.click(screen.getByText("Environment comparison runner"));
  await screen.findByLabelText("Comparison plan name");
  return { user, ...view };
}
async function openImport(user: ReturnType<typeof userEvent.setup>) {
  const textarea = screen.getByLabelText("Comparison plan JSON");
  if (!textarea.closest("details")?.open)
    await user.click(screen.getByText("Comparison plan import and export"));
}
async function paste(
  user: ReturnType<typeof userEvent.setup>,
  plan: ParityPlan | string,
) {
  await openImport(user);
  change(
    "Comparison plan JSON",
    typeof plan === "string" ? plan : serializeParityPlan(plan),
  );
  await user.click(button("Import comparison plan"));
}
async function live(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    screen.getByLabelText("Comparison execution mode"),
    "live",
  );
  change("Baseline server URL", "https://baseline.example.com/api");
  change("Candidate server URL", "https://candidate.example.com/api");
}
function proxyResponse(body = '{"id":7}', durationMs = 10) {
  return new Response(
    JSON.stringify({
      status: "200",
      body,
      headers: { "content-type": "application/json" },
      durationMs,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
function file(text: string) {
  const input = new File([text], "comparison.json", {
    type: "application/json",
  });
  Object.defineProperty(input, "text", {
    configurable: true,
    value: async () => text,
  });
  return input;
}
beforeEach(() => {
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  navigate.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("ApiParityPanel", () => {
  it("builds and runs an offline suite from visible GET/HEAD endpoints, filters results and exports", async () => {
    const { user } = await setup();
    const network = vi.spyOn(globalThis, "fetch");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    expect(screen.getByLabelText("Comparison execution mode")).toHaveValue(
      "mock",
    );
    expect(
      within(screen.getByLabelText("Endpoint to compare")).queryByRole(
        "option",
        { name: /POST/ },
      ),
    ).not.toBeInTheDocument();
    await user.click(button("Add visible GET/HEAD endpoints"));
    expect(screen.getByText("Comparison cases: 2/20")).toBeInTheDocument();
    expect(button("Add visible GET/HEAD endpoints")).toBeDisabled();
    await user.click(button("Run Mock comparison"));
    await screen.findByText("Mock comparison: all cases matched");
    expect(screen.getByText("Completed cases: 2/2")).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Filter comparison results"),
      "issues",
    );
    expect(
      screen.getByText("No results match these filters."),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Filter comparison results"),
      "matched",
    );
    change("Search comparison results", "GET items 200");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      2,
    );
    fireEvent.keyDown(screen.getByLabelText("Search comparison results"), {
      key: "Escape",
    });
    expect(screen.getByLabelText("Search comparison results")).toHaveValue("");
    expect(screen.getByLabelText("Filter comparison results")).toHaveValue(
      "matched",
    );
    await user.click(button("Copy comparison report"));
    const report = vi.mocked(writeTextToClipboard).mock.calls[0][0];
    expect(report).not.toContain("secret-response");
    expect(JSON.parse(report)).toMatchObject({
      mode: "mock",
      outcome: "matched",
      results: [{ method: "GET" }, { method: "HEAD" }],
    });
    await user.click(button("Download comparison report"));
    expect(downloadTextFile).toHaveBeenLastCalledWith(
      report,
      "rsswag-environment-report.json",
      "application/json",
    );
    await openImport(user);
    await user.click(button("Download comparison plan"));
    expect(downloadTextFile).toHaveBeenLastCalledWith(
      expect.any(String),
      "rsswag-environment-plan.json",
      "application/json",
    );
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });

  it("runs live pairs with session credentials, highlights latency and body differences, and omits secrets", async () => {
    const { user } = await setup();
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(proxyResponse('{"id":7,"token":"private-a"}', 10))
      .mockResolvedValueOnce(proxyResponse('{"id":8,"token":"private-b"}', 90));
    await user.click(button("Add comparison case"));
    await live(user);
    await user.click(screen.getByText("Session headers for each target"));
    change(
      "Baseline session headers (JSON)",
      '{"Authorization":"Bearer baseline-secret"}',
    );
    change(
      "Candidate session headers (JSON)",
      '{"Authorization":"Bearer candidate-secret"}',
    );
    await user.click(screen.getByText("Comparison rules"));
    change("Allowed candidate slowdown (ms; 0 disables)", "40");
    expect(network).not.toHaveBeenCalled();
    await user.click(button("Run Live comparison"));
    await screen.findByText("Live comparison: review required");
    expect(network).toHaveBeenCalledTimes(2);
    const payloads = network.mock.calls.map(([, init]) =>
      JSON.parse(init!.body as string),
    );
    expect(payloads[0]).toMatchObject({
      requireLive: true,
      serverUrl: "https://baseline.example.com/api",
      method: "GET",
      requestBody: "",
    });
    expect(payloads[0].requestParameters).toContainEqual({
      name: "Authorization",
      location: "header",
      value: "Bearer baseline-secret",
    });
    expect(payloads[1].requestParameters).toContainEqual({
      name: "Authorization",
      location: "header",
      value: "Bearer candidate-secret",
    });
    expect(
      screen.getByText("The candidate exceeded the allowed latency increase."),
    ).toBeInTheDocument();
    expect(screen.getByText("Body · Changed · /id")).toBeInTheDocument();
    await user.click(button("Copy comparison report"));
    const report = vi.mocked(writeTextToClipboard).mock.calls[0][0];
    expect(report).not.toMatch(
      /baseline-secret|candidate-secret|private-a|private-b|example\.com/,
    );
    await openImport(user);
    await user.click(button("Copy comparison plan"));
    const definition = vi.mocked(writeTextToClipboard).mock.calls[1][0];
    expect(definition).not.toMatch(
      /baseline-secret|candidate-secret|private-a|private-b/,
    );
    expect(definition).toContain("baseline.example.com");
    change("Candidate server URL", "https://new.example.com");
    expect(
      screen.getByLabelText("Candidate session headers (JSON)"),
    ).toHaveValue("{}");
    expect(
      screen.getByLabelText("Baseline session headers (JSON)"),
    ).toHaveValue('{"Authorization":"Bearer baseline-secret"}');
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("cancels a request even with the panel closed and releases controls afterwards", async () => {
    const { user } = await setup();
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => {}));
    await user.click(button("Add visible GET/HEAD endpoints"));
    await live(user);
    await user.click(button("Run Live comparison"));
    await waitFor(() => expect(network).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Comparison plan name")).toBeDisabled();
    await user.click(screen.getByText("Environment comparison runner"));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Comparison plan name"),
      ).not.toBeInTheDocument(),
    );
    await user.click(button("Cancel environment comparison"));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Cancel environment comparison" }),
      ).not.toBeInTheDocument(),
    );
    expect(network.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await user.click(screen.getByText("Environment comparison runner"));
    await screen.findByText("Live comparison: cancelled");
    expect(screen.getByLabelText("Comparison plan name")).toBeEnabled();
    expect(screen.getByText("Completed cases: 2/2")).toBeInTheDocument();
    expect(network).toHaveBeenCalledOnce();
  });

  it("prevents any request when a later case is incomplete and permits editing, reordering and duplication", async () => {
    const { user } = await setup();
    const network = vi.spyOn(globalThis, "fetch");
    await user.click(button("Add visible GET/HEAD endpoints"));
    await user.click(button("Duplicate comparison case"));
    change("Comparison case name", "Another health check");
    await user.click(button("Move comparison case 3 up"));
    await user.click(button("Move comparison case 2 up"));
    await user.click(button("Move comparison case 1 down"));
    await user.click(button("Remove comparison case 3"));
    await user.click(button("Add comparison parameter"));
    change("Parameter 1 name", "X-Required");
    await user.selectOptions(
      screen.getByLabelText("Parameter 1 location"),
      "header",
    );
    change("Parameter 1 value", "common-header");
    await user.click(button("Remove parameter 1"));
    await user.click(button("View comparison endpoint"));
    expect(navigate).toHaveBeenCalledWith("HEAD", "/health");
    await user.click(screen.getByRole("button", { name: /1\. GET \/items/ }));
    change("Parameter 1 value", "");
    await live(user);
    await user.click(button("Run Live comparison"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "required parameter is missing",
    );
    expect(network).not.toHaveBeenCalled();
    await user.click(button("Clear comparison cases"));
    expect(screen.getByText("Comparison cases: 0/20")).toBeInTheDocument();
  });

  it("imports definitions, preserves failed imports, resets credentials and handles blocked exports", async () => {
    const { user } = await setup();
    await user.click(button("Add comparison case"));
    await live(user);
    await user.click(screen.getByText("Session headers for each target"));
    change(
      "Baseline session headers (JSON)",
      '{"Authorization":"private-old"}',
    );
    await paste(user, "{}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid comparison plan",
    );
    expect(screen.getByText("Comparison cases: 1/20")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Baseline session headers (JSON)"),
    ).toHaveValue('{"Authorization":"private-old"}');
    const definition = makePlan();
    definition.name = "Imported comparison";
    await user.upload(
      screen.getByLabelText("Import comparison plan file"),
      file(serializeParityPlan(definition)),
    );
    await screen.findByText(
      "Comparison plan imported. Session headers cleared and Mock mode selected.",
    );
    expect(screen.getByLabelText("Comparison plan name")).toHaveValue(
      "Imported comparison",
    );
    expect(screen.getByLabelText("Comparison execution mode")).toHaveValue(
      "mock",
    );
    await user.selectOptions(
      screen.getByLabelText("Comparison execution mode"),
      "live",
    );
    await user.click(screen.getByText("Session headers for each target"));
    expect(
      screen.getByLabelText("Baseline session headers (JSON)"),
    ).toHaveValue("{}");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download comparison plan"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "browser blocked the download",
    );
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(button("Copy comparison plan"));
    expect(screen.getByRole("alert")).toHaveTextContent("Copy failed");
    const oversized = file("{}");
    Object.defineProperty(oversized, "size", { value: MAX_PARITY_BYTES + 1 });
    await user.upload(
      screen.getByLabelText("Import comparison plan file"),
      oversized,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "comparison limit was reached",
    );
    expect(screen.getByLabelText("Comparison plan name")).toHaveValue(
      "Imported comparison",
    );
  });

  it("does not let a late clipboard result mask an import error and aborts requests on unmount", async () => {
    const { user, unmount } = await setup();
    await user.click(button("Add comparison case"));
    await openImport(user);
    let finish: (ok: boolean) => void = () => {};
    vi.mocked(writeTextToClipboard).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(button("Copy comparison plan"));
    await paste(user, "invalid");
    await act(async () => finish(true));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid comparison plan",
    );
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => {}));
    await live(user);
    await user.click(button("Run Live comparison"));
    await waitFor(() => expect(network).toHaveBeenCalledOnce());
    unmount();
    expect(network.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("supports Russian results and a rehearsal with different response variants", async () => {
    const { user } = await setup();
    await user.click(button("Add comparison case"));
    await user.selectOptions(
      screen.getByLabelText("Candidate mock response"),
      "404",
    );
    await act(async () => setAppLanguage("ru"));
    await user.click(button("Запустить Mock-сравнение"));
    await screen.findByText("Сравнение Mock: требуется проверка");
    expect(screen.getByText("Завершено случаев: 1/1")).toBeInTheDocument();
    await user.click(button("Скопировать отчёт сравнения"));
    expect(
      JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]).results[0],
    ).toMatchObject({ outcome: "different", candidate: { status: "404" } });
  });
});
