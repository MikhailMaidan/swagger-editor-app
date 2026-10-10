import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentationLocalizationPanel } from "./documentation-localization-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  emptyLocalizationProject,
  MAX_LOCALIZATION_CATALOG_BYTES,
  parseDocumentationCatalog,
  parseDocumentationCsv,
  parseLocalizationProject,
  readDocumentationSource,
  serializeDocumentationCatalog,
  serializeLocalizationProject,
} from "@/lib/documentation-localization";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const api = () => ({
  openapi: "3.1.0",
  info: { title: "Shop", description: "Guide", version: "1" },
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        summary: "List",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Item" },
                example: { title: "Product" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Item: {
        type: "object",
        description: "Model",
        properties: { name: { type: "string", description: "Name" } },
      },
    },
  },
});
const original = JSON.stringify(api());
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const file = (text: string, name = "api.json") => {
  const f = new File([text], name, {
    type: name.endsWith(".csv") ? "text/csv" : "application/json",
  });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
};
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
const importCatalogLabel = "Import translation catalog (JSON/CSV)";
async function setup(input = original, capture = true) {
  const user = userEvent.setup();
  let editor = input;
  const apply = vi.fn((text: string) => {
    editor = text;
  });
  const view = render(
    <DocumentationLocalizationPanel
      getSchemaText={() => editor}
      onApply={apply}
    />,
  );
  await user.click(
    screen.getByText("API documentation localization studio", {
      selector: "summary",
    }),
  );
  if (capture) {
    await user.click(button("Capture or refresh documentation from editor"));
    change("New translation language code", "fr");
    await user.click(button("Add translation language"));
  }
  return {
    user,
    apply,
    ...view,
    edit: (text: string) => {
      editor = text;
    },
    editor: () => editor,
  };
}
async function reviewTitle(
  user: ReturnType<typeof userEvent.setup>,
  text = "Boutique",
) {
  change("Translation (fr)", text);
  await user.click(button("Mark translation reviewed for current source"));
}
async function preview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Preview localized documentation"));
}

