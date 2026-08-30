import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { ENDPOINT_COLLAPSE_STORAGE_KEY } from "@/lib/endpoint-collapse";
import { ENDPOINT_FAVORITES_STORAGE_KEY } from "@/lib/endpoint-favorites";
import {
  createEndpointPermalink,
  getEndpointAnchor,
} from "@/lib/endpoint-link";
import {
  EDITOR_FONT_SIZE_STORAGE_KEY,
  EDITOR_INDENT_SIZE_STORAGE_KEY,
  EDITOR_SCHEMA_SEARCH_MATCH_CASE_STORAGE_KEY,
  EDITOR_SCHEMA_SEARCH_WHOLE_WORD_STORAGE_KEY,
  EDITOR_WORD_WRAP_STORAGE_KEY,
} from "@/lib/editor-preferences";
import { ENDPOINT_SORT_STORAGE_KEY } from "@/lib/endpoint-sort";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { REQUEST_HISTORY_STORAGE_KEY } from "@/lib/request-history";
import { REQUEST_ENVIRONMENTS_STORAGE_KEY } from "@/lib/request-environments";
import {
  MOCK_RESPONSE_DELAY_STORAGE_KEY,
  REQUEST_EXECUTION_MODE_STORAGE_KEY,
} from "@/lib/request-execution-mode";
import { REQUEST_PRESETS_STORAGE_KEY } from "@/lib/request-presets";
import { SCHEMA_DRAFT_STORAGE_KEY } from "@/lib/schema-draft";
import { SCHEMA_COMPARISON_BASELINE_STORAGE_KEY } from "@/lib/schema-comparison-baseline";
import { MAX_SCHEMA_IMPORT_SIZE_BYTES } from "@/lib/schema-import";
import {
  SAVED_SCHEMA_STORAGE_KEY,
  SCHEMA_EDITOR_HANDOFF_STORAGE_KEY,
  stageSavedSchemaForEditor,
} from "@/lib/schema-storage";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("SwaggerWorkspace", () => {
  it("expands the schema editor instead of showing a vertical scrollbar", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "scrollHeight",
    );

    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 780,
    });

    try {
      render(<SwaggerWorkspace />);

      const editor = screen.getByLabelText("OpenAPI schema editor");

      expect(editor).toHaveStyle({ height: "780px" });
      expect(editor).toHaveAttribute("wrap", "off");
      expect(editor).toHaveAttribute("spellcheck", "false");
      expect(editor.className).toContain("block");
      expect(editor.className).toContain("overflow-y-hidden");
      expect(screen.getByText("Line 1, column 1")).toBeVisible();

      const titleOffset =
        (editor as HTMLTextAreaElement).value.indexOf("title") + 2;
      (editor as HTMLTextAreaElement).setSelectionRange(
        titleOffset,
        titleOffset,
      );
      fireEvent.select(editor);

      expect(screen.getByText("Line 3, column 5")).toBeVisible();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(
          HTMLTextAreaElement.prototype,
          "scrollHeight",
          originalDescriptor,
        );
      } else {
        delete (HTMLTextAreaElement.prototype as { scrollHeight?: number })
          .scrollHeight;
      }
    }
  });

  it("restores and persists the editor word wrap preference", async () => {
    const user = userEvent.setup();
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "scrollHeight",
    );

    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        return this.wrap === "soft" ? 640 : 520;
      },
    });
    window.localStorage.setItem(EDITOR_WORD_WRAP_STORAGE_KEY, "true");

    try {
      render(<SwaggerWorkspace />);

      const editor = screen.getByLabelText("OpenAPI schema editor");
      const wordWrap = screen.getByRole("checkbox", { name: "Word wrap" });

      await waitFor(() => expect(wordWrap).toBeChecked());
      expect(editor).toHaveAttribute("wrap", "soft");
      expect(editor).toHaveStyle({ height: "640px" });
      expect(editor.className).toContain("overflow-x-hidden");

      await user.click(wordWrap);

      expect(wordWrap).not.toBeChecked();
      expect(editor).toHaveAttribute("wrap", "off");
      expect(editor).toHaveStyle({ height: "520px" });
      expect(editor.className).toContain("overflow-x-auto");
      expect(
        window.localStorage.getItem(EDITOR_WORD_WRAP_STORAGE_KEY),
      ).toBeNull();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(
          HTMLTextAreaElement.prototype,
          "scrollHeight",
          originalDescriptor,
        );
      } else {
        delete (HTMLTextAreaElement.prototype as { scrollHeight?: number })
          .scrollHeight;
      }
    }
  });

  it("restores font size and resizes the editor when it changes", async () => {
    const user = userEvent.setup();
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "scrollHeight",
    );

    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        return this.className.includes("text-base") ? 700 : 480;
      },
    });
    window.localStorage.setItem(EDITOR_FONT_SIZE_STORAGE_KEY, "large");

    try {
      render(<SwaggerWorkspace />);

      const editor = screen.getByLabelText("OpenAPI schema editor");
      const fontSize = screen.getByRole("combobox", {
        name: "Editor font size",
      });

      await waitFor(() => expect(fontSize).toHaveValue("large"));
      expect(editor.className).toContain("text-base");
      expect(editor).toHaveStyle({ height: "700px" });

      await user.selectOptions(fontSize, "small");

      expect(editor.className).toContain("text-xs");
      expect(editor).toHaveStyle({ height: "480px" });
      expect(window.localStorage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY)).toBe(
        "small",
      );

      await user.selectOptions(fontSize, "medium");

      expect(editor.className).toContain("text-sm");
      expect(
        window.localStorage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY),
      ).toBeNull();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(
          HTMLTextAreaElement.prototype,
          "scrollHeight",
          originalDescriptor,
        );
      } else {
        delete (HTMLTextAreaElement.prototype as { scrollHeight?: number })
          .scrollHeight;
      }
    }
  });

  it("toggles word wrap with Alt+Z and prevents browser save while signed out", () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText("OpenAPI schema editor");
    const wordWrap = screen.getByRole("checkbox", { name: "Word wrap" });

    expect(editor).toHaveAttribute(
      "aria-keyshortcuts",
      "Alt+Z Control+F Meta+F Control+G Meta+G Control+O Meta+O Control+Shift+S Meta+Shift+S F3 Shift+F3",
    );
    expect(fireEvent.keyDown(editor, { altKey: true, key: "z" })).toBe(false);
    expect(wordWrap).toBeChecked();
    expect(editor).toHaveAttribute("wrap", "soft");
    expect(window.localStorage.getItem(EDITOR_WORD_WRAP_STORAGE_KEY)).toBe(
      "true",
    );

    expect(fireEvent.keyDown(editor, { altKey: true, key: "Z" })).toBe(false);
    expect(wordWrap).not.toBeChecked();
    expect(editor).toHaveAttribute("wrap", "off");

    expect(fireEvent.keyDown(editor, { ctrlKey: true, key: "s" })).toBe(false);
  });

  it("focuses go to line with the shortcut and clamps navigation", () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const lineInput = screen.getByRole("spinbutton", { name: "Go to line" });
    const titleOffset = editor.value.indexOf("title") + 2;

    editor.setSelectionRange(titleOffset, titleOffset);
    fireEvent.select(editor);

    expect(editor).toHaveAttribute(
      "aria-keyshortcuts",
      "Alt+Z Control+F Meta+F Control+G Meta+G Control+O Meta+O Control+Shift+S Meta+Shift+S F3 Shift+F3",
    );
    expect(fireEvent.keyDown(editor, { ctrlKey: true, key: "g" })).toBe(false);
    expect(lineInput).toHaveFocus();
    expect(lineInput).toHaveValue(3);

    fireEvent.change(lineInput, { target: { value: "999" } });
    fireEvent.submit(lineInput.closest("form")!);

    const lastLineOffset = editor.value.lastIndexOf("\n") + 1;

    expect(editor).toHaveFocus();
    expect(editor.selectionStart).toBe(lastLineOffset);
    expect(editor.selectionEnd).toBe(lastLineOffset);
    expect(lineInput).toHaveValue(editor.value.split("\n").length);
    expect(screen.getByText(/Line \d+, column 1/)).toBeVisible();

    fireEvent.change(lineInput, { target: { value: "" } });
    fireEvent.submit(lineInput.closest("form")!);

    expect(editor.selectionStart).toBe(0);
    expect(lineInput).toHaveValue(1);
    expect(screen.getByText("Line 1, column 1")).toBeVisible();
  });

  it("opens the schema import picker with the keyboard shortcut", () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText("OpenAPI schema editor");
    const fileInput = screen.getByLabelText(
      "Import OpenAPI schema file",
    ) as HTMLInputElement;
    const importButton = screen.getByRole("button", { name: "Import" });
    const clickSpy = vi
      .spyOn(fileInput, "click")
      .mockImplementation(() => undefined);

    try {
      expect(importButton).toHaveAttribute(
        "aria-keyshortcuts",
        "Control+O Meta+O",
      );
      expect(fireEvent.keyDown(editor, { ctrlKey: true, key: "o" })).toBe(
        false,
      );
      expect(fireEvent.keyDown(editor, { key: "O", metaKey: true })).toBe(
        false,
      );
      expect(clickSpy).toHaveBeenCalledTimes(2);
    } finally {
      clickSpy.mockRestore();
    }
  });

  it("supports Tab and Shift+Tab indentation in the schema editor", () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    editor.setSelectionRange(0, 0);
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(editor.value).toBe(`  ${DEFAULT_OPENAPI_SCHEMA}`);
    expect(editor.selectionStart).toBe(2);
    expect(editor.selectionEnd).toBe(2);
    expect(screen.getByText("Line 1, column 3")).toBeVisible();

    fireEvent.keyDown(editor, { key: "Tab", shiftKey: true });

    expect(editor.value).toBe(DEFAULT_OPENAPI_SCHEMA);
    expect(editor.selectionStart).toBe(0);
    expect(editor.selectionEnd).toBe(0);
    expect(screen.getByText("Line 1, column 1")).toBeVisible();
  });

  it("restores and applies four-space editor indentation", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(EDITOR_INDENT_SIZE_STORAGE_KEY, "4");
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const indentSize = screen.getByRole("combobox", { name: "Indent size" });

    await waitFor(() => expect(indentSize).toHaveValue("4"));

    editor.setSelectionRange(0, 0);
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(editor.value).toBe(`    ${DEFAULT_OPENAPI_SCHEMA}`);
    expect(editor.selectionStart).toBe(4);

    fireEvent.keyDown(editor, { key: "Tab", shiftKey: true });

    expect(editor.value).toBe(DEFAULT_OPENAPI_SCHEMA);
    expect(editor.selectionStart).toBe(0);

    await user.selectOptions(indentSize, "2");

    expect(
      window.localStorage.getItem(EDITOR_INDENT_SIZE_STORAGE_KEY),
    ).toBeNull();
  });

  it("converts line endings without moving the logical selection", async () => {
    const schemaText =
      "openapi: 3.0.0\r\ninfo:\r\n  title: Line Endings\r\n  version: 1.0.0\r\npaths: {}";
    window.localStorage.setItem(SCHEMA_DRAFT_STORAGE_KEY, schemaText);
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const lineEndings = screen.getByRole("combobox", {
      name: "Line endings",
    });

    await waitFor(() => expect(lineEndings).toHaveValue("crlf"));

    const selectionStart = editor.value.indexOf("title");

    editor.setSelectionRange(selectionStart, selectionStart + 5);
    fireEvent.select(editor);

    expect(screen.getByText("Selected 5")).toBeVisible();

    fireEvent.change(lineEndings, { target: { value: "lf" } });

    expect(editor.value).not.toContain("\r");
    await waitFor(() =>
      expect(
        editor.value.slice(editor.selectionStart, editor.selectionEnd),
      ).toBe("title"),
    );
    expect(screen.getByText("Line 3, column 3")).toBeVisible();
    expect(lineEndings).toHaveValue("lf");

    fireEvent.change(lineEndings, { target: { value: "crlf" } });

    await waitFor(() =>
      expect(
        editor.value.slice(editor.selectionStart, editor.selectionEnd),
      ).toBe("title"),
    );
    expect(lineEndings).toHaveValue("crlf");

    fireEvent.change(editor, {
      target: { value: `${editor.value}\ncomponents: {}` },
    });

    expect(lineEndings).toHaveValue("crlf");
  });

  it("searches the schema with shortcut and wrapped navigation", () => {
    render(<SwaggerWorkspace />);

    const schemaText =
      "openapi: 3.0.0\ninfo:\n  title: Alpha\n  version: 1.0.0\n  description: alpha\npaths: {}\nx-label: ALPHA\nx-prefix: alphabet";
    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const searchInput = screen.getByRole("searchbox", {
      name: "Search schema",
    });

    fireEvent.change(editor, { target: { value: schemaText } });

    const selectedTitleStart = schemaText.indexOf("Alpha");
    editor.setSelectionRange(selectedTitleStart, selectedTitleStart + 5);
    fireEvent.select(editor);

    expect(searchInput).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+F Meta+F Enter Shift+Enter F3 Shift+F3",
    );
    expect(fireEvent.keyDown(editor, { ctrlKey: true, key: "f" })).toBe(false);
    expect(searchInput).toHaveFocus();
    expect(searchInput).toHaveValue("Alpha");
    expect(screen.getByText("0 of 4")).toBeVisible();

    editor.setSelectionRange(0, 0);
    fireEvent.select(editor);
    fireEvent.change(searchInput, { target: { value: "alpha" } });

    expect(screen.getByText("0 of 4")).toBeVisible();

    fireEvent.submit(searchInput.closest("form")!);

    expect(searchInput).toHaveFocus();
    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      "Alpha",
    );
    expect(screen.getByText("1 of 4")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Next match" }));

    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      "alpha",
    );
    expect(screen.getByText("2 of 4")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Previous match" }));

    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      "Alpha",
    );
    expect(screen.getByText("1 of 4")).toBeVisible();

    const matchCase = screen.getByRole("checkbox", { name: "Match case" });

    fireEvent.click(matchCase);

    expect(matchCase).toBeChecked();
    expect(screen.getByText("0 of 2")).toBeVisible();
    expect(
      window.localStorage.getItem(EDITOR_SCHEMA_SEARCH_MATCH_CASE_STORAGE_KEY),
    ).toBe("true");

    fireEvent.submit(searchInput.closest("form")!);

    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      "alpha",
    );
    expect(screen.getByText("1 of 2")).toBeVisible();

    const wholeWord = screen.getByRole("checkbox", { name: "Whole word" });

    fireEvent.click(wholeWord);

    expect(wholeWord).toBeChecked();
    expect(screen.getByText("0 of 1")).toBeVisible();
    expect(
      window.localStorage.getItem(EDITOR_SCHEMA_SEARCH_WHOLE_WORD_STORAGE_KEY),
    ).toBe("true");

    fireEvent.submit(searchInput.closest("form")!);

    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      "alpha",
    );
    expect(screen.getByText("1 of 1")).toBeVisible();

    fireEvent.click(matchCase);

    expect(matchCase).not.toBeChecked();
    expect(screen.getByText("0 of 3")).toBeVisible();
    expect(
      window.localStorage.getItem(EDITOR_SCHEMA_SEARCH_MATCH_CASE_STORAGE_KEY),
    ).toBeNull();

    fireEvent.click(wholeWord);

    expect(wholeWord).not.toBeChecked();
    expect(screen.getByText("0 of 4")).toBeVisible();
    expect(
      window.localStorage.getItem(EDITOR_SCHEMA_SEARCH_WHOLE_WORD_STORAGE_KEY),
    ).toBeNull();

    expect(fireEvent.keyDown(searchInput, { key: "Escape" })).toBe(false);
    expect(searchInput).toHaveValue("");
    expect(editor).toHaveFocus();
    expect(screen.getByText("0 of 0")).toBeVisible();
  });

  it("navigates schema search results with Enter and F3", () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const searchInput = screen.getByRole("searchbox", {
      name: "Search schema",
    });

    fireEvent.change(editor, { target: { value: "alpha beta alpha" } });
    fireEvent.change(searchInput, { target: { value: "alpha" } });

    expect(searchInput).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+F Meta+F Enter Shift+Enter F3 Shift+F3",
    );
    expect(fireEvent.keyDown(searchInput, { key: "F3" })).toBe(false);
    expect(screen.getByText("1 of 2")).toBeVisible();

    expect(fireEvent.keyDown(searchInput, { key: "F3", shiftKey: true })).toBe(
      false,
    );
    expect(screen.getByText("2 of 2")).toBeVisible();

    expect(
      fireEvent.keyDown(searchInput, { key: "Enter", shiftKey: true }),
    ).toBe(false);
    expect(screen.getByText("1 of 2")).toBeVisible();

    expect(fireEvent.keyDown(searchInput, { key: "Enter" })).toBe(false);
    expect(screen.getByText("2 of 2")).toBeVisible();

    expect(fireEvent.keyDown(editor, { key: "F3" })).toBe(false);
    expect(searchInput).toHaveFocus();
    expect(screen.getByText("1 of 2")).toBeVisible();
    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      "alpha",
    );
  });

  it("updates document and Unicode selection statistics", () => {
    render(<SwaggerWorkspace />);

    const schemaText = "openapi: 3.0.0\r\ninfo: {title: Café}";
    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    fireEvent.change(editor, {
      target: { value: schemaText },
    });

    expect(
      screen.getByLabelText("Schema document statistics"),
    ).toHaveTextContent(
      `Lines 2, ${Array.from(editor.value).length} characters, ${new TextEncoder().encode(editor.value).length} B`,
    );

    const emojiSchema = "openapi: 3.0.0\ninfo: {title: A😀B}";

    fireEvent.change(editor, { target: { value: emojiSchema } });
    editor.setSelectionRange(30, 32);
    fireEvent.select(editor);

    expect(screen.getByText("Selected 1")).toBeVisible();
  });

  it("renders the default schema and dynamically populated endpoints", () => {
    render(<SwaggerWorkspace />);

    expect(screen.getByText("Valid")).toBeVisible();
    expect(screen.getByText("YAML")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "RSSwag Demo API" }),
    ).toBeVisible();
    expect(document.getElementById("api-viewer")).toBeVisible();
    const stats = screen.getByLabelText("Endpoint statistics");

    expect(stats).toHaveTextContent("Endpoints2");
    expect(stats).toHaveTextContent("Methods2");
    expect(stats).toHaveTextContent("With bodies1");
    expect(stats).toHaveTextContent("Deprecated0");
    expect(stats).toHaveTextContent("Secured0");
    expect(screen.getAllByText("/users/{id}")).toHaveLength(2);
    expect(screen.getAllByText("Path parameters")).toHaveLength(2);
    expect(screen.getAllByText("id (Required)")).toHaveLength(2);
    expect(screen.getByText("search")).toBeVisible();
    expect(screen.getByText("X-Trace-Id")).toBeVisible();
    expect(screen.getByText("sessionId")).toBeVisible();
    expect(
      screen.getByText("200 - Successful response", { selector: "p" }),
    ).toBeVisible();
    expect(
      screen.getByText("404 - User not found", { selector: "p" }),
    ).toBeVisible();
    expect(screen.getAllByText("Content: application/json")).toHaveLength(2);
    expect(screen.getAllByText("Properties: id, name")).toHaveLength(2);
    expect(screen.getByText("Properties: name")).toBeVisible();
    expect(screen.getByLabelText("cURL GET /users/{id}")).toHaveTextContent(
      "curl -X GET",
    );
    expect(screen.getByLabelText("cURL POST /users/{id}")).toHaveTextContent(
      "Alex Smith",
    );
  });

  it("resolves server variables for the viewer and generated cURL", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Variable Server API
  version: 1.0.0
servers:
  - url: https://{environment}.example.com/{version}
    variables:
      environment:
        default: api
      version:
        default: v2
  - url: https://staging.example.com/v2
paths:
  /users:
    get:
      responses:
        '200':
          description: OK`,
      },
    });

    expect(await screen.findByText("https://api.example.com/v2")).toBeVisible();
    expect(screen.getByLabelText("cURL GET /users")).toHaveTextContent(
      "https://api.example.com/v2/users",
    );

    await user.selectOptions(
      screen.getByLabelText("Select API server"),
      "https://staging.example.com/v2",
    );

    expect(screen.getByLabelText("cURL GET /users")).toHaveTextContent(
      "https://staging.example.com/v2/users",
    );

    await user.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "https://staging.example.com/v2/users",
    );
  });

  it("applies and clears a validated custom server URL", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    const serverInput = screen.getByLabelText("Custom server URL");
    const getPreview = () => screen.getByLabelText("cURL GET /users/{id}");

    await user.type(serverInput, "/api");
    await user.click(screen.getByRole("button", { name: "Apply server" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a public HTTP or HTTPS server URL.",
    );
    expect(getPreview()).toHaveTextContent(
      "https://jsonplaceholder.typicode.com/users/",
    );

    await user.clear(serverInput);
    await user.type(serverInput, "  https://staging.example.net/v3/  ");
    await user.click(screen.getByRole("button", { name: "Apply server" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(serverInput).toHaveValue("https://staging.example.net/v3/");
    expect(getPreview()).toHaveTextContent(
      "https://staging.example.net/v3/users/",
    );

    await user.click(
      screen.getByRole("button", { name: "Clear custom server" }),
    );

    expect(serverInput).toHaveValue("");
    expect(getPreview()).toHaveTextContent(
      "https://jsonplaceholder.typicode.com/users/",
    );
  }, 10_000);

  it("applies a persisted request environment to previews and Try It Out", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          body: "{}",
          durationMs: 18,
          errorDetails: null,
          headers: { "content-type": "application/json" },
          requestSize: 24,
          responseSize: 2,
          status: "200",
          url: "https://staging.example.com/v2/users/42",
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );

    try {
      render(<SwaggerWorkspace />);

      await user.click(screen.getByRole("button", { name: "New environment" }));
      await user.type(screen.getByLabelText("Profile name"), "Staging");
      await user.type(
        screen.getByLabelText("Base URL (optional)"),
        "https://staging.example.com/v2",
      );
      await user.type(screen.getByLabelText("Header 1 name"), "Authorization");
      await user.type(
        screen.getByLabelText("Header 1 value"),
        "Bearer staging-token",
      );
      await user.click(
        screen.getByRole("button", { name: "Save environment" }),
      );

      const curlPreview = screen.getByLabelText("cURL GET /users/{id}");

      expect(curlPreview).toHaveTextContent(
        "https://staging.example.com/v2/users/",
      );
      expect(curlPreview).toHaveTextContent(
        "Authorization: Bearer staging-token",
      );
      expect(
        window.localStorage.getItem(REQUEST_ENVIRONMENTS_STORAGE_KEY),
      ).toContain("Staging");

      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const payload = JSON.parse(
        String((fetchMock.mock.calls[0][1] as RequestInit).body),
      );

      expect(payload.serverUrl).toBe("https://staging.example.com/v2");
      expect(payload.requestParameters).toEqual(
        expect.arrayContaining([
          {
            location: "header",
            name: "Authorization",
            value: "Bearer staging-token",
          },
          { location: "path", name: "id", value: "42" },
        ]),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("lets endpoint header values override matching environment defaults", async () => {
    window.localStorage.setItem(
      REQUEST_ENVIRONMENTS_STORAGE_KEY,
      JSON.stringify({
        settings: {
          activeEnvironmentId: "development",
          environments: [
            {
              headers: [
                {
                  enabled: true,
                  id: "trace-header",
                  name: "x-trace-id",
                  value: "environment-trace",
                },
              ],
              id: "development",
              name: "Development",
              serverUrl: "",
            },
          ],
        },
        storageVersion: 1,
      }),
    );

    render(<SwaggerWorkspace />);

    await waitFor(() =>
      expect(screen.getByLabelText("Active request environment")).toHaveValue(
        "development",
      ),
    );
    expect(screen.getByLabelText("cURL GET /users/{id}")).toHaveTextContent(
      "x-trace-id: environment-trace",
    );

    await userEvent
      .setup()
      .type(
        screen.getByLabelText("Header parameter X-Trace-Id"),
        "endpoint-trace",
      );

    const curlPreview = screen.getByLabelText("cURL GET /users/{id}");

    expect(curlPreview).toHaveTextContent("X-Trace-Id: endpoint-trace");
    expect(curlPreview).not.toHaveTextContent("environment-trace");
  });

  it("applies schema authentication only to secured operations without persisting secrets", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          body: '{"ok":true}',
          durationMs: 21,
          errorDetails: null,
          headers: { "content-type": "application/json" },
          requestSize: 80,
          responseSize: 11,
          status: "200",
          url: "https://api.example.com/private?api_key=query-secret",
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Secured API
  version: 1.0.0
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    queryKey:
      type: apiKey
      in: query
      name: api_key
security:
  - bearerAuth: []
    queryKey: []
paths:
  /private:
    get:
      summary: Private endpoint
      parameters:
        - in: query
          name: api_key
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
  /public:
    get:
      summary: Public endpoint
      security: []
      responses:
        '200':
          description: OK`,
        },
      });

      expect(
        await screen.findByRole("heading", { name: "Authentication" }),
      ).toBeVisible();
      const privatePreview = screen.getByLabelText("cURL GET /private");
      const privateCard = privatePreview.closest("article") as HTMLElement;
      const privateExecuteButton = within(privateCard).getByRole("button", {
        name: "Try It Out",
      });

      await user.click(privateExecuteButton);
      expect(privateExecuteButton).toBeDisabled();
      expect(fetchMock).not.toHaveBeenCalled();
      await user.click(
        screen.getByRole("checkbox", {
          name: "Enable bearerAuth authentication",
        }),
      );
      await user.type(
        screen.getByLabelText("Credential for bearerAuth"),
        "bearer-secret",
      );
      await user.click(
        screen.getByRole("checkbox", {
          name: "Enable queryKey authentication",
        }),
      );
      await user.type(
        screen.getByLabelText("Credential for queryKey"),
        "query-secret",
      );

      const publicPreview = screen.getByLabelText("cURL GET /public");

      expect(privatePreview).toHaveTextContent(
        "Authorization: Bearer bearer-secret",
      );
      expect(privatePreview).toHaveTextContent("api_key=query-secret");
      expect(publicPreview).not.toHaveTextContent("bearer-secret");
      expect(publicPreview).not.toHaveTextContent("query-secret");
      expect(within(privateCard).getByText("Auth configured")).toBeVisible();
      expect(privateExecuteButton).not.toBeDisabled();

      await user.click(privateExecuteButton);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const payload = JSON.parse(
        String((fetchMock.mock.calls[0][1] as RequestInit).body),
      );

      expect(payload.requestParameters).toEqual(
        expect.arrayContaining([
          {
            location: "header",
            name: "Authorization",
            value: "Bearer bearer-secret",
          },
          { location: "query", name: "api_key", value: "query-secret" },
        ]),
      );
      expect(payload.requestValues).toEqual([
        expect.objectContaining({ value: "[configured]" }),
        expect.objectContaining({ value: "[configured]" }),
      ]);
      const redactedResponseUrl = await within(privateCard).findByText(
        /api_key=%5Bconfigured%5D/,
      );
      expect(redactedResponseUrl).not.toHaveTextContent("query-secret");
      expect(
        Array.from({ length: window.localStorage.length }, (_, index) =>
          window.localStorage.getItem(window.localStorage.key(index) || ""),
        ).join("\n"),
      ).not.toContain("bearer-secret");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("filters the endpoint list by method, path, summary, and method tab", () => {
    render(<SwaggerWorkspace />);

    const filterInput = screen.getByLabelText(
      "Filter endpoints by method, path, summary, operation ID, tag, parameter, or auth",
    );
    const methodFilters = screen.getByRole("group", {
      name: "Filter endpoints by HTTP method",
    });

    expect(screen.getByText("Showing 2 of 2 endpoints")).toBeVisible();

    fireEvent.change(filterInput, { target: { value: "update" } });

    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("cURL GET /users/{id}"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No endpoints match the current filters."),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(methodFilters).getByRole("button", { name: "GET (1)" }),
    );

    expect(
      screen.getByText("No endpoints match the current filters."),
    ).toBeVisible();

    expect(screen.getByText("Showing 0 of 2 endpoints")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(filterInput).toHaveValue("");
    expect(
      within(methodFilters).getByRole("button", { name: "All methods" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Showing 2 of 2 endpoints")).toBeVisible();
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();

    fireEvent.change(filterInput, { target: { value: "does-not-exist" } });

    expect(
      screen.getByText("No endpoints match the current filters."),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("cURL POST /users/{id}"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
  });

  it("persists endpoint favorites and filters the viewer to them", async () => {
    const user = userEvent.setup();
    const firstView = render(<SwaggerWorkspace />);
    const addFavorite = await screen.findByRole("button", {
      name: "Add GET /users/{id} to favorites",
    });

    expect(addFavorite).toHaveAttribute("aria-pressed", "false");

    await user.click(addFavorite);

    expect(addFavorite).toHaveAttribute("aria-pressed", "true");
    expect(
      JSON.parse(
        window.localStorage.getItem(ENDPOINT_FAVORITES_STORAGE_KEY) || "[]",
      ),
    ).toEqual(["GET /users/{id}"]);
    expect(screen.getByRole("button", { name: "Favorites (1)" })).toBeVisible();

    firstView.unmount();
    render(<SwaggerWorkspace />);

    const removeFavorite = await screen.findByRole("button", {
      name: "Remove GET /users/{id} from favorites",
    });
    const favoritesFilter = screen.getByRole("button", {
      name: "Favorites (1)",
    });

    expect(removeFavorite).toHaveAttribute("aria-pressed", "true");

    await user.click(favoritesFilter);

    expect(favoritesFilter).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("cURL POST /users/{id}"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 2 endpoints")).toBeVisible();

    await user.click(removeFavorite);

    expect(
      screen.getByText("No favorite endpoints in the current schema."),
    ).toBeVisible();
    expect(
      window.localStorage.getItem(ENDPOINT_FAVORITES_STORAGE_KEY),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
  });

  it("persists collapsible endpoint details without losing request values", async () => {
    const user = userEvent.setup();
    const firstView = render(<SwaggerWorkspace />);
    const pathInput = await screen.findAllByLabelText("Path parameter id");
    const collapseGet = screen.getByRole("button", {
      name: "Hide details for GET /users/{id}",
    });

    await user.type(pathInput[0], "42");
    await user.click(collapseGet);

    expect(collapseGet).toHaveAttribute("aria-expanded", "false");
    expect(pathInput[0]).not.toBeVisible();
    expect(pathInput[0]).toHaveValue("42");
    expect(
      JSON.parse(
        window.localStorage.getItem(ENDPOINT_COLLAPSE_STORAGE_KEY) || "[]",
      ),
    ).toEqual(["GET /users/{id}"]);

    const expandGet = screen.getByRole("button", {
      name: "Show details for GET /users/{id}",
    });

    await user.click(expandGet);

    expect(pathInput[0]).toBeVisible();
    expect(pathInput[0]).toHaveValue("42");
    expect(
      window.localStorage.getItem(ENDPOINT_COLLAPSE_STORAGE_KEY),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "Hide details for GET /users/{id}",
      }),
    );
    firstView.unmount();
    render(<SwaggerWorkspace />);

    const restoredExpandGet = await screen.findByRole("button", {
      name: "Show details for GET /users/{id}",
    });

    expect(restoredExpandGet).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("cURL GET /users/{id}")).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "Collapse visible" }));

    expect(
      screen.getByRole("button", { name: "Expand visible" }),
    ).toBeVisible();
    expect(screen.getByLabelText("cURL POST /users/{id}")).not.toBeVisible();
    expect(
      JSON.parse(
        window.localStorage.getItem(ENDPOINT_COLLAPSE_STORAGE_KEY) || "[]",
      ),
    ).toEqual(["GET /users/{id}", "POST /users/{id}"]);

    await user.click(screen.getByRole("button", { name: "Expand visible" }));

    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeVisible();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeVisible();
    expect(
      window.localStorage.getItem(ENDPOINT_COLLAPSE_STORAGE_KEY),
    ).toBeNull();
  });

  it("focuses endpoint search with slash and clears it with Escape", () => {
    render(<SwaggerWorkspace />);

    const filterInput = screen.getByLabelText(
      "Filter endpoints by method, path, summary, operation ID, tag, parameter, or auth",
    );

    expect(filterInput).toHaveAttribute("aria-keyshortcuts", "/");

    fireEvent.keyDown(document.body, { key: "/" });

    expect(filterInput).toHaveFocus();

    fireEvent.change(filterInput, { target: { value: "users" } });
    fireEvent.keyDown(filterInput, { key: "Escape" });

    expect(filterInput).toHaveValue("");

    const editor = screen.getByLabelText("OpenAPI schema editor");

    editor.focus();
    fireEvent.keyDown(editor, { key: "/" });

    expect(editor).toHaveFocus();
    expect(filterInput).not.toHaveFocus();
  });

  it("restores endpoint filters from a shared view link", async () => {
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    window.localStorage.setItem(ENDPOINT_SORT_STORAGE_KEY, "path");
    window.history.replaceState(
      null,
      "",
      "/?endpoint-search=update&endpoint-method=post&endpoint-trait=with-request-body&endpoint-response=success&endpoint-sort=method",
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() =>
        expect(
          screen.getByRole("searchbox", {
            name: /Filter endpoints by method/,
          }),
        ).toHaveValue("update"),
      );
      expect(
        within(
          screen.getByRole("group", {
            name: "Filter endpoints by HTTP method",
          }),
        ).getByRole("button", { name: "POST (1)" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByLabelText("Filter endpoints by characteristic"),
      ).toHaveValue("with-request-body");
      expect(
        screen.getByLabelText("Filter endpoints by documented responses"),
      ).toHaveValue("success");
      expect(screen.getByLabelText("Sort endpoints")).toHaveValue("method");
      expect(screen.getByText("Showing 1 of 2 endpoints")).toBeVisible();
      expect(
        screen.queryByLabelText("cURL GET /users/{id}"),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("cURL POST /users/{id}")).toBeVisible();
    } finally {
      window.history.replaceState(null, "", previousUrl);
    }
  });

  it("copies the current endpoint filters as a shareable link", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.history.replaceState(null, "", "/?schema=demo#endpoint-get-users");

    try {
      render(<SwaggerWorkspace />);

      const endpointSearch = screen.getByRole("searchbox", {
        name: /Filter endpoints by method/,
      });

      await user.type(endpointSearch, "update");
      await user.click(
        within(
          screen.getByRole("group", {
            name: "Filter endpoints by HTTP method",
          }),
        ).getByRole("button", { name: "POST (1)" }),
      );
      await user.selectOptions(
        screen.getByLabelText("Filter endpoints by characteristic"),
        "with-request-body",
      );
      await user.selectOptions(
        screen.getByLabelText("Filter endpoints by documented responses"),
        "success",
      );
      await user.selectOptions(
        screen.getByLabelText("Sort endpoints"),
        "method",
      );
      await user.click(
        screen.getByRole("button", {
          name: "Copy current endpoint filters as a link",
        }),
      );

      expect(writeText).toHaveBeenCalledTimes(1);

      const copiedUrl = new URL(writeText.mock.calls[0][0] as string);

      expect(copiedUrl.searchParams.get("schema")).toBe("demo");
      expect(copiedUrl.searchParams.get("endpoint-search")).toBe("update");
      expect(copiedUrl.searchParams.get("endpoint-method")).toBe("POST");
      expect(copiedUrl.searchParams.get("endpoint-trait")).toBe(
        "with-request-body",
      );
      expect(copiedUrl.searchParams.get("endpoint-response")).toBe("success");
      expect(copiedUrl.searchParams.get("endpoint-sort")).toBe("method");
      expect(copiedUrl.hash).toBe("");
      expect(screen.getByText("Filter link copied.")).toHaveAttribute(
        "role",
        "status",
      );

      await user.clear(endpointSearch);

      expect(screen.queryByText("Filter link copied.")).not.toBeInTheDocument();
    } finally {
      window.history.replaceState(null, "", previousUrl);

      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  });

  it("exports only the currently visible endpoints as CSV", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((object: Blob | MediaSource) => {
      void object;
      return "blob:endpoint-inventory";
    });
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    const createElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);

        if (tagName === "a") {
          element.click = vi.fn();
          anchors.push(element as HTMLAnchorElement);
        }

        return element;
      });

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      render(<SwaggerWorkspace />);

      const endpointSearch = screen.getByRole("searchbox", {
        name: /Filter endpoints by method/,
      });
      const exportButton = screen.getByRole("button", {
        name: "Export visible endpoints as CSV",
      });

      await user.type(endpointSearch, "update");

      expect(screen.getByText("Showing 1 of 2 endpoints")).toBeVisible();
      expect(exportButton).toBeEnabled();

      await user.click(exportButton);

      expect(createObjectURL).toHaveBeenCalledTimes(1);

      const inventoryBlob = createObjectURL.mock.calls[0][0] as Blob;

      expect(inventoryBlob.type).toBe("text/csv;charset=utf-8");
      expect(anchors).toHaveLength(1);
      expect(anchors[0].download).toMatch(
        /^rsswag-rsswag-demo-api-endpoints-\d{4}-\d{2}-\d{2}\.csv$/,
      );
      expect(anchors[0].click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:endpoint-inventory");
      expect(
        screen.getByText("Visible endpoint CSV export started."),
      ).toHaveAttribute("role", "status");

      await user.clear(endpointSearch);
      await user.type(endpointSearch, "does-not-exist");

      expect(screen.getByText("Showing 0 of 2 endpoints")).toBeVisible();
      expect(exportButton).toBeDisabled();
      expect(
        screen.queryByText("Visible endpoint CSV export started."),
      ).not.toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElement.mockRestore();
    }
  });

  it("sorts visible endpoints without changing the default schema order", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Sorted API
  version: 1.0.0
paths:
  /zeta:
    delete:
      responses: {}
  /alpha:
    post:
      responses: {}
  /beta:
    get:
      responses: {}`,
      },
    });

    const endpointOrder = () =>
      screen
        .getAllByLabelText(/^cURL /)
        .map((preview) => preview.getAttribute("aria-label"));

    await waitFor(() =>
      expect(endpointOrder()).toEqual([
        "cURL DELETE /zeta",
        "cURL POST /alpha",
        "cURL GET /beta",
      ]),
    );

    const sort = screen.getByLabelText("Sort endpoints");

    await user.selectOptions(sort, "path");
    expect(window.localStorage.getItem(ENDPOINT_SORT_STORAGE_KEY)).toBe("path");
    expect(endpointOrder()).toEqual([
      "cURL POST /alpha",
      "cURL GET /beta",
      "cURL DELETE /zeta",
    ]);

    await user.selectOptions(sort, "method");
    expect(window.localStorage.getItem(ENDPOINT_SORT_STORAGE_KEY)).toBe(
      "method",
    );
    expect(endpointOrder()).toEqual([
      "cURL GET /beta",
      "cURL POST /alpha",
      "cURL DELETE /zeta",
    ]);

    await user.selectOptions(sort, "schema");
    expect(window.localStorage.getItem(ENDPOINT_SORT_STORAGE_KEY)).toBeNull();
    expect(endpointOrder()).toEqual([
      "cURL DELETE /zeta",
      "cURL POST /alpha",
      "cURL GET /beta",
    ]);
  });

  it("restores the saved endpoint sort preference", async () => {
    window.localStorage.setItem(ENDPOINT_SORT_STORAGE_KEY, "method");

    render(<SwaggerWorkspace />);

    await waitFor(() =>
      expect(screen.getByLabelText("Sort endpoints")).toHaveValue("method"),
    );
  });

  it("shows endpoint tags, security badges, deprecated badges, and metadata stats", async () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Reports API
  version: 1.0.0
security:
  - bearerAuth: []
paths:
  /reports:
    get:
      summary: List reports
      operationId: listReports
      deprecated: true
      tags:
        - reports
        - admin
      responses:
        '200':
          description: OK
  /status:
    get:
      summary: Health check
      operationId: getStatus
      security: []
      responses:
        '200':
          description: OK`,
      },
    });

    expect(await screen.findByText("reports")).toBeVisible();
    expect(screen.getByText("admin")).toBeVisible();
    expect(screen.getByText("Operation ID: listReports")).toBeVisible();
    expect(screen.getAllByText("Deprecated")).toHaveLength(2);
    expect(screen.getByText("Auth: bearerAuth")).toBeVisible();

    const stats = screen.getByLabelText("Endpoint statistics");

    expect(stats).toHaveTextContent("Endpoints2");
    expect(stats).toHaveTextContent("Deprecated1");
    expect(stats).toHaveTextContent("Secured1");

    const tagFilters = screen.getByRole("group", {
      name: "Filter endpoints by tag",
    });

    fireEvent.click(
      within(tagFilters).getByRole("button", { name: "admin (1)" }),
    );

    expect(screen.getByLabelText("cURL GET /reports")).toBeInTheDocument();
    expect(screen.queryByLabelText("cURL GET /status")).not.toBeInTheDocument();

    fireEvent.click(
      within(tagFilters).getByRole("button", { name: "All tags" }),
    );

    expect(screen.getByLabelText("cURL GET /status")).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText(
        "Filter endpoints by method, path, summary, operation ID, tag, parameter, or auth",
      ),
      { target: { value: "listReports" } },
    );

    expect(screen.getByLabelText("cURL GET /reports")).toBeInTheDocument();
    expect(screen.queryByLabelText("cURL GET /status")).not.toBeInTheDocument();
  });

  it("filters endpoints by security, deprecation, and request body traits", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Trait Filter API
  version: 1.0.0
security:
  - bearerAuth: []
paths:
  /private:
    get:
      responses: {}
  /public:
    get:
      security: []
      responses: {}
  /legacy:
    get:
      deprecated: true
      security: []
      responses: {}
  /create:
    post:
      security: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses: {}`,
      },
    });

    await screen.findByLabelText("cURL GET /private");
    const traitFilter = screen.getByLabelText(
      "Filter endpoints by characteristic",
    );

    await user.selectOptions(traitFilter, "secured");
    expect(screen.getByLabelText("cURL GET /private")).toBeInTheDocument();
    expect(screen.queryByLabelText("cURL GET /public")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 4 endpoints")).toBeVisible();

    await user.selectOptions(traitFilter, "unsecured");
    expect(
      screen.queryByLabelText("cURL GET /private"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /public")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /legacy")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /create")).toBeInTheDocument();

    await user.selectOptions(traitFilter, "deprecated");
    expect(screen.queryByLabelText("cURL GET /public")).not.toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /legacy")).toBeInTheDocument();

    await user.selectOptions(traitFilter, "with-request-body");
    expect(screen.getByLabelText("cURL POST /create")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("cURL GET /private"),
    ).not.toBeInTheDocument();

    await user.selectOptions(traitFilter, "without-request-body");
    expect(
      screen.queryByLabelText("cURL POST /create"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /private")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /public")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /legacy")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(traitFilter).toHaveValue("all");
    expect(screen.getByLabelText("cURL GET /private")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /public")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /legacy")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /create")).toBeInTheDocument();
  });

  it("filters endpoints by documented response coverage", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Response Coverage API
  version: 1.0.0
paths:
  /success:
    get:
      responses:
        '200':
          description: OK
  /client:
    get:
      responses:
        4XX:
          description: Client error
  /server:
    get:
      responses:
        '503':
          description: Unavailable
  /fallback:
    get:
      responses:
        default:
          description: Fallback
  /empty:
    get:
      responses: {}`,
      },
    });

    await screen.findByLabelText("cURL GET /success");
    const responseFilter = screen.getByLabelText(
      "Filter endpoints by documented responses",
    );

    await user.selectOptions(responseFilter, "success");
    expect(screen.getByLabelText("cURL GET /success")).toBeInTheDocument();
    expect(screen.queryByLabelText("cURL GET /client")).not.toBeInTheDocument();

    await user.selectOptions(responseFilter, "client-error");
    expect(screen.getByLabelText("cURL GET /client")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("cURL GET /success"),
    ).not.toBeInTheDocument();

    await user.selectOptions(responseFilter, "server-error");
    expect(screen.getByLabelText("cURL GET /server")).toBeInTheDocument();

    await user.selectOptions(responseFilter, "missing-error");
    expect(screen.getByLabelText("cURL GET /success")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /empty")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("cURL GET /fallback"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 5 endpoints")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(responseFilter).toHaveValue("all");
    expect(screen.getByLabelText("cURL GET /fallback")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /server")).toBeInTheDocument();
  });

  it("prefills try-it-out parameter inputs from schema examples and defaults", async () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Example Params API
  version: 1.0.0
paths:
  /users/{id}:
    get:
      summary: Get user
      parameters:
        - name: id
          in: path
          description: Unique user identifier
          schema:
            type: integer
            example: 42
        - name: search
          in: query
          example: Alex
          schema:
            type: string
        - name: X-Trace-Id
          in: header
          required: true
          schema:
            type: string
            default: trace-1
      responses:
        '200':
          description: OK`,
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Path parameter id")).toHaveValue("42"),
    );
    expect(screen.getByLabelText("Query parameter search")).toHaveValue("Alex");
    expect(screen.getByLabelText("Header parameter X-Trace-Id")).toHaveValue(
      "trace-1",
    );
    expect(screen.getAllByText("Required")).toHaveLength(2);
    expect(screen.getByText("id (Required)")).toBeVisible();
    expect(screen.getByText("X-Trace-Id (Required)")).toBeVisible();
    expect(screen.getByText("Unique user identifier")).toBeVisible();
    const curlPreview = screen.getByLabelText("cURL GET /users/{id}");

    expect(curlPreview).toHaveTextContent("curl -X GET");
    expect(curlPreview.textContent).toContain(
      '"https://api.example.com/users/42?search=Alex"',
    );
    expect(curlPreview.textContent).toContain('-H "X-Trace-Id: trace-1"');

    fireEvent.change(screen.getByLabelText("Header parameter X-Trace-Id"), {
      target: { value: " " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(screen.getByText("X-Trace-Id is required.")).toBeVisible();
    expect(
      screen.getByLabelText("Header parameter X-Trace-Id"),
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Try It Out" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Header parameter X-Trace-Id"), {
      target: { value: "trace-2" },
    });

    expect(
      screen.queryByText("X-Trace-Id is required."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try It Out" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Reset values" }));
    expect(screen.getByLabelText("Header parameter X-Trace-Id")).toHaveValue(
      "trace-1",
    );

    fireEvent.change(
      screen.getByLabelText(
        "Filter endpoints by method, path, summary, operation ID, tag, parameter, or auth",
      ),
      { target: { value: "unique user" } },
    );

    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
  });

  it("renders schema-aware parameter controls and blocks invalid requests", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        body: '{"ok":true}',
        durationMs: 12,
        errorDetails: null,
        headers: { "content-type": "application/json" },
        requestSize: 20,
        responseSize: 11,
        status: "200",
        url: "https://api.example.com/items?status=active&limit=5&code=ABC",
      }),
    );

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Constraint API
  version: 1.0.0
paths:
  /items:
    get:
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [active, paused]
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 10
        - name: code
          in: query
          schema:
            type: string
            minLength: 3
            maxLength: 5
            pattern: ^[A-Z]+$
      responses:
        '200':
          description: OK`,
        },
      });

      expect(
        await screen.findByRole("heading", { name: "Constraint API" }),
      ).toBeVisible();

      const statusSelect = screen.getByLabelText("Query parameter status");
      const limitInput = screen.getByLabelText("Query parameter limit");
      const codeInput = screen.getByLabelText("Query parameter code");
      const executeButton = screen.getByRole("button", { name: "Try It Out" });

      expect(statusSelect.tagName).toBe("SELECT");
      expect(
        within(statusSelect).getByRole("option", { name: "active" }),
      ).toBeVisible();
      expect(
        within(statusSelect).getByRole("option", { name: "paused" }),
      ).toBeVisible();
      expect(limitInput).toHaveAttribute("type", "text");
      expect(limitInput).toHaveAttribute("inputmode", "numeric");
      expect(limitInput).toHaveAttribute("min", "1");
      expect(limitInput).toHaveAttribute("max", "10");
      expect(limitInput).toHaveAttribute("step", "1");
      expect(codeInput).toHaveAttribute("minlength", "3");
      expect(codeInput).toHaveAttribute("maxlength", "5");

      await user.selectOptions(statusSelect, "active");
      await user.type(limitInput, "11");
      await user.type(codeInput, "abc1");
      await user.click(executeButton);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText("limit must be at most 10.")).toBeVisible();
      expect(screen.getByText("code must match ^[A-Z]+$.")).toBeVisible();
      expect(limitInput).toHaveAttribute("aria-invalid", "true");
      expect(codeInput).toHaveAttribute("aria-invalid", "true");
      expect(executeButton).toBeDisabled();

      await user.clear(limitInput);
      await user.type(limitInput, "5");
      await user.clear(codeInput);
      await user.type(codeInput, "ABC");

      expect(executeButton).toBeEnabled();
      await user.click(executeButton);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      const requestPayload = JSON.parse(
        fetchMock.mock.calls[0][1]?.body as string,
      );
      expect(requestPayload.requestParameters).toEqual(
        expect.arrayContaining([
          { location: "query", name: "status", value: "active" },
          { location: "query", name: "limit", value: "5" },
          { location: "query", name: "code", value: "ABC" },
        ]),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("saves, applies, updates, and deletes an endpoint request preset", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    try {
      render(<SwaggerWorkspace />);

      const pathInput = screen.getAllByLabelText("Path parameter id")[0];
      const endpointCard = pathInput.closest("article");

      expect(endpointCard).not.toBeNull();
      const card = within(endpointCard as HTMLElement);
      const presetSelect = card.getByLabelText("Request preset");
      const timeoutSelect = card.getByLabelText("Request timeout");

      await user.type(pathInput, "42");
      await user.type(card.getByLabelText("Query parameter search"), "Alex");
      await user.selectOptions(timeoutSelect, "30000");
      await user.click(card.getByRole("button", { name: "Save as preset" }));
      await user.type(card.getByLabelText("Preset name"), "Happy path");
      await user.click(card.getByRole("button", { name: "Save preset" }));

      expect(presetSelect).not.toHaveValue("");
      expect(
        JSON.parse(
          window.localStorage.getItem(REQUEST_PRESETS_STORAGE_KEY) || "{}",
        ),
      ).toMatchObject({
        presets: [
          {
            method: "GET",
            name: "Happy path",
            parameterValues: {
              "path:id": "42",
              "query:search": "Alex",
            },
            path: "/users/{id}",
            timeoutMs: 30000,
          },
        ],
        storageVersion: 1,
      });
      expect(
        within(
          screen
            .getAllByLabelText("Path parameter id")[1]
            .closest("article") as HTMLElement,
        ).queryByRole("option", { name: "Happy path" }),
      ).not.toBeInTheDocument();

      await user.click(card.getByRole("button", { name: "Reset values" }));
      expect(pathInput).toHaveValue("");
      expect(timeoutSelect).toHaveValue("10000");
      expect(presetSelect).toHaveValue("");

      await user.selectOptions(
        presetSelect,
        card.getByRole("option", { name: "Happy path" }),
      );
      expect(pathInput).toHaveValue("42");
      expect(card.getByLabelText("Query parameter search")).toHaveValue("Alex");
      expect(timeoutSelect).toHaveValue("30000");

      await user.type(card.getByLabelText("Query parameter search"), " Smith");
      await user.click(card.getByRole("button", { name: "Update preset" }));
      await user.click(card.getByRole("button", { name: "Reset values" }));
      await user.selectOptions(
        presetSelect,
        card.getByRole("option", { name: "Happy path" }),
      );
      expect(card.getByLabelText("Query parameter search")).toHaveValue(
        "Alex Smith",
      );

      await user.click(card.getByRole("button", { name: "Delete" }));
      expect(confirm).toHaveBeenCalledWith(
        'Delete the "Happy path" request preset?',
      );
      expect(presetSelect).toHaveValue("");
      expect(
        window.localStorage.getItem(REQUEST_PRESETS_STORAGE_KEY),
      ).toBeNull();
    } finally {
      confirm.mockRestore();
    }
  });

  it("restores request body drafts from a locally persisted preset", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    const requestBody = screen.getByLabelText("Editable request body");
    const endpointCard = requestBody.closest("article");

    expect(endpointCard).not.toBeNull();
    const card = within(endpointCard as HTMLElement);
    const presetSelect = card.getByLabelText("Request preset");

    fireEvent.change(requestBody, {
      target: { value: '{"name":"Preset User"}' },
    });
    await user.click(card.getByRole("button", { name: "Save as preset" }));
    await user.type(card.getByLabelText("Preset name"), "Custom body");
    await user.click(card.getByRole("button", { name: "Save preset" }));
    await user.click(card.getByRole("button", { name: "Reset values" }));

    expect(requestBody).toHaveValue('{\n  "name": "Alex Smith"\n}');

    await user.selectOptions(
      presetSelect,
      card.getByRole("option", { name: "Custom body" }),
    );

    expect(requestBody).toHaveValue('{"name":"Preset User"}');
    expect(card.getByLabelText("cURL POST /users/{id}")).toHaveTextContent(
      "Preset User",
    );
  });

  it("uses named media type examples in the viewer and Try It Out", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Named Examples API
  version: 1.0.0
paths:
  /users:
    post:
      summary: Create user
      requestBody:
        content:
          application/json:
            schema:
              type: object
            examples:
              createUser:
                value:
                  name: Ada
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                type: object
              examples:
                createdUser:
                  value:
                    id: 7
                    name: Ada`,
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "name": "Ada"\n}',
      ),
    );
    expect(screen.getByLabelText("Example: createUser")).toHaveTextContent(
      '"name": "Ada"',
    );
    expect(screen.getByLabelText("Example: createdUser")).toHaveTextContent(
      '"id": 7',
    );
    expect(screen.getByLabelText("cURL POST /users")).toHaveTextContent(
      '"name": "Ada"',
    );

    await user.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(await screen.findByLabelText("Response body")).toHaveTextContent(
      '"id": 7',
    );
  });

  it("switches request body content types in cURL and Try It Out", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Use the local fallback"));

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Documents API
  version: 1.0.0
paths:
  /documents:
    post:
      requestBody:
        description: Document payload
        required: true
        content:
          application/json:
            schema:
              type: object
            example:
              title: Guide
          application/xml:
            schema:
              type: string
            example: <document><title>Guide</title></document>
      responses:
        '201':
          description: Created`,
        },
      });

      const contentTypeSelect = await screen.findByLabelText(
        "Request content type",
      );

      expect(contentTypeSelect).toHaveValue("application/json");
      expect(screen.getByText("Document payload")).toBeVisible();
      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "title": "Guide"\n}',
      );

      fireEvent.change(screen.getByLabelText("Editable request body"), {
        target: { value: '{"title":' },
      });

      expect(
        screen.getByText("Enter valid JSON before executing."),
      ).toBeVisible();
      expect(screen.getByLabelText("Editable request body")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByRole("button", { name: "Try It Out" })).toBeDisabled();
      expect(fetchMock).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Editable request body"), {
        target: { value: '{"title":"Custom JSON"}' },
      });

      expect(
        screen.queryByText("Enter valid JSON before executing."),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try It Out" })).toBeEnabled();

      await user.click(screen.getByRole("button", { name: "Format JSON" }));

      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "title": "Custom JSON"\n}',
      );

      await user.selectOptions(contentTypeSelect, "application/xml");

      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        "<document><title>Guide</title></document>",
      );
      expect(
        screen.queryByRole("button", { name: "Format JSON" }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("cURL POST /documents")).toHaveTextContent(
        "Content-Type: application/xml",
      );

      await user.click(screen.getByRole("button", { name: "Try It Out" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
      const payload = JSON.parse(String(requestInit.body));

      expect(payload).toMatchObject({
        contentType: "application/xml",
        requestBody: "<document><title>Guide</title></document>",
      });

      await user.selectOptions(contentTypeSelect, "application/json");

      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "title": "Custom JSON"\n}',
      );

      await user.selectOptions(contentTypeSelect, "application/xml");

      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        "<document><title>Guide</title></document>",
      );

      await user.clear(screen.getByLabelText("Editable request body"));

      expect(screen.getByLabelText("Editable request body")).toBeRequired();
      expect(screen.getByLabelText("Editable request body")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByText("Request body is required.")).toBeVisible();
      expect(screen.getByRole("button", { name: "Try It Out" })).toBeDisabled();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "Reset values" }));

      expect(contentTypeSelect).toHaveValue("application/json");
      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "title": "Guide"\n}',
      );
      expect(
        screen.queryByText("Request body is required."),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try It Out" })).toBeEnabled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows advisory request body contract feedback without blocking execution", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        body: '{"id":7}',
        durationMs: 18,
        errorDetails: null,
        headers: { "content-type": "application/json" },
        requestSize: 24,
        responseSize: 8,
        status: "201",
        url: "https://api.example.com/users",
      }),
    );

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Request Contract API
  version: 1.0.0
