import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiComposerPanel } from "./api-composer-panel";
import { setAppLanguage } from "./i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_COMPOSER_SOURCE_BYTES,
  parseComposerProject,
} from "@/lib/api-composer";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const source = (name = "Catalog", paths = ["/items"]) =>
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: name, version: "1.0" },
    servers: [{ url: "https://upstream.example.com" }],
    paths: Object.fromEntries(
      paths.map((path) => [
        path,
        {
          get: {
            summary: `Read ${path}`,
            responses: { "200": { description: "OK" } },
          },
        },
      ]),
    ),
  });
function file(text = source(), name = "service.json") {
  const f = new File([text], name, { type: "application/json" });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
}
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function setup() {
  const user = userEvent.setup();
  let editor = source("Editor");
  const apply = vi.fn((text: string) => {
    editor = text;
  });
  const view = render(
    <ApiComposerPanel getSchemaText={() => editor} onApply={apply} />,
  );
  await user.click(screen.getByText("API gateway composer"));
  await screen.findByLabelText("Gateway server URL");
  change("Gateway server URL", "https://gateway.example.com");
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
  texts = [source()],
) {
  await user.upload(
    screen.getByLabelText("Add service definitions (JSON/YAML)"),
    texts.map((text, i) => file(text, `service${i}.json`)),
  );
  await screen.findByLabelText("Service display name");
}
beforeEach(() => {
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("ApiComposerPanel", () => {
  it("composes multiple services, exports all artifacts, and applies/undoes without automatic requests or saves", async () => {
    const { user, apply, getEditor } = await setup();
    const network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await upload(user, [source(), source("Billing", ["/invoices"])]);
    expect(apply).not.toHaveBeenCalled();
    change("Service namespace", "billing");
    change("Gateway route prefix", "/billing");
    await user.click(button("Preview gateway composition"));
    expect(
      screen.getByText("Composition · 2 services · 2 routes · 0 components"),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Composed API format"),
      "json",
    );
    await user.click(button("Copy composed OpenAPI"));
    const text = vi.mocked(writeTextToClipboard).mock.calls[0][0],
      doc = JSON.parse(text);
    expect(Object.keys(doc.paths)).toEqual([
      "/service-1/items",
      "/billing/invoices",
    ]);
    expect(doc.servers).toEqual([{ url: "https://gateway.example.com" }]);
    await user.click(button("Download composed OpenAPI"));
    expect(downloadTextFile).toHaveBeenCalledWith(
      text,
      "gateway-document.json",
      "application/json",
    );
    await user.click(button("Download routing inventory and diagnostics"));
    expect(
      JSON.parse(vi.mocked(downloadTextFile).mock.calls[1][0]).routes[1],
    ).toMatchObject({ namespace: "billing", sourcePath: "/invoices" });
    await user.click(button("Download composition project"));
    expect(
      parseComposerProject(vi.mocked(downloadTextFile).mock.calls[2][0])
        .services[1].namespace,
    ).toBe("billing");
    await user.click(button("Apply composed API to editor"));
    expect(getEditor()).toBe(text);
    await user.click(button("Undo composition application"));
    expect(getEditor()).toBe(source("Editor"));
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("rejects stale applications and undo after manual editor edits", async () => {
    const { user, edit, apply, getEditor } = await setup();
    await upload(user);
    await user.click(button("Preview gateway composition"));
    edit("manual changes");
    await user.click(button("Apply composed API to editor"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "editor changed since preview",
    );
    expect(apply).not.toHaveBeenCalled();
    await user.click(button("Preview gateway composition"));
    await user.click(button("Apply composed API to editor"));
    const applied = getEditor();
    edit("later changes");
    await user.click(button("Undo composition application"));
    expect(screen.getByRole("alert")).toHaveTextContent("preserve those edits");
    expect(getEditor()).toBe("later changes");
    edit(applied);
    await user.click(button("Undo composition application"));
    expect(getEditor()).toBe("manual changes");
  });
  it("makes conflicts reviewable and recovers by changing prefixes or excluding services", async () => {
    const { user } = await setup();
    await upload(user, [source(), source("Second")]);
    change("Gateway route prefix", "/service-1");
    await user.click(button("Preview gateway composition"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Composition is incomplete",
    );
    expect(screen.getByText(/gateway path overlaps/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply composed API to editor" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Include Second (service-2)"));
    expect(
      screen.queryByLabelText("Gateway composition result"),
    ).not.toBeInTheDocument();
    await user.click(button("Preview gateway composition"));
    expect(button("Copy composed OpenAPI")).toBeEnabled();
  });
  it("keeps pending source edits across service selection and requires validation before export", async () => {
    const { user } = await setup();
    await upload(user, [source(), source("Billing")]);
    await user.click(screen.getByText("Edit this service definition"));
    change("Selected service source", "openapi: [");
    expect(button("Preview gateway composition")).toBeDisabled();
    expect(button("Download composition project")).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: /Catalog.*service-1/ }),
    );
    await user.click(
      screen.getByRole("button", { name: /Billing.*service-2/ }),
    );
    expect(screen.getByLabelText("Selected service source")).toHaveValue(
      "openapi: [",
    );
    await user.click(button("Validate and use source edits"));
    expect(screen.getByRole("alert")).toHaveTextContent("valid OpenAPI");
    change("Selected service source", source("Updated", ["/updated"]));
    await user.click(button("Validate and use source edits"));
    await user.click(button("Preview gateway composition"));
    expect(screen.getByText("GET /service-2/updated")).toBeInTheDocument();
    change("Selected service source", "bad");
    await user.click(button("Discard pending source edits"));
    expect(screen.getByLabelText("Selected service source")).toHaveValue(
      source("Updated", ["/updated"]),
    );
  });
  it("captures and pastes sources, reorders/removes services, and restores a reusable project", async () => {
    const { user } = await setup();
    await user.click(button("Add current editor as a service"));
    await user.click(screen.getByText("Paste a service definition"));
    change("Service definition to add", source("Pasted"));
    await user.click(button("Add pasted service"));
    await user.click(button("Move service earlier"));
    await user.click(button("Download composition project"));
    const saved = vi.mocked(downloadTextFile).mock.calls[0][0];
    expect(parseComposerProject(saved).services[0].name).toBe("Pasted");
    await user.click(button("Remove service from composition"));
    expect(screen.getByText("Services: 1/8")).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText(
        "Restore composition project (replaces current project)",
      ),
      file(saved),
    );
    expect(screen.getByText("Services: 2/8")).toBeInTheDocument();
    expect(screen.getByLabelText("Service display name")).toHaveValue("Pasted");
  });
  it("preserves work when any file in a batch or project import fails", async () => {
    const { user } = await setup();
    await upload(user);
    await user.upload(
      screen.getByLabelText("Add service definitions (JSON/YAML)"),
      [file(source("Good"), "good.json"), file("{}", "bad.json")],
    );
    expect(screen.getByRole("alert")).toHaveTextContent("valid OpenAPI");
    expect(screen.getByText("Services: 1/8")).toBeInTheDocument();
    const oversized = file();
    Object.defineProperty(oversized, "size", {
      value: MAX_COMPOSER_SOURCE_BYTES + 1,
    });
    await user.upload(
      screen.getByLabelText("Add service definitions (JSON/YAML)"),
      oversized,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("exceeds");
    await user.upload(
      screen.getByLabelText(
        "Restore composition project (replaces current project)",
      ),
      file("{}"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "project or service settings are invalid",
    );
    expect(screen.getByLabelText("Service display name")).toHaveValue(
      "Catalog",
    );
  });
  it("ignores late imports and blocks export while files are being read", async () => {
    const { user } = await setup();
    await upload(user);
    await user.click(button("Download composition project"));
    const saved = vi.mocked(downloadTextFile).mock.calls[0][0];
    await user.click(button("Preview gateway composition"));
    let finish!: (text: string) => void;
    const slow = file();
    Object.defineProperty(slow, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    await user.upload(
      screen.getByLabelText("Add service definitions (JSON/YAML)"),
      slow,
    );
    expect(button("Copy composed OpenAPI")).toBeDisabled();
    expect(button("Apply composed API to editor")).toBeDisabled();
    await user.upload(
      screen.getByLabelText(
        "Restore composition project (replaces current project)",
      ),
      file(saved),
    );
    await act(async () => finish(source("Late")));
    expect(screen.getByText("Services: 1/8")).toBeInTheDocument();
    expect(screen.getByLabelText("Service display name")).toHaveValue(
      "Catalog",
    );
  });
  it("reports export failures and discards stale clipboard feedback", async () => {
    const { user } = await setup();
    await upload(user);
    await user.click(button("Preview gateway composition"));
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download composed OpenAPI"));
    expect(screen.getByRole("alert")).toHaveTextContent("download was blocked");
    vi.mocked(writeTextToClipboard).mockResolvedValue(false);
    await user.click(button("Copy composed OpenAPI"));
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
    await user.click(button("Copy composed OpenAPI"));
    change("Gateway API title", "Changed");
    await act(async () => finish(true));
    expect(screen.queryByText("Composed API copied.")).not.toBeInTheDocument();
  });
  it("searches and paginates composed routes and clears search with Escape", async () => {
    const { user } = await setup();
    await upload(user, [
      source(
        "Large",
        Array.from({ length: 28 }, (_, i) => `/route${i}`),
      ),
    ]);
    await user.click(button("Preview gateway composition"));
    expect(screen.getByText("Page 1/2")).toBeInTheDocument();
    await user.click(button("Next composed routes"));
    expect(screen.getByText("GET /service-1/route27")).toBeInTheDocument();
    change("Search composed routes", "route27 GET");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.keyDown(screen.getByLabelText("Search composed routes"), {
      key: "Escape",
    });
    expect(screen.getByText("Page 1/2")).toBeInTheDocument();
  });
  it("retains services across collapse and offers the complete workflow in Russian", async () => {
    const { user } = await setup();
    await upload(user);
    await user.click(screen.getByText("API gateway composer"));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Gateway server URL"),
      ).not.toBeInTheDocument(),
    );
    act(() => setAppLanguage("ru"));
    await user.click(screen.getByText("Компоновщик API-шлюза"));
    expect(
      await screen.findByLabelText("Отображаемое имя сервиса"),
    ).toHaveValue("Catalog");
    await user.click(button("Предпросмотр компоновки шлюза"));
    expect(
      screen.getByText(
        "Компоновка · сервисов: 1 · маршрутов: 1 · компонентов: 0",
      ),
    ).toBeInTheDocument();
  });
});
