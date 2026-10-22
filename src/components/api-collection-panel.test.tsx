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
import { ApiCollectionPanel } from "./api-collection-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  demoCollectionProject,
  emptyCollectionProject,
} from "@/lib/api-collection";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  fetcher.mockReset().mockRejectedValue(new Error("Unexpected network"));
  vi.stubGlobal("fetch", fetcher);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
const jsonResponse = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
function file(source: string) {
  const f = new File([source], "collection.json", { type: "application/json" });
  Object.defineProperty(f, "text", { value: async () => source });
  return f;
}
function importProject(source: string) {
  fireEvent.change(screen.getByLabelText("Import collection project"), {
    target: { files: [file(source)] },
  });
}
async function setup(demo = true) {
  const user = userEvent.setup(),
    view = render(<ApiCollectionPanel />);
  await user.click(
    screen.getByText("API collection studio", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load five-pattern pagination demo"));
  return { user, ...view };
}
async function collect(user: ReturnType<typeof userEvent.setup>, all = false) {
  await user.click(
    button(
      all
        ? "Run all offline collection plans"
        : "Collect selected plan offline",
    ),
  );
  await screen.findByText(
    all
      ? "Finished 5/5 plans: 5 passed, 0 failed."
      : "Finished 1/1 plans: 1 passed, 0 failed.",
  );
}
describe("ApiCollectionPanel", () => {
  it("runs all five saved patterns offline, displays accepted pages and checks, and keeps data session-only", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { user } = await setup();
    await collect(user, true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(screen.getByRole("table")).toHaveTextContent("offset=4");
    expect(
      screen.getByLabelText(
        "Selected collected record (first 16000 characters)",
      ),
    ).toHaveValue(JSON.stringify({ id: 1, name: "Atlas" }, null, 2));
    expect(
      within(
        screen.getByRole("list", { name: "Acceptance checks" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(4);
    await user.click(button("Download collection report"));
    expect(JSON.parse(exported())).toMatchObject({
      complete: true,
      total: 5,
      passed: 5,
    });
  });
  it("exports complete JSON/NDJSON/CSV datasets even when the inspector is filtered and copies JSON", async () => {
    const { user } = await setup();
    await collect(user);
    change("Search collected records", "cedar");
    expect(
      screen.getByText(
        "1/3 records match. The list shows up to 100; exports include the full collection.",
      ),
    ).toBeInTheDocument();
    expect(
      (
        screen.getByLabelText(
          "Selected collected record (first 16000 characters)",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("Cedar");
    await user.click(button("Download collected JSON"));
    expect(JSON.parse(exported())).toHaveLength(3);
    await user.click(button("Download collected NDJSON"));
    expect(exported().trim().split("\n")).toHaveLength(3);
    await user.click(button("Download collected CSV"));
    expect(exported()).toContain('"id","name"');
    await user.click(button("Copy collected JSON"));
    await screen.findByText("Collected JSON copied.");
    expect(
      JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]),
    ).toHaveLength(3);
    change("Search collected records", "nothing");
    expect(
      screen.getByText("No matching collected records."),
    ).toBeInTheDocument();
    const search = screen.getByLabelText("Search collected records");
    search.focus();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
  });
  it("guards pending edits, preserves invalid numeric drafts, and discards safely", async () => {
    const { user } = await setup();
    change("Maximum pages (1–100)", "");
    expect(button("Collect selected plan offline")).toBeDisabled();
    expect(button("Export collection project")).toBeDisabled();
    expect(screen.getByLabelText("Collection plan")).toBeDisabled();
    await user.click(button("Save collection plan"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Check the plan fields",
    );
    expect(screen.getByLabelText("Maximum pages (1–100)")).toHaveValue("");
    await user.click(button("Discard pending collection edits"));
    expect(screen.getByLabelText("Maximum pages (1–100)")).toHaveValue("20");
    expect(button("Collect selected plan offline")).toBeEnabled();
  });
  it("saves plan names, policies and body assertions and invalidates stale results", async () => {
    const { user } = await setup();
    await collect(user);
    change("Plan name", "Last occurrence");
    change("Duplicate policy", "last");
    change(
      "Per-record body assertions (JSON array)",
      '[{"name":"IDs","target":"body","path":"/id","operator":"type","expected":"number"}]',
    );
    await user.click(button("Save collection plan"));
    expect(
      screen.queryByLabelText("Collection results"),
    ).not.toBeInTheDocument();
    await collect(user);
    change("Collected record", "1");
    expect(
      (
        screen.getByLabelText(
          "Selected collected record (first 16000 characters)",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("Birch updated");
    await user.click(button("Export collection project"));
    expect(JSON.parse(exported()).plans[0]).toMatchObject({
      name: "Last occurrence",
      deduplicate: "last",
    });
  });
  it("authors, saves, selects, and deletes independent plans", async () => {
    const { user } = await setup(false);
    expect(button("Delete collection plan")).toBeDisabled();
    await user.click(button("Add collection plan"));
    expect(screen.getByLabelText("Plan name")).toHaveValue("Collection 2");
    change("Plan name", "My cursor API");
    change("Pagination strategy", "cursor");
    change("Page-size query parameter (optional)", "limit");
    change("Page size (1–1000)", "10");
    await user.click(button("Save collection plan"));
    change("Collection plan", "starter");
    expect(screen.getByLabelText("Plan name")).toHaveValue("New collection");
    await user.click(button("Delete collection plan"));
    expect(screen.getByLabelText("Plan name")).toHaveValue("My cursor API");
    expect(button("Delete collection plan")).toBeDisabled();
  });
  it("creates editable response fixtures and preserves malformed JSON as a reproducible failure", async () => {
    const { user } = await setup(false);
    await user.click(button("Add page fixture"));
    change("Fixture response body", '{"items":[{"id":1}],"next":null}');
    expect(button("Collect selected plan offline")).toBeDisabled();
    await user.click(button("Save page fixture"));
    await collect(user);
    change("Fixture response body", "{broken");
    await user.click(button("Save page fixture"));
    await user.click(button("Collect selected plan offline"));
    await screen.findByText("Finished 1/1 plans: 0 passed, 1 failed.");
    expect(screen.getByText(/Stopped: Invalid, oversized/)).toBeInTheDocument();
    await user.click(button("Delete page fixture"));
    expect(screen.getByText(/No offline fixtures yet/)).toBeInTheDocument();
  });
  it("rejects duplicate fixture URLs without losing pending response edits", async () => {
    const { user } = await setup();
    change("Fixture request URL", demoCollectionProject().fixtures[1].url);
    change("Fixture response body", "my pending body");
    await user.click(button("Save page fixture"));
    expect(screen.getByRole("alert")).toHaveTextContent("duplicate IDs/URLs");
    expect(screen.getByLabelText("Fixture response body")).toHaveValue(
      "my pending body",
    );
    await user.click(button("Discard pending collection edits"));
    expect(screen.getByLabelText("Fixture response body")).not.toHaveValue(
      "my pending body",
    );
  });
  it("imports projects atomically and omits session headers, imported credentials, and run data on export", async () => {
    const { user } = await setup();
    change(
      "Session-only live headers (JSON object)",
      '{"Authorization":"Bearer secret-session"}',
    );
    await user.click(button("Export collection project"));
    expect(exported()).not.toContain("secret-session");
    importProject("{broken");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Collection project name")).toHaveValue(
      "Five pagination patterns",
    );
    const p = {
      ...emptyCollectionProject(),
      name: "Imported project",
      headers: { secret: "credential" },
      results: ["private-result"],
    };
    importProject(JSON.stringify(p));
    await screen.findByText("Collection project imported.");
    expect(screen.getByLabelText("Collection project name")).toHaveValue(
      "Imported project",
    );
    expect(
      screen.getByLabelText("Session-only live headers (JSON object)"),
    ).toHaveValue("{}");
    await user.click(button("Export collection project"));
    expect(exported()).not.toContain("credential");
    expect(exported()).not.toContain("private-result");
  });
  it("performs live traversal with session headers and records response pages for offline replay", async () => {
    const { user } = await setup(false);
    change(
      "Session-only live headers (JSON object)",
      '{"Authorization":"Bearer secret"}',
    );
    fetcher
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: 1, name: "Live" }], next: "?cursor=two" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: 2, name: "Final" }], next: null }),
      );
    await user.click(button("Collect selected plan live"));
    await screen.findByText("Finished 1/1 plans: 1 passed, 0 failed.");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetcher.mock.calls[1][1]?.headers).get("Authorization"),
    ).toBe("Bearer secret");
    await user.click(button("Record pages as offline fixtures"));
    await screen.findByText("Recorded response pages as offline fixtures.");
    expect(
      (screen.getByLabelText("Selected page fixture") as HTMLSelectElement)
        .value,
    ).not.toBe("");
    await user.click(button("Export collection project"));
    const p = JSON.parse(exported());
    expect(p.fixtures).toHaveLength(2);
    expect(exported()).not.toContain("Bearer secret");
    await collect(user);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await user.click(button("Download collection report"));
    expect(exported()).not.toContain("Final");
    expect(exported()).not.toContain("cursor=two");
  });
  it("cancels live collection and keeps completed records available for partial export", async () => {
    const { user } = await setup(false),
      cancel = vi.fn();
    fetcher
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: 1 }], next: "?page=2" }),
      )
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    await user.click(button("Collect selected plan live"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(button("Load five-pattern pagination demo")).toBeDisabled();
    await user.click(button("Cancel collection"));
    await screen.findByText("Finished 1/1 plans: 0 passed, 1 failed.");
    expect(
      screen.getByText(/Stopped: Collection cancelled/),
    ).toBeInTheDocument();
    expect(cancel).toHaveBeenCalledOnce();
    await user.click(button("Download collected JSON"));
    expect(JSON.parse(exported())).toEqual([{ id: 1 }]);
    await user.click(button("Download collection report"));
    expect(JSON.parse(exported())).toMatchObject({
      complete: false,
      runs: [{ reason: "cancelled" }],
    });
  });
  it("disposes an active request on unmount and ignores late responses", async () => {
    const { user, unmount } = await setup(false),
      cancel = vi.fn();
    let resolve!: (response: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await user.click(button("Collect selected plan live"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const signal = fetcher.mock.calls[0][1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve(new Response(new ReadableStream({ cancel }))),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
  it("retains collection results when collapsed and reports blocked exports and clipboard failures", async () => {
    const { user } = await setup();
    await collect(user);
    await user.click(
      screen.getByText("API collection studio", { selector: "summary" }),
    );
    await user.click(
      screen.getByText("API collection studio", { selector: "summary" }),
    );
    expect(
      screen.getByText("Finished 1/1 plans: 1 passed, 0 failed."),
    ).toBeInTheDocument();
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(button("Download collected JSON"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not start the collection download.",
    );
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(button("Copy collected JSON"));
    await screen.findByText("Could not copy the collected JSON.");
  });
  it("localizes collection controls and result feedback in Russian", async () => {
    const { user } = await setup(false);
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Студия сбора API", { selector: "summary" }),
    ).toBeInTheDocument();
    await user.click(button("Загрузить пример пяти видов пагинации"));
    await user.click(button("Запустить все планы сбора локально"));
    await screen.findByText(
      "Выполнено планов: 5/5; успешно: 5, с ошибками: 0.",
    );
    expect(
      screen.getByLabelText("Выбранная запись (первые 16000 символов)"),
    ).toBeInTheDocument();
  });
});
