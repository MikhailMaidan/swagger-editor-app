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
import { StreamingHttpPanel } from "./streaming-http-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import * as streams from "@/lib/streaming-http";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  fetcher
    .mockReset()
    .mockRejectedValue(new Error("Unexpected network request"));
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
const bytes = (s: string) => new TextEncoder().encode(s);
function file(text: string) {
  const f = new File([text], "stream.json", { type: "application/json" });
  Object.defineProperty(f, "text", { value: async () => text });
  return f;
}
function response(chunks: string[], format = "sse") {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        chunks.forEach((s) => c.enqueue(bytes(s)));
        c.close();
      },
    }),
    {
      headers: {
        "Content-Type":
          format === "sse" ? "text/event-stream" : "application/x-ndjson",
      },
    },
  );
}
async function setup(demo = true) {
  const user = userEvent.setup(),
    view = render(<StreamingHttpPanel />);
  await user.click(
    screen.getByText("Streaming HTTP studio", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load streaming framing demo"));
  return { user, ...view };
}
async function saveLive(user: ReturnType<typeof userEvent.setup>) {
  change("Streaming HTTP URL", "https://stream.example/events");
  await user.click(button("Save streaming connection settings"));
}
async function runCases(
  user: ReturnType<typeof userEvent.setup>,
  sweep = false,
) {
  await user.click(
    button(
      sweep
        ? "Run byte-boundary regression sweep"
        : "Run saved stream replay cases",
    ),
  );
  const count = sweep ? 30 : 5;
  await screen.findByText(
    `Completed ${count}/${count} variants: ${count} passed, 0 failed.`,
  );
}

describe("StreamingHttpPanel", () => {
  it("authors a binary malformed-UTF-8 fixture and treats the expected parser error as a passing case", async () => {
    const { user } = await setup(false);
    change("Replay framing format", "ndjson");
    change("Replay wire encoding", "base64");
    change(
      "Raw stream wire fixture",
      btoa('1\n"' + String.fromCharCode(255) + '"\n'),
    );
    change("Expected replay parser error", "utf8");
    await user.click(button("Save stream replay case"));
    await user.click(button("Replay selected stream fixture"));
    await screen.findByText("Completed 1/1 variants: 1 passed, 0 failed.");
    expect(
      screen.getByLabelText(
        "Selected stream record data (first 16000 characters)",
      ),
    ).toHaveValue("1");
  });
  it("resets the effective event filter when its type is evicted from the bounded inspector", async () => {
    const { user } = await setup(false);
    change("Maximum session records (1–1000)", "1000");
    await saveLive(user);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    fetcher.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(c) {
            controller = c;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    await user.click(button("Connect HTTP stream"));
    await screen.findByText(/State: streaming/);
    await act(async () =>
      controller.enqueue(bytes("event: old\ndata: first\n\n")),
    );
    change("Stream event type filter", "old");
    await act(async () => {
      controller.enqueue(bytes("event: new\ndata: next\n\n".repeat(201)));
      controller.close();
    });
    await screen.findByText("The response reached EOF.");
    expect(screen.getByLabelText("Stream event type filter")).toHaveValue("");
    expect(button("Inspect stream record 202")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Retained 200 records; dropped from the bounded inspector: 2/,
      ),
    ).toBeInTheDocument();
  });
  it("replays the demo and all boundary variants without network, storage writes or credential changes", async () => {
    document.cookie = "auth=keep-existing; path=/";
    const cookies = document.cookie,
      storage = vi.spyOn(Storage.prototype, "setItem");
    const { user } = await setup();
    await user.click(button("Replay selected stream fixture"));
    await screen.findByText("Completed 1/1 variants: 1 passed, 0 failed.");
    expect(
      screen.getByLabelText(
        "Selected stream record data (first 16000 characters)",
      ),
    ).toHaveValue('{"task":\n{"id":42,"title":"Привет 🌍"}}');
    await runCases(user);
    await runCases(user, true);
    await user.click(button("Download value-free streaming replay report"));
    expect(JSON.parse(exported())).toMatchObject({
      complete: true,
      completed: 30,
      total: 30,
    });
    expect(exported()).not.toContain("Привет");
    expect(exported()).not.toContain('"wire"');
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(document.cookie).toBe(cookies);
  });

  it("connects explicitly, sends session-only auth, stops on a sentinel and exports a value-free session report", async () => {
    const { user } = await setup(false);
    change("Stop on exact record data (blank disables)", "[DONE]");
    await saveLive(user);
    change(
      "Session-only stream headers (JSON object)",
      '{"Authorization":"Bearer private-token"}',
    );
    fetcher.mockResolvedValueOnce(
      response([
        'id: 42\nevent: task\ndata: {"private":"value"}\n\nevent: done\ndata: [DONE]\n\ndata: late\n\n',
      ]),
    );
    expect(fetcher).not.toHaveBeenCalled();
    await user.click(button("Connect HTTP stream"));
    await screen.findByText("The exact stop-data sentinel was received.");
    expect(button("Inspect stream record 1")).toBeInTheDocument();
    expect(button("Inspect stream record 2")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Inspect stream record 3" }),
    ).not.toBeInTheDocument();
    const init = fetcher.mock.calls[0][1]!;
    expect(init).toMatchObject({
      credentials: "omit",
      redirect: "error",
      method: "GET",
    });
    expect((init.headers as Headers).get("Authorization")).toBe(
      "Bearer private-token",
    );
    await user.click(button("Download value-free stream session report"));
    expect(JSON.parse(exported())).toMatchObject({
      reason: "sentinel",
      records: 2,
      connections: 1,
    });
    expect(exported()).not.toMatch(/private|stream.example|DONE|"lastEventId"/);
    await user.click(button("Download streaming project"));
    expect(exported()).not.toContain("private-token");
    await user.click(button("Use current SSE cursor for next connection"));
    expect(screen.getByLabelText("Initial Last-Event-ID cursor")).toHaveValue(
      "42",
    );
    expect(button("Connect HTTP stream")).toBeDisabled();
    await user.click(button("Save streaming connection settings"));
    expect(button("Connect HTTP stream")).toBeEnabled();
  });

  it("streams POST NDJSON and exports exact retained records without resending the request", async () => {
    const { user } = await setup(false);
    change("Live stream format", "ndjson");
    change("Streaming HTTP method", "POST");
    change("Streaming POST request body", '{"stream":true}');
    await saveLive(user);
    fetcher.mockResolvedValueOnce(
      response(['{"city":"東京 🌸"}\r', "\n42"], "ndjson"),
    );
    await user.click(button("Connect HTTP stream"));
    await screen.findByText("The response reached EOF.");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.body).toBe('{"stream":true}');
    await user.click(button("Download stream transcript"));
    const transcript = streams.parseStreamTranscript(exported());
    expect(transcript.format).toBe("ndjson");
    expect(transcript.records.map((r) => r.data)).toEqual([
      '{"city":"東京 🌸"}',
      "42",
    ]);
    await user.click(button("Download stream records (NDJSON)"));
    expect(
      exported()
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s).data),
    ).toEqual(['{"city":"東京 🌸"}', "42"]);
  });

  it("keeps a stream running while collapsed, allows inspection and cancels it on disconnect or unmount", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const { user, unmount } = await setup(false);
    await saveLive(user);
    const hold = () =>
      new Response(
        new ReadableStream({
          start(c) {
            controller = c;
          },
          cancel,
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    fetcher.mockResolvedValueOnce(hold());
    await user.click(button("Connect HTTP stream"));
    await screen.findByText(/State: streaming/);
    expect(screen.getByLabelText("Streaming HTTP URL")).toBeDisabled();
    await user.click(
      screen.getByText("Streaming HTTP studio", { selector: "summary" }),
    );
    await act(async () => controller.enqueue(bytes("data: while closed\n\n")));
    await user.click(
      screen.getByText("Streaming HTTP studio", { selector: "summary" }),
    );
    expect(
      screen.getByLabelText(
        "Selected stream record data (first 16000 characters)",
      ),
    ).toHaveValue("while closed");
    await user.click(button("Disconnect HTTP stream"));
    await screen.findByText("The stream was disconnected.");
    expect(cancel).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(hold());
    await user.click(button("Connect HTTP stream"));
    await screen.findByText(/State: streaming/);
    unmount();
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
  });

  it("honors explicit GET SSE reconnect settings and forwards the committed cursor", async () => {
    const { user } = await setup(false);
    change("Automatic GET SSE reconnects (0–5)", "1");
    change("Default SSE reconnect delay (ms, 0–30000)", "0");
    await saveLive(user);
    fetcher
      .mockResolvedValueOnce(response(["retry: 0\nid: first\ndata: one\n\n"]))
      .mockResolvedValueOnce(response(["id: second\ndata: two\n\n"]));
    await user.click(button("Connect HTTP stream"));
    await screen.findByText("The response reached EOF.");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      (fetcher.mock.calls[1][1]?.headers as Headers).get("Last-Event-ID"),
    ).toBe("first");
    expect(screen.getByText(/connections 2; records 2/)).toBeInTheDocument();
  });

  it("retains invalid config drafts, blocks context changes and refuses forbidden session headers before fetching", async () => {
    const { user } = await setup();
    change("Stream idle timeout (ms)", "not-a-number");
    await user.click(button("Save streaming connection settings"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use bounded stream settings",
    );
    expect(screen.getByLabelText("Stream idle timeout (ms)")).toHaveValue(
      "not-a-number",
    );
    expect(button("Download streaming project")).toBeDisabled();
    expect(screen.getByLabelText("Selected stream replay case")).toBeDisabled();
    await user.click(button("Discard streaming connection edits"));
    await saveLive(user);
    change("Session-only stream headers (JSON object)", '{"Cookie":"private"}');
    await user.click(button("Connect HTTP stream"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "valid session headers",
    );
    expect(fetcher).not.toHaveBeenCalled();
    await user.click(button("Clear session stream headers"));
    expect(
      screen.getByLabelText("Session-only stream headers (JSON object)"),
    ).toHaveValue("{}");
  });

  it("authors negative replay cases, validates check drafts and preserves original cases through duplication", async () => {
    const { user } = await setup(false);
    await user.click(button("Duplicate stream replay case"));
    change("Stream replay case name", "Malformed JSON case");
    change("Replay framing format", "ndjson");
    change("Raw stream wire fixture", '{"ok":true}\n{bad}\n');
    change("Expected replay parser error", "json");
    await user.click(button("Insert example JSON record check"));
    change("Stream record checks (JSON array)", "invalid JSON");
    await user.click(button("Save stream replay case"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use valid bounded JSON",
    );
    expect(button("Load streaming framing demo")).toBeDisabled();
    await user.click(button("Insert example JSON record check"));
    await user.click(button("Save stream replay case"));
    await user.click(button("Replay selected stream fixture"));
    await screen.findByText("Completed 1/1 variants: 1 passed, 0 failed.");
    expect(
      screen.getByLabelText(
        "Selected stream record data (first 16000 characters)",
      ),
    ).toHaveValue('{"ok":true}');
    await user.click(button("Download streaming project"));
    const p = streams.parseStreamProject(exported());
    expect(p.cases).toHaveLength(2);
    expect(p.cases[0]).toEqual(streams.defaultStreamCase());
    await user.click(button("Remove stream replay case"));
    expect(button("Remove stream replay case")).toBeDisabled();
    await user.click(button("Add stream replay case"));
    expect(screen.getByLabelText("Stream replay case name")).toHaveValue(
      "Replay case 2",
    );
  });

  it("records retained data into a replay case and restores portable projects without session headers or results", async () => {
    const { user } = await setup();
    await user.click(button("Replay selected stream fixture"));
    await screen.findByText("Completed 1/1 variants: 1 passed, 0 failed.");
    await user.click(button("Create replay case from retained records"));
    expect(screen.getByLabelText("Stream replay case name")).toHaveValue(
      "Captured stream records",
    );
    await user.click(button("Replay selected stream fixture"));
    await screen.findByText("Completed 1/1 variants: 1 passed, 0 failed.");
    await user.click(button("Download stream transcript"));
    const transcript = exported();
    change(
      "Session-only stream headers (JSON object)",
      '{"Authorization":"Bearer private"}',
    );
    await user.click(button("Download streaming project"));
    const p = streams.parseStreamProject(exported());
    expect(p.cases).toHaveLength(6);
    expect(exported()).not.toContain("Bearer private");
    fireEvent.change(
      screen.getByLabelText("Restore streaming project (JSON)"),
      {
        target: {
          files: [
            file(
              JSON.stringify({
                ...p,
                headers: { Authorization: "untrusted" },
                results: [{ status: "passed" }],
              }),
            ),
          ],
        },
      },
    );
    await screen.findByText(/Project restored without session headers/);
    expect(
      screen.getByLabelText("Session-only stream headers (JSON object)"),
    ).toHaveValue("{}");
    expect(
      screen.queryByLabelText("Stream replay results"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Import stream transcript (JSON)"), {
      target: { files: [file(transcript)] },
    });
    await screen.findByText(/Transcript imported without connecting/);
    expect(button("Inspect stream record 1")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("searches and filters records, bounds previews and copies the full retained payload", async () => {
    const { user } = await setup(false);
    await saveLive(user);
    const large = "x".repeat(20000);
    fetcher.mockResolvedValueOnce(
      response([
        `event: task\ndata: small hello\n\nevent: big\ndata: ${large}\n\n`,
      ]),
    );
    await user.click(button("Connect HTTP stream"));
    await screen.findByText("The response reached EOF.");
    expect(
      (
        screen.getByLabelText(
          "Selected stream record data (first 16000 characters)",
        ) as HTMLTextAreaElement
      ).value,
    ).toHaveLength(16000);
    await user.click(button("Copy full selected stream record data"));
    await screen.findByText("Record copied to clipboard.");
    expect(writeTextToClipboard).toHaveBeenLastCalledWith(large);
    change("Search stream records", "task hello");
    expect(button("Inspect stream record 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Inspect stream record 2" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search stream records"), {
      key: "Escape",
    });
    change("Stream event type filter", "big");
    expect(button("Inspect stream record 2")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Inspect stream record 1" }),
    ).not.toBeInTheDocument();
    await user.click(button("Download stream transcript"));
    expect(streams.parseStreamTranscript(exported()).records[1].data).toBe(
      large,
    );
    await user.click(button("Clear stream inspector"));
    expect(
      screen.queryByRole("button", { name: "Inspect stream record 2" }),
    ).not.toBeInTheDocument();
  });

  it("exports honest partial coverage after cancellation and discards cancelled late file reads", async () => {
    const { user } = await setup();
    const nativeRun = streams.runStreamCases;
    let release!: () => void;
    vi.spyOn(streams, "runStreamCases").mockImplementationOnce(
      async (project, options, signal, progress) => {
        const stop = new AbortController();
        const report = await nativeRun(
          project,
          options,
          stop.signal,
          (count, total) => {
            progress?.(count, total);
            stop.abort();
          },
        );
        await new Promise<void>((done) => {
          release = done;
        });
        expect(signal?.aborted).toBe(true);
        return report;
      },
    );
    await user.click(button("Run byte-boundary regression sweep"));
    await waitFor(() => expect(release).toBeTypeOf("function"));
    await user.click(button("Cancel streaming work"));
    await act(async () => release());
    await screen.findByText(/Incomplete replay run/);
    await user.click(button("Download value-free streaming replay report"));
    expect(JSON.parse(exported())).toMatchObject({
      complete: false,
      completed: 1,
      total: 30,
    });
    let read!: (source: string) => void;
    const delayed = new File([], "late.json");
    Object.defineProperty(delayed, "text", {
      value: () =>
        new Promise((done) => {
          read = done;
        }),
    });
    fireEvent.change(
      screen.getByLabelText("Restore streaming project (JSON)"),
      { target: { files: [delayed] } },
    );
    await user.click(button("Cancel streaming work"));
    change("Streaming project name", "Keep new work");
    await act(async () =>
      read(streams.serializeStreamProject(streams.emptyStreamProject())),
    );
    expect(screen.getByLabelText("Streaming project name")).toHaveValue(
      "Keep new work",
    );
  });

  it("retains work after invalid imports and reports blocked downloads and clipboard failures", async () => {
    const { user } = await setup();
    await user.click(button("Replay selected stream fixture"));
    await screen.findByText("Completed 1/1 variants: 1 passed, 0 failed.");
    fireEvent.change(
      screen.getByLabelText("Restore streaming project (JSON)"),
      { target: { files: [file('{"kind":"wrong"}')] } },
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Streaming project name")).toHaveValue(
      "Streaming framing and replay demo",
    );
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(button("Download stream transcript"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Download was blocked.",
    );
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(button("Copy full selected stream record data"));
    await screen.findByText("Could not copy the record.");
    expect(button("Inspect stream record 1")).toBeInTheDocument();
  });

  it("keeps offline results when collapsed and localizes controls and outcomes in Russian", async () => {
    const { user } = await setup();
    await runCases(user);
    await user.click(
      screen.getByText("Streaming HTTP studio", { selector: "summary" }),
    );
    await user.click(
      screen.getByText("Streaming HTTP studio", { selector: "summary" }),
    );
    expect(
      screen.getByText("Completed 5/5 variants: 5 passed, 0 failed."),
    ).toBeInTheDocument();
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Студия потокового HTTP", { selector: "summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Подключить HTTP-поток" }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("streamStudio.");
    expect(
      within(
        screen.getByLabelText("Результаты воспроизведения потока"),
      ).getByText(/Завершено 5\/5/),
    ).toBeInTheDocument();
  });
});
