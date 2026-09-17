import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrafficDiscoveryPanel } from "./traffic-discovery-panel";
import { setAppLanguage } from "./i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { MAX_DISCOVERY_BYTES } from "@/lib/traffic-discovery";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const capture = (paths = ["/api/users/12", "/api/users/34", "/health"]) =>
  JSON.stringify({
    log: {
      entries: paths.map((path, index) => ({
        request: {
          method: "GET",
          url: `https://api.example.com${path}?token=private-token`,
        },
        response: {
          status: 200,
          content: {
            mimeType: "application/json",
            text: JSON.stringify({ id: index, name: "private-name" }),
          },
        },
      })),
    },
  });
function file(text = capture()) {
  const file = new File([text], "capture.har", { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: async () => text,
  });
  return file;
}
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const button = (name: string) => screen.getByRole("button", { name });
async function setup() {
  let editor = "previous editor text";
  const apply = vi.fn((text: string) => {
    editor = text;
  });
  const user = userEvent.setup();
  const view = render(
    <TrafficDiscoveryPanel getSchemaText={() => editor} onApply={apply} />,
  );
  await user.click(screen.getByText("Traffic-to-OpenAPI studio"));
  await screen.findByLabelText("Import HAR for API discovery");
  return {
    user,
    apply,
    getEditor: () => editor,
    edit: (value: string) => {
      editor = value;
    },
    ...view,
  };
}
async function upload(
  user: ReturnType<typeof userEvent.setup>,
  text = capture(),
) {
  await user.upload(
    screen.getByLabelText("Import HAR for API discovery"),
    file(text),
  );
  await screen.findByLabelText("API origin");
}
beforeEach(() => {
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("TrafficDiscoveryPanel", () => {
  it("imports, configures, exports, applies and undoes a generated API without network or automatic storage writes", async () => {
    const { user, apply, getEditor } = await setup();
    const network = vi.spyOn(globalThis, "fetch");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    await upload(user);
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByText("Selected routes: 2/2")).toBeInTheDocument();
    change("Move path prefix into server URL", "/api");
    change("Path template for GET /users/{id}", "/users/{userId}");
    change("Discovered API title", "Customers API");
    await user.click(button("Generate OpenAPI draft"));
    expect(
      screen.getByText("Draft ready · 1 operations · 2 observations"),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Discovered definition format"),
      "json",
    );
    await user.click(button("Copy discovered OpenAPI"));
    const text = vi.mocked(writeTextToClipboard).mock.calls[0][0];
    const document = JSON.parse(text);
    expect(document.info.title).toBe("Customers API");
    expect(document.servers).toEqual([{ url: "https://api.example.com/api" }]);
    expect(
      document.paths["/users/{userId}"].get.responses["200"],
    ).toBeDefined();
    expect(text).not.toContain("private-");
    await user.click(button("Download discovered OpenAPI"));
    expect(downloadTextFile).toHaveBeenCalledWith(
      text,
      "rsswag-discovered-openapi.json",
      "application/json",
    );
    await user.click(button("Apply discovered API to editor"));
    expect(getEditor()).toBe(text);
    await user.click(button("Undo discovered API application"));
    expect(getEditor()).toBe("previous editor text");
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });

  it("filters and selects routes, clears stale output after edits and reports invalid templates", async () => {
    const { user } = await setup();
    await upload(user);
    change("Search discovered routes", "health");
    await user.click(button("Exclude matching routes"));
    expect(screen.getByText("Selected routes: 1/2")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search discovered routes"), {
      key: "Escape",
    });
    expect(screen.getByLabelText("Search discovered routes")).toHaveValue("");
    await user.click(button("Generate OpenAPI draft"));
    expect(
      screen.getByText("Draft ready · 1 operations · 2 observations"),
    ).toBeInTheDocument();
    change("Path template for GET /api/users/{id}", "/wrong/{id}");
    expect(
      screen.queryByRole("button", { name: "Apply discovered API to editor" }),
    ).not.toBeInTheDocument();
    await user.click(button("Generate OpenAPI draft"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "must match every source path",
    );
    change("Path template for GET /api/users/{id}", "/api/users/{userId}");
    await user.click(button("Generate OpenAPI draft"));
    await user.click(
      screen.getByLabelText(
        "Suggest path parameters for numeric and UUID segments",
      ),
    );
    expect(screen.getByText("Selected routes: 3/3")).toBeInTheDocument();
    expect(screen.queryByText(/Draft ready/)).not.toBeInTheDocument();
  });

  it("preserves the capture on failed imports, reads or size limits and accepts pasted HAR", async () => {
    const { user } = await setup();
    await upload(user);
    await user.upload(
      screen.getByLabelText("Import HAR for API discovery"),
      file("{}"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("log.entries");
    expect(screen.getByText("Selected routes: 2/2")).toBeInTheDocument();
    const rejected = file();
    Object.defineProperty(rejected, "text", {
      value: async () => {
        throw new Error("read");
      },
    });
    await user.upload(
      screen.getByLabelText("Import HAR for API discovery"),
      rejected,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not read");
    const oversized = file();
    Object.defineProperty(oversized, "size", {
      value: MAX_DISCOVERY_BYTES + 1,
    });
    await user.upload(
      screen.getByLabelText("Import HAR for API discovery"),
      oversized,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("5 MiB");
    await user.click(screen.getByText("Paste a HAR capture"));
    change("HAR JSON for discovery", capture(["/replacement"]));
    await user.click(button("Discover API from pasted HAR"));
    expect(
      screen.getByLabelText("Path template for GET /replacement"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("HAR JSON for discovery")).toHaveValue("");
  });

  it("ignores late file reads after clear, newer imports and unmount", async () => {
    const { user, unmount } = await setup();
    let resolve!: (text: string) => void;
    const pending = () => {
      const deferred = file();
      Object.defineProperty(deferred, "text", {
        value: () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      });
      return deferred;
    };
    await user.upload(
      screen.getByLabelText("Import HAR for API discovery"),
      pending(),
    );
    expect(screen.getByText("Reading traffic capture…")).toBeInTheDocument();
    await user.click(button("Clear discovery capture"));
    await act(async () => resolve(capture()));
    expect(screen.queryByLabelText("API origin")).not.toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("Import HAR for API discovery"),
      pending(),
    );
    const firstResolve = resolve;
    await upload(user, capture(["/latest"]));
    await act(async () => firstResolve(capture()));
    expect(
      screen.getByLabelText("Path template for GET /latest"),
    ).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("Import HAR for API discovery"),
      pending(),
    );
    unmount();
    await act(async () => resolve(capture()));
    expect(screen.queryByLabelText("API origin")).not.toBeInTheDocument();
  });

  it("preserves later main-editor edits on undo, keeps drafts across panel closing, and localizes controls", async () => {
    const { user, edit, getEditor } = await setup();
    await upload(user);
    await user.click(button("Generate OpenAPI draft"));
    await user.click(button("Apply discovered API to editor"));
    edit("newer changes");
    await user.click(button("Undo discovered API application"));
    expect(screen.getByRole("alert")).toHaveTextContent("editor has changed");
    expect(getEditor()).toBe("newer changes");
    await user.click(screen.getByText("Traffic-to-OpenAPI studio"));
    await waitFor(() =>
      expect(screen.queryByLabelText("API origin")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByText("Traffic-to-OpenAPI studio"));
    expect(await screen.findByLabelText("API origin")).toHaveValue(
      "https://api.example.com",
    );
    act(() => setAppLanguage("ru"));
    expect(screen.getByText("Создание OpenAPI из трафика")).toBeInTheDocument();
    expect(screen.getByLabelText("Источник API")).toHaveValue(
      "https://api.example.com",
    );
    expect(
      screen.getByRole("button", { name: "Скачать обнаруженный OpenAPI" }),
    ).toBeInTheDocument();
  });

  it("paginates routes and resets route edits when the origin changes", async () => {
    const { user } = await setup();
    const value = JSON.parse(
      capture(Array.from({ length: 27 }, (_, index) => `/route-${index}`)),
    );
    value.log.entries.push({
      request: { method: "GET", url: "https://other.example.com/other" },
      response: { status: 204 },
    });
    await upload(user, JSON.stringify(value));
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(
      screen.getAllByRole("checkbox", { name: /^Include GET/ }),
    ).toHaveLength(25);
    await user.click(button("Next routes"));
    expect(
      screen.getAllByRole("checkbox", { name: /^Include GET/ }),
    ).toHaveLength(2);
    await user.selectOptions(
      screen.getByLabelText("API origin"),
      "https://other.example.com",
    );
    expect(screen.getByText("Selected routes: 1/1")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Path template for GET /other"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Page \d/)).not.toBeInTheDocument();
  });

  it("preserves a newer pasted-import error when an earlier clipboard operation completes", async () => {
    const { user, apply } = await setup();
    await upload(user);
    await user.click(button("Generate OpenAPI draft"));
    let resolve!: (value: boolean) => void;
    vi.mocked(writeTextToClipboard).mockImplementation(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    await user.click(button("Copy discovered OpenAPI"));
    await user.click(screen.getByText("Paste a HAR capture"));
    change("HAR JSON for discovery", "{}");
    await user.click(button("Discover API from pasted HAR"));
    expect(screen.getByRole("alert")).toHaveTextContent("log.entries");
    await act(async () => resolve(true));
    expect(screen.getByRole("alert")).toHaveTextContent("log.entries");
    expect(
      screen.getByText("Draft ready · 2 operations · 3 observations"),
    ).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();

    vi.mocked(writeTextToClipboard).mockResolvedValue(true);
    await user.click(button("Copy discovered OpenAPI"));
    expect(
      screen.getByText("Generated definition exported."),
    ).toBeInTheDocument();
  });

  it("shows missing-body diagnostics and handles blocked and stale exports", async () => {
    const { user } = await setup();
    await upload(
      user,
      JSON.stringify({
        log: {
          entries: [
            {
              request: { method: "GET", url: "https://api.example.com/users" },
              response: {
                status: 200,
                content: { mimeType: "application/json" },
              },
            },
          ],
        },
      }),
    );
    await user.click(screen.getByText("Capture and inference warnings"));
    expect(
      screen.getByText(/JSON body content was not captured/),
    ).toBeInTheDocument();
    await user.click(button("Generate OpenAPI draft"));
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download discovered OpenAPI"));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not export");
    let resolve!: (value: boolean) => void;
    vi.mocked(writeTextToClipboard).mockImplementation(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    await user.click(button("Copy discovered OpenAPI"));
    change("Discovered API title", "New draft");
    await act(async () => resolve(true));
    expect(
      screen.queryByText("Generated definition exported."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Draft ready/)).not.toBeInTheDocument();
  });
});
