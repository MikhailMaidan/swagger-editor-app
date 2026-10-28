import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorsStudioPanel } from "./cors-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_CORS_BYTES,
  defaultCorsCase,
  emptyCorsProject,
  serializeCorsProject,
} from "@/lib/cors-project";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const fetcher = vi.fn();
beforeEach(() => {
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  fetcher.mockReset().mockRejectedValue(new Error("Unexpected traffic"));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
async function setup(demo = false) {
  const user = userEvent.setup(),
    view = render(<CorsStudioPanel />);
  await user.click(
    screen.getByText("CORS policy studio", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load browser CORS lifecycle demo"));
  return { user, ...view };
}
function importFile(source: string, text?: () => Promise<string>) {
  const file = new File([source], "cors.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  fireEvent.change(screen.getByLabelText("Import CORS project"), {
    target: { files: [file] },
  });
}
describe("CORS policy studio", () => {
  it("rehearses all demo scenarios without traffic/storage writes and exports reports without captured values", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem"),
      { user } = await setup(true);
    await user.click(button("Rehearse all CORS scenarios and policies"));
    expect(screen.getByRole("status")).toHaveTextContent("10/10");
    expect(
      screen.getByLabelText("Body visible to the browser script"),
    ).toHaveValue('{"items":[1,2,3]}');
    await user.click(button("Download CORS decision report"));
    expect(JSON.parse(exported()).simulations).toHaveLength(10);
    for (const secret of [
      "app.example",
      "api.example",
      "DEMO-ONLY",
      "demo-trace",
      "another-top-level-site",
      "trace-123",
    ])
      expect(exported()).not.toContain(secret);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("protects pending edits, retains invalid text after a failed save, and restores saved values on discard", async () => {
    const { user } = await setup();
    change("Server Access-Control-Max-Age, seconds (0–86400)", "");
    expect(
      button("Compare policies for selected CORS scenario"),
    ).toBeDisabled();
    expect(button("Load browser CORS lifecycle demo")).toBeDisabled();
    expect(button("Export CORS project")).toBeDisabled();
    expect(screen.getByLabelText("CORS policy")).toBeDisabled();
    await user.click(button("Save CORS edits"));
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid CORS project");
    expect(
      screen.getByLabelText("Server Access-Control-Max-Age, seconds (0–86400)"),
    ).toHaveValue("");
    await user.click(button("Discard CORS edits"));
    expect(
      screen.getByLabelText("Server Access-Control-Max-Age, seconds (0–86400)"),
    ).toHaveValue("600");
  });
  it("diagnoses captured actual-response headers and records that the actual request was attempted", async () => {
    const { user } = await setup();
    await user.click(
      screen.getByLabelText(
        "Generate actual response CORS headers from each replay policy",
      ),
    );
    change("Expected browser outcome", "blocked");
    change(
      "Expected script-visible status (empty = unchecked, 0 = hidden)",
      "0",
    );
    await user.click(button("Save CORS edits"));
    await user.click(button("Compare policies for selected CORS scenario"));
    expect(screen.getByRole("status")).toHaveTextContent("2/2");
    expect(
      screen.getByText("Actual request attempted: yes"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Access-Control-Allow-Origin is missing."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Body visible to the browser script"),
    ).toHaveValue("");
    expect(
      screen.getByLabelText("Headers visible to the browser script (JSON)"),
    ).toHaveValue("{}");
  });
  it("compares credential permissions and evaluates per-request expectations and budgets", async () => {
    const { user } = await setup();
    change("Fetch ambient credential mode", "include");
    change("Expected browser outcome", "allowed");
    change("Maximum blocked requests (0–100)", "0");
    await user.click(button("Save CORS edits"));
    await user.click(button("Compare policies for selected CORS scenario"));
    expect(screen.getByRole("status")).toHaveTextContent("1/2");
    await user.click(button("Download CORS decision report"));
    expect(
      JSON.parse(exported()).simulations.map(
        (s: { passed: boolean }) => s.passed,
      ),
    ).toEqual([true, false]);
    change("Select CORS replay result", "1");
    expect(
      screen.getByText(
        "A wildcard origin cannot authorize a request with credential mode include.",
      ),
    ).toBeInTheDocument();
  });
  it("reviews wildcard/credential settings and exports only public policy middleware", async () => {
    const { user } = await setup();
    change("Allowed origins (one per line; * alone or explicit null)", "*");
    change(
      "Application request headers (JSON object)",
      '{"authorization":"Bearer private-fixture-token"}',
    );
    await user.click(button("Save CORS edits"));
    expect(button("Download Fetch CORS middleware")).toBeDisabled();
    expect(
      screen.getByText(
        /Credentialed requests cannot use Access-Control-Allow-Origin/,
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByLabelText("Allow credentialed cross-origin responses"),
    );
    await user.click(button("Save CORS edits"));
    await user.click(button("Download Fetch CORS middleware"));
    expect(exported()).toContain("export function withCors");
    expect(exported()).not.toContain("private-fixture-token");
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)!.slice(1)).toEqual([
      "cors-middleware.mjs",
      "text/javascript",
    ]);
    await user.click(button("Export CORS project"));
    expect(exported()).toContain("private-fixture-token");
  });
  it("authors and deletes policies, scenarios and request cases while retaining at least one of each", async () => {
    const { user } = await setup();
    await user.click(button("Add browser request"));
    change("Browser request name", "JSON update");
    change("Browser request method", "PUT");
    change(
      "Application request headers (JSON object)",
      '{"content-type":"application/json"}',
    );
    change("Expected preflight behavior", "sent");
    await user.click(button("Save CORS edits"));
    await user.click(button("Copy CORS policy"));
    await user.click(button("Delete CORS policy"));
    await user.click(button("Add CORS scenario"));
    await user.click(button("Delete CORS scenario"));
    change("Browser request case", "request-2");
    await user.click(button("Delete browser request"));
    expect(button("Delete browser request")).toBeDisabled();
    expect(button("Delete CORS scenario")).toBeDisabled();
    expect(screen.getByLabelText("Browser request case")).toHaveValue(
      "request-1",
    );
  });
  it("restores projects atomically, discards imported results and retains work on failed imports", async () => {
    await setup();
    const p = emptyCorsProject();
    p.name = "Restored CORS project";
    importFile(JSON.stringify({ ...p, results: { passed: true } }));
    await screen.findByText(
      "CORS project loaded. Rehearse it to calculate fresh results.",
    );
    expect(screen.getByLabelText("CORS project name")).toHaveValue(
      "Restored CORS project",
    );
    expect(button("Download CORS decision report")).toBeDisabled();
    importFile("{");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("CORS project name")).toHaveValue(
      "Restored CORS project",
    );
    importFile(" ".repeat(MAX_CORS_BYTES + 1));
    expect(screen.getByRole("alert")).toHaveTextContent("exceeds");
  });
  it("rejects structural growth at the byte limit without losing an exportable saved project", async () => {
    const { user } = await setup(),
      p = emptyCorsProject();
    p.scenarios[0].cases = Array.from({ length: 32 }, (_, i) => {
      const c = defaultCorsCase(`large-${i}`);
      c.response.body = "x".repeat(65536);
      return c;
    });
    const last = p.scenarios[0].cases.at(-1)!;
    last.response.body = last.response.body.slice(
      0,
      -(JSON.stringify(p).length - MAX_CORS_BYTES + 10),
    );
    importFile(JSON.stringify(p));
    await screen.findByText(
      "CORS project loaded. Rehearse it to calculate fresh results.",
    );
    await user.click(button("Copy CORS policy"));
    expect(screen.getByRole("alert")).toHaveTextContent("exceeds");
    expect(
      screen.getByLabelText("CORS policy").querySelectorAll("option"),
    ).toHaveLength(2);
    await user.click(button("Export CORS project"));
    expect(exported().length).toBeLessThanOrEqual(MAX_CORS_BYTES);
    expect(JSON.parse(exported()).scenarios[0].cases).toHaveLength(32);
  });
  it("filters decisions, clears search with Escape, and retains the outcome filter", async () => {
    const { user } = await setup(true);
    await user.click(button("Compare policies for selected CORS scenario"));
    change("CORS outcome filter", "blocked");
    change("Search CORS decisions", "unmatched");
    expect(
      screen.getByText("No CORS decisions match this filter."),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search CORS decisions"), {
      key: "Escape",
    });
    expect(screen.getByLabelText("Search CORS decisions")).toHaveValue("");
    expect(screen.getByLabelText("CORS outcome filter")).toHaveValue("blocked");
    expect(
      button("Inspect CORS request: same-origin-mode"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Inspect CORS request: simple" }),
    ).not.toBeInTheDocument();
  });
  it("retains saved work when closed and gives feedback for blocked downloads", async () => {
    const { user } = await setup(true);
    await user.click(button("Compare policies for selected CORS scenario"));
    const summary = screen.getByText("CORS policy studio", {
      selector: "summary",
    });
    await user.click(summary);
    await user.click(summary);
    expect(screen.getByLabelText("CORS project name")).toHaveValue(
      "Browser CORS lifecycle examples",
    );
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download CORS decision report"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not start the download.",
    );
  });
  it("locks editing during file reads and ignores late results after unmount", async () => {
    const { unmount } = await setup();
    let finish!: (source: string) => void;
    importFile(
      "{}",
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    expect(screen.getByLabelText("CORS project name")).toBeDisabled();
    expect(button("Load browser CORS lifecycle demo")).toBeDisabled();
    unmount();
    await act(async () => finish(serializeCorsProject(emptyCorsProject())));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("localizes the studio, policy decisions and all demo workflows in Russian", async () => {
    const user = userEvent.setup();
    render(<CorsStudioPanel />);
    act(() => setAppLanguage("ru"));
    await user.click(
      screen.getByText("Студия политик CORS", { selector: "summary" }),
    );
    await user.click(button("Загрузить примеры жизненного цикла CORS"));
    await user.click(button("Моделировать все сценарии и политики CORS"));
    expect(screen.getByRole("status")).toHaveTextContent("10/10");
    expect(screen.getByLabelText("Поиск решений CORS")).toBeInTheDocument();
  });
});
