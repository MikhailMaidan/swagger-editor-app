import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiDesignerPanel } from "./api-designer-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import {
  demoDesignDocument,
  designOperations,
  MAX_DESIGN_BYTES,
  parseDesignProject,
  readDesignDocument,
  serializeDesignProject,
} from "@/lib/api-designer";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(button("Save form to design draft"));
function file(text: string, name = "design.json") {
  const f = new File([text], name, { type: "application/json" });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
}
async function setup(demo = true) {
  const user = userEvent.setup();
  let editor = DEFAULT_OPENAPI_SCHEMA;
  const get = vi.fn(() => editor),
    apply = vi.fn((text: string) => {
      editor = text;
    }),
    view = render(<ApiDesignerPanel getSchemaText={get} onApply={apply} />);
  await user.click(
    screen.getByText("API design studio", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load task-board design demo"));
  return {
    user,
    get,
    apply,
    ...view,
    editor: () => editor,
    edit: (text: string) => {
      editor = text;
    },
  };
}

describe("ApiDesignerPanel", () => {
  it("authors operations, parameters, models and payloads through forms and exports a usable contract", async () => {
    const { user, apply } = await setup(false);
    change("Design form", "model");
    change("Reusable model name", "Item");
    await save(user);
    change("Design form", "property");
    change("Property name", "id");
    await user.click(screen.getByLabelText("Required"));
    await save(user);
    change("Selected model property", "");
    change("Property name", "title");
    await user.click(screen.getByLabelText("Required"));
    await save(user);
    change("Design form", "operation");
    change("Operation path", "/items/{id}");
    change("Operation summary", "Read item");
    change("Operation identifier", "readItem");
    await save(user);
    expect(screen.getByLabelText("Operation path")).toBeDisabled();
    expect(screen.getByLabelText("Operation identifier")).toBeDisabled();
    change("Design form", "parameter");
    change("Selected operation parameter", "0");
    change("Parameter schema JSON: Schema template type", "integer");
    await user.click(button("Build schema draft Parameter schema JSON"));
    await save(user);
    expect(screen.getByLabelText("Required")).toBeChecked();
    expect(screen.getByLabelText("Required")).toBeDisabled();
    change("Design form", "payload");
    change("Payload schema JSON", '{"$ref":"#/components/schemas/Item"}');
    await save(user);
    change("Selected designer operation", "");
    change("Design form", "operation");
    change("Operation path", "/items");
    change("Operation method", "post");
    change("Operation identifier", "createItem");
    await save(user);
    change("Design form", "payload");
    change("Payload direction", "request");
    change("Payload description", "Item input");
    change(
      "Payload schema JSON",
      '{"type":"object","required":["title"],"properties":{"title":{"type":"string"}}}',
    );
    await user.click(screen.getByLabelText("Required"));
    await save(user);
    expect(screen.getByLabelText("Payload direction")).toHaveValue("request");
    change("Payload direction", "response");
    change("Response status / default", "201");
    change("Payload description", "Created");
    change("Payload schema JSON", '{"$ref":"#/components/schemas/Item"}');
    await save(user);
    expect(screen.getByLabelText("Response status / default")).toHaveValue(
      "201",
    );
    change("Payload description", "Unsaved replacement");
    await user.click(button("Discard form edits"));
    expect(screen.getByLabelText("Response status / default")).toHaveValue(
      "201",
    );
    expect(screen.getByLabelText("Payload description")).toHaveValue("Created");
    await user.click(button("Download designed OpenAPI"));
    const doc = readDesignDocument(exported()),
      ops = designOperations(doc);
    expect(ops).toHaveLength(2);
    expect(ops[0].operation.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "integer" } },
    ]);
    expect(ops[1].operation.requestBody).toMatchObject({
      description: "Item input",
      required: true,
    });
    expect(ops[1].operation.responses).toHaveProperty(
      "201.description",
      "Created",
    );
    expect(doc.components).toMatchObject({
      schemas: { Item: { required: ["id", "title"] } },
    });
    expect(apply).not.toHaveBeenCalled();
  });
  it("keeps unfinished form changes visible, blocks navigation and exports, and allows explicit save/discard", async () => {
    const { user } = await setup();
    change("Operation summary", "Unfinished");
    expect(button("Download API design project")).toBeDisabled();
    expect(button("Prepare API design editor preview")).toBeDisabled();
    expect(screen.getByLabelText("Design form")).toBeDisabled();
    expect(screen.getByLabelText("Selected reusable model")).toBeDisabled();
    expect(button("Capture editor into API designer")).toBeDisabled();
    await user.click(button("Discard form edits"));
    expect(screen.getByLabelText("Operation summary")).toHaveValue(
      "Read a task",
    );
    expect(button("Download API design project")).toBeEnabled();
    change("Operation summary", "Saved edit");
    await save(user);
    expect(screen.getByLabelText("Operation summary")).toHaveValue(
      "Saved edit",
    );
    expect(button("Undo draft change")).toBeEnabled();
  });
  it("undoes and redoes draft edits without changing the main editor", async () => {
    const { user, apply } = await setup();
    change("Operation summary", "Updated");
    await save(user);
    await user.click(button("Undo draft change"));
    expect(screen.getByLabelText("Operation summary")).toHaveValue(
      "Read a task",
    );
    await user.click(button("Redo draft change"));
    expect(screen.getByLabelText("Operation summary")).toHaveValue("Updated");
    await user.click(button("Undo draft change"));
    change("Operation summary", "New branch");
    await save(user);
    expect(button("Redo draft change")).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
  });
  it("requires a fresh editor preview to apply and restores exact prior text with guarded editor undo", async () => {
    const { user, editor, apply, edit } = await setup();
    expect(button("Apply API design to editor")).toBeDisabled();
    await user.click(button("Prepare API design editor preview"));
    expect(
      screen.getByLabelText("API design preview (first 16,000 characters)"),
    ).toBeInTheDocument();
    edit("Changed while preview was open");
    await user.click(button("Apply API design to editor"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "editor or design changed",
    );
    expect(apply).not.toHaveBeenCalled();
    edit(DEFAULT_OPENAPI_SCHEMA);
    await user.click(button("Prepare API design editor preview"));
    await user.click(button("Apply API design to editor"));
    expect(designOperations(readDesignDocument(editor()))).toHaveLength(2);
    expect(editor()).not.toBe(DEFAULT_OPENAPI_SCHEMA);
    const applied = editor();
    edit(applied + "\n");
    await user.click(button("Undo API design editor update"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "editor or design changed",
    );
    expect(editor()).toBe(applied + "\n");
    edit(applied);
    await user.click(button("Undo API design editor update"));
    expect(editor()).toBe(DEFAULT_OPENAPI_SCHEMA);
    expect(button("Undo API design editor update")).toBeDisabled();
  });
  it("repairs selected operation/model context when undo removes a newly created entity", async () => {
    const { user } = await setup(false);
    change("Design form", "model");
    change("Reusable model name", "Item");
    await save(user);
    await user.click(button("Undo draft change"));
    expect(screen.getByLabelText("Selected reusable model")).toHaveValue("");
    expect(screen.getByLabelText("Reusable model name")).toBeEnabled();
    change("Reusable model name", "Replacement");
    await save(user);
    expect(screen.getByLabelText("Selected reusable model")).toHaveValue(
      "Replacement",
    );
    change("Design form", "operation");
    change("Operation path", "/items");
    await save(user);
    await user.click(button("Undo draft change"));
    expect(screen.getByLabelText("Selected designer operation")).toHaveValue(
      "",
    );
    expect(screen.getByLabelText("Operation path")).toBeEnabled();
    change("Operation path", "/replacement");
    await save(user);
    expect(screen.getByLabelText("Selected designer operation")).toHaveValue(
      "/paths/~1replacement/get",
    );
  });
  it("invalidates previews after draft or format edits and permits explicit replacement of invalid editor text", async () => {
    const { user, edit, editor } = await setup();
    await user.click(button("Prepare API design editor preview"));
    change("Operation summary", "Change");
    expect(button("Apply API design to editor")).toBeDisabled();
    await save(user);
    expect(button("Apply API design to editor")).toBeDisabled();
    await user.click(button("Prepare API design editor preview"));
    change("API design output format", "yaml");
    expect(button("Apply API design to editor")).toBeDisabled();
    edit("openapi: [");
    await user.click(button("Prepare API design editor preview"));
    expect(
      screen.getByText(
        "The current editor text is invalid; applying this reviewed draft will replace it.",
      ),
    ).toBeInTheDocument();
    await user.click(button("Apply API design to editor"));
    expect(editor()).toContain("openapi: 3.1.0");
  });
  it("captures existing OpenAPI explicitly, preserves existing operations on metadata changes, and searches with Escape", async () => {
    const { user, get, apply } = await setup();
    await user.click(button("Capture editor into API designer"));
    expect(get).toHaveBeenCalledTimes(1);
    expect(
      screen.getByLabelText("OpenAPI source to load into designer"),
    ).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    change("Operation summary", "Updated user docs");
    await save(user);
    await user.click(button("Download designed OpenAPI"));
    const doc = readDesignDocument(exported());
    expect(designOperations(doc)).toHaveLength(2);
    expect(designOperations(doc)[0].operation.summary).toBe(
      "Updated user docs",
    );
    expect(designOperations(doc)[1].operation.requestBody).toMatchObject({
      content: { "application/json": { example: { name: "Alex Smith" } } },
    });
    expect(apply).not.toHaveBeenCalled();
    change("Search designer operations", "post");
    await user.click(screen.getByLabelText("Search designer operations"));
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Search designer operations")).toHaveValue("");
  });
  it("blocks dirty source exports, retains current work on invalid imports and allows discarding source edits", async () => {
    const { user } = await setup();
    change("OpenAPI source to load into designer", "openapi: [");
    expect(button("Download designed OpenAPI")).toBeDisabled();
    expect(button("Download API design project")).toBeDisabled();
    await user.click(button("Load OpenAPI into designer"));
    expect(screen.getByRole("alert")).toHaveTextContent("valid local OpenAPI");
    expect(
      screen.getByText("OpenAPI 3.1.0: 2 editable operations, 1 models."),
    ).toBeInTheDocument();
    await user.click(button("Discard import source edits"));
    expect(button("Download designed OpenAPI")).toBeEnabled();
    await user.upload(
      screen.getByLabelText("Import design OpenAPI (JSON/YAML)"),
      file("openapi: ["),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "valid local OpenAPI",
    );
    expect(
      screen.getByText("OpenAPI 3.1.0: 2 editable operations, 1 models."),
    ).toBeInTheDocument();
  });
  it("round-trips project exports and rejects imported claimed preview/undo results", async () => {
    const { user, apply } = await setup();
    change("Operation summary", "Portable");
    await save(user);
    await user.click(button("Download API design project"));
    const raw = JSON.parse(exported());
    raw.preview = { before: DEFAULT_OPENAPI_SCHEMA, after: "fake" };
    raw.undoEditor = { before: "fake", after: DEFAULT_OPENAPI_SCHEMA };
    await user.click(button("Prepare API design editor preview"));
    await user.upload(
      screen.getByLabelText("Restore API design project (JSON)"),
      file(JSON.stringify(raw)),
    );
    expect(
      await screen.findByText(
        "API design project restored. Prepare a fresh editor preview before applying.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Operation summary")).toHaveValue("Portable");
    expect(button("Apply API design to editor")).toBeDisabled();
    expect(button("Undo API design editor update")).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
  });
  it("adds API metadata and a server without changing the main editor", async () => {
    const { user, apply } = await setup();
    change("Design form", "info");
    change("API title", "Project title");
    change("API version", "2.0");
    change("API description", "Docs");
    await save(user);
    change("Design form", "server");
    change("New server URL", "https://discarded.example.com");
    change("New server description", "Unsaved region");
    await user.click(button("Discard form edits"));
    expect(screen.getByLabelText("New server URL")).toHaveValue(
      "https://api.example.com",
    );
    expect(screen.getByLabelText("New server description")).toHaveValue("");
    change("New server URL", "https://api.example.com/v2");
    change("New server description", "New region");
    await save(user);
    await user.click(button("Download API design project"));
    const doc = parseDesignProject(exported()).document;
    expect(doc.info).toMatchObject({
      title: "Project title",
      version: "2.0",
      description: "Docs",
    });
    expect(doc.servers).toEqual([
      { url: "https://api.example.com/v2", description: "New region" },
    ]);
    expect(apply).not.toHaveBeenCalled();
  });
  it("changes authentication separately and keeps referenced parameters and bodies read-only", async () => {
    const { user } = await setup();
    const doc = demoDesignDocument(),
      op = designOperations(doc)[0].operation;
    op.parameters = [{ $ref: "#/components/parameters/Shared" }];
    op.requestBody = { $ref: "#/components/requestBodies/Shared" };
    doc.security = [{ key: [] }];
    doc.components = {
      ...(doc.components as Record<string, never>),
      securitySchemes: { key: { type: "apiKey", name: "X-Key", in: "header" } },
    };
    await user.upload(
      screen.getByLabelText("Restore API design project (JSON)"),
      file(serializeDesignProject(doc, "Refs")),
    );
    change("Design form", "parameter");
    change("Selected operation parameter", "0");
    expect(button("Save form to design draft")).toBeDisabled();
    change("Design form", "payload");
    change("Payload direction", "request");
    expect(button("Save form to design draft")).toBeDisabled();
    change("Design form", "security");
    change("Operation security policy", "custom");
    change("Security requirements JSON", '[{"key":[]},{}]');
    await save(user);
    await user.click(button("Download API design project"));
    expect(
      designOperations(parseDesignProject(exported()).document)[0].operation
        .security,
    ).toEqual([{ key: [] }, {}]);
  });
  it("exports value-free reference/change reviews and JSON/YAML without network or storage writes", async () => {
    const { user, apply } = await setup(),
      network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await user.click(button("Prepare API design editor preview"));
    await user.click(button("Download value-free API design review"));
    expect(JSON.parse(exported())).toMatchObject({
      kind: "rsswag-api-design-review",
      operationCount: 2,
      modelCount: 1,
    });
    expect(exported()).not.toContain('"before"');
    expect(exported()).not.toContain('"after"');
    expect(exported()).not.toContain("Task fields");
    change("API design output format", "yaml");
    await user.click(button("Download designed OpenAPI"));
    expect(exported()).toContain("openapi: 3.1.0");
    expect(readDesignDocument(exported()).info).toMatchObject({
      title: "Task board API",
    });
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
  it("preserves drafts and previews when closed and reopened", async () => {
    const { user } = await setup();
    await user.click(button("Prepare API design editor preview"));
    await user.click(
      screen.getByText("API design studio", { selector: "summary" }),
    );
    await user.click(
      screen.getByText("API design studio", { selector: "summary" }),
    );
    expect(button("Apply API design to editor")).toBeEnabled();
    expect(screen.getByLabelText("Operation summary")).toHaveValue(
      "Read a task",
    );
  });
  it("reports blocked downloads and oversized files without replacing valid work", async () => {
    const { user } = await setup();
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download API design project"));
    expect(screen.getByRole("alert")).toHaveTextContent("Download was blocked");
    const large = file("{}");
    Object.defineProperty(large, "size", { value: MAX_DESIGN_BYTES + 1 });
    await user.upload(
      screen.getByLabelText("Import design OpenAPI (JSON/YAML)"),
      large,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "limit was exceeded",
    );
    expect(screen.getByLabelText("Operation summary")).toHaveValue(
      "Read a task",
    );
  });
  it("disables editing during file reads and ignores late completion after unmount", async () => {
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
      screen.getByLabelText("Restore API design project (JSON)"),
      slow,
    );
    expect(screen.getByText("Reading API design file…")).toBeInTheDocument();
    expect(button("Load task-board design demo")).toBeDisabled();
    expect(screen.getByLabelText("Operation summary")).toBeDisabled();
    unmount();
    await act(async () =>
      resolve(serializeDesignProject(demoDesignDocument(), "Demo")),
    );
    expect(downloadTextFile).not.toHaveBeenCalled();
  });
  it("localizes authoring, schema templates, previews and exports into Russian", async () => {
    act(() => setAppLanguage("ru"));
    const user = userEvent.setup();
    render(
      <ApiDesignerPanel
        getSchemaText={() => DEFAULT_OPENAPI_SCHEMA}
        onApply={vi.fn()}
      />,
    );
    await user.click(
      screen.getByText("Студия проектирования API", { selector: "summary" }),
    );
    await user.click(button("Загрузить демо API задач"));
    change("Краткое описание операции", "Обновление");
    await user.click(button("Сохранить форму в черновик"));
    await user.click(button("Подготовить просмотр обновления редактора"));
    expect(
      screen.getByLabelText("Просмотр проекта API (первые 16 000 символов)"),
    ).toBeInTheDocument();
    await user.click(button("Скачать проект API"));
    expect(
      designOperations(parseDesignProject(exported()).document)[0].operation
        .summary,
    ).toBe("Обновление");
  });
});
