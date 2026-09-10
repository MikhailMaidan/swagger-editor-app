import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToClipboard } from "@/lib/clipboard";
import { MAX_HAR_BYTES } from "@/lib/har-inspector";
import type { EndpointSummary } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import { HarInspectorPanel } from "./har-inspector-panel";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const endpoint: EndpointSummary = {
  method: "GET",
  path: "/users/{id}",
  operationId: "",
  deprecated: false,
  secured: false,
  securityRequirements: [],
  serverUrl: "https://example.test",
  summary: "",
  description: "",
  parameters: [],
  requestBodies: [],
  tags: [],
  responses: [
    { status: "200", description: "", contentTypes: [], schema: null },
  ],
};
const entry = (
  path = "/users/42",
  status = 200,
  time = 20,
  origin = "https://example.test",
) => ({
  request: { url: origin + path + "?token=hidden-secret", method: "GET" },
  response: { status },
  time,
});
const har = (
  entries = [entry(), entry("/users/7", 503, 150), entry("/missing", 404, -1)],
) => JSON.stringify({ log: { entries } });
const props = {
  allEndpoints: [endpoint],
  visibleEndpoints: [] as EndpointSummary[],
  onSelectEndpoint: vi.fn(),
};
async function paste(user: ReturnType<typeof userEvent.setup>, value = har()) {
  const details = screen.getByText("Paste HAR JSON").closest("details")!;
  if (!details.open) await user.click(screen.getByText("Paste HAR JSON"));
  fireEvent.change(screen.getByLabelText("HAR JSON"), { target: { value } });
  await user.click(screen.getByRole("button", { name: "Inspect pasted HAR" }));
}
const trafficRows = () =>
  within(screen.getByRole("table", { name: "Captured traffic" }))
    .getAllByRole("row")
    .slice(1);