describe("DocumentationLocalizationPanel", () => {
  it("exports localized OpenAPI, catalogs, progress, HTML and a restorable project, and applies/undoes without automatic network or storage writes", async () => {
    const { user, apply, editor } = await setup(),
      network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await reviewTitle(user);
    await preview(user);
    await user.click(button("Download localized OpenAPI"));
    const output = JSON.parse(exported());
    expect(output.info.title).toBe("Boutique");
    expect(output.paths["/items"].get.operationId).toBe("listItems");
    expect(
      output.paths["/items"].get.responses["200"].content["application/json"]
        .example,
    ).toEqual({ title: "Product" });
    await user.click(button("Download translation catalog JSON"));
    expect(
      parseDocumentationCatalog(exported()).translations.find(
        (t) => t.pointer === "/info/title",
      )?.text,
    ).toBe("Boutique");
    await user.click(button("Download translation catalog CSV"));
    expect(
      parseDocumentationCsv(exported()).translations.find(
        (t) => t.pointer === "/info/title",
      )?.reviewed,
    ).toBe(true);
    await user.click(button("Download translation progress report"));
    expect(JSON.parse(exported()).locales[0]).toMatchObject({
      locale: "fr",
      reviewed: 1,
      total: 6,
    });
    await user.click(button("Download localized offline HTML documentation"));
    expect(exported()).toContain('<html lang="fr" data-theme="light">');
    expect(exported()).toContain("Boutique");
    await user.click(button("Download localization project with source"));
    expect(parseLocalizationProject(exported()).project.source).toBe(original);
    expect(apply).not.toHaveBeenCalled();
    expect(editor()).toBe(original);
    await user.click(button("Apply localized OpenAPI to editor"));
    expect(JSON.parse(editor()).info.title).toBe("Boutique");
    expect(apply).toHaveBeenCalledTimes(1);
    await user.click(button("Undo last localization application"));
    expect(editor()).toBe(original);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("never publishes draft text, invalidates edited previews, and blocks incomplete strict output", async () => {
    const { user } = await setup();
    change("Translation (fr)", "Unreviewed");
    await preview(user);
    expect(
      (
        screen.getByLabelText(
          "Localized API preview (first 16,000 characters)",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain('"title": "Shop"');
    await user.click(button("Mark translation reviewed for current source"));
    expect(button("Download localized OpenAPI")).toBeDisabled();
    change("Localization publication policy", "strict");
    await preview(user);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Strict publication is blocked",
    );
    expect(button("Download localized OpenAPI")).toBeDisabled();
    expect(button("Apply localized OpenAPI to editor")).toBeDisabled();
    const source = readDocumentationSource(original),
      catalog = {
        locale: "fr",
        translations: source.entries.map((e) => ({
          pointer: e.pointer,
          source: e.source,
          text: `FR ${e.source}`,
          reviewed: true,
        })),
      };
    await user.upload(
      screen.getByLabelText(importCatalogLabel),
      file(serializeDocumentationCatalog(catalog), "catalog.json"),
    );
    await preview(user);
    expect(button("Download localized OpenAPI")).toBeEnabled();
    await user.click(button("Download localized OpenAPI"));
    expect(JSON.parse(exported()).info.title).toBe("Unreviewed");
    change("Localized OpenAPI output format", "yaml");
    expect(button("Download localized OpenAPI")).toBeDisabled();
    await preview(user);
    await user.click(button("Download localized OpenAPI"));
    expect(exported()).toContain("title: Unreviewed");
  });
  it("retains translations during source refresh, exposes previous text and orphaned locations, and retains the previous source on errors", async () => {
    const { user, edit } = await setup();
    await reviewTitle(user);
    await user.click(
      screen.getByRole("button", { name: /\/info\/description/ }),
    );
    change("Translation (fr)", "Guide français");
    await user.click(button("Mark translation reviewed for current source"));
    const changed = api();
    changed.info.title = "Updated Shop";
    delete (changed.info as Partial<typeof changed.info>).description;
    edit(JSON.stringify(changed));
    await user.click(button("Capture or refresh documentation from editor"));
    expect(
      screen.getByLabelText("Source text when this translation was written"),
    ).toHaveValue("Shop");
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("Boutique");
    await preview(user);
    expect(
      (
        screen.getByLabelText(
          "Localized API preview (first 16,000 characters)",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("Updated Shop");
    await user.click(
      screen.getByText("Orphaned translation locations (first 30)", {
        selector: "summary",
      }),
    );
    expect(
      screen.getByText("/info/description", { selector: "li" }),
    ).toBeInTheDocument();
    await user.click(button("Download localization project with source"));
    expect(
      parseLocalizationProject(exported()).project.locales[0].translations,
    ).toHaveLength(2);
    edit("openapi: [");
    await user.click(button("Capture or refresh documentation from editor"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use a valid supported OpenAPI",
    );
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("Boutique");
    await user.click(button("Mark translation reviewed for current source"));
    await preview(user);
    expect(
      (
        screen.getByLabelText(
          "Localized API preview (first 16,000 characters)",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain('"title": "Boutique"');
  });
  it("guards applying and undoing against newer editor edits", async () => {
    const { user, edit, apply, editor } = await setup();
    await reviewTitle(user);
    await preview(user);
    edit("Different editor text");
    await user.click(button("Apply localized OpenAPI to editor"));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "editor changed after this preview",
    );
    await preview(user);
    await user.click(button("Apply localized OpenAPI to editor"));
    expect(apply).toHaveBeenCalledTimes(1);
    edit("New edit");
    await user.click(button("Undo last localization application"));
    expect(editor()).toBe("New edit");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Undo is blocked");
  });
  it("merges JSON/CSV catalogs without overwriting by default and updates only matching rows when replacement is selected", async () => {
    const { user } = await setup();
    await reviewTitle(user);
    const catalog = {
      locale: "fr",
      translations: [
        {
          pointer: "/info/title",
          source: "Shop",
          text: "Updated",
          reviewed: true,
        },
        {
          pointer: "/info/description",
          source: "Guide",
          text: "Documentation",
          reviewed: false,
        },
      ],
    };
    await user.upload(
      screen.getByLabelText(importCatalogLabel),
      file(serializeDocumentationCatalog(catalog), "catalog.json"),
    );
    expect(
      screen.getByText(
        "Catalog merged: 1 rows imported, 1 existing translations kept.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("Boutique");
    await user.click(
      screen.getByLabelText("Replace matching translations on catalog import"),
    );
    await user.upload(
      screen.getByLabelText(importCatalogLabel),
      file(
        "locale,pointer,source,current_source,translation,reviewed\nfr,/info/title,Shop,Shop,Nouveau,true\n",
        "catalog.csv",
      ),
    );
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("Nouveau");
    await user.click(button("Download translation catalog JSON"));
    expect(
      parseDocumentationCatalog(exported()).translations.find(
        (t) => t.pointer === "/info/description",
      )?.text,
    ).toBe("Documentation");
  });
  it("restores projects without trusting saved output or automatically applying and permits a new preview", async () => {
    const { user, apply } = await setup(original, false),
      source = readDocumentationSource(original);
    const project = {
      ...emptyLocalizationProject(),
      source: original,
      locales: [
        {
          locale: "fr",
          translations: [
            {
              pointer: source.entries[0].pointer,
              source: source.entries[0].source,
              text: "Restored",
              reviewed: true,
            },
          ],
        },
      ],
    };
    const raw = JSON.parse(serializeLocalizationProject(project));
    raw.preview = { text: "injected", ready: true };
    await user.upload(
      screen.getByLabelText("Restore localization project (JSON)"),
      file(JSON.stringify(raw), "project.json"),
    );
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("Restored");
    expect(button("Apply localized OpenAPI to editor")).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
    await preview(user);
    await user.click(button("Apply localized OpenAPI to editor"));
    expect(apply.mock.calls[0][0]).not.toContain("injected");
  });
  it("isolates languages, rejects duplicates, and retains all work when closed and reopened", async () => {
    const { user } = await setup();
    await reviewTitle(user);
    change("New translation language code", "ru");
    await user.click(button("Add translation language"));
    change("Translation (ru)", "Магазин");
    await user.click(button("Mark translation reviewed for current source"));
    await user.click(button("fr"));
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("Boutique");
    change("New translation language code", "FR");
    await user.click(button("Add translation language"));
    expect(screen.getByRole("alert")).toHaveTextContent("unique language tag");
    const summary = screen.getByText("API documentation localization studio", {
      selector: "summary",
    });
    await user.click(summary);
    expect(screen.queryByLabelText("Translation (fr)")).not.toBeInTheDocument();
    await user.click(summary);
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("Boutique");
    await user.click(button("ru"));
    expect(screen.getByLabelText("Translation (ru)")).toHaveValue("Магазин");
  });
  it("rejects malformed and oversized imports atomically and reports blocked downloads", async () => {
    const { user } = await setup();
    await reviewTitle(user);
    await user.upload(
      screen.getByLabelText(importCatalogLabel),
      file("{", "catalog.json"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid translation catalog",
    );
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("Boutique");
    const big = file("{}");
    Object.defineProperty(big, "size", {
      value: MAX_LOCALIZATION_CATALOG_BYTES + 1,
    });
    await user.upload(screen.getByLabelText(importCatalogLabel), big);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Localization limits exceeded",
    );
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download translation catalog JSON"));
    expect(screen.getByRole("alert")).toHaveTextContent("browser blocked");
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("Boutique");
  });
  it("disables mutations during file reads and ignores a late read after unmount", async () => {
    const { user, unmount, apply } = await setup();
    let resolve!: (text: string) => void;
    const delayed = file("{}");
    Object.defineProperty(delayed, "text", {
      configurable: true,
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText("Import documentation source (OpenAPI JSON/YAML)"),
      delayed,
    );
    expect(
      button("Capture or refresh documentation from editor"),
    ).toBeDisabled();
    expect(screen.getByLabelText("Translation (fr)")).toBeDisabled();
    unmount();
    await act(async () => resolve(original));
    expect(apply).not.toHaveBeenCalled();
  });
  it("searches, filters, pages, and keeps the selected translation editable when it leaves a status filter", async () => {
    const value = api();
    Object.assign(value.components.schemas.Item, {
      properties: Object.fromEntries(
        Array.from({ length: 35 }, (_, i) => [
          `field${i}`,
          { type: "string", description: `Field ${i} docs` },
        ]),
      ),
    });
    const { user } = await setup(JSON.stringify(value));
    change("Documentation section", "schemas");
    expect(
      within(
        screen.getByRole("list", { name: "Documentation fields" }),
      ).getAllByRole("button"),
    ).toHaveLength(20);
    await user.click(button("Next documentation fields"));
    expect(screen.getByText("Page 2/2")).toBeInTheDocument();
    change("Search documentation and translations", "field12");
    expect(screen.getByLabelText("Current source text")).toHaveValue(
      "Field 12 docs",
    );
    change("Filter translation status", "missing");
    await user.type(screen.getByLabelText("Translation (fr)"), "Champ douze");
    expect(screen.getByLabelText("Current source text")).toHaveValue(
      "Field 12 docs",
    );
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue(
      "Champ douze",
    );
    fireEvent.keyDown(
      screen.getByLabelText("Search documentation and translations"),
      { key: "Escape" },
    );
    expect(
      screen.getByLabelText("Search documentation and translations"),
    ).toHaveValue("");
    change("Filter translation status", "draft");
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue(
      "Champ douze",
    );
  });
  it("escapes translated markup in offline HTML while declaring the target language", async () => {
    const { user } = await setup();
    await reviewTitle(user, '<img src=x onerror="alert(1)">');
    await preview(user);
    await user.click(button("Download localized offline HTML documentation"));
    expect(exported()).not.toContain('<img src=x onerror="alert(1)">');
    expect(exported()).toContain("&lt;img");
    expect(exported()).toContain('lang="fr"');
  });
  it("clears only the selected translation and retains other rows", async () => {
    const { user } = await setup();
    await reviewTitle(user);
    await user.click(
      screen.getByRole("button", { name: /\/info\/description/ }),
    );
    change("Translation (fr)", "Guide français");
    await user.click(screen.getByRole("button", { name: /\/info\/title/ }));
    await user.click(button("Clear selected translation"));
    expect(screen.getByLabelText("Translation (fr)")).toHaveValue("");
    await user.click(button("Download translation catalog JSON"));
    expect(
      parseDocumentationCatalog(exported()).translations.find(
        (t) => t.pointer === "/info/description",
      )?.text,
    ).toBe("Guide français");
  });
  it("localizes controls and errors into Russian without losing translations", async () => {
    const { user } = await setup();
    await reviewTitle(user);
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Студия локализации документации API", {
        selector: "summary",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Перевод (fr)")).toHaveValue("Boutique");
    change("Код нового языка перевода", "bad_code");
    await user.click(button("Добавить язык перевода"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "корректный уникальный код языка",
    );
  });
});
