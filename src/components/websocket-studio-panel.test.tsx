import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketStudioPanel } from "./websocket-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { MockWebSocket } from "@/test/websocket-mock";
import { downloadTextFile } from "@/lib/schema-download";
import {
  demoWsProject,
  MAX_WS_PROJECT_BYTES,
  parseWsProject,
  parseWsTranscript,
  serializeWsProject,
  serializeWsTranscript,
  type WsMessage,
} from "@/lib/websocket-studio";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
const socket = () => MockWebSocket.instances.at(-1)!;
function file(text: string) {
  const f = new File([text], "websocket.json", { type: "application/json" });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
}
async function setup(demo = true) {
  const user = userEvent.setup(),
    view = render(<WebSocketStudioPanel />);
  await user.click(
    screen.getByText("WebSocket session studio", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load realtime conversation demo"));
  return { user, ...view };
}
async function connect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Connect WebSocket"));
  await act(async () => socket().open());
  expect(button("Send WebSocket message")).toBeEnabled();
}
async function replay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Replay conversation offline"));
  await waitFor(() =>
    expect(screen.getByText(/Offline replay: passed/)).toBeInTheDocument(),
  );
}

describe("WebSocketStudioPanel", () => {
  it("replays the demo, renders typed acknowledgement messages and exports a portable project, transcript, NDJSON and value-free report without network or storage", async () => {
    const fetch = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    const { user } = await setup();
    await replay(user);
    expect(
      screen.getByLabelText(
        "Selected message preview (first 16,000 characters)",
      ),
    ).toHaveValue('{"type":"ack","id":42}');
    await user.click(button("Download WebSocket transcript"));
    expect(parseWsTranscript(exported())).toHaveLength(5);
    await user.click(button("Download WebSocket messages (NDJSON)"));
    expect(
      exported()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toHaveLength(5);
    await user.click(button("Download value-free conversation report"));
    expect(JSON.parse(exported())).toMatchObject({
      status: "passed",
      mode: "replay",
    });
    expect(exported()).not.toContain("Ship realtime support");
    expect(exported()).not.toContain("wss://");
    await user.click(button("Download WebSocket project"));
    expect(parseWsProject(exported()).conversations[0].steps).toHaveLength(4);
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("connects explicitly, sends exact JSON and binary messages, receives events and shows server-close details", async () => {
    const { user } = await setup(false);
    change("WebSocket URL", "wss://socket.example.com/events");
    change("WebSocket subprotocols (comma-separated)", "chat.v2, json");
    await connect(user);
    expect(socket().url).toBe("wss://socket.example.com/events");
    expect(socket().protocols).toEqual(["chat.v2", "json"]);
    change("Outgoing WebSocket message", '{"hello":true}');
    await user.click(button("Send WebSocket message"));
    expect(socket().send).toHaveBeenLastCalledWith('{"hello":true}');
    change("Outgoing message format", "binary");
    change("Outgoing WebSocket message", "AAEC");
    await user.click(button("Send WebSocket message"));
    expect(
      new Uint8Array(socket().send.mock.calls.at(-1)![0] as ArrayBuffer),
    ).toEqual(Uint8Array.from([0, 1, 2]));
    act(() => socket().message('{"type":"reply"}'));
    expect(
      screen.getByLabelText(
        "Selected message preview (first 16,000 characters)",
      ),
    ).toHaveValue('{"type":"reply"}');
    expect(button("Run live WebSocket conversation")).toBeDisabled();
    act(() => socket().serverClose(4001, "Server finished", false));
    expect(
      screen.getByText(/4001 · Server finished · unclean close/),
    ).toBeInTheDocument();
    expect(button("Send WebSocket message")).toBeDisabled();
    expect(button("Connect WebSocket")).toBeEnabled();
  });
  it("searches and filters messages, clears search with Escape and copies a selected binary payload without sending", async () => {
    const { user } = await setup(false);
    await connect(user);
    act(() => {
      socket().message('{"type":"hello","id":1}');
      socket().message(Uint8Array.from([0, 1, 2]).buffer);
    });
    change("Search WebSocket messages", "hello json");
    expect(button("Select WebSocket message 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select WebSocket message 2" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search WebSocket messages"), {
      key: "Escape",
    });
    change("Message format filter", "binary");
    await user.click(button("Select WebSocket message 2"));
    await user.click(button("Copy selected message to composer"));
    expect(screen.getByLabelText("Outgoing message format")).toHaveValue(
      "binary",
    );
    expect(screen.getByLabelText("Outgoing WebSocket message")).toHaveValue(
      "AAEC",
    );
    expect(socket().send).not.toHaveBeenCalled();
    await user.click(button("Disconnect WebSocket"));
    expect(socket().close).toHaveBeenCalledWith(1000, "");
  });
  it("runs a live conversation on a fresh socket, captures a server value and closes after success", async () => {
    const { user } = await setup();
    await user.click(button("Run live WebSocket conversation"));
    expect(button("Cancel WebSocket conversation")).toBeEnabled();
    socket().onSend = (data) => {
      if (typeof data === "string" && JSON.parse(data).type === "subscribe")
        socket().message('{"type":"task","task":{"id":91}}');
    };
    await act(async () => {
      socket().open();
      socket().message('{"type":"welcome"}');
    });
    await waitFor(() =>
      expect(screen.getByText(/Live conversation: passed/)).toBeInTheDocument(),
    );
    expect(
      socket().send.mock.calls.map(([data]) => JSON.parse(data as string)),
    ).toEqual([
      { type: "subscribe", room: "tasks" },
      { type: "ack", id: 91 },
    ]);
    expect(socket().close).toHaveBeenCalledTimes(1);
    expect(button("Connect WebSocket")).toBeEnabled();
  });
  it("cancels live handshake and receive waits without sending later steps", async () => {
    const { user } = await setup();
    await user.click(button("Run live WebSocket conversation"));
    await user.click(button("Cancel WebSocket conversation"));
    await waitFor(() =>
      expect(
        screen.getByText(/Live conversation: cancelled/),
      ).toBeInTheDocument(),
    );
    expect(socket().send).not.toHaveBeenCalled();
    await user.click(button("Run live WebSocket conversation"));
    await act(async () => socket().open());
    await user.click(button("Cancel WebSocket conversation"));
    await waitFor(() =>
      expect(
        screen.getByText(/Live conversation: cancelled/),
      ).toBeInTheDocument(),
    );
    expect(socket().send).not.toHaveBeenCalled();
    expect(socket().close).toHaveBeenCalledTimes(1);
  });
  it("records a transcript as a new editable conversation and replays its generated fixtures", async () => {
    const { user } = await setup();
    await replay(user);
    await user.click(button("Create conversation from transcript"));
    expect(screen.getByLabelText("Conversation name")).toHaveValue(
      "Recorded conversation",
    );
    expect(
      screen.getByLabelText("Substitute conversation variables in this step"),
    ).not.toBeChecked();
    await user.click(button("Download WebSocket project"));
    const project = parseWsProject(exported());
    expect(project.conversations).toHaveLength(2);
    expect(project.conversations[1].steps).toHaveLength(5);
    expect(project.fixtures).toHaveLength(3);
    await replay(user);
    expect(MockWebSocket.instances).toHaveLength(0);
  });
  it("requires saving or discarding edited steps and does not discard work after invalid JSON", async () => {
    const { user } = await setup();
    change("Conversation step name", "My welcome step");
    expect(button("Replay conversation offline")).toBeDisabled();
    expect(button("Download WebSocket project")).toBeDisabled();
    expect(
      screen.getByLabelText("Selected WebSocket conversation"),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Initial conversation variables (JSON object)"),
    ).toBeDisabled();
    change("Message JSON Pointer checks (JSON array)", "{");
    await user.click(button("Save conversation step"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Conversation step name")).toHaveValue(
      "My welcome step",
    );
    await user.click(button("Discard step edits"));
    expect(screen.getByLabelText("Conversation step name")).toHaveValue(
      "Wait for welcome",
    );
    change("Conversation step name", "My welcome step");
    await user.click(button("Save conversation step"));
    expect(button("Replay conversation offline")).toBeEnabled();
    await user.click(button("Download WebSocket project"));
    expect(parseWsProject(exported()).conversations[0].steps[0].name).toBe(
      "My welcome step",
    );
  });
  it("authors, reorders and removes steps and duplicates/removes conversations without changing the original", async () => {
    const { user } = await setup(false);
    change("Conversation step name", "Send request");
    change("Step message payload", '{"id":"{{id}}"}');
    await user.click(button("Save conversation step"));
    await user.click(button("Add pause step"));
    change("Pause duration (ms)", "50");
    await user.click(button("Save conversation step"));
    await user.click(button("Add expect step"));
    change("Step message format", "json");
    change(
      "Message JSON Pointer checks (JSON array)",
      '[{"name":"Success","target":"body","path":"/ok","operator":"equals","expected":"true"}]',
    );
    await user.click(button("Save conversation step"));
    change("Initial conversation variables (JSON object)", '{"id":7}');
    change(
      "Incoming replay messages (JSON array)",
      JSON.stringify([{ format: "json", data: '{"ok":true}' }]),
    );
    await user.click(button("Save replay settings"));
    await replay(user);
    await user.click(button("Duplicate conversation"));
    await user.click(button("Download WebSocket project"));
    const copy = parseWsProject(exported());
    expect(copy.conversations).toHaveLength(2);
    expect(copy.conversations[0].steps.map((s) => s.id)).not.toEqual(
      copy.conversations[1].steps.map((s) => s.id),
    );
    change("Selected conversation step", copy.conversations[1].steps[1].id);
    await user.click(button("Move step up"));
    await user.click(button("Remove conversation step"));
    await user.click(button("Download WebSocket project"));
    expect(
      parseWsProject(exported()).conversations.map((c) => c.steps.length),
    ).toEqual([3, 2]);
    await user.click(button("Remove conversation"));
    expect(screen.getByLabelText("Conversation name")).toHaveValue(
      "Conversation",
    );
    await replay(user);
  });
  it("guards unsaved replay settings, retains previous settings on invalid save, and supports discard", async () => {
    const { user } = await setup();
    change("Initial conversation variables (JSON object)", "[]");
    expect(button("Replay conversation offline")).toBeDisabled();
    expect(button("Connect WebSocket")).toBeDisabled();
    expect(screen.getByLabelText("Conversation step name")).toBeDisabled();
    await user.click(button("Save replay settings"));
    expect(screen.getByRole("alert")).toHaveTextContent("variables");
    expect(
      screen.getByLabelText("Initial conversation variables (JSON object)"),
    ).toHaveValue("[]");
    await user.click(button("Discard replay settings edits"));
    expect(
      JSON.parse(
        (
          screen.getByLabelText(
            "Initial conversation variables (JSON object)",
          ) as HTMLTextAreaElement
        ).value,
      ),
    ).toEqual({ room: "tasks" });
    await replay(user);
    expect(button("Download value-free conversation report")).toBeEnabled();
    change("Initial conversation variables (JSON object)", '{"room":"work"}');
    expect(button("Download value-free conversation report")).toBeDisabled();
    await user.click(button("Save replay settings"));
    await replay(user);
    await user.click(button("Download WebSocket transcript"));
    expect(parseWsTranscript(exported())[1].data).toContain('"room":"work"');
  });
  it("restores portable projects without imported run results, and invalid imports retain current work", async () => {
    const { user } = await setup();
    const raw = JSON.parse(serializeWsProject(demoWsProject()));
    raw.name = "Restored project";
    raw.result = { status: "passed" };
    raw.connection.state = "open";
    await user.upload(
      screen.getByLabelText("Restore WebSocket project (JSON)"),
      file(JSON.stringify(raw)),
    );
    expect(screen.getByLabelText("WebSocket project name")).toHaveValue(
      "Restored project",
    );
    expect(button("Download value-free conversation report")).toBeDisabled();
    expect(MockWebSocket.instances).toHaveLength(0);
    await user.upload(
      screen.getByLabelText("Restore WebSocket project (JSON)"),
      file("{}"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "previous work was retained",
    );
    expect(screen.getByLabelText("WebSocket project name")).toHaveValue(
      "Restored project",
    );
    const large = file("{}");
    Object.defineProperty(large, "size", { value: MAX_WS_PROJECT_BYTES + 1 });
    await user.upload(
      screen.getByLabelText("Restore WebSocket project (JSON)"),
      large,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("limit was exceeded");
    expect(MockWebSocket.instances).toHaveLength(0);
  });
  it("imports transcript messages, prepares fixtures, supports blocked downloads and clears the journal", async () => {
    const { user } = await setup(false);
    const messages: WsMessage[] = [
      {
        sequence: 1,
        direction: "receive",
        format: "text",
        data: "<script>no execution</script>",
        bytes: 29,
        atMs: 0,
      },
    ];
    await user.upload(
      screen.getByLabelText("Import WebSocket transcript (JSON)"),
      file(serializeWsTranscript(messages)),
    );
    expect(
      screen.getByLabelText(
        "Selected message preview (first 16,000 characters)",
      ),
    ).toHaveValue(messages[0].data);
    expect(MockWebSocket.instances).toHaveLength(0);
    await user.click(button("Use received messages as replay fixtures"));
    expect(
      JSON.parse(
        (
          screen.getByLabelText(
            "Incoming replay messages (JSON array)",
          ) as HTMLTextAreaElement
        ).value,
      ),
    ).toEqual([{ format: "text", data: messages[0].data }]);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download WebSocket transcript"));
    expect(screen.getByRole("alert")).toHaveTextContent("Download was blocked");
    await user.click(button("Clear WebSocket transcript"));
    expect(button("Download WebSocket transcript")).toBeDisabled();
    expect(
      screen.queryByLabelText(
        "Selected message preview (first 16,000 characters)",
      ),
    ).not.toBeInTheDocument();
  });
  it("bounds retained history, indicates dropped messages and renders only the latest 50 matches", async () => {
    const { user } = await setup(false);
    await connect(user);
    act(() => {
      for (let i = 0; i < 250; i++) socket().message(`event-${i}`);
    });
    expect(
      screen.getByText(
        "200 matching retained messages; 50 older messages dropped.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Select WebSocket message / }),
    ).toHaveLength(50);
    expect(button("Select WebSocket message 250")).toBeInTheDocument();
    expect(button("Send WebSocket message")).toBeEnabled();
    await user.click(button("Disconnect WebSocket"));
  });
  it("rejects invalid connection settings and outgoing JSON without creating or sending traffic", async () => {
    const { user } = await setup(false);
    change("WebSocket URL", "https://example.com");
    await user.click(button("Connect WebSocket"));
    expect(screen.getByRole("alert")).toHaveTextContent("ws:// or wss://");
    expect(MockWebSocket.instances).toHaveLength(0);
    change("WebSocket URL", "wss://example.com");
    await connect(user);
    change("Outgoing WebSocket message", "{");
    await user.click(button("Send WebSocket message"));
    expect(screen.getByRole("alert")).toHaveTextContent("bounded JSON");
    expect(socket().send).not.toHaveBeenCalled();
    await user.click(button("Disconnect WebSocket"));
  });
  it("retains the active connection and messages across panel collapse and closes on unmount", async () => {
    const { user, unmount } = await setup(false);
    await connect(user);
    await user.click(
      screen.getByText("WebSocket session studio", { selector: "summary" }),
    );
    act(() => socket().message("received while collapsed"));
    expect(socket().close).not.toHaveBeenCalled();
    await user.click(
      screen.getByText("WebSocket session studio", { selector: "summary" }),
    );
    expect(
      screen.getByLabelText(
        "Selected message preview (first 16,000 characters)",
      ),
    ).toHaveValue("received while collapsed");
    expect(MockWebSocket.instances).toHaveLength(1);
    unmount();
    expect(socket().close).toHaveBeenCalledTimes(1);
    act(() => socket().message("late"));
  });
  it("disables forms during file reads and ignores completion after unmount", async () => {
    const { user, unmount } = await setup();
    const slow = file("");
    let resolve!: (text: string) => void;
    Object.defineProperty(slow, "text", {
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText("Restore WebSocket project (JSON)"),
      slow,
    );
    expect(screen.getByText("Reading WebSocket file…")).toBeInTheDocument();
    expect(button("Load realtime conversation demo")).toBeDisabled();
    expect(screen.getByLabelText("Conversation step name")).toBeDisabled();
    unmount();
    await act(async () => resolve(serializeWsProject(demoWsProject())));
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(downloadTextFile).not.toHaveBeenCalled();
  });
  it("supports Russian authoring, replay, transcripts and report downloads", async () => {
    act(() => setAppLanguage("ru"));
    const user = userEvent.setup();
    render(<WebSocketStudioPanel />);
    await user.click(
      screen.getByText("Студия сессий WebSocket", { selector: "summary" }),
    );
    await user.click(button("Загрузить демо диалога реального времени"));
    await user.click(button("Воспроизвести диалог локально"));
    await waitFor(() =>
      expect(
        screen.getByText(/Локальное воспроизведение: пройдено/),
      ).toBeInTheDocument(),
    );
    await user.click(button("Скачать отчёт диалога без значений"));
    expect(JSON.parse(exported()).status).toBe("passed");
    expect(
      screen.getByLabelText("Просмотр сообщения (первые 16 000 символов)"),
    ).toHaveValue('{"type":"ack","id":42}');
  });
});
