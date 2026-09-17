import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiTransformPanel } from "./api-transform-panel";
import { setAppLanguage } from "./i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { MAX_TRANSFORM_BYTES } from "@/lib/api-transform";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const original = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Shop", version: "1" },
  paths: { "/items": { get: { responses: { "200": { description: "OK" } } } } },
});
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const button = (name: string) => screen.getByRole("button", { name });
async function setup() {
  let editor = original;
  const apply = vi.fn((value: string) => {
    editor = value;
  });
  const user = userEvent.setup();
  const view = render(
    <ApiTransformPanel getSchemaText={() => editor} onApply={apply} />,
  );
  await user.click(screen.getByText("API transformation workbench"));
  await screen.findByText("Use current editor as source");
  return {
    user,
    apply,
    ...view,
    getEditor: () => editor,
    edit: (text: string) => {
      editor = text;
    },
  };
}
async function paste(user: ReturnType<typeof userEvent.setup>, value: unknown) {
  const input = screen.queryByLabelText("Recipe JSON");
  if (!input?.closest("details")?.open)
    await user.click(screen.getByText("Import a JSON Patch recipe"));
  change(
    "Recipe JSON",
    typeof value === "string" ? value : JSON.stringify(value),
  );
  await user.click(button("Import pasted recipe"));
}
function file(text: string) {
  const input = new File([text], "recipe.json", { type: "application/json" });
  Object.defineProperty(input, "text", {
    configurable: true,
    value: async () => text,
  });
  return input;
}
beforeEach(() => {
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});

