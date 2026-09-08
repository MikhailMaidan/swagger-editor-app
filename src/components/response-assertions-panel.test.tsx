import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import {
  serializeResponseAssertions,
  type AssertionResponse,
  type ResponseAssertion,
} from "@/lib/response-assertions";
import { ResponseAssertionsPanel } from "./response-assertions-panel";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const endpoint = { method: "GET", path: "/users/{id}" };
const response: AssertionResponse = {
  body: '{"items":[{"id":7}]}',
  status: "200",
  durationMs: 10,
  source: "live",
  headers: { "content-type": "application/json" },
};
const check: ResponseAssertion = {
  name: "Expected ID",
  target: "body",
  path: "/items/0/id",
  operator: "equals",
  expected: "7",
};
const panel = (value: AssertionResponse | null) => (
  <ResponseAssertionsPanel endpoint={endpoint} response={value} />
);
async function setup(value: AssertionResponse | null = response) {
  const user = userEvent.setup();
  const view = render(panel(value));
  await user.click(screen.getByText("Response assertions"));
  return { user, ...view };
}
async function openTransfer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Import and export checks"));
}
function paste(rules: ResponseAssertion[]) {
  fireEvent.change(screen.getByLabelText("Check set JSON"), {
    target: { value: serializeResponseAssertions(rules) },
  });
}