paths:
  /users:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, email]
              properties:
                name:
                  type: string
                email:
                  type: string
            example:
              name: Ada
      responses:
        '201':
          description: Created`,
        },
      });

      expect(
        await screen.findByRole("heading", { name: "Request Contract API" }),
      ).toBeVisible();

      let contract = screen.getByLabelText("Request body contract");
      const bodyInput = screen.getByLabelText("Editable request body");
      const executeButton = screen.getByRole("button", { name: "Try It Out" });

      expect(contract).toHaveTextContent("Issues found");
      expect(contract).toHaveTextContent("Missing required properties: email.");
      expect(executeButton).toBeEnabled();

      await user.click(executeButton);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      fireEvent.change(bodyInput, { target: { value: "[]" } });
      contract = screen.getByLabelText("Request body contract");
      expect(contract).toHaveTextContent("Expected object, received array.");
      expect(executeButton).toBeEnabled();

      fireEvent.change(bodyInput, {
        target: { value: '{"name":"Ada","email":"ada@example.com"}' },
      });
      contract = screen.getByLabelText("Request body contract");
      expect(contract).toHaveTextContent("Passed");
      expect(contract).toHaveTextContent("Top-level object shape matches.");
      expect(executeButton).toBeEnabled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("previews selected response statuses and prefers successful responses", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Response Preview API
  version: 1.0.0
paths:
  /items:
    post:
      responses:
        '400':
          description: Invalid item
          content:
            application/json:
              example:
                error: Invalid item
        '201':
          description: Created
          content:
            application/json:
              example:
                id: 42`,
      },
    });

    await screen.findByLabelText("cURL POST /items");
    const responseStatus = screen.getByLabelText("Mock response status");

    expect(responseStatus).toHaveValue("201");

    await user.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(await screen.findByLabelText("Response body")).toHaveTextContent(
      '"id": 42',
    );

    await user.selectOptions(responseStatus, "400");

    expect(screen.queryByLabelText("Response body")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(await screen.findByLabelText("Response body")).toHaveTextContent(
      '"error": "Invalid item"',
    );
    expect(screen.getByRole("status")).toHaveTextContent("400");

    await user.click(screen.getByRole("button", { name: "Reset values" }));

    expect(responseStatus).toHaveValue("201");
    expect(screen.queryByLabelText("Response body")).not.toBeInTheDocument();
  });

  it("switches mock response media types and restores them from presets", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ body: "unexpected live response" }));

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Response Formats API
  version: 1.0.0
