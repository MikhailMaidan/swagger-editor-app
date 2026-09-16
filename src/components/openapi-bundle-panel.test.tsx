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
import { OpenApiBundlePanel } from "./openapi-bundle-panel";
import { setAppLanguage } from "./i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import {
  serializeBundleProject,
  MAX_BUNDLE_FILE_BYTES,
} from "@/lib/openapi-bundle";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const rootText =
  'openapi: 3.1.0\ninfo:\n  title: Folder API\n  version: "1"\npaths:\n  /users:\n    $ref: paths/users.yaml\n';
const pathText =
  'get:\n  summary: List users\n  responses:\n    "200":\n      description: OK\n';
function makeFile(name: string, text: string, relativePath = "") {
  const file = new File([text], name, {
    type: name.endsWith("json") ? "application/json" : "application/yaml",
  });
  Object.defineProperty(file, "text", {
    value: async () => text,
    configurable: true,
  });
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const button = (name: string) => screen.getByRole("button", { name });
async function setup() {
  let editor = "original editor text";
  const apply = vi.fn((text: string) => {
    editor = text;
  });
  const user = userEvent.setup();
  const view = render(
    <OpenApiBundlePanel getSchemaText={() => editor} onApply={apply} />,
  );
  await user.click(screen.getByText("Multi-file OpenAPI workbench"));
  await screen.findByLabelText("New file path");
  return {
    user,
    apply,
    getEditor: () => editor,
    edit: (text: string) => {
      editor = text;
    },
    ...view,
  };
}
async function importFolder(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText("Import definition folder"), [
    makeFile("users.yaml", pathText, "api/paths/users.yaml"),
    makeFile("openapi.yaml", rootText, "api/openapi.yaml"),
    makeFile("notes.txt", "not imported", "api/notes.txt"),
  ]);
  await waitFor(() =>
    expect(screen.getByLabelText("Root API document")).toHaveValue(
      "api/openapi.yaml",
    ),
  );
}
beforeEach(() => {
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("OpenApiBundlePanel", () => {
  it("imports a folder, builds and exports a usable bundle, and applies it with an undo without automatic storage or network writes", async () => {
    const { user, apply, getEditor } = await setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const storageMock = vi.spyOn(Storage.prototype, "setItem");
    await importFolder(user);
    expect(screen.getByText("Project files: 2/50")).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
    await user.click(button("Build reference bundle"));
    expect(
      screen.getByText("Bundle ready · 1 references · 2 files used"),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Bundle output format"),
      "json",
    );
    await user.click(button("Copy bundled document"));
    const bundle = vi.mocked(writeTextToClipboard).mock.calls[0][0];
    expect(JSON.parse(bundle).paths["/users"].$ref).toBe(
      "#/x-rsswag-bundled/ref1",
    );
    await user.click(button("Download bundled document"));
    expect(downloadTextFile).toHaveBeenCalledWith(
      bundle,
      "openapi-bundle.json",
      "application/json",
    );
    await user.click(button("Apply bundle to editor"));
    expect(getEditor()).toBe(bundle);
    await user.click(button("Undo bundle application"));
    expect(getEditor()).toBe("original editor text");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storageMock).not.toHaveBeenCalled();
  });

  it("navigates diagnostics to source, filters references, and removes stale results after a file edit", async () => {
    const { user } = await setup();
    await user.upload(
      screen.getByLabelText("Import definition files"),
      makeFile("openapi.yaml", rootText),
    );
    await user.click(button("Build reference bundle"));
    expect(
      screen.getByText("Bundle blocked · 1 issues to fix"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply bundle to editor" }),
    ).not.toBeInTheDocument();
    const diagnostics = within(
      screen.getByRole("list", { name: "Bundle diagnostics" }),
    );
    await user.click(
      diagnostics.getByRole("button", {
        name: "openapi.yaml#/paths/~1users/$ref",
      }),
    );
    const source = screen.getByLabelText(
      "Source: openapi.yaml",
    ) as HTMLTextAreaElement;
    expect(source).toHaveFocus();
    expect(
      source.value.slice(source.selectionStart, source.selectionEnd),
    ).toContain("paths/users.yaml");
    change("Search bundle references", "openapi users");
    expect(screen.getByText("Matching references: 1")).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Reference resolution filter"),
      "resolved",
    );
    expect(screen.getByText("Matching references: 0")).toBeInTheDocument();
    change(
      "Source: openapi.yaml",
      rootText.replace(
        "    $ref: paths/users.yaml",
        '    get:\n      responses:\n        "200":\n          description: OK',
      ),
    );
    expect(
      screen.queryByText("Bundle blocked · 1 issues to fix"),
    ).not.toBeInTheDocument();
    await user.click(button("Build reference bundle"));
    expect(
      screen.getByText("Bundle ready · 0 references · 1 files used"),
    ).toBeInTheDocument();
  });

  it("preserves the project on duplicate imports, supports explicit replacement, and protects newer main-editor edits from undo", async () => {
    const { user, edit, getEditor } = await setup();
    await importFolder(user);
    await user.upload(
      screen.getByLabelText("Import definition folder"),
      makeFile("openapi.yaml", "invalid replacement", "api/openapi.yaml"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    expect(screen.getByLabelText("Source: api/openapi.yaml")).toHaveValue(
      rootText,
    );
    await user.click(button("Build reference bundle"));
    await user.click(button("Apply bundle to editor"));
    edit("newer unsaved changes");
    await user.click(button("Undo bundle application"));
    expect(getEditor()).toBe("newer unsaved changes");
    expect(screen.getByRole("alert")).toHaveTextContent("Undo is blocked");
    await user.click(
      screen.getByLabelText("Replace matching files on import or add"),
    );
    await user.upload(
      screen.getByLabelText("Import definition folder"),
      makeFile(
        "openapi.yaml",
        rootText.replace("Folder API", "Updated API"),
        "api/openapi.yaml",
      ),
    );
    expect(screen.getByLabelText("Source: api/openapi.yaml")).toHaveValue(
      rootText.replace("Folder API", "Updated API"),
    );
    expect(
      screen.queryByRole("button", { name: "Apply bundle to editor" }),
    ).not.toBeInTheDocument();
  });

  it("creates and edits files, retains them across closing, and round-trips a project containing unfinished drafts", async () => {
    const { user } = await setup();
    await user.click(button("Copy editor into project file"));
    expect(screen.getByLabelText("Source: openapi.yaml")).toHaveValue(
      "original editor text",
    );
    change("New file path", "schemas/new.yaml");
    await user.click(button("Create project file"));
    change("Source: schemas/new.yaml", "unfinished: [");
    await user.click(screen.getByText("Multi-file OpenAPI workbench"));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Selected project file"),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByText("Multi-file OpenAPI workbench"));
    expect(
      await screen.findByLabelText("Source: schemas/new.yaml"),
    ).toHaveValue("unfinished: [");
    await user.click(screen.getByText("Save or restore multi-file project"));
    await user.click(button("Download project JSON"));
    const exported = vi.mocked(downloadTextFile).mock.calls[0][0];
    expect(JSON.parse(exported).files).toHaveLength(2);
    await user.click(button("Remove selected project file"));
    expect(screen.getByText("Project files: 1/50")).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("Restore project JSON file"),
      makeFile("project.json", exported),
    );
    expect(screen.getByText("Project files: 2/50")).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Selected project file"),
      "schemas/new.yaml",
    );
    expect(screen.getByLabelText("Source: schemas/new.yaml")).toHaveValue(
      "unfinished: [",
    );
  });

  it("does not let failed or oversized file reads replace a draft", async () => {
    const { user } = await setup();
    await user.click(button("Copy editor into project file"));
    const broken = makeFile("broken.json", "{}");
    Object.defineProperty(broken, "text", {
      value: async () => {
        throw new Error("read failed");
      },
    });
    await user.upload(screen.getByLabelText("Import definition files"), broken);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be read");
    const big = makeFile("big.json", "{}");
    Object.defineProperty(big, "size", { value: MAX_BUNDLE_FILE_BYTES + 1 });
    await user.upload(screen.getByLabelText("Import definition files"), big);
    expect(screen.getByRole("alert")).toHaveTextContent("limit was exceeded");
    expect(screen.getByText("Project files: 1/50")).toBeInTheDocument();
    expect(screen.getByLabelText("Source: openapi.yaml")).toHaveValue(
      "original editor text",
    );
  });

  it("disables editing during file reads and ignores delayed clipboard feedback after a newer edit", async () => {
    const { user } = await setup();
    let finish!: (text: string) => void;
    const pendingFile = makeFile("openapi.yaml", rootText);
    Object.defineProperty(pendingFile, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    await user.upload(
      screen.getByLabelText("Import definition files"),
      pendingFile,
    );
    expect(button("Create project file")).toBeDisabled();
    expect(screen.getByLabelText("Import definition files")).toBeDisabled();
    await act(async () => finish(rootText));
    expect(await screen.findByLabelText("Source: openapi.yaml")).toHaveValue(
      rootText,
    );
    await user.click(screen.getByText("Save or restore multi-file project"));
    let copied!: (ok: boolean) => void;
    vi.mocked(writeTextToClipboard).mockReturnValueOnce(
      new Promise((resolve) => {
        copied = resolve;
      }),
    );
    await user.click(button("Copy project JSON"));
    change("Source: openapi.yaml", rootText + "# newer edit\n");
    await act(async () => copied(false));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("restores a project without applying it and supports language changes", async () => {
    const { user, apply } = await setup();
    await user.click(screen.getByText("Save or restore multi-file project"));
    const saved = serializeBundleProject({
      root: "api.yaml",
      files: [{ path: "api.yaml", text: rootText }],
    });
    await user.upload(
      screen.getByLabelText("Restore project JSON file"),
      makeFile("project.json", saved),
    );
    expect(apply).not.toHaveBeenCalled();
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Многофайловый OpenAPI-проект"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Исходный текст: api.yaml")).toHaveValue(
      rootText,
    );
    act(() => setAppLanguage("en"));
    expect(screen.getByLabelText("Root API document")).toHaveValue("api.yaml");
  });
});
