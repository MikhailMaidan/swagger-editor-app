import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncApiStudioPanel } from "./asyncapi-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  addAsyncChannel,
  emptyAsyncDocument,
  parseAsyncProject,
  rehearseEvent,
  readAsyncDocument,
  serializeAsyncProject,
  type AsyncDocument,
} from "@/lib/asyncapi-studio";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const openApi = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "REST API", version: "1" },
  paths: {
    "/orders": {
      get: {
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                example: { orderId: 9, customer: "private-customer" },
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
  },
});
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const file = (text: string, name = "asyncapi.json") => {
  const f = new File([text], name, { type: "application/json" });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
};
function document() {
  return addAsyncChannel(emptyAsyncDocument(), {
    key: "orders",
    address: "orders.created",
    messageName: "Created",
    action: "send",
    example: '{"orderId":1,"customer":"private-customer"}',
  });
}
async function setup() {
  const user = userEvent.setup();
  let editor = openApi;
  const view = render(<AsyncApiStudioPanel getSchemaText={() => editor} />);
  await user.click(screen.getByText("AsyncAPI event studio"));
  return {
    user,
    ...view,
    edit: (text: string) => {
      editor = text;
    },
    editor: () => editor,
  };
}
async function load(
  user: ReturnType<typeof userEvent.setup>,
  doc: AsyncDocument = document(),
) {
  await user.upload(
    screen.getByLabelText("Import AsyncAPI document (JSON/YAML)"),
    file(doc.text),
  );
  await screen.findByText("Event contract loaded; journal reset.");
}
async function example(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Load message example into rehearsal"));
}
async function record(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Record local message rehearsal"));
}
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];