paths:
  /users/7:
    get:
      responses:
        '200':
          description: User
          content:
            application/json:
              schema:
                type: object
                required: [id]
                properties:
                  id:
                    type: integer
              example:
                id: 7
            application/xml:
              schema:
                type: string
              example: '<user id="7" />'`,
        },
      });

      const contentTypeSelect = await screen.findByLabelText(
        "Mock response content type",
      );
      const endpointCard = screen
        .getByLabelText("cURL GET /users/7")
        .closest("article") as HTMLElement;
      const card = within(endpointCard);

      await user.click(screen.getByRole("button", { name: "Mock" }));
      expect(contentTypeSelect).toHaveValue("application/json");

      await user.click(card.getByRole("button", { name: "Generate Mock" }));
      expect(await card.findByLabelText("Response body")).toHaveTextContent(
        '"id": 7',
      );

      await user.selectOptions(contentTypeSelect, "application/xml");
      expect(card.queryByLabelText("Response body")).not.toBeInTheDocument();
      await user.click(card.getByRole("button", { name: "Save as preset" }));
      await user.type(card.getByLabelText("Preset name"), "XML response");
      await user.click(card.getByRole("button", { name: "Save preset" }));

      expect(
        JSON.parse(
          window.localStorage.getItem(REQUEST_PRESETS_STORAGE_KEY) || "{}",
        ),
      ).toMatchObject({
        presets: [{ responseContentType: "application/xml" }],
      });

      await user.selectOptions(contentTypeSelect, "application/json");
      await user.selectOptions(
        card.getByLabelText("Request preset"),
        card.getByRole("option", { name: "XML response" }),
      );
      expect(contentTypeSelect).toHaveValue("application/xml");

      await user.click(card.getByRole("button", { name: "Generate Mock" }));
      expect(await card.findByLabelText("Response body")).toHaveTextContent(
        '<user id="7" />',
      );
      expect(card.getByRole("status")).toHaveTextContent(
        "content-type: application/xml",
      );
      expect(card.getByLabelText("Response contract")).toHaveTextContent(
        "All 3 checked rules passed.",
      );
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/try-it-out",
        expect.anything(),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows validation errors and disables conversion for invalid schemas", async () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: "openapi: 3.0.0" },
    });

    await waitFor(() => expect(screen.getByText("Invalid")).toBeVisible());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Schema info.title is required.",
    );
    expect(
      screen.getByRole("button", { name: "Format schema" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /convert/i })).toBeDisabled();
    expect(
      screen.getByText("Add a valid OpenAPI schema to populate the viewer."),
    ).toBeVisible();
  });

  it("shows parser locations and moves the editor caret to an error", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: "openapi: [" } });

    expect(await screen.findByText("Error at line 1, column 11")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Go to error" }));

    expect(editor).toHaveFocus();
    expect(editor.selectionStart).toBe(10);
    expect(editor.selectionEnd).toBe(10);
    expect(screen.getByText("Line 1, column 11")).toBeVisible();
  });

  it("converts between YAML and JSON without losing schema data", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const latestSchema = DEFAULT_OPENAPI_SCHEMA.replace(
      "RSSwag Demo API",
      "Recently Edited API",
    );

    fireEvent.change(editor, { target: { value: latestSchema } });
    fireEvent.click(screen.getByRole("button", { name: "Convert to JSON" }));

    expect(editor.value.trim().startsWith("{")).toBe(true);
    expect(editor.value).toContain('"title": "Recently Edited API"');
    expect(editor.value).not.toContain('"title": "RSSwag Demo API"');
    await waitFor(() => expect(screen.getByText("JSON")).toBeVisible());

    await user.click(
      await screen.findByRole("button", { name: "Convert to YAML" }),
    );

    expect(editor.value).toContain("title: Recently Edited API");
    await waitFor(() => expect(screen.getByText("YAML")).toBeVisible());
  });

  it("formats the current schema without changing its format", () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const compactSchema =
      '{"openapi":"3.0.0","info":{"title":"Compact API","version":"1.0.0"},"paths":{}}';

    fireEvent.change(editor, { target: { value: compactSchema } });
    fireEvent.click(screen.getByRole("button", { name: "Format schema" }));

    expect(editor.value).toBe(
      JSON.stringify(JSON.parse(compactSchema), null, 2),
    );
    expect(editor.value.trim().startsWith("{")).toBe(true);
    expect(editor.selectionStart).toBe(0);
    expect(editor.selectionEnd).toBe(0);
    expect(screen.getByText("Line 1, column 1")).toBeVisible();
  });

  it("formats the current schema with the editor keyboard shortcut", () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const formatButton = screen.getByRole("button", { name: "Format schema" });
    const compactSchema =
      '{"openapi":"3.0.0","info":{"title":"Shortcut API","version":"1.0.0"},"paths":{}}';

    fireEvent.change(editor, { target: { value: compactSchema } });

    expect(formatButton).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+Shift+F Meta+Shift+F",
    );
    expect(
      fireEvent.keyDown(editor, { ctrlKey: true, key: "f", shiftKey: true }),
    ).toBe(false);
    expect(editor.value).toBe(
      JSON.stringify(JSON.parse(compactSchema), null, 2),
    );
  });

  it("imports a schema from a local file", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    const file = new File(
      [
        `openapi: 3.0.0