describe("ResponseAssertionsPanel", () => {
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  });

  it("builds checks before a response, evaluates new responses, and retains checks after clearing", async () => {
    const { user, rerender } = await setup(null);
    expect(screen.getByText(/No checks yet/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add status check" }));
    expect(screen.getByText(/Checks ready/)).toBeVisible();
    expect(
      screen.getByRole("group", { name: "Check 1 · Waiting for response" }),
    ).toBeVisible();
    rerender(panel(response));
    expect(
      screen.getByText("1 passed · 0 failed · 0 errors · Live response"),
    ).toBeVisible();
    rerender(panel({ ...response, status: "404", source: "mock" }));
    expect(
      screen.getByText("0 passed · 1 failed · 0 errors · Mock response"),
    ).toBeVisible();
    rerender(panel(null));
    expect(screen.getByLabelText("Expected value")).toHaveValue("200");
    expect(
      screen.queryByRole("button", { name: "Copy assertion report" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("edits JSON rules with validation and preserves names when changing targets", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Add JSON check" }));
    fireEvent.change(screen.getByLabelText("Check name (optional)"), {
      target: { value: "Items count" },
    });
    fireEvent.change(
      screen.getByLabelText("JSON Pointer (empty = whole body)"),
      { target: { value: "/items" } },
    );
    await user.selectOptions(screen.getByLabelText("Expected value"), "array");
    expect(
      screen.getByRole("group", { name: "Check 1 · Passed" }),
    ).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Condition"), "length");
    fireEvent.change(screen.getByLabelText("Expected value"), {
      target: { value: "1" },
    });
    expect(
      screen.getByRole("group", { name: "Check 1 · Passed" }),
    ).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Condition"), "equals");
    fireEvent.change(screen.getByLabelText("Expected value (JSON)"), {
      target: { value: "oops" },
    });
    expect(screen.getByLabelText("Expected value (JSON)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByRole("group", { name: "Check 1 · Error" }),
    ).toBeVisible();
    fireEvent.change(
      screen.getByLabelText("JSON Pointer (empty = whole body)"),
      { target: { value: "invalid" } },
    );
    expect(
      screen.getByLabelText("JSON Pointer (empty = whole body)"),
    ).toHaveAttribute("aria-invalid", "true");
    await user.selectOptions(screen.getByLabelText("Check target"), "header");
    expect(screen.getByLabelText("Check name (optional)")).toHaveValue(
      "Items count",
    );
    expect(screen.getByLabelText("Header name")).toHaveValue("content-type");
    expect(
      screen.getByRole("group", { name: "Check 1 · Passed" }),
    ).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Condition"), "exists");
    expect(screen.queryByLabelText("Expected value")).not.toBeInTheDocument();
  });

  it("filters outcomes and exports all numbered results without values", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Add status check" }));
    await user.click(screen.getByRole("button", { name: "Add timing check" }));
    const timing = within(
      screen.getByRole("group", { name: "Check 2 · Passed" }),
    );
    fireEvent.change(timing.getByLabelText("Expected value"), {
      target: { value: "1" },
    });
    await user.selectOptions(
      screen.getByLabelText("Filter assertion results"),
      "fail",
    );
    expect(screen.getAllByRole("group", { name: /^Check \d/ })).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Copy assertion report" }),
    );
    const report = JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]);
    expect(report.summary).toEqual({ total: 2, pass: 1, fail: 1, error: 0 });
    expect(report.results).toHaveLength(2);
    expect(JSON.stringify(report)).not.toMatch(/expected|body|headers/);
    await user.selectOptions(
      screen.getByLabelText("Filter assertion results"),
      "error",
    );
    expect(screen.getByText("No checks match this filter.")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Download assertion report" }),
    );
    expect(downloadTextFile).toHaveBeenCalledWith(
      expect.any(String),
      "rsswag-get-users-id-assertion-report.json",
      "application/json",
    );
  });

  it("appends imported rules without replacing existing checks and exports reusable definitions", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Add header check" }));
    await openTransfer(user);
    paste([check]);
    await user.click(
      screen.getByRole("button", { name: "Append imported checks" }),
    );
    expect(screen.getAllByRole("group", { name: /^Check \d/ })).toHaveLength(2);
    expect(screen.getByLabelText("Check set JSON")).toHaveValue("");
    expect(
      screen.getByText("2 passed · 0 failed · 0 errors · Live response"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Copy check set" }));
    const set = JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]);
    expect(set.kind).toBe("rsswag-response-assertions");
    expect(set.checks[1]).toEqual(check);
    await user.click(
      screen.getByRole("button", { name: "Download check set" }),
    );
    expect(downloadTextFile).toHaveBeenCalledWith(
      expect.any(String),
      "rsswag-get-users-id-assertion-set.json",
      "application/json",
    );
    await user.click(screen.getByRole("button", { name: "Remove check 1" }));
    expect(screen.getByLabelText("Check name (optional)")).toHaveValue(
      "Expected ID",
    );
    expect(screen.getAllByRole("group", { name: /^Check \d/ })).toHaveLength(1);
  });

  it("rejects invalid imports without discarding checks and enforces combined rule limits", async () => {
    const { user } = await setup(null);
    await user.click(screen.getByRole("button", { name: "Add status check" }));
    await openTransfer(user);
    fireEvent.change(screen.getByLabelText("Check set JSON"), {
      target: { value: "invalid" },
    });
    await user.click(
      screen.getByRole("button", { name: "Append imported checks" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/valid version 1/);
    expect(screen.getAllByRole("group", { name: /^Check \d/ })).toHaveLength(1);
    paste(Array.from({ length: 50 }, () => check));
    await user.click(
      screen.getByRole("button", { name: "Append imported checks" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/at most 50/);
    paste(Array.from({ length: 49 }, () => check));
    await user.click(
      screen.getByRole("button", { name: "Append imported checks" }),
    );
    expect(screen.getAllByRole("group", { name: /^Check \d/ })).toHaveLength(
      50,
    );
    expect(
      screen.getByRole("button", { name: "Add JSON check" }),
    ).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks invalid definition exports but allows reports to record evaluation errors", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Add status check" }));
    fireEvent.change(screen.getByLabelText("Expected value"), {
      target: { value: "999" },
    });
    await openTransfer(user);
    expect(
      screen.getByRole("button", { name: "Copy check set" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download check set" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Copy assertion report" }),
    );
    expect(
      JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]).summary
        .error,
    ).toBe(1);
  });

  it("shows evaluation errors for non-JSON responses instead of passing absence checks", async () => {
    const { user } = await setup({ ...response, body: "not JSON" });
    await user.click(screen.getByRole("button", { name: "Add JSON check" }));
    await user.selectOptions(screen.getByLabelText("Condition"), "absent");
    expect(
      screen.getByRole("group", { name: "Check 1 · Error" }),
    ).toBeVisible();
    expect(
      screen.getByText(/The response body is not valid JSON/),
    ).toBeVisible();
  });

  it("reports clipboard and download failures and allows retries", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Add status check" }));
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(
      screen.getByRole("button", { name: "Copy assertion report" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Copy failed");
    await user.click(
      screen.getByRole("button", { name: "Copy assertion report" }),
    );
    expect(screen.getByText("Copied to clipboard.")).toBeVisible();
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(
      screen.getByRole("button", { name: "Download assertion report" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Download failed");
    await user.click(
      screen.getByRole("button", { name: "Download assertion report" }),
    );
    expect(screen.getByText("Download started.")).toBeVisible();
  });

  it("hides stale asynchronous copy feedback after checks change", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Add status check" }));
    let finish!: (value: boolean) => void;
    vi.mocked(writeTextToClipboard).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(
      screen.getByRole("button", { name: "Copy assertion report" }),
    );
    fireEvent.change(screen.getByLabelText("Expected value"), {
      target: { value: "201" },
    });
    await act(async () => finish(true));
    expect(screen.queryByText("Copied to clipboard.")).not.toBeInTheDocument();
  });

  it("renders localized Russian controls and outcomes", async () => {
    window.localStorage.setItem("rsswagger-language", "ru");
    const user = userEvent.setup();
    render(panel(response));
    await user.click(screen.getByText("Проверки ответа"));
    await user.click(
      screen.getByRole("button", { name: "Добавить проверку статуса" }),
    );
    expect(
      screen.getByText(
        "Успешно: 1 · Не пройдено: 0 · Ошибок: 0 · Ответ: Реальный",
      ),
    ).toBeVisible();
  });
});
