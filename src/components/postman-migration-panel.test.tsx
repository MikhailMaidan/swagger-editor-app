import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostmanMigrationPanel } from "./postman-migration-panel";
import { setAppLanguage } from "./i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { POSTMAN_COLLECTION_SCHEMA } from "@/lib/postman-collection";
import { MAX_MIGRATION_BYTES } from "@/lib/postman-migration";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const collection = (
  urls = ["https://example.com/users/:id", "https://example.com/health"],
) =>
  JSON.stringify({
    info: { name: "Customer collection", schema: POSTMAN_COLLECTION_SCHEMA },
    item: urls.map((url, i) => ({
      name: `Request ${i + 1}`,
      request: { method: "GET", url },
      response: [{ code: 200, body: '{"id":1}' }],
    })),
  });
function file(text = collection()) {
  const value = new File([text], "collection.json", {
    type: "application/json",
  });
  Object.defineProperty(value, "text", {
    configurable: true,
    value: async () => text,
  });
  return value;
}
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function setup() {
  let editor = "previous document";
  const apply = vi.fn((text: string) => {
    editor = text;
  });
  const user = userEvent.setup();
  const view = render(
    <PostmanMigrationPanel getSchemaText={() => editor} onApply={apply} />,
  );
  await user.click(screen.getByText("Postman migration studio"));
  await screen.findByLabelText("Import Postman collection");
  return {
    user,
    apply,
    edit: (text: string) => {
      editor = text;
    },
    getEditor: () => editor,
    ...view,
  };
}
async function upload(
  user: ReturnType<typeof userEvent.setup>,
  text = collection(),
) {
  await user.upload(
    screen.getByLabelText("Import Postman collection"),
    file(text),
  );
  await screen.findByLabelText("Migrated API title");
}
beforeEach(() => {
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("PostmanMigrationPanel", () => {
  it("imports, selects, edits, exports, applies and undoes entirely offline", async () => {
    const { user, apply, getEditor } = await setup();
    const network = vi.spyOn(globalThis, "fetch");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    await upload(user);
    expect(apply).not.toHaveBeenCalled();
    change("Migrated API title", "Customers API");
    change("Path override for Request 1 (/item/0)", "/customers/{customerId}");
    await user.click(screen.getByLabelText("Select Request 2 (/item/1)"));
    await user.click(button("Generate migrated OpenAPI"));
    expect(
      screen.getByText("Migration draft · 1 requests · 1 operations"),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Migrated definition format"),
      "json",
    );
    await user.click(button("Copy migrated OpenAPI"));
    const text = vi.mocked(writeTextToClipboard).mock.calls[0][0];
    expect(JSON.parse(text)).toMatchObject({
      info: { title: "Customers API" },
      paths: { "/customers/{customerId}": { get: { summary: "Request 1" } } },
    });
    expect(JSON.parse(text).paths["/health"]).toBeUndefined();
    await user.click(button("Download migrated OpenAPI"));
    expect(downloadTextFile).toHaveBeenCalledWith(
      text,
      "postman-api.json",
      "application/json",
    );
    expect(apply).not.toHaveBeenCalled();
    await user.click(button("Apply migrated API to editor"));
    expect(getEditor()).toBe(text);
    await user.click(button("Undo migration application"));
    expect(getEditor()).toBe("previous document");
    expect(
      screen.getByLabelText("Path override for Request 1 (/item/0)"),
    ).toHaveValue("/customers/{customerId}");
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("guards applying stale previews and undoing across later editor edits", async () => {
    const { user, apply, edit, getEditor } = await setup();
    await upload(user);
    await user.click(button("Generate migrated OpenAPI"));
    edit("new external edits");
    await user.click(button("Apply migrated API to editor"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "editor changed since generation",
    );
    expect(apply).not.toHaveBeenCalled();
    await user.click(button("Generate migrated OpenAPI"));
    await user.click(button("Apply migrated API to editor"));
    const applied = getEditor();
    edit("later manual edits");
    await user.click(button("Undo migration application"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "editor changed after application",
    );
    expect(getEditor()).toBe("later manual edits");
    edit(applied);
    await user.click(button("Undo migration application"));
    expect(getEditor()).toBe("new external edits");
  });
  it("invalidates generated results when migration settings change", async () => {
    const { user } = await setup();
    await upload(user);
    await user.click(button("Generate migrated OpenAPI"));
    change("Migrated API version", "2.0.0");
    expect(
      screen.queryByRole("button", { name: "Apply migrated API to editor" }),
    ).not.toBeInTheDocument();
    await user.click(button("Generate migrated OpenAPI"));
    await user.click(
      screen.getByLabelText(
        "Include resolved query/header and raw-body examples",
      ),
    );
    expect(
      screen.queryByLabelText("Postman migration result"),
    ).not.toBeInTheDocument();
  });
  it("supports pasted imports and preserves the current collection after failed imports", async () => {
    const { user } = await setup();
    await user.click(screen.getByText("Paste collection JSON"));
    change("Postman collection JSON", collection());
    await user.click(button("Import pasted collection"));
    change("Migrated API title", "Keep this title");
    change("Postman collection JSON", "{}");
    await user.click(button("Import pasted collection"));
    expect(screen.getByRole("alert")).toHaveTextContent("Collection v2.1");
    expect(screen.getByLabelText("Migrated API title")).toHaveValue(
      "Keep this title",
    );
    const tooLarge = file();
    Object.defineProperty(tooLarge, "size", { value: MAX_MIGRATION_BYTES + 1 });
    await user.upload(
      screen.getByLabelText("Import Postman collection"),
      tooLarge,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("exceeds");
    expect(screen.getByLabelText("Migrated API title")).toHaveValue(
      "Keep this title",
    );
  });
  it("imports an environment, prioritizes overrides, and clears them when changing collections", async () => {
    const { user } = await setup();
    await upload(user, collection(["{{baseUrl}}/users"]));
    await user.click(screen.getByText("Variables and environment"));
    await user.upload(
      screen.getByLabelText("Import Postman environment"),
      file(
        '{"values":[{"key":"baseUrl","value":"https://environment.example.com"}]}',
      ),
    );
    expect(
      screen.getByText("Enabled environment values: 1"),
    ).toBeInTheDocument();
    change(
      "Migration variable overrides (JSON string map)",
      '{"baseUrl":"https://override.example.com"}',
    );
    await user.click(button("Generate migrated OpenAPI"));
    await user.click(button("Copy migrated OpenAPI"));
    expect(vi.mocked(writeTextToClipboard).mock.calls[0][0]).toContain(
      "https://override.example.com",
    );
    await user.click(button("Clear imported environment"));
    expect(
      screen.queryByLabelText("Postman migration result"),
    ).not.toBeInTheDocument();
    await upload(user);
    expect(
      screen.getByLabelText("Migration variable overrides (JSON string map)"),
    ).toHaveValue("{}");
    expect(
      screen.getByText("Enabled environment values: 0"),
    ).toBeInTheDocument();
  });
  it("keeps errored drafts reviewable and recovers through request selection", async () => {
    const { user } = await setup();
    await upload(
      user,
      collection(["https://example.com/health", "{{missing}}/users"]),
    );
    await user.click(button("Generate migrated OpenAPI"));
    expect(screen.getByRole("alert")).toHaveTextContent("Fix or deselect");
    expect(
      screen.queryByRole("button", { name: "Copy migrated OpenAPI" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Select Request 2 (/item/1)"));
    await user.click(button("Generate migrated OpenAPI"));
    expect(button("Copy migrated OpenAPI")).toBeEnabled();
    await user.click(screen.getByText("Variables and environment"));
    change("Migration variable overrides (JSON string map)", '{"x":1}');
    await user.click(button("Generate migrated OpenAPI"));
    expect(screen.getByRole("alert")).toHaveTextContent("string values");
  });
  it("searches and paginates requests without losing selection or path overrides", async () => {
    const { user } = await setup();
    await upload(
      user,
      collection(
        Array.from({ length: 28 }, (_, i) => `https://example.com/item${i}`),
      ),
    );
    expect(screen.getByText("Page 1/2")).toBeInTheDocument();
    await user.click(button("Next requests"));
    expect(screen.getByLabelText("Select Request 28 (/item/27)")).toBeChecked();
    change("Path override for Request 28 (/item/27)", "/last");
    change("Search collection requests", "request 28 GET");
    await user.click(button("Deselect filtered requests"));
    expect(
      screen.getByLabelText("Select Request 28 (/item/27)"),
    ).not.toBeChecked();
    await user.click(button("Select filtered requests"));
    fireEvent.keyDown(screen.getByLabelText("Search collection requests"), {
      key: "Escape",
    });
    await user.click(button("Next requests"));
    expect(
      screen.getByLabelText("Path override for Request 28 (/item/27)"),
    ).toHaveValue("/last");
  });
  it("ignores stale file reads and disables export while importing", async () => {
    const { user } = await setup();
    await upload(user);
    await user.click(button("Generate migrated OpenAPI"));
    let finish!: (text: string) => void;
    const slow = file();
    Object.defineProperty(slow, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    await user.upload(screen.getByLabelText("Import Postman collection"), slow);
    expect(button("Copy migrated OpenAPI")).toBeDisabled();
    expect(button("Apply migrated API to editor")).toBeDisabled();
    await upload(user, collection(["https://example.com/latest"]));
    await act(async () =>
      finish(
        collection(["https://example.com/stale", "https://example.com/other"]),
      ),
    );
    expect(screen.getByText(/Selected requests: 1\/1/)).toBeInTheDocument();
    await user.click(button("Generate migrated OpenAPI"));
    await user.click(button("Copy migrated OpenAPI"));
    expect(vi.mocked(writeTextToClipboard).mock.calls[0][0]).toContain(
      "/latest:",
    );
  });
  it("reports copy/download failures and discards late clipboard feedback after editing", async () => {
    const { user } = await setup();
    await upload(user);
    await user.click(button("Generate migrated OpenAPI"));
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download migrated OpenAPI"));
    expect(screen.getByRole("alert")).toHaveTextContent("blocked the download");
    vi.mocked(writeTextToClipboard).mockResolvedValue(false);
    await user.click(button("Copy migrated OpenAPI"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Clipboard access failed",
    );
    let finish!: (ok: boolean) => void;
    vi.mocked(writeTextToClipboard).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(button("Copy migrated OpenAPI"));
    change("Migrated API title", "Changed");
    await act(async () => finish(true));
    expect(
      screen.queryByText("Migrated OpenAPI copied."),
    ).not.toBeInTheDocument();
  });
  it("retains imported state when collapsed and localizes the workflow in Russian", async () => {
    const { user } = await setup();
    await upload(user);
    await user.click(screen.getByText("Postman migration studio"));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Migrated API title"),
      ).not.toBeInTheDocument(),
    );
    act(() => setAppLanguage("ru"));
    await user.click(screen.getByText("Студия миграции Postman"));
    expect(
      await screen.findByLabelText("Название импортируемого API"),
    ).toHaveValue("Customer collection");
    await user.click(button("Создать OpenAPI из коллекции"));
    expect(
      screen.getByText("Черновик миграции · запросов: 2 · операций: 2"),
    ).toBeInTheDocument();
  });
});