info:
  title: Imported API
  version: 3.0.0
paths:
  /imported:
    get:
      summary: Imported endpoint
      responses:
        '200':
          description: OK`,
      ],
      "schema.yaml",
      { type: "application/yaml" },
    );

    await user.upload(
      screen.getByLabelText("Import OpenAPI schema file"),
      file,
    );

    expect(
      await screen.findByRole("heading", { name: "Imported API" }),
    ).toBeVisible();
    expect(screen.getByText("/imported")).toBeVisible();
    expect(
      screen.getByText(`Imported schema.yaml (${file.size} B).`),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: `${file.size}` },
    });
    expect(
      screen.queryByText(`Imported schema.yaml (${file.size} B).`),
    ).not.toBeInTheDocument();
  });

  it("imports a schema from a public URL", async () => {
    const user = userEvent.setup();
    const remoteSchema = `openapi: 3.0.0
info:
  title: Remote Catalog API
  version: 2.0.0
paths:
  /catalog:
    get:
      responses:
        '200':
          description: OK`;
    const byteSize = new TextEncoder().encode(remoteSchema).byteLength;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        byteSize,
        fileName: "catalog.yaml",
        schemaText: remoteSchema,
        sourceUrl: "https://docs.example.com/catalog.yaml",
      }),
    );

    try {
      render(<SwaggerWorkspace />);

      await user.click(screen.getByRole("button", { name: "Import URL" }));
      await user.type(
        screen.getByLabelText("OpenAPI schema URL"),
        "https://docs.example.com/catalog.yaml",
      );
      await user.click(screen.getByRole("button", { name: "Load schema" }));

      expect(
        await screen.findByRole("heading", { name: "Remote Catalog API" }),
      ).toBeVisible();
      expect(screen.getByText("/catalog")).toBeVisible();
      expect(
        screen.getByText(`Imported catalog.yaml (${byteSize} B).`),
      ).toBeVisible();
      expect(
        screen.queryByLabelText("Import OpenAPI schema from URL"),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/schema-import",
        expect.objectContaining({
          body: JSON.stringify({
            url: "https://docs.example.com/catalog.yaml",
          }),
          method: "POST",
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows remote import validation and HTTP errors without replacing the editor", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      render(<SwaggerWorkspace />);

      await user.click(screen.getByRole("button", { name: "Import URL" }));
      await user.type(
        screen.getByLabelText("OpenAPI schema URL"),
        "http://localhost/openapi.yaml",
      );
      await user.click(screen.getByRole("button", { name: "Load schema" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter a public HTTP or HTTPS schema URL.",
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
        DEFAULT_OPENAPI_SCHEMA,
      );

      await user.clear(screen.getByLabelText("OpenAPI schema URL"));
      await user.type(
        screen.getByLabelText("OpenAPI schema URL"),
        "https://docs.example.com/missing.yaml",
      );
      fetchMock.mockResolvedValueOnce(
        Response.json({ error: "http-error", status: 404 }, { status: 502 }),
      );
      await user.click(screen.getByRole("button", { name: "Load schema" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "The remote server returned HTTP 404.",
      );
      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
        DEFAULT_OPENAPI_SCHEMA,
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("cancels an in-progress remote schema import", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    try {
      render(<SwaggerWorkspace />);

      await user.click(screen.getByRole("button", { name: "Import URL" }));
      await user.type(
        screen.getByLabelText("OpenAPI schema URL"),
        "https://docs.example.com/slow.yaml",
      );
      await user.click(screen.getByRole("button", { name: "Load schema" }));

      expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Cancel load" }));

      expect(screen.getByLabelText("OpenAPI schema URL")).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "Cancel load" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
        DEFAULT_OPENAPI_SCHEMA,
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not let a stale local file read overwrite newer editor changes", async () => {
    let finishPendingRead = () => {};
    const readAsTextSpy = vi
      .spyOn(FileReader.prototype, "readAsText")
      .mockImplementation(function (this: FileReader) {
        finishPendingRead = () => {
          Object.defineProperty(this, "result", {
            configurable: true,
            value: "openapi: 3.0.0\ninfo:\n  title: Stale import",
          });
          this.onload?.(
            new ProgressEvent("load") as unknown as ProgressEvent<FileReader>,
          );
        };
      });

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("Import OpenAPI schema file"), {
        target: {
          files: [new File(["ignored"], "slow.yaml")],
        },
      });
      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: { value: "openapi: 3.0.0\ninfo:\n  title: Newer edit" },
      });

      finishPendingRead();

      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
        "openapi: 3.0.0\ninfo:\n  title: Newer edit",
      );
    } finally {
      readAsTextSpy.mockRestore();
    }
  });

  it("imports a schema file dropped onto the editor", async () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText("OpenAPI schema editor");
    const file = new File(
      [
        `openapi: 3.0.0
