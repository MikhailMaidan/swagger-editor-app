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
import {
  createScenarioStep,
  serializeScenario,
  type ApiScenario,
} from "@/lib/api-scenario";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import type { EndpointSummary } from "@/lib/openapi";
import { ApiScenarioPanel } from "./api-scenario-panel";
import { setAppLanguage } from "./i18n-provider";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const create: EndpointSummary = {
  method: "POST",
  path: "/users",
  operationId: "",
  deprecated: false,
  secured: false,
  securityRequirements: [],
  serverUrl: "https://example.test",
  summary: "Create user",
  description: "",
  tags: [],
  parameters: [],
  requestBodies: [],
  responses: [
    {
      status: "201",
      description: "Created",
      contentTypes: ["application/json"],
      schema: {
        type: "object",
        properties: ["id"],
        requiredProperties: ["id"],
        example: '{"id":7,"token":"response-secret"}',
        exampleName: "",
        hasExplicitExample: true,
      },
    },
  ],
};
const read: EndpointSummary = {
  ...create,
  method: "GET",
  path: "/users/{id}",
  summary: "Read user",
  parameters: [
    {
      name: "id",
      location: "path",
      required: true,
      example: "",
      description: "",
    },
  ],
  responses: create.responses.map((response) => ({
    ...response,
    status: "200",
  })),
};
const endpoints = [create, read];
const onSelectEndpoint = vi.fn();
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const button = (name: string) => screen.getByRole("button", { name });
async function setup() {
  const user = userEvent.setup();
  const view = render(
    <ApiScenarioPanel
      allEndpoints={endpoints}
      onSelectEndpoint={onSelectEndpoint}
    />,
  );
  await user.click(screen.getByText("API scenario runner"));
  await screen.findByLabelText("Scenario name");
  return { user, ...view };
}
async function importPlan(
  user: ReturnType<typeof userEvent.setup>,
  plan: ApiScenario,
) {
  await user.click(screen.getByText("Scenario import and export"));
  change("Scenario JSON to import", serializeScenario(plan));
  await user.click(button("Import scenario definition"));
}
function chainedPlan(): ApiScenario {
  const first = createScenarioStep(create, "create");
  first.extracts = [{ name: "userId", pointer: "/id" }];
  const second = createScenarioStep(read, "read");
  second.parameters[0].value = "{{userId}}";
  return {
    name: "User lifecycle",
    variableNames: ["token"],
    stopOnFailure: true,
    steps: [first, second],
  };
}
beforeEach(() => {
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("ApiScenarioPanel", () => {
  it("authors and rehearses a chained scenario without network or storage writes", async () => {
    const { user } = await setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const storageMock = vi.spyOn(Storage.prototype, "setItem");
    expect(button("Run Mock scenario")).toBeDisabled();
    await user.click(button("Add scenario step"));
    change("Step request body template", '{"name":"{{name}}"}');
    change("Session variables (JSON object)", '{"name":"Ada"}');
    await user.click(button("Add response extraction"));
    change("Extraction 1 variable name", "userId");
    await user.click(
      screen.getByLabelText(
        "Check documented status, media type, and body shape",
      ),
    );
    await user.selectOptions(
      screen.getByLabelText("Endpoint to add"),
      "GET /users/{id}",
    );
    await user.click(button("Add scenario step"));
    change("Parameter 1 value", "{{userId}}");
    await user.click(button("View scenario endpoint"));
    expect(onSelectEndpoint).toHaveBeenCalledWith("GET", "/users/{id}");
    await user.click(button("Run Mock scenario"));
    expect(
      await screen.findByText("Scenario passed · 2/2 steps passed"),
    ).toBeInTheDocument();
    const rows = within(
      screen.getByRole("table", { name: "Scenario step results" }),
    ).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("userId");
    expect(rows[2]).toHaveTextContent("200");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storageMock).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText("Session variables (JSON object)"),
    ).toHaveValue('{"name":"Ada"}');
    change("Scenario name", "Revised scenario");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps independent step drafts when duplicating, reordering, and removing steps", async () => {
    const { user } = await setup();
    await user.click(button("Add scenario step"));
    change("Step request body template", '{"name":"first"}');
    await user.click(button("Duplicate step 1"));
    change("Step request body template", '{"name":"copy"}');
    await user.click(button("Move step 2 up"));
    await user.click(button("Edit scenario step 2"));
    expect(screen.getByLabelText("Step request body template")).toHaveValue(
      '{"name":"first"}',
    );
    await user.click(button("Remove step 2"));
    await user.click(button("Edit scenario step 1"));
    expect(screen.getByLabelText("Step request body template")).toHaveValue(
      '{"name":"copy"}',
    );
    expect(button("Move step 1 up")).toBeDisabled();
    expect(button("Move step 1 down")).toBeDisabled();
    await user.click(button("New empty scenario"));
    expect(button("Run Mock scenario")).toBeDisabled();
    expect(screen.getByText("Scenario steps: 0/20")).toBeInTheDocument();
  });

  it("runs Live requests sequentially and exports definitions and reports without session or response values", async () => {
    const { user } = await setup();
    await importPlan(user, chainedPlan());
    expect(
      JSON.parse(
        (
          screen.getByLabelText(
            "Session variables (JSON object)",
          ) as HTMLTextAreaElement
        ).value,
      ),
    ).toEqual({ token: "" });
    change(
      "Session variables (JSON object)",
      '{"token":"session-secret","enabled":false}',
    );
    await user.click(button("Add step parameter"));
    change("Step request body template", '{"enabled":"{{enabled}}"}');
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () =>
        Response.json({
          body: '{"id":73,"token":"response-secret"}',
          status: "201",
          durationMs: 10,
          headers: {
            "content-type": "application/json",
            "x-secret": "header-secret",
          },
        }),
      )
      .mockImplementationOnce(async () =>
        Response.json({
          body: '{"id":73}',
          status: "200",
          durationMs: 12,
          headers: {},
        }),
      );
    await user.selectOptions(
      screen.getByLabelText("Scenario execution mode"),
      "live",
    );
    await user.click(button("Run Live scenario"));
    expect(
      await screen.findByText("Scenario passed · 2/2 steps passed"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    const second = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(first).toMatchObject({
      requireLive: true,
      method: "POST",
      requestBody: '{"enabled":false}',
      requestParameters: [
        {
          location: "header",
          name: "Authorization",
          value: "Bearer session-secret",
        },
      ],
    });
    expect(second.requestParameters).toEqual([
      { name: "id", location: "path", value: "73" },
    ]);
    await user.click(button("Copy scenario definition"));
    const definition = vi.mocked(writeTextToClipboard).mock.calls[0][0];
    expect(JSON.parse(definition).scenario.variableNames).toEqual([
      "token",
      "enabled",
    ]);
    expect(definition).toContain("Bearer {{token}}");
    expect(definition).not.toContain("session-secret");
    await user.click(button("Download scenario report"));
    const report = vi.mocked(downloadTextFile).mock.calls[0][0];
    expect(JSON.parse(report)).toMatchObject({
      kind: "rsswag-api-scenario-report",
      outcome: "passed",
      mode: "live",
    });
    for (const secret of ["session-secret", "response-secret", "header-secret"])
      expect(report).not.toContain(secret);
    expect(report).not.toContain('"body"');
    expect(report).not.toContain('"headers"');
  });

  it("cancels a pending request and marks later steps skipped while protecting the active definition", async () => {
    const { user } = await setup();
    await importPlan(user, chainedPlan());
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => {}));
    await user.selectOptions(
      screen.getByLabelText("Scenario execution mode"),
      "live",
    );
    await user.click(button("Run Live scenario"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Scenario name")).toBeDisabled();
    expect(button("New empty scenario")).toBeDisabled();
    expect(button("Cancel scenario")).toBeEnabled();
    await user.click(button("Cancel scenario"));
    expect(
      await screen.findByText("Scenario cancelled · 0/2 steps passed"),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Scenario name")).toBeEnabled();
    expect(screen.getByRole("table")).toHaveTextContent("skipped");
  });

  it("aborts an active request when the panel unmounts", async () => {
    const { user, unmount } = await setup();
    await user.click(button("Add scenario step"));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => {}));
    await user.selectOptions(
      screen.getByLabelText("Scenario execution mode"),
      "live",
    );
    await user.click(button("Run Live scenario"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("preserves the draft on invalid imports and while schema endpoints are temporarily unavailable", async () => {
    const { user, rerender } = await setup();
    await importPlan(user, chainedPlan());
    change("Scenario JSON to import", '{"kind":"unrelated"}');
    await user.click(button("Import scenario definition"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Scenario name")).toHaveValue(
      "User lifecycle",
    );
    await user.click(screen.getByText("API scenario runner"));
    await waitFor(() =>
      expect(screen.queryByLabelText("Scenario name")).not.toBeInTheDocument(),
    );
    rerender(
      <ApiScenarioPanel
        allEndpoints={[]}
        onSelectEndpoint={onSelectEndpoint}
      />,
    );
    await user.click(screen.getByText("API scenario runner"));
    expect(await screen.findByLabelText("Scenario name")).toHaveValue(
      "User lifecycle",
    );
    expect(screen.getByText("Scenario steps: 2/20")).toBeInTheDocument();
    expect(button("Add scenario step")).toBeDisabled();
    rerender(
      <ApiScenarioPanel
        allEndpoints={endpoints}
        onSelectEndpoint={onSelectEndpoint}
      />,
    );
    await user.click(button("Run Mock scenario"));
    expect(
      await screen.findByText("Scenario passed · 2/2 steps passed"),
    ).toBeInTheDocument();
  });

  it("loads a file without executing it and does not let delayed clipboard feedback overwrite newer edits", async () => {
    const { user } = await setup();
    await user.click(screen.getByText("Scenario import and export"));
    const file = new File([serializeScenario(chainedPlan())], "scenario.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: async () => serializeScenario(chainedPlan()),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await user.upload(screen.getByLabelText("Import scenario JSON file"), file);
    await waitFor(() =>
      expect(screen.getByLabelText("Scenario name")).toHaveValue(
        "User lifecycle",
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    let finish!: (success: boolean) => void;
    vi.mocked(writeTextToClipboard).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await user.click(button("Copy scenario definition"));
    change("Scenario name", "Newer draft");
    await act(async () => finish(false));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Could not export the scenario. Try again."),
    ).not.toBeInTheDocument();
  });

  it("switches language without losing the scenario", async () => {
    const { user } = await setup();
    await user.click(button("Add scenario step"));
    change("Scenario name", "My scenario");
    act(() => setAppLanguage("ru"));
    expect(screen.getByText("Запуск API-сценариев")).toBeInTheDocument();
    expect(screen.getByDisplayValue("My scenario")).toBeInTheDocument();
    act(() => setAppLanguage("en"));
    expect(screen.getByLabelText("Scenario name")).toHaveValue("My scenario");
  });
});
