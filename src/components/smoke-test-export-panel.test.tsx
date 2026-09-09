import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { parseOpenApiSchema } from "@/lib/openapi";
import { SmokeTestExportPanel } from "./smoke-test-export-panel";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", async (original) => ({
  ...(await original<typeof import("@/lib/schema-download")>()),
  downloadTextFile: vi.fn(),
}));
const parsed = parseOpenApiSchema(`openapi: 3.1.0
info: { title: Test API, version: '1' }
paths:
  /items/{id}:
    get:
      parameters:
        - { in: path, name: id, required: true, schema: { type: string } }
      responses:
        '200': { description: OK }
  /health:
    head:
      deprecated: true
      responses:
        '204': { description: OK }
  /items:
    post:
      responses:
        '201': { description: Created }
`);
if (!parsed.ok) throw new Error(parsed.error);
const endpoints = parsed.value.endpoints;
const panel = (visible = endpoints.slice(0, 1)) => (
  <SmokeTestExportPanel
    allEndpoints={endpoints}
    visibleEndpoints={visible}
    title="Test API"
  />
);

describe("SmokeTestExportPanel", () => {
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  });

  it("defaults to the visible scope and lists required inputs without executing requests", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      render(panel());
      expect(
        screen.getByText("1 smoke tests · 0 excluded operations"),
      ).toBeVisible();
      await user.click(
        screen.getByText("Generated smoke-test inventory", {
          selector: "summary",
        }),
      );
      expect(
        within(screen.getByRole("table")).getByText("GET /items/{id}"),
      ).toBeVisible();
      expect(within(screen.getByRole("table")).getByText("1")).toBeVisible();
      await user.selectOptions(
        screen.getByLabelText("Smoke-test scope"),
        "all",
      );
      expect(
        screen.getByText("2 smoke tests · 1 excluded operations"),
      ).toBeVisible();
      await user.click(screen.getByLabelText("Include deprecated smoke tests"));
      expect(
        screen.getByText("1 smoke tests · 2 excluded operations"),
      ).toBeVisible();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("downloads executable source and a separate editable configuration", async () => {
    const user = userEvent.setup();
    render(panel());
    await user.click(
      screen.getByRole("button", { name: "Download smoke-test runner" }),
    );
    expect(downloadTextFile).toHaveBeenCalledWith(
      expect.stringContaining("export async function runSmokeTests"),
      "rsswag-test-api-smoke-tests.mjs",
      "text/javascript;charset=utf-8",
    );
    await user.click(
      screen.getByRole("button", { name: "Download smoke-test configuration" }),
    );
    const config = JSON.parse(vi.mocked(downloadTextFile).mock.calls[1][0]);
    expect(config.baseUrl).toBe("");
    expect(config.operations["GET /items/{id}"].parameters.path).toEqual({
      id: "",
    });
    expect(screen.getByText("Smoke-test download started.")).toBeVisible();
  });

  it("previews and copies each file and applies JSON, timeout, and timing options", async () => {
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByText("Preview smoke-test files"));
    await user.click(
      screen.getByLabelText("Check JSON shape and required properties"),
    );
    await user.click(screen.getByLabelText("Enforce a response-time budget"));
    fireEvent.change(screen.getByLabelText("Response-time budget (ms)"), {
      target: { value: "400" },
    });
    fireEvent.change(screen.getByLabelText("Request timeout (ms)"), {
      target: { value: "2000" },
    });
    await user.click(
      screen.getByRole("button", { name: "Copy smoke-test preview" }),
    );
    expect(vi.mocked(writeTextToClipboard).mock.calls[0][0]).toContain(
      '"checkJson": false',
    );
    expect(vi.mocked(writeTextToClipboard).mock.calls[0][0]).toContain(
      '"maxDurationMs": 400',
    );
    await user.selectOptions(
      screen.getByLabelText("Smoke-test preview file"),
      "config",
    );
    await user.click(
      screen.getByRole("button", { name: "Copy smoke-test preview" }),
    );
    expect(
      JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[1][0]).timeoutMs,
    ).toBe(2000);
    expect(
      screen.getByLabelText("Generated smoke-test source"),
    ).toHaveTextContent('"baseUrl": ""');
    await user.click(screen.getByText("Running smoke tests in CI"));
    expect(
      screen.getByText(/node rsswag-test-api-smoke-tests.mjs/),
    ).toBeVisible();
  });

  it("blocks invalid settings and empty scopes, then recovers", async () => {
    const user = userEvent.setup();
    const { rerender } = render(panel());
    fireEvent.change(screen.getByLabelText("Request timeout (ms)"), {
      target: { value: "0" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("whole milliseconds");
    expect(
      screen.getByRole("button", { name: "Download smoke-test runner" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Request timeout (ms)"), {
      target: { value: "1000" },
    });
    await user.click(screen.getByLabelText("Enforce a response-time budget"));
    fireEvent.change(screen.getByLabelText("Response-time budget (ms)"), {
      target: { value: "" },
    });
    expect(
      screen.getByRole("button", { name: "Download smoke-test configuration" }),
    ).toBeDisabled();
    await user.click(screen.getByLabelText("Enforce a response-time budget"));
    expect(
      screen.getByRole("button", { name: "Download smoke-test runner" }),
    ).toBeEnabled();
    rerender(panel([]));
    expect(screen.getByText(/No GET or HEAD endpoints/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download smoke-test runner" }),
    ).toBeDisabled();
  });

  it("reports action failures and permits retries", async () => {
    const user = userEvent.setup();
    render(panel());
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(
      screen.getByRole("button", { name: "Download smoke-test runner" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Download failed");
    await user.click(
      screen.getByRole("button", { name: "Download smoke-test runner" }),
    );
    expect(screen.getByText("Smoke-test download started.")).toBeVisible();
    await user.click(screen.getByText("Preview smoke-test files"));
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(
      screen.getByRole("button", { name: "Copy smoke-test preview" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Copy failed");
    await user.click(
      screen.getByRole("button", { name: "Copy smoke-test preview" }),
    );
    expect(screen.getByText("Smoke-test file copied.")).toBeVisible();
  });

  it("hides stale async feedback when switching preview files", async () => {
    const user = userEvent.setup();
    render(panel());
    let finish!: (value: boolean) => void;
    vi.mocked(writeTextToClipboard).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(screen.getByText("Preview smoke-test files"));
    await user.click(
      screen.getByRole("button", { name: "Copy smoke-test preview" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Smoke-test preview file"),
      "config",
    );
    await act(async () => finish(true));
    expect(
      screen.queryByText("Smoke-test file copied."),
    ).not.toBeInTheDocument();
  });

  it("renders Russian controls", () => {
    window.localStorage.setItem("rsswagger-language", "ru");
    render(panel());
    expect(
      screen.getByRole("heading", { name: "Экспорт smoke-тестов для CI" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Скачать скрипт smoke-тестов" }),
    ).toBeEnabled();
  });
});