info:
  title: Dropped API
  version: 1.0.0
paths: {}`,
      ],
      "dropped.yaml",
      { type: "application/yaml" },
    );
    const dataTransfer = { files: [file], types: ["Files"] };

    fireEvent.dragEnter(editor, { dataTransfer });
    expect(editor.className).toContain("ring-2");

    fireEvent.drop(editor, { dataTransfer });

    expect(editor.className).not.toContain("ring-2");
    expect(
      await screen.findByRole("heading", { name: "Dropped API" }),
    ).toBeVisible();
    expect((editor as HTMLTextAreaElement).value).toContain(
      "title: Dropped API",
    );
    expect(
      screen.getByText(`Imported dropped.yaml (${file.size} B).`),
    ).toBeVisible();
  });

  it("confirms oversized schema imports without removing the option to continue", () => {
    const readAsTextSpy = vi
      .spyOn(FileReader.prototype, "readAsText")
      .mockImplementation(() => undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    try {
      render(<SwaggerWorkspace />);

      const fileInput = screen.getByLabelText("Import OpenAPI schema file");
      const editor = screen.getByLabelText("OpenAPI schema editor");
      const oversizedFile = new File(["openapi: 3.0.0"], "large.yaml");
      Object.defineProperty(oversizedFile, "size", {
        value: MAX_SCHEMA_IMPORT_SIZE_BYTES + 1,
      });
      fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

      expect(confirmSpy).toHaveBeenCalledWith(
        "This file is larger than 5 MB and may slow the editor. Import it anyway?",
      );
      expect(readAsTextSpy).not.toHaveBeenCalled();
      expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);

      confirmSpy.mockReturnValue(true);
      fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

      expect(readAsTextSpy).toHaveBeenCalledWith(oversizedFile);
    } finally {
      readAsTextSpy.mockRestore();
      confirmSpy.mockRestore();
    }
  });

  it("shows an error instead of silently failing when the imported file can't be read", async () => {
    const user = userEvent.setup();
    const readAsTextSpy = vi
      .spyOn(FileReader.prototype, "readAsText")
      .mockImplementation(function (this: FileReader) {
        this.onerror?.(
          new ProgressEvent("error") as unknown as ProgressEvent<FileReader>,
        );
      });

    render(<SwaggerWorkspace />);

    const file = new File(["openapi: 3.0.0"], "schema.yaml", {
      type: "application/yaml",
    });

    await user.upload(
      screen.getByLabelText("Import OpenAPI schema file"),
      file,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not read that file.",
    );

    readAsTextSpy.mockRestore();
  });

  it("keeps the current schema when a file reader returns no text", async () => {
    const user = userEvent.setup();
    const readAsTextSpy = vi
      .spyOn(FileReader.prototype, "readAsText")
      .mockImplementation(function (this: FileReader) {
        this.onload?.(
          new ProgressEvent("load") as unknown as ProgressEvent<FileReader>,
        );
      });

    try {
      render(<SwaggerWorkspace />);

      await user.upload(
        screen.getByLabelText("Import OpenAPI schema file"),
        new File(["ignored"], "schema.yaml", {
          type: "application/yaml",
        }),
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not read that file.",
      );
      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
        DEFAULT_OPENAPI_SCHEMA,
      );
    } finally {
      readAsTextSpy.mockRestore();
    }
  });

  it("downloads the latest schema with current format and title metadata", () => {
    const createObjectURL = vi.fn((object: Blob | MediaSource) => {
      void object;
      return "blob:mock-url";
    });
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const anchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);

        if (tagName === "a") {
          element.click = vi.fn();
          anchors.push(element as HTMLAnchorElement);
        }

        return element;
      });

    try {
      render(<SwaggerWorkspace />);

      const latestSchema = JSON.stringify({
        info: { title: "Fresh Download API", version: "2.0.0" },
        openapi: "3.0.0",
        paths: {},
      });

      const editor = screen.getByLabelText("OpenAPI schema editor");
      const downloadButton = screen.getByRole("button", { name: "Download" });

      fireEvent.change(editor, {
        target: { value: latestSchema },
      });
      expect(downloadButton).toHaveAttribute(
        "aria-keyshortcuts",
        "Control+Shift+S Meta+Shift+S",
      );
      fireEvent.click(downloadButton);
      expect(
        fireEvent.keyDown(editor, {
          ctrlKey: true,
          key: "s",
          shiftKey: true,
        }),
      ).toBe(false);

      expect(createObjectURL).toHaveBeenCalledTimes(2);
      const blobArg = createObjectURL.mock.calls[0][0] as Blob;
      expect(blobArg.type).toBe("application/json");
      expect(anchors).toHaveLength(2);

      for (const downloadAnchor of anchors) {
        expect(downloadAnchor.download).toBe("fresh-download-api.json");
        expect(downloadAnchor.getAttribute("href")).toBe("blob:mock-url");
        expect(downloadAnchor.click).toHaveBeenCalledTimes(1);
      }

      expect(revokeObjectURL).toHaveBeenCalledTimes(2);
      expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:mock-url");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Schema download started.",
      );

      createObjectURL.mockImplementationOnce(() => {
        throw new DOMException("Downloads blocked", "SecurityError");
      });
      fireEvent.click(downloadButton);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not download schema.",
      );
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
    }
  });

  it("copies the exact schema text and clears stale copy feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<SwaggerWorkspace />);

    await user.click(screen.getByRole("button", { name: "Copy schema" }));

    expect(writeText).toHaveBeenCalledWith(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByRole("status")).toHaveTextContent("Schema copied.");

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: DEFAULT_OPENAPI_SCHEMA.replace("1.0.0", "1.0.1"),
      },
    });

    expect(screen.queryByText("Schema copied.")).not.toBeInTheDocument();
  });

  it("copies schema text when the modern Clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "execCommand",
    );
    const execCommand = vi.fn().mockReturnValue(true);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    try {
      render(<SwaggerWorkspace />);

      const copyButton = screen.getByRole("button", { name: "Copy schema" });

      await user.click(copyButton);

      expect(execCommand).toHaveBeenCalledWith("copy");
      expect(copyButton).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent("Schema copied.");
      expect(
        document.querySelector("[data-clipboard-fallback]"),
      ).not.toBeInTheDocument();
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }

      if (execCommandDescriptor) {
        Object.defineProperty(document, "execCommand", execCommandDescriptor);
      } else {
        Reflect.deleteProperty(document, "execCommand");
      }
    }
  });

  it("shows an alert when schema copying fails", async () => {
    const user = userEvent.setup();
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "execCommand",
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Blocked")) },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });

    try {
      render(<SwaggerWorkspace />);

      await user.click(screen.getByRole("button", { name: "Copy schema" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not copy schema.",
      );

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: { value: "openapi: 3.0.0" },
      });
      expect(
        screen.queryByText("Could not copy schema."),
      ).not.toBeInTheDocument();
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }

      if (execCommandDescriptor) {
        Object.defineProperty(document, "execCommand", execCommandDescriptor);
      } else {
        Reflect.deleteProperty(document, "execCommand");
      }
    }
  });

  it("copies generated cURL commands", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    render(<SwaggerWorkspace />);

    expect(
      screen.getAllByRole("button", { name: "Copy request URL" })[0],
    ).toBeDisabled();
    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.type(screen.getByLabelText("Query parameter search"), "Alex");
    await user.type(
      screen.getByLabelText("Header parameter X-Trace-Id"),
      "trace-1",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Copy request URL" })[0],
    );

    expect(writeText).toHaveBeenLastCalledWith(
      "https://jsonplaceholder.typicode.com/users/42?search=Alex",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Request URL copied.");

    await user.click(screen.getAllByRole("button", { name: "Copy cURL" })[0]);

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        'curl -X GET \\\n  "https://jsonplaceholder.typicode.com/users/42?search=Alex" \\\n  -H "X-Trace-Id: trace-1"',
      ),
    );
    expect(screen.getByLabelText("cURL GET /users/{id}")).toHaveTextContent(
      "/users/42?search=Alex",
    );
    expect(screen.getByRole("status")).toHaveTextContent("cURL copied.");
    expect(screen.queryByText("Request URL copied.")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Query parameter search"), " Smith");

    expect(screen.queryByText("cURL copied.")).not.toBeInTheDocument();
  });

  it("adds stable endpoint anchors and copies direct links", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const scrollIntoView = vi.fn();
    const method = "GET";
    const path = "/users/{id}";
    const anchor = getEndpointAnchor(method, path);
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    const scrollDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    window.history.replaceState(null, "", `/?schema=demo#${anchor}`);

    try {
      render(<SwaggerWorkspace />);

      expect(document.getElementById(anchor)).toBeInTheDocument();
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }),
      );

      await user.click(
        screen.getByRole("button", {
          name: "Copy link to GET /users/{id}",
        }),
      );

      expect(writeText).toHaveBeenCalledWith(
        createEndpointPermalink(window.location.href, method, path),
      );
      expect(screen.getByRole("status")).toHaveTextContent("Link copied.");
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }

      if (scrollDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollIntoView",
          scrollDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }

      window.history.replaceState(null, "", previousUrl);
    }
  });

  it("previews and copies Fetch and raw HTTP snippets", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<SwaggerWorkspace />);

    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.type(screen.getByLabelText("Query parameter search"), "Alex");
    await user.type(
      screen.getByLabelText("Header parameter X-Trace-Id"),
      "trace-1",
    );
    await user.type(
      screen.getByLabelText("Cookie parameter sessionId"),
      "session-1",
    );

    const codeFormat = screen.getAllByRole("group", {
      name: "Request code format",
    })[0];

    await user.click(within(codeFormat).getByRole("button", { name: "Fetch" }));

    const fetchPreview = screen.getByLabelText("Fetch GET /users/{id}");

    expect(fetchPreview).toHaveTextContent(
      "https://jsonplaceholder.typicode.com/users/42?search=Alex",
    );
    expect(fetchPreview).toHaveTextContent('"method": "GET"');
    expect(fetchPreview).toHaveTextContent('"X-Trace-Id": "trace-1"');

    await user.click(screen.getAllByRole("button", { name: "Copy fetch" })[0]);

    expect(writeText).toHaveBeenCalledWith(fetchPreview.textContent);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Fetch snippet copied.",
    );

    await user.click(within(codeFormat).getByRole("button", { name: "HTTP" }));

    const httpPreview = screen.getByLabelText("HTTP GET /users/{id}");

    expect(httpPreview).toHaveTextContent(
      "GET https://jsonplaceholder.typicode.com/users/42?search=Alex HTTP/1.1",
    );
    expect(httpPreview).toHaveTextContent("X-Trace-Id: trace-1");
    expect(httpPreview).toHaveTextContent("Cookie: sessionId=session-1");

    await user.click(screen.getAllByRole("button", { name: "Copy HTTP" })[0]);

    expect(writeText).toHaveBeenLastCalledWith(httpPreview.textContent);
    expect(screen.getByRole("status")).toHaveTextContent(
      "HTTP request copied.",
    );

    await user.type(screen.getByLabelText("Query parameter search"), " Smith");

    expect(screen.queryByText("Fetch snippet copied.")).not.toBeInTheDocument();
    expect(screen.queryByText("HTTP request copied.")).not.toBeInTheDocument();
  });

  it("downloads the selected request snippet format", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((object: Blob | MediaSource) => {
      void object;
      return "blob:request-preview";
    });
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const anchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);

        if (tagName === "a") {
          element.click = vi.fn();
          anchors.push(element as HTMLAnchorElement);
        }

        return element;
      });

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      render(<SwaggerWorkspace />);

      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");

      const codeFormat = screen.getAllByRole("group", {
        name: "Request code format",
      })[0];

      await user.click(
        within(codeFormat).getByRole("button", { name: "HTTP" }),
      );
      await user.click(
        screen.getByRole("button", {
          name: "Download HTTP snippet for GET /users/{id}",
        }),
      );

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const requestBlob = createObjectURL.mock.calls[0][0] as Blob;
      const downloadAnchor = anchors.find((anchor) => anchor.download);

      expect(requestBlob.type).toBe("text/plain;charset=utf-8");
      expect(requestBlob.size).toBeGreaterThan(0);
      expect(downloadAnchor?.download).toBe("rsswag-get-users-id.http");
      expect(downloadAnchor?.getAttribute("href")).toBe("blob:request-preview");
      expect(downloadAnchor?.click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:request-preview");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
    }
  });

  it("omits the request body and Content-Type from the cURL preview once the body textarea is cleared", () => {
    render(<SwaggerWorkspace />);

    expect(screen.getByLabelText("cURL POST /users/{id}")).toHaveTextContent(
      "Content-Type",
    );

    fireEvent.change(screen.getByLabelText("Editable request body"), {
      target: { value: "" },
    });

    const curlPreview = screen.getByLabelText("cURL POST /users/{id}");

    expect(curlPreview).not.toHaveTextContent("Content-Type");
    expect(curlPreview.textContent).not.toContain("-d ");
  });

  it("shows filled parameter values in the mock request preview", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.type(
      screen.getByLabelText("Header parameter X-Trace-Id"),
      "trace-1",
    );
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[0]);

    expect(screen.getByRole("status")).toHaveTextContent("Request preview");
    expect(screen.getByRole("status")).toHaveTextContent("Path: id: 42");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Header: X-Trace-Id: trace-1",
    );
  });

  it("shows edited request body values in the mock request preview", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("Editable request body"), {
      target: {
        value: JSON.stringify({ name: "Mikhail" }, null, 2),
      },
    });
    await user.type(screen.getAllByLabelText("Path parameter id")[1], "42");
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[1]);

    expect(screen.getByRole("status")).toHaveTextContent("Request preview");
    expect(screen.getByRole("status")).toHaveTextContent("Mikhail");
  });

  it("keeps a newly added parameter input controlled and usable after a live schema edit", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: RSSwag Demo API
  version: 1.0.0
servers:
  - url: https://jsonplaceholder.typicode.com
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    get:
      summary: Get user by id
      parameters:
        - name: search
          in: query
          schema:
            type: string
        - name: sort
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Successful response`,
      },
    });

    const sortInput = await screen.findByLabelText("Query parameter sort");

    await user.type(sortInput, "asc");

    const loggedControlledInputWarning = consoleError.mock.calls.some(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("changing an uncontrolled input"),
    );

    expect(loggedControlledInputWarning).toBe(false);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toHaveTextContent(
      "sort=asc",
    );

    consoleError.mockRestore();
  });

  it("syncs an untouched request body to a live schema edit that keeps the same endpoint", async () => {
    render(<SwaggerWorkspace />);

    expect(screen.getByLabelText("Editable request body")).toHaveValue(
      '{\n  "name": "Alex Smith"\n}',
    );

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: RSSwag Demo API
  version: 1.0.0
servers:
  - url: https://jsonplaceholder.typicode.com
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    post:
      summary: Update user
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
            example:
              name: "Jordan Lee"
      responses:
        '200':
          description: Updated user`,
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "name": "Jordan Lee"\n}',
      ),
    );
  });

  it("syncs untouched parameter examples and resets edits to the latest value", async () => {
    const user = userEvent.setup();
    const schemaWithExample = (example: number) => `openapi: 3.0.0
info:
  title: Parameter Sync API
  version: 1.0.0
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        schema:
          type: integer
          example: ${example}
    get:
      responses:
        '200':
          description: OK`;
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor");

    fireEvent.change(editor, { target: { value: schemaWithExample(41) } });

    await waitFor(() => {
      const inputs = screen.getAllByLabelText("Path parameter id");

      expect(inputs).toHaveLength(1);
      expect(inputs[0]).toHaveValue("41");
    });
    const parameterInput = screen.getByLabelText("Path parameter id");

    fireEvent.change(editor, { target: { value: schemaWithExample(42) } });

    await waitFor(() => expect(parameterInput).toHaveValue("42"));

    await user.clear(parameterInput);
    await user.type(parameterInput, "custom");
    fireEvent.change(editor, { target: { value: schemaWithExample(43) } });

    await waitFor(() =>
      expect(parameterInput).toHaveAttribute("placeholder", "Example: 43"),
    );
    expect(parameterInput).toHaveValue("custom");

    await user.click(screen.getByRole("button", { name: "Reset values" }));

    expect(parameterInput).toHaveValue("43");
  });

  it("keeps a user's own request body edit instead of overwriting it after a live schema edit", async () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("Editable request body"), {
      target: { value: '{"name":"Custom Edit"}' },
    });

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: RSSwag Demo API
  version: 1.0.0