describe("ApiTransformPanel", () => {
  it("previews, exports, applies and restores a variant without requests or automatic storage writes", async () => {
    const { user, apply, getEditor } = await setup();
    const network = vi.spyOn(globalThis, "fetch");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    await user.click(button("Use current editor as source"));
    await user.click(button("Add version change"));
    change("Step value (JSON)", '"2.5"');
    await user.click(button("Add root server change"));
    change("Step value (JSON)", '[{"url":"https://staging.example.com"}]');
    await user.click(button("Preview transformation"));
    expect(screen.getByText("Document changes: 2")).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
    expect(getEditor()).toBe(original);
    await user.click(button("Copy recipe JSON"));
    const patch = JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]);
    expect(patch).toEqual([
      { op: "add", path: "/info/version", value: "2.5" },
      {
        op: "add",
        path: "/servers",
        value: [{ url: "https://staging.example.com" }],
      },
    ]);
    await user.click(button("Download recipe JSON"));
    expect(downloadTextFile).toHaveBeenCalledWith(
      expect.any(String),
      "rsswag-api-recipe.json",
      "application/json-patch+json",
    );
    await user.click(button("Copy transformed OpenAPI"));
    const output = vi.mocked(writeTextToClipboard).mock.calls[1][0];
    expect(JSON.parse(output)).toMatchObject({
      info: { version: "2.5" },
      paths: JSON.parse(original).paths,
    });
    await user.click(button("Download transformed OpenAPI"));
    expect(downloadTextFile).toHaveBeenLastCalledWith(
      output,
      "rsswag-transformed-openapi.json",
      "application/json",
    );
    await user.click(button("Apply transformation to editor"));
    expect(getEditor()).toBe(output);
    await user.click(button("Undo transformation application"));
    expect(getEditor()).toBe(original);
    await user.selectOptions(
      screen.getByLabelText("Transformed definition format"),
      "yaml",
    );
    await user.click(button("Download transformed OpenAPI"));
    expect(downloadTextFile).toHaveBeenLastCalledWith(
      expect.stringContaining("openapi: 3.1.0"),
      "rsswag-transformed-openapi.yaml",
      "application/yaml",
    );
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    network.mockRestore();
    storage.mockRestore();
  });

  it("protects newer editor changes, rebases the existing recipe, and guards undo", async () => {
    const { user, edit, getEditor, apply } = await setup();
    await user.click(button("Use current editor as source"));
    await user.click(button("Add version change"));
    await user.click(button("Preview transformation"));
    const newer = original.replace('"Shop"', '"New title"');
    edit(newer);
    await user.click(button("Apply transformation to editor"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The editor changed after the source was captured",
    );
    expect(apply).not.toHaveBeenCalled();
    await user.click(button("Use current editor as source"));
    expect(
      screen.queryByRole("region", { name: "Transformation preview" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Recipe steps: 1/100")).toBeInTheDocument();
    await user.click(button("Preview transformation"));
    await user.click(button("Apply transformation to editor"));
    const applied = getEditor();
    expect(JSON.parse(applied).info).toEqual({
      title: "New title",
      version: "2.0.0",
    });
    edit(applied + " ");
    await user.click(button("Undo transformation application"));
    expect(screen.getByRole("alert")).toHaveTextContent("Undo was stopped");
    expect(getEditor()).toBe(applied + " ");
    edit(applied);
    await user.click(button("Undo transformation application"));
    expect(getEditor()).toBe(newer);
  });

  it("imports guarded recipes, identifies failing steps, and invalidates previews after edits", async () => {
    const { user, apply } = await setup();
    await user.click(button("Use current editor as source"));
    await paste(user, [
      { op: "test", path: "/info/version", value: "wrong" },
      { op: "replace", path: "/info/version", value: "2" },
    ]);
    await user.click(button("Preview transformation"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Step 1: The expected value does not match",
    );
    expect(
      screen.queryByRole("button", { name: "Apply transformation to editor" }),
    ).not.toBeInTheDocument();
    change("Step value (JSON)", '"1"');
    await user.click(button("Preview transformation"));
    expect(screen.getByText("Document changes: 1")).toBeInTheDocument();
    change("Step value (JSON)", "{");
    expect(screen.queryByText("Document changes: 1")).not.toBeInTheDocument();
    await user.click(button("Preview transformation"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Step 1: Enter valid JSON",
    );
    await paste(user, [{ op: "remove", path: "/info" }]);
    await user.click(button("Preview transformation"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "not an OpenAPI document",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("browses escaped pointers, reorders, duplicates and removes steps", async () => {
    const { user } = await setup();
    await user.click(button("Use current editor as source"));
    await user.click(button("Add transformation step"));
    await user.selectOptions(screen.getByLabelText("Patch operation"), "copy");
    await user.click(screen.getByText("Browse source JSON Pointers"));
    change("Search source pointers", "paths get 200");
    await user.click(
      button("Use /paths/~1items/get/responses/200 as source pointer"),
    );
    expect(screen.getByLabelText("Source JSON Pointer")).toHaveValue(
      "/paths/~1items/get/responses/200",
    );
    change("Target JSON Pointer", "/paths/~1items/get/responses/201");
    fireEvent.keyDown(screen.getByLabelText("Search source pointers"), {
      key: "Escape",
    });
    expect(screen.getByLabelText("Search source pointers")).toHaveValue("");
    await user.click(button("Add version change"));
    await user.click(button("Duplicate selected step"));
    change("Step value (JSON)", '"3"');
    await user.click(button("Move step 3 up"));
    await user.click(button("Move step 2 up"));
    await user.click(button("Move step 1 down"));
    await user.click(button("Remove step 3"));
    await user.click(button("Preview transformation"));
    await user.click(button("Copy transformed OpenAPI"));
    const result = JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]);
    expect(result.info.version).toBe("3");
    expect(result.paths["/items"].get.responses["201"]).toEqual({
      description: "OK",
    });
    await user.click(button("Clear recipe"));
    expect(screen.getByText("Recipe steps: 0/100")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Transformation preview" }),
    ).not.toBeInTheDocument();
  });

  it("keeps recipe and snapshot through closing, invalid sources and failed imports", async () => {
    const { user, edit } = await setup();
    await user.click(button("Use current editor as source"));
    await user.click(button("Add version change"));
    await user.click(screen.getByText("API transformation workbench"));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Step value (JSON)"),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByText("API transformation workbench"));
    await screen.findByLabelText("Step value (JSON)");
    expect(screen.getByText("Recipe steps: 1/100")).toBeInTheDocument();
    edit("openapi: [");
    await user.click(button("Use current editor as source"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "source must be a valid OpenAPI",
    );
    expect(screen.getByText("Captured source: Shop")).toBeInTheDocument();
    await paste(user, "{}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Expected a JSON Patch array",
    );
    expect(screen.getByText("Recipe steps: 1/100")).toBeInTheDocument();
  });

  it("imports files and ignores late file reads after newer recipe edits", async () => {
    const { user } = await setup();
    await user.click(screen.getByText("Import a JSON Patch recipe"));
    await user.upload(
      screen.getByLabelText("Recipe JSON file"),
      file('[{"op":"remove","path":"/x"}]'),
    );
    await screen.findByText(
      "Recipe imported. Existing steps were replaced; the editor is unchanged.",
    );
    let finish: (text: string) => void = () => {};
    const slow = file("[]");
    Object.defineProperty(slow, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    await user.upload(screen.getByLabelText("Recipe JSON file"), slow);
    await user.click(button("Add version change"));
    await act(async () => finish("[]"));
    expect(screen.getByText("Recipe steps: 2/100")).toBeInTheDocument();
    const huge = file("[]");
    Object.defineProperty(huge, "size", { value: MAX_TRANSFORM_BYTES + 1 });
    await user.upload(screen.getByLabelText("Recipe JSON file"), huge);
    expect(screen.getByRole("alert")).toHaveTextContent("processing limit");
    expect(screen.getByText("Recipe steps: 2/100")).toBeInTheDocument();
  });

  it("reports export failures and ignores stale clipboard feedback", async () => {
    const { user } = await setup();
    await user.click(button("Add version change"));
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download recipe JSON"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "browser blocked the download",
    );
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(button("Copy recipe JSON"));
    expect(screen.getByRole("alert")).toHaveTextContent("Copy failed");
    let finish: (ok: boolean) => void = () => {};
    vi.mocked(writeTextToClipboard).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(button("Copy recipe JSON"));
    await paste(user, "invalid");
    await act(async () => finish(true));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter valid JSON");
    expect(screen.queryByText("Copied to clipboard.")).not.toBeInTheDocument();
  });

  it("supports Russian labels and Swagger 2 while disabling the OpenAPI server starter", async () => {
    const { user, edit } = await setup();
    edit(
      JSON.stringify({
        swagger: "2.0",
        info: { title: "Legacy", version: "1" },
        paths: {},
      }),
    );
    await user.click(button("Use current editor as source"));
    expect(button("Add root server change")).toBeDisabled();
    await act(async () => setAppLanguage("ru"));
    await user.click(button("Добавить изменение версии"));
    await user.click(button("Предпросмотр преобразования"));
    const result = within(
      screen.getByRole("region", { name: "Предпросмотр преобразования API" }),
    );
    expect(result.getByText("Изменений документа: 1")).toBeInTheDocument();
    await user.click(
      result.getByRole("button", {
        name: "Применить преобразование к редактору",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Преобразование применено",
    );
  });
});
