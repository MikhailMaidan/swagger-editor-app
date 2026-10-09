import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataRedactionPanel } from "./data-redaction-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_REDACTION_SOURCE_BYTES,
  parseRedactionProject,
  parseRedactionRules,
} from "@/lib/data-redaction";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const api = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Private examples", version: "1" },
  paths: {
    "/items": {
      get: {
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    password: { type: "string" },
                    email: { type: "string" },
                  },
                },
                example: {
                  password: "original-secret",
                  email: "ada@example.org",
                },
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
const preview = () =>
  screen.getByLabelText("Redacted output preview (first 16,000 characters)")
    .textContent!;
const file = (text: string, name = "artifact.json") => {
  const f = new File([text], name, { type: "application/json" });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
};
async function setup() {
  const user = userEvent.setup();
  let editor = api;
  const apply = vi.fn((text: string) => {
    editor = text;
  });
  const view = render(
    <DataRedactionPanel getSchemaText={() => editor} onApply={apply} />,
  );
  await user.click(screen.getByText("Data redaction studio"));
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
async function capture(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Add current editor for redaction"));
}
async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByText("Paste an artifact"));
  change("Artifact text to add", text);
  await user.click(button("Add pasted artifact"));
}

describe("DataRedactionPanel", () => {
  it("previews/exports redacted data, projects, rules, bundles and reports without automatic network, storage, or editor changes", async () => {
    const { user, apply, editor } = await setup();
    const network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await capture(user);
    await user.click(button("Preview redacted artifacts"));
    expect(preview()).not.toContain("original-secret");
    expect(preview()).toContain("ada@example.org");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Include common personal-data fields",
      }),
    );
    change("Automatic replacement strategy", "pseudonymize");
    await user.click(button("Preview redacted artifacts"));
    expect(preview()).not.toContain("ada@example.org");
    expect(preview()).toContain("@example.invalid");
    await user.click(button("Download selected redacted artifact"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).not.toContain(
      "original-secret",
    );
    await user.click(button("Download redaction audit report"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).not.toContain(
      "ada@example.org",
    );
    await user.click(button("Download bundle of redacted outputs"));
    expect(
      JSON.parse(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).files,
    ).toHaveLength(1);
    await user.click(button("Download reusable rule set"));
    const rules = vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
    expect(rules).not.toContain("original-secret");
    expect(parseRedactionRules(rules).options.action).toBe("pseudonymize");
    await user.click(button("Download project with original inputs"));
    expect(
      parseRedactionProject(vi.mocked(downloadTextFile).mock.calls.at(-1)![0])
        .sources[0].text,
    ).toContain("original-secret");
    expect(apply).not.toHaveBeenCalled();
    expect(editor()).toBe(api);
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("guards application and undo against later editor changes", async () => {
    const { user, edit, editor } = await setup();
    await capture(user);
    await user.click(button("Preview redacted artifacts"));
    edit(api + "\n");
    await user.click(button("Apply selected redacted API to editor"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "changed since preview",
    );
    expect(editor()).toBe(api + "\n");
    await user.click(button("Preview redacted artifacts"));
    await user.click(button("Apply selected redacted API to editor"));
    const applied = editor();
    expect(applied).not.toContain("original-secret");
    edit("later edits");
    await user.click(button("Undo redacted API application"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "changed after application",
    );
    expect(editor()).toBe("later edits");
    edit(applied);
    await user.click(button("Undo redacted API application"));
    expect(editor()).toBe(api + "\n");
  });
  it("preserves source drafts across selection, blocks pending exports, and validates/discards edits", async () => {
    const { user } = await setup();
    await capture(user);
    await user.click(
      screen.getByText("Edit original artifact inside this project"),
    );
    change("Selected original artifact", "openapi: [");
    expect(button("Preview redacted artifacts")).toBeDisabled();
    expect(button("Download project with original inputs")).toBeDisabled();
    await user.click(button("Validate and save artifact edits"));
    expect(screen.getByRole("alert")).toHaveTextContent("valid JSON");
    await paste(user, '{"token":"json-secret"}');
    change("Artifact to inspect", "source-1");
    expect(screen.getByLabelText("Selected original artifact")).toHaveValue(
      "openapi: [",
    );
    await user.click(button("Discard artifact edits"));
    expect(button("Preview redacted artifacts")).toBeEnabled();
    change(
      "Selected original artifact",
      api.replace("original-secret", "new-secret"),
    );
    await user.click(button("Validate and save artifact edits"));
    await user.click(button("Preview redacted artifacts"));
    expect(preview()).not.toContain("new-secret");
    change("Artifact to inspect", "source-2");
    expect(preview()).not.toContain("json-secret");
  });
  it("creates, prioritizes, and removes custom rules with guarded JSON replacements", async () => {
    const { user } = await setup();
    await paste(user, '{"privateNote":"original-note"}');
    await user.click(button("Add custom redaction rule"));
    change("Rule action", "replace");
    change("Custom replacement (JSON value)", "bad JSON");
    expect(button("Preview redacted artifacts")).toBeDisabled();
    await user.click(button("Validate and save replacement"));
    expect(screen.getByRole("alert")).toHaveTextContent("valid JSON");
    change("Custom replacement (JSON value)", '"public-note"');
    await user.click(button("Validate and save replacement"));
    await user.click(button("Preview redacted artifacts"));
    expect(preview()).toContain("public-note");
    await user.click(button("Add custom redaction rule"));
    change("Rule action", "remove");
    await user.click(button("Move rule earlier"));
    await user.click(button("Preview redacted artifacts"));
    expect(JSON.parse(preview())).toEqual({});
    await user.click(button("Remove rule"));
    await user.click(button("Preview redacted artifacts"));
    expect(preview()).toContain("public-note");
    change("Custom replacement (JSON value)", "bad pending");
    await user.click(button("Remove rule"));
    await user.click(button("Add custom redaction rule"));
    change("Rule action", "replace");
    expect(
      screen.getByLabelText("Custom replacement (JSON value)"),
    ).toHaveValue('"[redacted]"');
  });
  it("imports files atomically and preserves the current preview on failed/oversized imports", async () => {
    const { user } = await setup();
    await capture(user);
    await user.click(button("Preview redacted artifacts"));
    const importLabel = "Add artifacts (OpenAPI, HAR, JSON)";
    await user.upload(screen.getByLabelText(importLabel), [
      file('{"token":"valid"}'),
      file("{", "bad.json"),
    ]);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Artifact to inspect") as HTMLSelectElement)
        .options,
    ).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "Redaction preview and audit" }),
    ).toBeInTheDocument();
    const large = file("{}");
    Object.defineProperty(large, "size", {
      value: MAX_REDACTION_SOURCE_BYTES + 1,
    });
    await user.upload(screen.getByLabelText(importLabel), large);
    expect(await screen.findByRole("alert")).toHaveTextContent("exceeds");
    expect(
      (screen.getByLabelText("Artifact to inspect") as HTMLSelectElement)
        .options,
    ).toHaveLength(1);
    await user.upload(
      screen.getByLabelText(importLabel),
      file('{"token":"new-input"}'),
    );
    await user.click(button("Preview redacted artifacts"));
    expect(preview()).not.toContain("new-input");
  });
  it("restores full projects and imports source-free rules while blocking edits during reads", async () => {
    const { user } = await setup();
    await capture(user);
    await user.click(button("Download project with original inputs"));
    const saved = vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
    await user.click(
      screen.getByText("Edit original artifact inside this project"),
    );
    await user.click(button("Remove artifact from project"));
    let resolve!: (text: string) => void;
    const pending = file(saved);
    Object.defineProperty(pending, "text", {
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText(
        "Restore redaction project (replaces current work)",
      ),
      pending,
    );
    expect(button("Add current editor for redaction")).toBeDisabled();
    expect(button("Add custom redaction rule")).toBeDisabled();
    await act(async () => resolve(saved));
    expect(
      await screen.findByText("Redaction project restored."),
    ).toBeInTheDocument();
    await user.click(button("Download reusable rule set"));
    const rules = JSON.parse(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]);
    rules.options.personal = true;
    await user.upload(
      screen.getByLabelText(
        "Import rule set (replaces rules/options, keeps sources)",
      ),
      file(JSON.stringify(rules)),
    );
    expect(
      await screen.findByText("Rule set imported; current artifacts retained."),
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Artifact to inspect") as HTMLSelectElement)
        .options,
    ).toHaveLength(1);
    await user.click(button("Preview redacted artifacts"));
    expect(preview()).not.toContain("ada@example.org");
    await user.upload(
      screen.getByLabelText(
        "Restore redaction project (replaces current work)",
      ),
      file("{}"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("version 1");
    expect(
      screen.getByRole("region", { name: "Redaction preview and audit" }),
    ).toBeInTheDocument();
  });
  it("blocks invalid OpenAPI output, searches audit findings, and handles failed downloads", async () => {
    const { user } = await setup();
    await capture(user);
    await user.click(button("Add custom redaction rule"));
    change("Rule pointer pattern", "/info");
    change("Rule action", "remove");
    await user.click(button("Preview redacted artifacts"));
    expect(button("Apply selected redacted API to editor")).toBeDisabled();
    expect(button("Download selected redacted artifact")).toBeDisabled();
    expect(button("Download bundle of redacted outputs")).toBeDisabled();
    expect(
      screen.getByText(/custom rules removed required API/),
    ).toBeInTheDocument();
    change("Search redaction findings", "no-such-field");
    expect(
      screen.getByText("No matching redaction findings."),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search redaction findings"), {
      key: "Escape",
    });
    expect(
      within(
        screen.getByRole("list", { name: "Redaction findings" }),
      ).getAllByRole("listitem").length,
    ).toBeGreaterThan(0);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download redaction audit report"));
    expect(screen.getByRole("alert")).toHaveTextContent("could not start");
  });
  it("preserves work through collapse and localizes the studio in Russian", async () => {
    const { user } = await setup();
    await capture(user);
    await user.click(button("Preview redacted artifacts"));
    await user.click(screen.getByText("Data redaction studio"));
    expect(
      screen.queryByLabelText("Artifact to inspect"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByText("Data redaction studio"));
    expect(preview()).not.toContain("original-secret");
    act(() => setAppLanguage("ru"));
    expect(screen.getByText("Студия обезличивания данных")).toBeInTheDocument();
    await user.click(button("Предпросмотр обработанных материалов"));
    expect(
      screen.getByRole("region", { name: "Результат обработки и аудит" }),
    ).toBeInTheDocument();
  });
});