servers:
  - url: https://jsonplaceholder.typicode.com
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    post:
      summary: Update user
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
            example:
              name: "Jordan Lee"
      responses:
        '200':
          description: Updated user`,
      },
    });

    await waitFor(() =>
      expect(
        screen.queryByLabelText("cURL GET /users/{id}"),
      ).not.toBeInTheDocument(),
    );

    expect(screen.getByLabelText("Editable request body")).toHaveValue(
      '{"name":"Custom Edit"}',
    );
  });

  it("updates the viewer when a JSON schema is entered", async () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: JSON.stringify({
          info: {
            title: "Pets API",
            version: "2.0.0",
          },
          openapi: "3.0.0",
          paths: {
            "/pets": {
              get: {
                responses: {
                  "200": {
                    description: "OK",
                  },
                },
                summary: "List pets",
              },
            },
          },
        }),
      },
    });

    expect(
      await screen.findByRole("heading", { name: "Pets API" }),
    ).toBeVisible();
    expect(screen.getByText("Version 2.0.0")).toBeVisible();
    expect(screen.getByText("/pets")).toBeVisible();
    expect(screen.getByText("List pets")).toBeVisible();
  });

  it("debounces re-parsing the schema instead of reparsing on every keystroke", () => {
    vi.useFakeTimers();

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: { value: "openapi: 3.0.0" },
      });

      // The textarea updates instantly (typing must never feel blocked)...
      expect(
        (screen.getByLabelText("OpenAPI schema editor") as HTMLTextAreaElement)
          .value,
      ).toBe("openapi: 3.0.0");
      // ...but the expensive re-parse and its "Invalid" feedback shouldn't
      // have landed yet.
      expect(screen.queryByText("Invalid")).not.toBeInTheDocument();
      expect(screen.getByText("Valid")).toBeVisible();

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(screen.getByText("Invalid")).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables schema saving for guests", () => {
    render(<SwaggerWorkspace />);

    expect(
      screen.getByText("Sign in to save and restore schemas."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save schema" })).toBeDisabled();
  });

  it("restores and updates a debounced guest schema draft", async () => {
    const restoredDraft = `openapi: 3.0.0
info:
  title: Guest Draft API
  version: 1.0.0
paths: {}`;
    const editedDraft = restoredDraft.replace("1.0.0", "2.0.0");
    window.localStorage.setItem(SCHEMA_DRAFT_STORAGE_KEY, restoredDraft);

    render(<SwaggerWorkspace />);

    expect(
      await screen.findByRole("heading", { name: "Guest Draft API" }),
    ).toBeVisible();
    expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
      restoredDraft,
    );

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: editedDraft },
    });

    expect(screen.getByText("Saving draft...")).toBeVisible();

    const pendingEvent = new Event("beforeunload", {
      cancelable: true,
    }) as BeforeUnloadEvent;

    expect(window.dispatchEvent(pendingEvent)).toBe(false);

    await waitFor(() =>
      expect(window.localStorage.getItem(SCHEMA_DRAFT_STORAGE_KEY)).toBe(
        editedDraft,
      ),
    );
    expect(screen.getByText("Draft saved locally.")).toBeVisible();

    const savedEvent = new Event("beforeunload", {
      cancelable: true,
    }) as BeforeUnloadEvent;

    expect(window.dispatchEvent(savedEvent)).toBe(true);
  });

  it("reports a failed guest draft save without disrupting editing", async () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage full", "QuotaExceededError");
      });

    try {
      render(<SwaggerWorkspace />);

      const editor = screen.getByLabelText("OpenAPI schema editor");
      const editedSchema = DEFAULT_OPENAPI_SCHEMA.replace("1.0.0", "1.0.1");

      fireEvent.change(editor, { target: { value: editedSchema } });

      expect(screen.getByText("Saving draft...")).toBeVisible();
      expect(
        await screen.findByText("Draft could not be saved."),
      ).toBeVisible();
      expect(editor).toHaveValue(editedSchema);

      const failedEvent = new Event("beforeunload", {
        cancelable: true,
      }) as BeforeUnloadEvent;

      expect(window.dispatchEvent(failedEvent)).toBe(false);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("resets a guest draft to the default schema only after confirmation", async () => {
    const user = userEvent.setup();
    const draft = `openapi: 3.0.0