describe("AsyncApiStudioPanel", () => {
  it("uses a bounded default project name without changing a long contract title", async () => {
    const { user } = await setup();
    const root = document().root;
    const title = "Long event title ".repeat(10);
    root.info = { title, version: "1" };
    await load(user, readDoc(root));
    expect(screen.getByLabelText("Event studio project name")).toHaveValue(
      title.trim().slice(0, 120),
    );
    await user.click(button("Download event project with message values"));
    expect(parseAsyncProject(exported()).doc.catalog.title).toBe(title);
  });
  it("imports, validates, rehearses, replays and exports without network, storage or OpenAPI changes", async () => {
    const { user, editor } = await setup(),
      network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await load(user);
    await example(user);
    await user.click(button("Check message without recording"));
    expect(screen.getByText("Local event journal (0/200)")).toBeInTheDocument();
    expect(
      screen.getByText("Message check: Valid for supported checks"),
    ).toBeInTheDocument();
    await record(user);
    await user.click(button("Replay event 1"));
    expect(screen.getByText("Local event journal (2/200)")).toBeInTheDocument();
    await user.click(
      button("Download rehearsal report without message values"),
    );
    expect(exported()).not.toContain("private-customer");
    expect(JSON.parse(exported()).events).toHaveLength(2);
    await user.click(button("Download full journal with message values"));
    expect(exported()).toContain("private-customer");
    await user.click(button("Download event project with message values"));
    expect(parseAsyncProject(exported()).project.journal).toHaveLength(2);
    await user.click(button("Download AsyncAPI JSON"));
    expect(JSON.parse(exported()).asyncapi).toBe("3.1.0");
    await user.click(button("Download AsyncAPI YAML"));
    expect(exported()).toContain("asyncapi: 3.1.0");
    await user.click(button("Download event inventory Markdown"));
    expect(exported()).toContain("send_orders");
    expect(editor()).toBe(openApi);
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("builds a new event contract with inferred schemas from an OpenAPI example", async () => {
    const { user, editor } = await setup();
    await user.click(button("Start an empty AsyncAPI 3.1 contract"));
    await user.click(
      screen.getByText("Add a channel from a JSON example", {
        selector: "summary",
      }),
    );
    await user.click(button("Read JSON examples from OpenAPI editor"));
    await user.click(button("Use selected OpenAPI example"));
    expect(
      screen.getByLabelText("JSON payload example for schema inference"),
    ).toHaveValue(
      JSON.stringify({ orderId: 9, customer: "private-customer" }, null, 2),
    );
    await user.click(button("Add event channel and operation"));
    await example(user);
    await record(user);
    await user.click(button("Download AsyncAPI JSON"));
    const root = JSON.parse(exported());
    expect(
      root.channels.orders.messages.event.payload.properties.orderId.type,
    ).toBe("integer");
    expect(root.operations.send_orders.action).toBe("send");
    expect(editor()).toBe(openApi);
    await user.click(button("Add event channel and operation"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "unique channel identifier",
    );
    expect(screen.getByText("Local event journal (1/200)")).toBeInTheDocument();
  });
  it("records invalid messages with errors, edits earlier envelopes, and supports undo and clear", async () => {
    const { user } = await setup();
    await load(user);
    await example(user);
    change(
      "Rehearsal payload (JSON)",
      '{"orderId":"wrong","customer":"private-customer"}',
    );
    await record(user);
    expect(screen.getAllByText("Message check: Invalid")).toHaveLength(2);
    await user.click(button("Edit event 1 inputs"));
    expect(screen.getByLabelText("Rehearsal payload (JSON)")).toHaveValue(
      JSON.stringify(
        { orderId: "wrong", customer: "private-customer" },
        null,
        2,
      ),
    );
    change(
      "Rehearsal payload (JSON)",
      '{"orderId":2,"customer":"private-customer"}',
    );
    await record(user);
    await user.click(button("Undo last journal entry"));
    expect(screen.getByText("Local event journal (1/200)")).toBeInTheDocument();
    await user.click(button("Clear local journal"));
    expect(screen.getByText("Local event journal (0/200)")).toBeInTheDocument();
  });
  it("blocks actions for pending contract edits and preserves active work after an invalid load", async () => {
    const { user } = await setup();
    await load(user);
    await example(user);
    await record(user);
    const original = (
      screen.getByLabelText(
        "AsyncAPI source (JSON or YAML)",
      ) as HTMLTextAreaElement
    ).value;
    change("AsyncAPI source (JSON or YAML)", "asyncapi: [");
    expect(button("Record local message rehearsal")).toBeDisabled();
    expect(button("Download AsyncAPI JSON")).toBeDisabled();
    expect(button("Replay event 1")).toBeDisabled();
    await user.click(button("Load event contract and reset journal"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Local event journal (1/200)")).toBeInTheDocument();
    await user.click(button("Discard event contract edits"));
    expect(screen.getByLabelText("AsyncAPI source (JSON or YAML)")).toHaveValue(
      original,
    );
    expect(button("Replay event 1")).toBeEnabled();
    change("AsyncAPI source (JSON or YAML)", original + "\n");
    await user.click(button("Load event contract and reset journal"));
    expect(screen.getByText("Local event journal (0/200)")).toBeInTheDocument();
  });
  it("restores projects and ignores forged imported results", async () => {
    const { user } = await setup(),
      doc = document(),
      journal = rehearseEvent(doc, [], {
        operationKey: "send_orders",
        messageKey: "event",
        parameters: {},
        payload: { orderId: 1, customer: "private-customer" },
        headers: {},
      });
    const raw = JSON.parse(
      serializeAsyncProject(doc, journal, "Project restored"),
    );
    raw.journal[0].check.status = "invalid";
    await user.upload(
      screen.getByLabelText("Restore event studio project (JSON)"),
      file(JSON.stringify(raw), "project.json"),
    );
    await screen.findByText(
      "Event project restored and journal checks recomputed.",
    );
    expect(screen.getByLabelText("Event studio project name")).toHaveValue(
      "Project restored",
    );
    await user.click(
      button("Download rehearsal report without message values"),
    );
    expect(JSON.parse(exported()).events[0].status).toBe("valid");
    await user.upload(
      screen.getByLabelText("Restore event studio project (JSON)"),
      file('{"kind":"wrong"}'),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("valid version 1"),
    );
    expect(screen.getByText("Local event journal (1/200)")).toBeInTheDocument();
  });
  it("blocks mutation during file reads and discards late reads after unmount", async () => {
    const { user, unmount } = await setup();
    await load(user);
    let resolve!: (value: string) => void;
    const f = file("");
    Object.defineProperty(f, "text", {
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText("Import AsyncAPI document (JSON/YAML)"),
      f,
    );
    expect(screen.getByText("Reading event studio file…")).toBeInTheDocument();
    expect(
      screen.getByLabelText("AsyncAPI source (JSON or YAML)"),
    ).toBeDisabled();
    expect(button("Download AsyncAPI JSON")).toBeDisabled();
    unmount();
    await act(async () => resolve(document().text));
    expect(
      screen.queryByText("Event contract loaded; journal reset."),
    ).not.toBeInTheDocument();
  });
  it("inspects AsyncAPI 2.x with correct application direction and explains the builder limit", async () => {
    const { user } = await setup();
    const source = JSON.stringify({
      asyncapi: "2.6.0",
      info: { title: "Legacy", version: "1" },
      channels: {
        updates: {
          publish: {
            operationId: "consume",
            message: {
              payload: { type: "string" },
              examples: [{ payload: "hello" }],
            },
          },
          subscribe: {
            operationId: "produce",
            message: { payload: { type: "string" } },
          },
        },
      },
    });
    await user.upload(
      screen.getByLabelText("Import AsyncAPI document (JSON/YAML)"),
      file(source),
    );
    await screen.findByText("Event contract loaded; journal reset.");
    expect(button("produce · Application sends · updates")).toBeInTheDocument();
    expect(
      button("consume · Application receives · updates"),
    ).toBeInTheDocument();
    await user.click(button("consume · Application receives · updates"));
    await example(user);
    await record(user);
    await user.click(button("Download full journal with message values"));
    expect(JSON.parse(exported()).events[0].action).toBe("receive");
    await user.click(
      screen.getByText("Add a channel from a JSON example", {
        selector: "summary",
      }),
    );
    expect(button("Add event channel and operation")).toBeDisabled();
  });
  it("searches and filters operations and journal rows while keeping state across panel closing", async () => {
    const { user } = await setup();
    let doc = document();
    doc = addAsyncChannel(doc, {
      key: "alerts",
      address: "alerts",
      messageName: "Alert",
      action: "receive",
      example: '{"message":"alarm"}',
    });
    await load(user, doc);
    change("Filter operation direction", "receive");
    expect(
      button("receive_alerts · Application receives · alerts"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "send_orders · Application sends · orders",
      }),
    ).not.toBeInTheDocument();
    change("Search event operations", "absent");
    expect(
      screen.getByText("No matching event operations."),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText("Search event operations"));
    await user.keyboard("{Escape}");
    change("Filter operation direction", "all");
    await user.click(button("send_orders · Application sends · orders"));
    await example(user);
    await record(user);
    change("Filter rehearsal outcome", "invalid");
    expect(
      screen.getByText("No matching journal entries."),
    ).toBeInTheDocument();
    change("Filter rehearsal outcome", "all");
    change("Search rehearsal journal", "orders.created");
    expect(button("Replay event 1")).toBeInTheDocument();
    await user.click(screen.getByText("AsyncAPI event studio"));
    await user.click(screen.getByText("AsyncAPI event studio"));
    expect(screen.getByText("Local event journal (1/200)")).toBeInTheDocument();
  });
  it("paginates restored journals and allows escaping the journal search", async () => {
    const { user } = await setup(),
      doc = document();
    let journal: ReturnType<typeof rehearseEvent> = [];
    for (let i = 0; i < 21; i++)
      journal = rehearseEvent(doc, journal, {
        operationKey: "send_orders",
        messageKey: "event",
        parameters: {},
        payload: { orderId: i, customer: "private-customer" },
        headers: {},
      });
    await user.upload(
      screen.getByLabelText("Restore event studio project (JSON)"),
      file(serializeAsyncProject(doc, journal, "Paging")),
    );
    await screen.findByText(
      "Event project restored and journal checks recomputed.",
    );
    expect(button("Replay event 20")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Replay event 21" }),
    ).not.toBeInTheDocument();
    await user.click(button("Next journal entries"));
    expect(button("Replay event 21")).toBeInTheDocument();
    change("Search rehearsal journal", "no-match");
    expect(
      screen.getByText("No matching journal entries."),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText("Search rehearsal journal"));
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Search rehearsal journal")).toHaveValue("");
    expect(button("Replay event 1")).toBeInTheDocument();
  });
  it("shows partial checks, validates parameter values and handles blocked downloads", async () => {
    const { user } = await setup(),
      original = document().root;
    const raw = JSON.parse(JSON.stringify(original));
    raw.channels.orders.address = "orders/{tenant}";
    raw.channels.orders.parameters = { tenant: { enum: ["alpha"] } };
    raw.channels.orders.messages.event.traits = [{}];
    await load(user, readDoc(raw));
    await example(user);
    await record(user);
    expect(screen.getByRole("alert")).toHaveTextContent("address parameters");
    change(
      "Channel parameter values (JSON string object)",
      '{"tenant":"alpha"}',
    );
    await record(user);
    expect(
      screen.getAllByText("Message check: Partial — review findings"),
    ).toHaveLength(2);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download AsyncAPI JSON"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "download could not start",
    );
  });
  it("localizes the new studio in Russian", async () => {
    await setup();
    act(() => setAppLanguage("ru"));
    expect(screen.getByText("Студия событий AsyncAPI")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Исходник AsyncAPI (JSON или YAML)"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Start an empty AsyncAPI 3.1 contract"),
    ).not.toBeInTheDocument();
  });
});

function readDoc(value: unknown) {
  return readAsyncDocument(JSON.stringify(value));
}
