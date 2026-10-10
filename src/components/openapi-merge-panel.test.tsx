import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenApiMergePanel } from "./openapi-merge-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  emptyMergeProject,
  MAX_MERGE_PROJECT_BYTES,
  parseMergeProject,
  serializeMergeProject,
} from "@/lib/openapi-merge";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const api = () => ({
  openapi: "3.1.0",
  info: { title: "Shop", version: "1" },
  paths: {
    "/items": {
      get: { summary: "List", responses: { "200": { description: "OK" } } },
    },
  },
});
const original = JSON.stringify(api());
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const file = (text: string, name = "api.json") => {
  const f = new File([text], name, { type: "application/json" });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
};
async function setup() {
  const user = userEvent.setup();
  let editor = original;
  const apply = vi.fn((text: string) => {
    editor = text;
  });
  const view = render(
    <OpenApiMergePanel getSchemaText={() => editor} onApply={apply} />,
  );
  await user.click(screen.getByText("OpenAPI three-way merge studio"));
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
function versions(conflict = true) {
  const base = api(),
    ours = structuredClone(base),
    theirs = structuredClone(base);
  ours.info.title = "Our title";
  if (conflict) theirs.info.title = "Their title";
  else theirs.info.version = "2";
  return { base, ours, theirs };
}
function inputs(v = versions()) {
  change("Base source (JSON/YAML)", JSON.stringify(v.base));
  change("Ours source (JSON/YAML)", JSON.stringify(v.ours));
  change("Theirs source (JSON/YAML)", JSON.stringify(v.theirs));
}
async function preview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Analyse and preview three-way merge"));
}
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];