info:
  title: Resettable Draft API
  version: 1.0.0
paths: {}`;
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    window.localStorage.setItem(SCHEMA_DRAFT_STORAGE_KEY, draft);

    try {
      render(<SwaggerWorkspace />);

      expect(
        await screen.findByRole("heading", { name: "Resettable Draft API" }),
      ).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Reset editor" }));
      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(draft);
      expect(window.localStorage.getItem(SCHEMA_DRAFT_STORAGE_KEY)).toBe(draft);

      await user.click(screen.getByRole("button", { name: "Reset editor" }));

      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
        DEFAULT_OPENAPI_SCHEMA,
      );
      expect(window.localStorage.getItem(SCHEMA_DRAFT_STORAGE_KEY)).toBeNull();
      expect(
        await screen.findByRole("heading", { name: "RSSwag Demo API" }),
      ).toBeVisible();
      expect(confirmSpy).toHaveBeenCalledTimes(2);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("saves a valid schema for authenticated users", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      await user.click(screen.getByRole("button", { name: "Save schema" }));

      expect(screen.getByRole("status")).toHaveTextContent("Schema saved.");
      expect(window.localStorage.getItem(SAVED_SCHEMA_STORAGE_KEY)).toContain(
        "RSSwag Demo API",
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/schemas",
        expect.objectContaining({
          method: "POST",
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("warns before leaving authenticated edits until they are saved", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      const cleanEvent = new Event("beforeunload", {
        cancelable: true,
      }) as BeforeUnloadEvent;

      expect(window.dispatchEvent(cleanEvent)).toBe(true);
      expect(cleanEvent.defaultPrevented).toBe(false);

      const editedSchema = DEFAULT_OPENAPI_SCHEMA.replace(
        "RSSwag Demo API",
        "Unsaved API",
      );

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: { value: editedSchema },
      });

      expect(screen.getByText("Unsaved schema changes.")).toBeVisible();

      const dirtyEvent = new Event("beforeunload", {
        cancelable: true,
      }) as BeforeUnloadEvent;

      expect(window.dispatchEvent(dirtyEvent)).toBe(false);
      expect(dirtyEvent.defaultPrevented).toBe(true);

      await user.click(screen.getByRole("button", { name: "Save schema" }));

      expect(
        screen.queryByText("Unsaved schema changes."),
      ).not.toBeInTheDocument();

      const savedEvent = new Event("beforeunload", {
        cancelable: true,
      }) as BeforeUnloadEvent;

      expect(window.dispatchEvent(savedEvent)).toBe(true);
      expect(savedEvent.defaultPrevented).toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("opens a selected saved schema and preserves its identity when resaving", async () => {
    const user = userEvent.setup();
    const selectedSchema = {
      createdAt: "2026-07-10T10:00:00.000Z",
      format: "yaml",
      id: "selected-schema",
      schemaText: `openapi: 3.0.0
info:
  title: Selected API
  version: 2.0.0
paths:
  /selected:
    get:
      summary: Selected endpoint
      responses:
        '200':
          description: OK`,
      title: "Selected API",
      updatedAt: "2026-07-10T11:00:00.000Z",
      version: "2.0.0",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );
    stageSavedSchemaForEditor(selectedSchema);

    try {
      render(<SwaggerWorkspace />);

      expect(
        await screen.findByRole("heading", { name: "Selected API" }),
      ).toBeVisible();
      expect(screen.getByText("/selected")).toBeVisible();
      expect(
        window.sessionStorage.getItem(SCHEMA_EDITOR_HANDOFF_STORAGE_KEY),
      ).toBeNull();

      await user.click(screen.getByRole("button", { name: "Save schema" }));

      const postCall = fetchMock.mock.calls.find(
        ([url, options]) =>
          url === "/api/schemas" &&
          (options as RequestInit | undefined)?.method === "POST",
      );
      const savedRecord = JSON.parse(
        String((postCall?.[1] as RequestInit | undefined)?.body),
      );

      expect(savedRecord).toMatchObject({
        createdAt: selectedSchema.createdAt,
        id: selectedSchema.id,
        title: selectedSchema.title,
      });
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) => url === "/api/schemas" && options === undefined,
        ),
      ).toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reports an authenticated local save failure without syncing stale data", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      const setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new DOMException("Storage full", "QuotaExceededError");
        });

      try {
        await user.click(screen.getByRole("button", { name: "Save schema" }));

        expect(screen.getByRole("alert")).toHaveTextContent(
          "Schema could not be saved locally.",
        );
        expect(
          fetchMock.mock.calls.some(
            ([url, options]) =>
              url === "/api/schemas" &&
              (options as RequestInit | undefined)?.method === "POST",
          ),
        ).toBe(false);
      } finally {
        setItemSpy.mockRestore();
      }
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("saves the latest schema metadata with the editor keyboard shortcut", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      expect(
        screen.getByRole("button", { name: "Save schema" }),
      ).toHaveAttribute("aria-keyshortcuts", "Control+S Meta+S");

      const editor = screen.getByLabelText("OpenAPI schema editor");
      const latestSchema = DEFAULT_OPENAPI_SCHEMA.replace(
        "RSSwag Demo API",
        "Shortcut Saved API",
      ).replace("version: 1.0.0", "version: 2.1.0");

      fireEvent.change(editor, { target: { value: latestSchema } });
      fireEvent.keyDown(editor, { ctrlKey: true, key: "s" });

      expect(screen.getByRole("status")).toHaveTextContent("Schema saved.");
      expect(window.localStorage.getItem(SAVED_SCHEMA_STORAGE_KEY)).toBe(
        latestSchema,
      );

      const postCall = fetchMock.mock.calls.find(
        ([url, options]) =>
          url === "/api/schemas" &&
          (options as RequestInit | undefined)?.method === "POST",
      );
      const savedRecord = JSON.parse(
        String((postCall?.[1] as RequestInit | undefined)?.body),
      );

      expect(savedRecord).toMatchObject({
        format: "yaml",
        schemaText: latestSchema,
        title: "Shortcut Saved API",
        version: "2.1.0",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reuses the same saved-schema id across repeated saves instead of creating duplicates", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      await user.click(screen.getByRole("button", { name: "Save schema" }));
      await user.click(screen.getByRole("button", { name: "Save schema" }));

      const postCalls = fetchMock.mock.calls.filter(
        ([url, options]) =>
          url === "/api/schemas" &&
          (options as RequestInit | undefined)?.method === "POST",
      );

      expect(postCalls).toHaveLength(2);

      const firstBody = JSON.parse(
        String((postCalls[0][1] as RequestInit).body),
      );
      const secondBody = JSON.parse(
        String((postCalls[1][1] as RequestInit).body),
      );

      expect(secondBody.id).toBe(firstBody.id);
      expect(secondBody.createdAt).toBe(firstBody.createdAt);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("keeps in-progress edits instead of overwriting them once a slower saved-schema fetch resolves", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(fetchPromise);
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      expect(fetchMock).toHaveBeenCalledWith("/api/schemas");

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: { value: "openapi: 3.0.0" },
      });

      await act(async () => {
        resolveFetch(
          Response.json({
            schemas: [
              {
                createdAt: "2026-01-01T00:00:00.000Z",
                format: "yaml",
                id: "server-1",
                schemaText:
                  "openapi: 3.0.0\ninfo:\n  title: Server Saved API\n  version: 1.0.0\npaths: {}",
                title: "Server Saved API",
                updatedAt: "2026-01-01T00:00:00.000Z",
                version: "1.0.0",
              },
            ],
          }),
        );
        // Gives the response.json() + .then() microtask chain room to settle
        // so a still-present bug would have had its chance to overwrite the
        // edit before this assertion runs.
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(
        (screen.getByLabelText("OpenAPI schema editor") as HTMLTextAreaElement)
          .value,
      ).toBe("openapi: 3.0.0");
      expect(screen.queryByText("Server Saved API")).not.toBeInTheDocument();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not overwrite an authenticated reset when initial server loading finishes late", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(fetchPromise);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      expect(fetchMock).toHaveBeenCalledWith("/api/schemas");

      fireEvent.click(screen.getByRole("button", { name: "Reset editor" }));

      await act(async () => {
        resolveFetch(
          Response.json({
            schemas: [
              {
                createdAt: "2026-01-01T00:00:00.000Z",
                format: "yaml",
                id: "server-1",
                schemaText:
                  "openapi: 3.0.0\ninfo:\n  title: Server Saved API\n  version: 1.0.0\npaths: {}",
                title: "Server Saved API",
                updatedAt: "2026-01-01T00:00:00.000Z",
                version: "1.0.0",
              },
            ],
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
        DEFAULT_OPENAPI_SCHEMA,
      );
      expect(screen.queryByText("Server Saved API")).not.toBeInTheDocument();
      expect(confirm).toHaveBeenCalledTimes(1);
    } finally {
      confirm.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("restores a saved schema for authenticated users", async () => {
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );
    window.localStorage.setItem(
      SAVED_SCHEMA_STORAGE_KEY,
      `openapi: 3.0.0
info:
  title: Saved API
  version: 9.0.0
paths:
  /saved:
    get:
      summary: Saved endpoint
      responses:
        '200':
          description: OK`,
    );

    render(<SwaggerWorkspace />);

    expect(
      await screen.findByRole("heading", { name: "Saved API" }),
    ).toBeVisible();
    expect(screen.getByText("/saved")).toBeVisible();
  });

  it("executes a mock response and saves history for authenticated users", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    render(<SwaggerWorkspace />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save schema" }),
      ).not.toBeDisabled();
    });

    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[0]);

    expect(screen.getByRole("status")).toHaveTextContent("Response");
    expect(screen.getByRole("status")).toHaveTextContent("200");
    expect(screen.getByRole("status")).toHaveTextContent("Alex Smith");
    expect(screen.getByRole("status")).toHaveTextContent("Saved to history");
    expect(screen.getByLabelText("Response contract")).toHaveTextContent(
      "All 3 checked rules passed.",
    );
    expect(window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)).toContain(
      "Get user by id",
    );

    await user.click(
      screen.getByRole("button", { name: "Copy response headers" }),
    );

    expect(writeText).toHaveBeenLastCalledWith(
      "content-type: application/json",
    );
    expect(screen.getByText("Response headers copied.")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Copy response body" }),
    );

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('"name": "Alex Smith"'),
    );
    expect(screen.getByText("Response copied.")).toBeVisible();
    expect(
      screen.queryByText("Response headers copied."),
    ).not.toBeInTheDocument();

    const savedHistory = window.localStorage.getItem(
      REQUEST_HISTORY_STORAGE_KEY,
    );
    await user.click(screen.getByRole("button", { name: "Clear response" }));

    expect(screen.queryByLabelText("Response body")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy response body" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Path parameter id")[0]).toHaveValue("42");
    expect(window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)).toBe(
      savedHistory,
    );
  });

  it("downloads the original response body with content-type metadata", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((object: Blob | MediaSource) => {
      void object;
      return "blob:response-url";
    });
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const anchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);

        if (tagName === "a") {
          element.click = vi.fn();
          anchors.push(element as HTMLAnchorElement);
        }

        return element;
      });

    try {
      render(<SwaggerWorkspace />);

      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );
      await user.click(
        screen.getByRole("button", { name: "Download response" }),
      );

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const responseBlob = createObjectURL.mock.calls[0][0] as Blob;
      expect(responseBlob.type).toBe("application/json");
      expect(responseBlob.size).toBeGreaterThan(0);
      expect(anchors[0]?.download).toBe("rsswag-response-200.json");
      expect(anchors[0]?.getAttribute("href")).toBe("blob:response-url");
      expect(anchors[0]?.click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:response-url");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
    }
  });

  it("records a failed request in history with its real status instead of a fake 200", async () => {
    const user = userEvent.setup();
    // Mirrors what the /api/try-it-out route itself returns (status 200,
    // its own fetch succeeded) when ITS upstream call to the real target
    // API fails: a "0" status sentinel inside the JSON body.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            body: JSON.stringify({ error: "network error" }),
            durationMs: 12,
            errorDetails: "network error",
            headers: {},
            requestSize: 10,
            responseSize: 20,
            status: "0",
            url: "https://jsonplaceholder.typicode.com/users/42",
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );

      const savedHistory = JSON.parse(
        window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY) || "[]",
      );

      expect(savedHistory).toMatchObject([{ status: 0 }]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses server execution analytics when the try-it-out route responds", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          body: JSON.stringify({ ok: true }),
          durationMs: 88,
          headers: {
            "content-type": "application/json",
            "x-demo": "server",
          },
          requestSize: 123,
          responseSize: 11,
          status: "200",
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    try {
      render(<SwaggerWorkspace />);

      const pathInput = screen.getAllByLabelText("Path parameter id")[0];
      const endpointCard = pathInput.closest("article");

      expect(endpointCard).not.toBeNull();
      const timeoutSelect = within(endpointCard as HTMLElement).getByLabelText(
        "Request timeout",
      );

      await user.type(pathInput, "42");
      await user.selectOptions(timeoutSelect, "30000");
      expect(timeoutSelect).toHaveValue("30000");
      await user.click(
        within(endpointCard as HTMLElement).getByRole("button", {
          name: "Try It Out",
        }),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/try-it-out",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(
        String((fetchMock.mock.calls[0][1] as RequestInit).body),
      );

      expect(requestBody).toMatchObject({
        method: "GET",
        path: "/users/{id}",
        requestParameters: [{ location: "path", name: "id", value: "42" }],
        serverUrl: "https://jsonplaceholder.typicode.com",
        timeoutMs: 30000,
      });
      expect(screen.getByRole("status")).toHaveTextContent("88 ms");
      expect(screen.getByRole("status")).toHaveTextContent("Request 123 B");
      expect(screen.getByRole("status")).toHaveTextContent("Response 11 B");
      expect(screen.getByRole("status")).toHaveTextContent("Response headers");
      expect(screen.getByRole("status")).toHaveTextContent("x-demo: server");
      expect(screen.getByLabelText("Response body").textContent).toBe(
        '{\n  "ok": true\n}',
      );

      await user.click(
        within(endpointCard as HTMLElement).getByRole("button", {
          name: "Reset values",
        }),
      );
      expect(timeoutSelect).toHaveValue("10000");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reports response contract drift after Try It Out", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        body: '{"id":7}',
        durationMs: 24,
        errorDetails: null,
        headers: { "content-type": "application/json; charset=utf-8" },
        requestSize: 20,
        responseSize: 8,
        status: "200",
        url: "https://api.example.com/users/7",
      }),
    );

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Contract API
  version: 1.0.0
paths:
  /users/7:
    get:
      summary: Get user
      responses:
        '200':
          description: User
          content:
            application/json:
              schema:
                type: object
                required: [id, name]
                properties:
                  id:
                    type: integer
                  name:
                    type: string`,
        },
      });

      expect(
        await screen.findByRole("heading", { name: "Contract API" }),
      ).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Try It Out" }));

      const contractReport = await screen.findByLabelText("Response contract");

      expect(contractReport).toHaveTextContent("Issues found");
      expect(contractReport).toHaveTextContent(
        "Missing required properties: name.",
      );
      expect(contractReport).toHaveTextContent("1 of 3 checked rules failed.");
      expect(
        within(contractReport).getByRole("button", {
          name: "Copy report JSON",
        }),
      ).toBeEnabled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("runs offline mock contract suites for visible or all endpoints", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ body: "unexpected network result" }));

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Contract Suite API
  version: 1.0.0
