import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { ResponseDataExplorer } from "./response-data-explorer";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const body = JSON.stringify({
  items: [
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace", extra: null },
  ],
  "a/b": { "~id": 7 },
  "": false,
});
const panel = (value: string | null = body) => (
  <ResponseDataExplorer
    body={value}
    endpoint={{ method: "GET", path: "/users/{id}" }}
  />
);
async function setup(value: string | null = body) {
  const user = userEvent.setup();
  const view = render(panel(value));
  if (value !== null) {
    await user.click(screen.getByText("Response data explorer"));
  }
  return { user, ...view };
}
async function go(user: ReturnType<typeof userEvent.setup>, pointer: string) {
  fireEvent.change(await screen.findByLabelText("Explore JSON Pointer"), {
    target: { value: pointer },
  });
  await user.click(screen.getByRole("button", { name: "Go to JSON value" }));
}

describe("ResponseDataExplorer", () => {
  it("clears JSON search with Escape while preserving location, type, and focus", async () => {
    const { user } = await setup();
    await go(user, "/items");
    await user.selectOptions(
      screen.getByLabelText("Filter JSON value type"),
      "string",
    );
    const search = screen.getByLabelText("Search response paths and values");
    await user.type(search, "missing");
    expect(search).toHaveAttribute("aria-keyshortcuts", "Escape");
    expect(search).toHaveAttribute("title", "Press Escape to clear search");
    for (const modifier of [
      "ctrlKey",
      "metaKey",
      "altKey",
      "shiftKey",
      "isComposing",
    ]) {
      fireEvent.keyDown(search, { key: "Escape", [modifier]: true });
      expect(search).toHaveValue("missing");
    }
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(screen.getByLabelText("Explore JSON Pointer")).toHaveValue("/items");
    expect(screen.getByLabelText("Filter JSON value type")).toHaveValue(
      "string",
    );
    expect(
      screen.getByText("2 matching values in the whole response"),
    ).toBeVisible();
    expect(fireEvent.keyDown(search, { key: "Escape" })).toBe(true);
  });

  it("clears table search with Escape while preserving columns and resetting pagination", async () => {
    const { user } = await setup(
      JSON.stringify(
        Array.from({ length: 60 }, (_, id) => ({
          id,
          name: `Row ${id}`,
          extra: "keep",
        })),
      ),
    );
    await user.selectOptions(
      await screen.findByLabelText("Array display"),
      "table",
    );
    await user.click(screen.getByText("Choose table columns"));
    await user.click(screen.getByRole("checkbox", { name: '"extra"' }));
    const search = screen.getByLabelText("Filter response table rows");
    await user.type(search, "row");
    await user.click(screen.getByRole("button", { name: "Next data page" }));
    expect(screen.getByText("Page 2 of 3")).toBeVisible();
    await user.click(search);
    expect(search).toHaveAttribute("aria-keyshortcuts", "Escape");
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    expect(screen.getByLabelText("Array display")).toHaveValue("table");
    expect(screen.getByRole("checkbox", { name: '"extra"' })).not.toBeChecked();
    await user.click(
      screen.getByRole("button", { name: "Download filtered CSV" }),
    );
    const exported = vi.mocked(downloadTextFile).mock.calls[0][0];
    expect(exported).toMatch(/^\uFEFF"#","id","name"\r\n/);
    expect(exported).toContain('"59","59","Row 59"');
    expect(exported.split("\r\n")).toHaveLength(62);
  });
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  });

  it("opens on demand, navigates escaped pointers and breadcrumbs, and preserves the selected JSON type", async () => {
    const user = userEvent.setup();
    render(panel());
    expect(
      screen.queryByLabelText("Explore JSON Pointer"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByText("Response data explorer"));
    await go(user, "/a~1b/~0id");
    await user.click(
      screen.getByRole("button", { name: "Copy selected JSON Pointer" }),
    );
    expect(writeTextToClipboard).toHaveBeenLastCalledWith("/a~1b/~0id");
    await user.click(
      screen.getByRole("button", { name: "Copy selected JSON" }),
    );
    expect(writeTextToClipboard).toHaveBeenLastCalledWith("7");
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Response JSON location" }),
      ).getByRole("button", { name: "Root" }),
    );
    expect(screen.getByLabelText("Explore JSON Pointer")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /^"items"/ }));
    expect(screen.getByLabelText("Explore JSON Pointer")).toHaveValue("/items");
    await go(user, "/");
    await user.click(
      screen.getByRole("button", { name: "Copy selected JSON" }),
    );
    expect(writeTextToClipboard).toHaveBeenLastCalledWith("false");
  });

  it("reports invalid or missing pointers without changing the current selection", async () => {
    const { user } = await setup();
    await go(user, "/items");
    for (const pointer of ["items", "/missing", "/items/01", "/a~2b"]) {
      await go(user, pointer);
      expect(screen.getByRole("alert")).toHaveTextContent("valid JSON Pointer");
      expect(screen.getByLabelText("Explore JSON Pointer")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await user.click(
        screen.getByRole("button", { name: "Copy selected JSON Pointer" }),
      );
      expect(writeTextToClipboard).toHaveBeenLastCalledWith("/items");
    }
    await go(user, "");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("searches the whole response and narrows matches by JSON type", async () => {
    const { user } = await setup();
    await go(user, "/a~1b");
    fireEvent.change(
      screen.getByLabelText("Search response paths and values"),
      { target: { value: "items GRACE" } },
    );
    expect(
      screen.getByText("1 matching values in the whole response"),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Filter JSON value type"),
      "number",
    );
    expect(
      screen.getByText("0 matching values in the whole response"),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Filter JSON value type"),
      "string",
    );
    await user.click(screen.getByRole("button", { name: /^\/items\/1\/name/ }));
    expect(screen.getByLabelText("Explore JSON Pointer")).toHaveValue(
      "/items/1/name",
    );
    expect(
      screen.getByLabelText("Search response paths and values"),
    ).toHaveValue("");
  });

  it("filters array rows, selects columns, exports complete CSV, and drills into a row", async () => {
    const { user } = await setup();
    await go(user, "/items");
    await user.selectOptions(screen.getByLabelText("Array display"), "table");
    expect(
      within(screen.getByRole("table")).getByText("(missing)"),
    ).toBeVisible();
    await user.click(screen.getByText("Choose table columns"));
    await user.click(screen.getByRole("checkbox", { name: '"extra"' }));
    fireEvent.change(screen.getByLabelText("Filter response table rows"), {
      target: { value: "grace" },
    });
    expect(screen.getByText("1 matching rows of 2")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Download filtered CSV" }),
    );
    expect(downloadTextFile).toHaveBeenLastCalledWith(
      '\uFEFF"#","id","name"\r\n"1","2","Grace"\r\n',
      "rsswag-get-users-id-response-data.csv",
      "text/csv;charset=utf-8",
    );
    await user.click(screen.getByRole("button", { name: "Explore row 1" }));
    expect(screen.getByLabelText("Explore JSON Pointer")).toHaveValue(
      "/items/1",
    );
    await user.click(
      screen.getByRole("button", { name: "Download selected JSON" }),
    );
    expect(JSON.parse(vi.mocked(downloadTextFile).mock.calls[1][0])).toEqual({
      id: 2,
      name: "Grace",
      extra: null,
    });
  });

  it("paginates navigation and tables while CSV exports every matching row", async () => {
    const { user } = await setup(
      JSON.stringify(Array.from({ length: 60 }, (_, id) => ({ id }))),
    );
    await screen.findByText("Page 1 of 3");
    expect(
      screen.getByRole("button", { name: "Previous data page" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next data page" }));
    expect(screen.getByText("Page 2 of 3")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Previous data page" }),
    );
    await user.selectOptions(screen.getByLabelText("Array display"), "table");
    await user.click(screen.getByRole("button", { name: "Next data page" }));
    expect(
      screen.getByRole("button", { name: "Explore row 25" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Download filtered CSV" }),
    );
    expect(vi.mocked(downloadTextFile).mock.calls[0][0]).toContain('"59","59"');
    expect(
      vi.mocked(downloadTextFile).mock.calls[0][0].split("\r\n"),
    ).toHaveLength(62);
  });

  it("supports value columns and disables CSV when all columns are hidden", async () => {
    const { user } = await setup('[1,null,"=formula"]');
    await user.selectOptions(
      await screen.findByLabelText("Array display"),
      "table",
    );
    expect(
      within(screen.getByRole("table")).getByRole("columnheader", {
        name: "Value",
      }),
    ).toBeVisible();
    await user.click(screen.getByText("Choose table columns"));
    await user.click(screen.getByRole("checkbox", { name: "Value" }));
    expect(
      screen.getByRole("button", { name: "Download filtered CSV" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Value" }));
    expect(
      screen.getByRole("button", { name: "Download filtered CSV" }),
    ).toBeEnabled();
  });

  it("exports full values when previews are shortened", async () => {
    const value = "a".repeat(9000);
    const { user } = await setup(JSON.stringify(value));
    await user.click(await screen.findByText("Preview selected JSON"));
    expect(screen.getByText(/Preview shortened to 8,000/)).toBeVisible();
    expect(
      screen.getByLabelText("Selected JSON preview").textContent,
    ).toHaveLength(8000);
    await user.click(
      screen.getByRole("button", { name: "Download selected JSON" }),
    );
    expect(vi.mocked(downloadTextFile).mock.calls[0][0]).toBe(
      JSON.stringify(value),
    );
  });

  it("resets navigation after response changes, closing, and clearing without persistent storage", async () => {
    const { user, rerender } = await setup();
    await go(user, "/items");
    rerender(panel('{"new":true}'));
    expect(screen.getByLabelText("Explore JSON Pointer")).toHaveValue("");
    await go(user, "/new");
    await user.click(screen.getByText("Response data explorer"));
    await user.click(screen.getByText("Response data explorer"));
    expect(await screen.findByLabelText("Explore JSON Pointer")).toHaveValue(
      "",
    );
    rerender(panel(null));
    expect(
      screen.queryByText("Response data explorer"),
    ).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("explains invalid JSON and table limits while preserving JSON export", async () => {
    const { user, rerender } = await setup("not JSON");
    expect(
      await screen.findByText(/This response is not valid JSON/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Download selected JSON" }),
    ).not.toBeInTheDocument();
    rerender(panel(JSON.stringify(Array(5001).fill(0))));
    await user.selectOptions(screen.getByLabelText("Array display"), "table");
    expect(screen.getByText(/5,000-row table limit/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download selected JSON" }),
    ).toBeEnabled();
  });

  it("reports copy and download failures, supports retries, and ignores stale copy results", async () => {
    const { user } = await setup();
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(
      await screen.findByRole("button", { name: "Copy selected JSON" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Copy failed");
    await user.click(
      screen.getByRole("button", { name: "Copy selected JSON" }),
    );
    expect(screen.getByText("Response data copied.")).toBeVisible();
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(
      screen.getByRole("button", { name: "Download selected JSON" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Download failed");
    await user.click(
      screen.getByRole("button", { name: "Download selected JSON" }),
    );
    expect(screen.getByText("Response data download started.")).toBeVisible();
    let finish!: (value: boolean) => void;
    vi.mocked(writeTextToClipboard).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(
      screen.getByRole("button", { name: "Copy selected JSON" }),
    );
    await go(user, "/items");
    await act(async () => finish(true));
    expect(screen.queryByText("Response data copied.")).not.toBeInTheDocument();
  });

  it("renders Russian controls", async () => {
    window.localStorage.setItem("rsswagger-language", "ru");
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByText("Исследователь данных ответа"));
    expect(
      await screen.findByRole("button", { name: "Скачать выбранный JSON" }),
    ).toBeVisible();
  });
});