describe("OpenApiMergePanel", () => {
  it("merges, exports and applies independent changes with undo, without automatic network or storage writes", async () => {
    const { user, apply, editor } = await setup(),
      network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    inputs(versions(false));
    await preview(user);
    expect(
      screen.getByText(
        "All structural conflicts resolved; merged API is ready for review.",
      ),
    ).toBeInTheDocument();
    await user.click(button("Download merged OpenAPI"));
    expect(JSON.parse(exported()).info).toEqual({
      title: "Our title",
      version: "2",
    });
    expect(apply).not.toHaveBeenCalled();
    expect(editor()).toBe(original);
    change("Merged API output format", "yaml");
    await user.click(button("Download merged OpenAPI"));
    expect(exported()).toContain("openapi: 3.1.0");
    await user.click(button("Download merge decision JSON report"));
    expect(JSON.parse(exported()).ready).toBe(true);
    await user.click(button("Download merge decision Markdown report"));
    expect(exported()).toContain("Conflicts resolved: 0/0");
    await user.click(button("Download merge project with sources"));
    expect(parseMergeProject(exported()).project.inputs.ours).toContain(
      "Our title",
    );
    await user.click(button("Apply merged OpenAPI to editor"));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(editor()).toContain("title: Our title");
    await user.click(button("Undo last merge application"));
    expect(editor()).toBe(original);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("blocks unresolved output, compares each version, and applies an explicit conflict resolution", async () => {
    const { user } = await setup();
    inputs();
    await preview(user);
    expect(button("Download merged OpenAPI")).toBeDisabled();
    expect(button("Apply merged OpenAPI to editor")).toBeDisabled();
    expect(
      screen.getByLabelText("Base conflict value (first 16,000 characters)"),
    ).toHaveTextContent('"Shop"');
    expect(
      screen.getByLabelText("Ours conflict value (first 16,000 characters)"),
    ).toHaveTextContent('"Our title"');
    expect(
      screen.getByLabelText("Theirs conflict value (first 16,000 characters)"),
    ).toHaveTextContent('"Their title"');
    await user.click(button("Choose Theirs value"));
    expect(
      screen.getByText(/Resolutions changed or a project was restored/),
    ).toBeInTheDocument();
    await preview(user);
    await user.click(button("Download merged OpenAPI"));
    expect(JSON.parse(exported()).info.title).toBe("Their title");
  });
  it("validates custom values, clears edited custom decisions, and refuses invalid resulting APIs", async () => {
    const { user } = await setup();
    inputs();
    await preview(user);
    change("Custom conflict value (JSON)", '"Agreed title"');
    await user.click(button("Validate and use custom JSON"));
    await preview(user);
    await user.click(button("Download merged OpenAPI"));
    expect(JSON.parse(exported()).info.title).toBe("Agreed title");
    change("Custom conflict value (JSON)", "invalid");
    expect(screen.getByText(/Conflicts resolved: 0\/1/)).toBeInTheDocument();
    await user.click(button("Validate and use custom JSON"));
    expect(screen.getByRole("alert")).toHaveTextContent("Use valid JSON");
    change("Custom conflict value (JSON)", "null");
    await user.click(button("Validate and use custom JSON"));
    await preview(user);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "not accepted by the OpenAPI parser",
    );
    expect(button("Apply merged OpenAPI to editor")).toBeDisabled();
    change("Custom conflict value (JSON)", '"Fixed"');
    await user.click(button("Validate and use custom JSON"));
    await preview(user);
    expect(button("Apply merged OpenAPI to editor")).toBeEnabled();
  });
  it("guards application and undo against later editor changes", async () => {
    const { user, apply, editor, edit } = await setup();
    inputs(versions(false));
    await preview(user);
    edit("later edits");
    await user.click(button("Apply merged OpenAPI to editor"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "editor changed after preview",
    );
    expect(apply).not.toHaveBeenCalled();
    await preview(user);
    await user.click(button("Apply merged OpenAPI to editor"));
    const applied = editor();
    edit("edits after applying");
    await user.click(button("Undo last merge application"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "overwrite later edits",
    );
    expect(editor()).toBe("edits after applying");
    edit(applied);
    await user.click(button("Undo last merge application"));
    expect(editor()).toBe("later edits");
  });
  it("clears decisions when sources or array strategy change and keeps source data on failed imports", async () => {
    const { user } = await setup();
    inputs();
    await preview(user);
    await user.click(button("Choose Ours value"));
    change(
      "Ours source (JSON/YAML)",
      JSON.stringify({ ...versions().ours, "x-new": true }),
    );
    await preview(user);
    expect(button("Apply merged OpenAPI to editor")).toBeDisabled();
    await user.click(button("Choose Ours value"));
    await user.click(
      screen.getByLabelText("Merge supported OpenAPI arrays by identity"),
    );
    await preview(user);
    expect(button("Apply merged OpenAPI to editor")).toBeDisabled();
    const before = (
      screen.getByLabelText("Ours source (JSON/YAML)") as HTMLTextAreaElement
    ).value;
    await user.upload(
      screen.getByLabelText("Import Ours OpenAPI (JSON/YAML)"),
      file("openapi: [", "bad.yaml"),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Check the indicated source",
      ),
    );
    expect(screen.getByLabelText("Ours source (JSON/YAML)")).toHaveValue(
      before,
    );
  });
  it("captures each editor version and imports a valid replacement", async () => {
    const { user, edit } = await setup();
    await user.click(button("Use editor as Base"));
    edit(JSON.stringify(versions().ours));
    await user.click(button("Use editor as Ours"));
    await user.upload(
      screen.getByLabelText("Import Theirs OpenAPI (JSON/YAML)"),
      file(JSON.stringify(versions().theirs)),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Theirs source (JSON/YAML)")).toHaveValue(
        JSON.stringify(versions().theirs),
      ),
    );
    await preview(user);
    expect(screen.getByText(/Conflicts resolved: 0\/1/)).toBeInTheDocument();
    edit("openapi: [");
    const before = (
      screen.getByLabelText("Base source (JSON/YAML)") as HTMLTextAreaElement
    ).value;
    await user.click(button("Use editor as Base"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Base source (JSON/YAML)")).toHaveValue(
      before,
    );
  });
  it("restores projects and requires a fresh preview before applying their resolved output", async () => {
    const { user } = await setup(),
      v = versions();
    const project = {
      ...emptyMergeProject(),
      name: "Saved merge",
      inputs: {
        base: JSON.stringify(v.base),
        ours: JSON.stringify(v.ours),
        theirs: JSON.stringify(v.theirs),
      },
      resolutions: [{ id: "/info/title", choice: "theirs" as const }],
    };
    const raw = JSON.parse(serializeMergeProject(project));
    raw.document = { forged: true };
    raw.ready = true;
    await user.upload(
      screen.getByLabelText("Restore three-way merge project (JSON)"),
      file(JSON.stringify(raw), "project.json"),
    );
    await screen.findByText(
      "Merge project restored and decisions recomputed. Preview again before applying.",
    );
    expect(screen.getByLabelText("Merge project name")).toHaveValue(
      "Saved merge",
    );
    expect(
      screen.queryByRole("button", { name: "Apply merged OpenAPI to editor" }),
    ).not.toBeInTheDocument();
    await preview(user);
    await user.click(button("Download merged OpenAPI"));
    expect(JSON.parse(exported()).info.title).toBe("Their title");
    await user.upload(
      screen.getByLabelText("Restore three-way merge project (JSON)"),
      file("{}"),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("valid version 1"),
    );
    expect(screen.getByLabelText("Merge project name")).toHaveValue(
      "Saved merge",
    );
  });
  it("searches, filters, paginates and bulk-resolves only remaining conflicts", async () => {
    const { user } = await setup();
    const base = {
        ...api(),
        "x-fields": Object.fromEntries(
          Array.from({ length: 21 }, (_, i) => [`p${i}`, 0]),
        ),
      },
      ours = {
        ...base,
        "x-fields": Object.fromEntries(
          Array.from({ length: 21 }, (_, i) => [`p${i}`, 1]),
        ),
      },
      theirs = {
        ...base,
        "x-fields": Object.fromEntries(
          Array.from({ length: 21 }, (_, i) => [`p${i}`, 2]),
        ),
      };
    inputs({ base, ours, theirs });
    await preview(user);
    expect(
      screen.queryByRole("button", { name: /^\/x-fields\/p20 ·/ }),
    ).not.toBeInTheDocument();
    await user.click(button("Next merge conflicts"));
    expect(
      screen.getByRole("button", { name: /^\/x-fields\/p20 ·/ }),
    ).toBeInTheDocument();
    change("Search merge conflicts", "p0");
    await user.click(button("Choose Ours value"));
    change("Filter conflict resolution", "unresolved");
    expect(screen.getByText("No matching conflicts.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Search merge conflicts"));
    await user.keyboard("{Escape}");
    await user.click(button("Use Theirs for remaining conflicts"));
    await preview(user);
    await user.click(button("Download merged OpenAPI"));
    const merged = JSON.parse(exported());
    expect(merged["x-fields"].p0).toBe(1);
    expect(merged["x-fields"].p20).toBe(2);
    await user.click(button("Clear all conflict resolutions"));
    expect(screen.getByText(/Conflicts resolved: 0\/21/)).toBeInTheDocument();
  });
  it("keeps array order choices separate and disables custom order JSON", async () => {
    const { user } = await setup();
    const base = { ...api(), servers: [{ url: "https://base.test" }] },
      ours = {
        ...base,
        servers: [{ url: "https://ours.test" }, ...base.servers],
      },
      theirs = {
        ...base,
        servers: [{ url: "https://theirs.test" }, ...base.servers],
      };
    inputs({ base, ours, theirs });
    await preview(user);
    expect(
      screen.getByLabelText("Custom conflict value (JSON)"),
    ).toBeDisabled();
    expect(button("Validate and use custom JSON")).toBeDisabled();
    await user.click(button("Choose Theirs value"));
    await preview(user);
    await user.click(button("Download merged OpenAPI"));
    expect(JSON.parse(exported()).servers[0].url).toBe("https://theirs.test");
  });
  it("preserves panel state across closing and exposes broken-reference advisory review", async () => {
    const { user } = await setup();
    const v = versions(false) as {
      base: Record<string, unknown>;
      ours: Record<string, unknown>;
      theirs: Record<string, unknown>;
    };
    v.theirs.components = {
      schemas: { Missing: { $ref: "#/components/schemas/Absent" } },
    };
    change("Base source (JSON/YAML)", JSON.stringify(v.base));
    change("Ours source (JSON/YAML)", JSON.stringify(v.ours));
    change("Theirs source (JSON/YAML)", JSON.stringify(v.theirs));
    await preview(user);
    expect(screen.getByText(/broken references: 1/)).toBeInTheDocument();
    expect(button("Apply merged OpenAPI to editor")).toBeEnabled();
    await user.click(screen.getByText("OpenAPI three-way merge studio"));
    await user.click(screen.getByText("OpenAPI three-way merge studio"));
    expect(screen.getByText(/broken references: 1/)).toBeInTheDocument();
  });
  it("disables edits during file reading, bounds file sizes and reports download failures", async () => {
    const { user } = await setup();
    inputs(versions(false));
    let resolve!: (value: string) => void;
    const f = file("");
    Object.defineProperty(f, "text", {
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText("Import Ours OpenAPI (JSON/YAML)"),
      f,
    );
    expect(screen.getByText("Reading merge file…")).toBeInTheDocument();
    expect(screen.getByLabelText("Base source (JSON/YAML)")).toBeDisabled();
    await act(async () => resolve(JSON.stringify(versions(false).ours)));
    expect(screen.getByLabelText("Base source (JSON/YAML)")).toBeEnabled();
    const large = file("{}");
    Object.defineProperty(large, "size", {
      value: MAX_MERGE_PROJECT_BYTES + 1,
    });
    await user.upload(
      screen.getByLabelText("Restore three-way merge project (JSON)"),
      large,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "exceeds merge limits",
      ),
    );
    await preview(user);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download merged OpenAPI"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "download could not start",
    );
  });
  it("localizes the merge studio in Russian", async () => {
    await setup();
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Студия трёхстороннего слияния OpenAPI"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Базовый исходник (JSON/YAML)"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Analyse and preview three-way merge"),
    ).not.toBeInTheDocument();
  });
});