describe("HarInspectorPanel", () => {
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
    props.onSelectEndpoint.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("imports metadata locally, filters traffic, sorts latency, navigates endpoints, and exports complete aggregates", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<HarInspectorPanel {...props} />);
    await paste(user);
    expect(
      screen.getByText(/3 requests · 2 matched · 1 undocumented/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Observed 1 of 1 operations/)).toBeInTheDocument();
    expect(screen.queryByText(/hidden-secret/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("HAR JSON")).toHaveValue("");
    await user.selectOptions(screen.getByLabelText("Traffic order"), "slowest");
    expect(trafficRows()[0]).toHaveTextContent("GET /users/7");
    await user.selectOptions(
      screen.getByLabelText("Traffic result filter"),
      "undocumented",
    );
    expect(trafficRows()).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Download traffic report" }),
    );
    const exported = JSON.parse(vi.mocked(downloadTextFile).mock.calls[0][0]);
    expect(exported.summary.requests).toBe(3);
    expect(exported.operations[0].requests).toBe(2);
    expect(downloadTextFile).toHaveBeenCalledWith(
      expect.not.stringContaining("hidden-secret"),
      "rsswag-har-analysis.json",
      "application/json",
    );
    await user.click(
      screen.getByRole("button", { name: "Copy traffic report" }),
    );
    expect(
      JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]),
    ).toEqual(exported);
    await user.selectOptions(
      screen.getByLabelText("Traffic result filter"),
      "all",
    );
    fireEvent.change(
      screen.getByLabelText("Search captured method, path, or status"),
      { target: { value: "get USERS 503" } },
    );
    expect(trafficRows()).toHaveLength(1);
    await user.click(
      screen.getByText("Operation traffic coverage", { selector: "summary" }),
    );
    await user.click(screen.getByRole("button", { name: "GET /users/{id}" }));
    expect(props.onSelectEndpoint).toHaveBeenCalledWith("GET", "/users/{id}");
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });

  it("recomputes matching for prefixes, origins, current view, and changed schema endpoints", async () => {
    const user = userEvent.setup();
    const view = render(<HarInspectorPanel {...props} />);
    await paste(
      user,
      har([
        entry("/api/users/42"),
        entry("/api/users/9", 200, 40, "https://other.test"),
      ]),
    );
    expect(screen.getByText(/2 requests · 0 matched/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Strip captured path prefix"), {
      target: { value: "/api" },
    });
    expect(screen.getByText(/2 requests · 2 matched/)).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Capture origin"),
      "https://other.test",
    );
    expect(screen.getByText(/1 requests · 1 matched/)).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Match against endpoints"),
      "visible",
    );
    expect(screen.getByText(/1 requests · 0 matched/)).toBeInTheDocument();
    view.rerender(
      <HarInspectorPanel {...props} visibleEndpoints={[endpoint]} />,
    );
    expect(screen.getByText(/1 requests · 1 matched/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Strip captured path prefix"), {
      target: { value: "api" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("path starting with /");
    expect(
      screen.queryByRole("button", { name: "Download traffic report" }),
    ).not.toBeInTheDocument();
  });

  it("preserves previous traffic on invalid paste and clears the capture and pending input", async () => {
    const user = userEvent.setup();
    render(<HarInspectorPanel {...props} />);
    await paste(user);
    await paste(user, "{}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "previous capture is unchanged",
    );
    expect(trafficRows()).toHaveLength(3);
    await user.click(
      screen.getByRole("button", { name: "Clear traffic capture" }),
    );
    expect(
      screen.queryByRole("table", { name: "Captured traffic" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("HAR JSON")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Clear traffic capture" }),
    ).toBeDisabled();
  });

  it("uploads HAR files and permits selecting the same file again", async () => {
    const user = userEvent.setup();
    render(<HarInspectorPanel {...props} />);
    const file = new File([har()], "traffic.har", { type: "application/json" });
    await user.upload(screen.getByLabelText("Import HAR file"), file);
    expect(await screen.findByText(/Imported 3 requests/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Clear traffic capture" }),
    );
    await user.upload(screen.getByLabelText("Import HAR file"), file);
    expect(await screen.findByText(/Imported 3 requests/)).toBeInTheDocument();
    const huge = new File([""], "large.har", { type: "application/json" });
    Object.defineProperty(huge, "size", { value: MAX_HAR_BYTES + 1 });
    await user.upload(screen.getByLabelText("Import HAR file"), huge);
    expect(screen.getByRole("alert")).toHaveTextContent("limited to 5 MiB");
    expect(trafficRows()).toHaveLength(3);
  });

  it("ignores a stale file read after clearing and reports read failures without dropping the capture", async () => {
    const readers: {
      result: string;
      onload: () => void;
      onerror: () => void;
    }[] = [];
    vi.stubGlobal(
      "FileReader",
      class {
        result = har();
        onload = () => {};
        onerror = () => {};
        readAsText() {
          readers.push(this);
        }
      },
    );
    const user = userEvent.setup();
    render(<HarInspectorPanel {...props} />);
    const file = new File([har()], "traffic.har");
    await user.upload(screen.getByLabelText("Import HAR file"), file);
    expect(screen.getByText("Reading traffic capture…")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Clear traffic capture" }),
    );
    await act(async () => {
      readers[0].onload();
    });
    expect(screen.queryByText(/Imported 3 requests/)).not.toBeInTheDocument();
    await paste(user);
    await user.upload(screen.getByLabelText("Import HAR file"), file);
    await act(async () => {
      readers[1].onerror();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("could not be read");
    expect(trafficRows()).toHaveLength(3);
  });

  it("paginates requests and resets the page when a search narrows results", async () => {
    const user = userEvent.setup();
    render(<HarInspectorPanel {...props} />);
    await paste(
      user,
      har(Array.from({ length: 30 }, (_, index) => entry(`/users/${index}`))),
    );
    expect(trafficRows()).toHaveLength(25);
    expect(
      screen.getByRole("button", { name: "Previous traffic page" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next traffic page" }));
    expect(trafficRows()).toHaveLength(5);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next traffic page" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Previous traffic page" }),
    );
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Search captured method, path, or status"),
      { target: { value: "/users/29" } },
    );
    expect(trafficRows()).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Next traffic page" }),
    ).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Search captured method, path, or status"),
      { target: { value: "not-found" } },
    );
    expect(trafficRows()).toHaveLength(0);
  });

  it("shows ambiguous matches and separates failed traffic from undocumented statuses", async () => {
    const user = userEvent.setup();
    render(
      <HarInspectorPanel
        {...props}
        allEndpoints={[endpoint, { ...endpoint, path: "/users/{name}" }]}
      />,
    );
    await paste(user);
    await user.selectOptions(
      screen.getByLabelText("Traffic result filter"),
      "ambiguous",
    );
    expect(trafficRows()).toHaveLength(2);
    expect(trafficRows()[0]).toHaveTextContent(
      "GET /users/{id}, GET /users/{name}",
    );
    await user.selectOptions(
      screen.getByLabelText("Traffic result filter"),
      "failed",
    );
    expect(trafficRows()).toHaveLength(2);
    await user.selectOptions(
      screen.getByLabelText("Traffic result filter"),
      "undocumented",
    );
    expect(trafficRows()).toHaveLength(0);
  });

  it("reports export failures and hides stale feedback after report settings change", async () => {
    const user = userEvent.setup();
    vi.mocked(writeTextToClipboard).mockResolvedValue(false);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    render(<HarInspectorPanel {...props} />);
    await paste(user);
    await user.click(
      screen.getByRole("button", { name: "Copy traffic report" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not copy");
    await user.click(
      screen.getByRole("button", { name: "Download traffic report" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not download");
    await user.selectOptions(
      screen.getByLabelText("Match against endpoints"),
      "visible",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("localizes the inspector in Russian", async () => {
    window.localStorage.setItem("rsswagger-language", "ru");
    const user = userEvent.setup();
    render(<HarInspectorPanel {...props} />);
    expect(
      screen.getByRole("heading", { name: "Анализатор HAR-трафика" }),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Вставить HAR JSON"));
    fireEvent.change(screen.getByLabelText("HAR JSON"), {
      target: { value: har() },
    });
    await user.click(
      screen.getByRole("button", { name: "Анализировать вставленный HAR" }),
    );
    expect(screen.getByText(/Запросов: 3 · Совпадений: 2/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Скачать отчёт о трафике" }),
    ).toBeInTheDocument();
  });
});
