import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { parseOpenApiSchema } from "@/lib/openapi";
import { I18nProvider } from "./i18n-provider";
import { ApiSlicePanel } from "./api-slice-panel";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-download")>()),
  downloadTextFile: vi.fn(),
}));

const result = parseOpenApiSchema(`openapi: 3.1.0
info: { title: Slice API, version: '1' }
paths:
  /items:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Item' }
    delete:
      deprecated: true
      responses: { '204': { description: Deleted } }
components:
  schemas:
    Item: { type: string }
    Unused: { type: number }
webhooks:
  changed:
    post:
      responses: { '204': { description: Accepted } }
`);
if (!result.ok) throw new Error(result.error);
const schema = result.value;

function renderPanel(
  rootSchema = schema.schema,
  visibleEndpoints = schema.endpoints.slice(0, 1),
) {
  return render(
    <ApiSlicePanel
      rootSchema={rootSchema}
      allEndpoints={schema.endpoints}
      visibleEndpoints={visibleEndpoints}
      title={schema.title}
    />,
  );
}

describe("ApiSlicePanel", () => {
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  });

  it("defaults to the current view, previews its contract, and exports either format", async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(
      screen.getByText("Exported operations").nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      screen.getByText("Removed components").nextElementSibling,
    ).toHaveTextContent("1");
    await user.click(
      screen.getByText("Preview OpenAPI slice", { selector: "summary" }),
    );
    const preview = screen.getByRole("textbox", {
      name: "Preview OpenAPI slice",
    }) as HTMLTextAreaElement;
    expect(YAML.parse(preview.value).paths["/items"].delete).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Copy slice" }));
    expect(writeTextToClipboard).toHaveBeenCalledWith(preview.value);
    expect(screen.getByRole("status")).toHaveTextContent(
      "OpenAPI slice copied.",
    );
    await user.selectOptions(screen.getByLabelText("Slice format"), "json");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download slice" }));
    expect(downloadTextFile).toHaveBeenCalledWith(
      preview.value,
      "slice-api-slice.json",
      "application/json",
    );
    expect(JSON.parse(preview.value).openapi).toBe("3.1.0");
    expect(screen.getByRole("status")).toHaveTextContent(
      "OpenAPI slice download started.",
    );
  });

  it("supports all operations, deprecated filtering, component retention, and webhooks", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.selectOptions(screen.getByLabelText("Slice scope"), "all");
    expect(
      screen.getByText("Exported operations").nextElementSibling,
    ).toHaveTextContent("2");
    await user.click(screen.getByLabelText("Include deprecated operations"));
    expect(
      screen.getByText("Exported operations").nextElementSibling,
    ).toHaveTextContent("1");
    await user.click(screen.getByLabelText("Remove unused components"));
    expect(
      screen.getByText("Retained components").nextElementSibling,
    ).toHaveTextContent("2");
    await user.click(screen.getByLabelText("Include all top-level webhooks"));
    await user.click(screen.getByRole("button", { name: "Copy slice" }));
    expect(
      YAML.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]).webhooks,
    ).toEqual(schema.schema.webhooks);
  });

  it("reacts to endpoint filter changes and disables export for an empty view", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPanel();
    await user.click(screen.getByRole("button", { name: "Copy slice" }));
    rerender(
      <ApiSlicePanel
        rootSchema={schema.schema}
        allEndpoints={schema.endpoints}
        visibleEndpoints={[]}
        title={schema.title}
      />,
    );
    expect(screen.getByRole("button", { name: "Copy slice" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download slice" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No operations selected.",
    );
    expect(screen.queryByText("OpenAPI slice copied.")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Slice scope"), "all");
    expect(screen.getByRole("button", { name: "Copy slice" })).toBeEnabled();
  });

  it("blocks missing local references and shows actionable diagnostics", () => {
    renderPanel({ ...schema.schema, components: {} });
    expect(
      screen.getByText(/A local reference or security definition is missing/),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Resolve missing local references",
    );
    expect(
      screen.getByRole("button", { name: "Download slice" }),
    ).toBeDisabled();
  });

  it("shows the actual UTF-8 download size and updates the filename and size with the format", async () => {
    const user = userEvent.setup();
    renderPanel({ ...schema.schema, "x-note": "Привет 🌍" });
    const preview = screen.getByLabelText(
      "Preview OpenAPI slice",
    ) as HTMLTextAreaElement;
    const yamlSize = new TextEncoder().encode(preview.value).byteLength;
    expect(yamlSize).toBeGreaterThan(preview.value.length);
    expect(
      screen.getByText(`Export file: slice-api-slice.yaml (${yamlSize} B)`),
    ).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Slice format"), "json");
    const jsonSize = new TextEncoder().encode(preview.value).byteLength;
    expect(
      screen.getByText(`Export file: slice-api-slice.json (${jsonSize} B)`),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Download slice" }));
    expect(downloadTextFile).toHaveBeenCalledWith(
      preview.value,
      "slice-api-slice.json",
      "application/json",
    );
  });

  it("reports serialization failures without claiming the selection is empty and recovers after correction", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const { rerender } = renderPanel({ ...schema.schema, "x-cycle": cyclic });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This document cannot be serialized.",
    );
    expect(
      screen.queryByText(/No operations selected/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Preview OpenAPI slice"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Export file:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy slice" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download slice" }),
    ).toBeDisabled();
    rerender(
      <ApiSlicePanel
        rootSchema={schema.schema}
        allEndpoints={schema.endpoints}
        visibleEndpoints={schema.endpoints}
        title={schema.title}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Preview OpenAPI slice")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download slice" }),
    ).toBeEnabled();
  });

  it("allows external references with a review note", () => {
    renderPanel({
      ...schema.schema,
      components: { schemas: { Item: { $ref: "./item.yaml" } } },
    });
    expect(
      screen.getByText(/This reference needs an external document/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download slice" }),
    ).toBeEnabled();
  });

  it("reports clipboard and download failures and recovers on retry", async () => {
    const user = userEvent.setup();
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Copy slice" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not copy the slice.",
    );
    await user.click(screen.getByRole("button", { name: "Download slice" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not download the slice.",
    );
    await user.click(screen.getByRole("button", { name: "Download slice" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "OpenAPI slice download started.",
    );
  });

  it("provides Russian controls and export feedback", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("rsswagger-language", "ru");
    render(
      <I18nProvider initialLanguage="ru">
        <ApiSlicePanel
          rootSchema={schema.schema}
          allEndpoints={schema.endpoints}
          visibleEndpoints={schema.endpoints}
          title={schema.title}
        />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Экспорт части API" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Копировать часть API" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Часть OpenAPI скопирована.",
    );
  });
});