paths:
  /users:
    get:
      responses:
        '200':
          description: User list
          content:
            application/json:
              schema:
                type: array
              example: []
  /jobs:
    delete:
      responses:
        '204':
          description: Deleted
  /missing:
    get:
      responses: {}`,
        },
      });

      expect(
        await screen.findByRole("heading", { name: "Contract Suite API" }),
      ).toBeVisible();
      const suitePanel = screen
        .getByRole("heading", { name: "Mock contract suite" })
        .closest("section") as HTMLElement;
      const endpointFilter = screen.getByLabelText(
        "Filter endpoints by method, path, summary, operation ID, tag, parameter, or auth",
      );

      await user.type(endpointFilter, "/users");
      expect(screen.getByText("Showing 1 of 3 endpoints")).toBeVisible();
      expect(
        screen.getByRole("option", { name: "Visible endpoints (1)" }),
      ).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Run mock suite" }));

      let suiteResults = screen.getByLabelText("Mock contract suite results");
      expect(suiteResults).toHaveTextContent("Cases1");
      expect(suiteResults).toHaveTextContent("Passed1");

      await user.selectOptions(screen.getByLabelText("Suite scope"), "all");
      await user.click(screen.getByRole("button", { name: "Run mock suite" }));

      suiteResults = screen.getByLabelText("Mock contract suite results");
      expect(suiteResults).toHaveTextContent("Cases3");
      expect(suiteResults).toHaveTextContent("Passed1");
      expect(suiteResults).toHaveTextContent("Partial1");
      expect(suiteResults).toHaveTextContent("Failed1");
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/try-it-out",
        expect.anything(),
      );
      expect(
        window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY),
      ).toBeNull();

      await user.click(screen.getByRole("button", { name: "Failed (1)" }));
      await user.click(
        within(suitePanel).getByRole("button", { name: "View endpoint" }),
      );

      expect(endpointFilter).toHaveValue("/missing");
      expect(screen.getByLabelText("cURL GET /missing")).toBeVisible();
      expect(window.location.hash).toBe(
        `#${getEndpointAnchor("GET", "/missing")}`,
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("persists mock mode and generates documented responses without network or history", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        body: "unexpected live response",
        durationMs: 99,
        errorDetails: null,
        headers: { "content-type": "text/plain" },
        requestSize: 1,
        responseSize: 1,
        status: "500",
        url: "https://unexpected.example.com",
      }),
    );

    try {
      const view = render(<SwaggerWorkspace initialIsAuthenticated />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Offline Reports API
  version: 1.0.0
paths:
  /reports/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '2XX':
          description: Report
          content:
            application/problem+json:
              schema:
                type: object
                required: [id, state]
                properties:
                  id:
                    type: integer
                  state:
                    type: string
                example:
                  id: 7
                  state: ready`,
        },
      });

      expect(
        await screen.findByRole("heading", { name: "Offline Reports API" }),
      ).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Mock" }));
      expect(screen.getByRole("button", { name: "Mock" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(
        window.localStorage.getItem(REQUEST_EXECUTION_MODE_STORAGE_KEY),
      ).toBe("mock");

      const endpointCard = screen
        .getByLabelText("cURL GET /reports/{id}")
        .closest("article") as HTMLElement;

      await user.type(
        within(endpointCard).getByLabelText("Path parameter id"),
        "7",
      );
      await user.click(
        within(endpointCard).getByRole("button", { name: "Generate Mock" }),
      );

      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/try-it-out",
        expect.anything(),
      );
      expect(within(endpointCard).getByRole("status")).toHaveTextContent(
        "Mock response",
      );
      expect(within(endpointCard).getByRole("status")).toHaveTextContent("200");
      expect(within(endpointCard).getByRole("status")).toHaveTextContent(
        "0 ms",
      );
      expect(endpointCard).toHaveTextContent(
        "content-type: application/problem+json",
      );
      expect(
        within(endpointCard).getByLabelText("Response body"),
      ).toHaveTextContent('"state": "ready"');
      expect(
        within(endpointCard).getByLabelText("Response contract"),
      ).toHaveTextContent("All 3 checked rules passed.");
      expect(
        window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY),
      ).toBeNull();

      view.unmount();
      render(<SwaggerWorkspace />);

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Mock" })).toHaveAttribute(
          "aria-pressed",
          "true",
        ),
      );
      expect(
        screen.getAllByRole("button", { name: "Generate Mock" }).length,
      ).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: "Live" }));
      expect(
        window.localStorage.getItem(REQUEST_EXECUTION_MODE_STORAGE_KEY),
      ).toBeNull();
      expect(
        screen.getAllByRole("button", { name: "Try It Out" }).length,
      ).toBeGreaterThan(0);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("generates a schema-conformant mock response when no example is documented", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ body: "unexpected live response" }));

    try {
      render(<SwaggerWorkspace initialIsAuthenticated />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Generated Mock API
  version: 1.0.0
paths:
  /health:
    get:
      responses:
        '200':
          description: Health details
          headers:
            X-RateLimit-Remaining:
              schema:
                default: 99
                type: integer
            X-Request-Id:
              description: Correlates this request
              schema:
                example: request-42
                type: string
          content:
            application/json:
              schema:
                type: object
                required: [id, active]
                properties:
                  id:
                    type: integer
                  active:
                    type: boolean
                  name:
                    type: string
                  tags:
                    type: array
                  profile:
                    type: object`,
        },
      });

      expect(
        await screen.findByRole("heading", { name: "Generated Mock API" }),
      ).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Mock" }));

      const endpointCard = screen
        .getByLabelText("cURL GET /health")
        .closest("article") as HTMLElement;

      await user.click(
        within(endpointCard).getByRole("button", { name: "Generate Mock" }),
      );

      expect(within(endpointCard).getByRole("status")).toHaveTextContent(
        "Generated mock response",
      );
      expect(
        within(endpointCard).getByLabelText("Response body"),
      ).toHaveTextContent('"id": 0');
      expect(
        within(endpointCard).getByLabelText("Response body"),
      ).toHaveTextContent('"active": false');
      expect(
        within(endpointCard).getByLabelText("Response body"),
      ).toHaveTextContent('"tags": []');
      expect(
        within(endpointCard).getByLabelText("Response contract"),
      ).toHaveTextContent("All 3 checked rules passed.");
      expect(within(endpointCard).getByRole("status")).toHaveTextContent(
        "X-RateLimit-Remaining: 99",
      );
      expect(within(endpointCard).getByRole("status")).toHaveTextContent(
        "X-Request-Id: request-42",
      );
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/try-it-out",
        expect.anything(),
      );
      expect(
        window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY),
      ).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("simulates cancellable mock response latency without network traffic", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ body: "unexpected live response" }));

    try {
      render(<SwaggerWorkspace />);

      await user.click(screen.getByRole("button", { name: "Mock" }));
      await user.selectOptions(screen.getByLabelText("Mock latency"), "500");

      expect(window.localStorage.getItem(MOCK_RESPONSE_DELAY_STORAGE_KEY)).toBe(
        "500",
      );

      const endpointCard = screen
        .getByLabelText("cURL GET /users/{id}")
        .closest("article") as HTMLElement;
      const pathInput =
        within(endpointCard).getByLabelText("Path parameter id");

      await user.type(pathInput, "42");
      await user.click(
        within(endpointCard).getByRole("button", { name: "Generate Mock" }),
      );

      expect(
        within(endpointCard).getByRole("button", { name: "Executing..." }),
      ).toBeDisabled();
      expect(
        within(endpointCard).getByRole("button", { name: "Cancel request" }),
      ).toBeVisible();

      fireEvent.keyDown(pathInput, { key: "Escape" });

      expect(endpointCard).toHaveTextContent("Request cancelled.");
      expect(
        within(endpointCard).queryByLabelText("Response body"),
      ).not.toBeInTheDocument();

      await user.click(
        within(endpointCard).getByRole("button", { name: "Generate Mock" }),
      );

      expect(
        await within(endpointCard).findByLabelText("Response body"),
      ).toBeVisible();
      expect(within(endpointCard).getByRole("status")).toHaveTextContent(
        "500 ms",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows the substituted target url when the try-it-out request itself fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network error"));

    try {
      render(<SwaggerWorkspace />);

      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        "https://jsonplaceholder.typicode.com/users/42",
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows guest mock execution without saving history", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[0]);

    expect(screen.getByRole("status")).toHaveTextContent("Guest run");
    expect(window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)).toBeNull();
  });

  it("runs the focused endpoint with the primary-modifier Enter shortcut", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        body: '{"id":"42"}',
        durationMs: 18,
        errorDetails: null,
        headers: { "content-type": "application/json" },
        requestSize: 24,
        responseSize: 11,
        status: "200",
        url: "https://jsonplaceholder.typicode.com/users/42",
      }),
    );

    try {
      render(<SwaggerWorkspace />);

      const pathInput = screen.getAllByLabelText("Path parameter id")[0];
      const executeButton = screen.getAllByRole("button", {
        name: "Try It Out",
      })[0];

      fireEvent.change(pathInput, { target: { value: "42" } });

      expect(executeButton).toHaveAttribute(
        "aria-keyshortcuts",
        "Control+Enter Meta+Enter",
      );

      fireEvent.keyDown(pathInput, { ctrlKey: true, key: "Enter" });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const requestPayload = JSON.parse(
        String((fetchMock.mock.calls[0][1] as RequestInit).body),
      );

      expect(requestPayload).toMatchObject({
        method: "GET",
        path: "/users/{id}",
        requestParameters: [{ location: "path", name: "id", value: "42" }],
      });
      expect(await screen.findByRole("status")).toHaveTextContent("Response");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("prevents duplicate requests while an endpoint is executing", async () => {
    let finishRequest: (response: Response) => void = () => {};
    const requestPromise = new Promise<Response>((resolve) => {
      finishRequest = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(requestPromise);

    try {
      render(<SwaggerWorkspace />);
      fireEvent.change(screen.getAllByLabelText("Path parameter id")[0], {
        target: { value: "42" },
      });

      const executeButton = screen.getAllByRole("button", {
        name: "Try It Out",
      })[0];

      fireEvent.click(executeButton);
      fireEvent.click(executeButton);

      expect(executeButton).toBeDisabled();
      expect(executeButton).toHaveTextContent("Executing...");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      finishRequest(
        Response.json({
          body: "{}",
          durationMs: 10,
          errorDetails: null,
          headers: {},
          requestSize: 10,
          responseSize: 2,
          status: "200",
          url: "https://example.com/users/42",
        }),
      );

      await waitFor(() => expect(executeButton).not.toBeDisabled());
      expect(executeButton).toHaveTextContent("Try It Out");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("cancels an in-flight request with Escape without showing or saving a fallback response", async () => {
    const user = userEvent.setup();
    let requestSignal: AbortSignal | null = null;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, init) => {
        const signal = init?.signal as AbortSignal | undefined;
        requestSignal = signal || null;

        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      });

    try {
      render(<SwaggerWorkspace />);
      const pathInput = screen.getAllByLabelText("Path parameter id")[0];

      await user.type(pathInput, "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );

      expect((requestSignal as AbortSignal | null)?.aborted).toBe(false);
      expect(
        screen.getByRole("button", { name: "Cancel request" }),
      ).toHaveAttribute("aria-keyshortcuts", "Escape");

      fireEvent.keyDown(pathInput, { key: "Escape" });

      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: "Try It Out" })[0],
        ).toBeEnabled(),
      );
      expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
      expect(screen.getByText("Request cancelled.")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Download response" }),
      ).not.toBeInTheDocument();
      expect(
        window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY),
      ).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("opens an audited operation and clears conflicting endpoint filters", async () => {
    const user = userEvent.setup();
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    const scrollIntoView = vi.fn();

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    window.localStorage.setItem(
      ENDPOINT_COLLAPSE_STORAGE_KEY,
      JSON.stringify(["GET /users/{id}"]),
    );

    try {
      render(<SwaggerWorkspace />);

      await screen.findByRole("button", {
        name: "Show details for GET /users/{id}",
      });

      const auditPanel = screen
        .getByRole("heading", { name: "API quality audit" })
        .closest("section");

      expect(auditPanel).not.toBeNull();
      expect(
        within(auditPanel as HTMLElement).getByText(/quality score/),
      ).toBeVisible();
      await user.click(
        within(auditPanel as HTMLElement).getAllByRole("button", {
          name: "View endpoint",
        })[0],
      );

      expect(
        screen.getByRole("searchbox", {
          name: /Filter endpoints by method/,
        }),
      ).toHaveValue("/users/{id}");
      expect(
        within(
          screen.getByRole("group", {
            name: "Filter endpoints by HTTP method",
          }),
        ).getByRole("button", { name: "GET (1)" }),
      ).toHaveAttribute("aria-pressed", "true");
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(window.location.hash).toBe(
        `#${getEndpointAnchor("GET", "/users/{id}")}`,
      );
      expect(
        screen.getByRole("button", {
          name: "Hide details for GET /users/{id}",
        }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(
        window.localStorage.getItem(ENDPOINT_COLLAPSE_STORAGE_KEY),
      ).toBeNull();
    } finally {
      window.history.replaceState(null, "", previousUrl);

      if (originalScrollIntoView) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollIntoView",
          originalScrollIntoView,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    }
  });

  it("captures a comparison baseline and reports removed operations", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    await user.click(
      screen.getByRole("button", { name: "Set current as baseline" }),
    );

    expect(
      window.localStorage.getItem(SCHEMA_COMPARISON_BASELINE_STORAGE_KEY),
    ).not.toBeNull();

    const editor = screen.getByLabelText("OpenAPI schema editor");
    const schemaWithoutPost = DEFAULT_OPENAPI_SCHEMA.replace(
      /\n    post:[\s\S]*$/,
      "",
    );

    fireEvent.change(editor, { target: { value: schemaWithoutPost } });

    const changePanel = screen
      .getByRole("heading", { name: "API change review" })
      .closest("section") as HTMLElement;

    await waitFor(() =>
      expect(
        within(changePanel).getByRole("button", { name: "Removed (1)" }),
      ).toBeVisible(),
    );
    expect(within(changePanel).getByText("POST /users/{id}")).toBeVisible();
    expect(within(changePanel).getByText("Operation removed.")).toBeVisible();
    expect(editor).toHaveValue(schemaWithoutPost);

    await user.click(
      within(changePanel).getByRole("button", { name: "Clear baseline" }),
    );

    expect(
      within(changePanel).getByText("No comparison baseline"),
    ).toBeVisible();
    expect(
      window.localStorage.getItem(SCHEMA_COMPARISON_BASELINE_STORAGE_KEY),
    ).toBeNull();
    expect(editor).toHaveValue(schemaWithoutPost);
  });
});
