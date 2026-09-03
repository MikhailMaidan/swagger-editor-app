import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadHtmlDocumentationFile,
  previewHtmlDocumentation,
} from "@/lib/html-documentation-export";
import { parseOpenApiSchema } from "@/lib/openapi";
import { extractSchemaModels } from "@/lib/schema-models";
import { HtmlDocumentationPanel } from "./html-documentation-panel";

vi.mock("@/lib/html-documentation-export", () => ({
  downloadHtmlDocumentationFile: vi.fn(),
  previewHtmlDocumentation: vi.fn(),
}));

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info:
  title: Catalog API
  version: 1.0.0
servers:
  - url: https://api.example.com
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  schemas:
    Item:
      type: object
      properties:
        id: { type: integer }
    Internal:
      type: string
paths:
  /items:
    get:
      operationId: listItems
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Items
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Item'
  /legacy:
    get:
      deprecated: true
      responses:
        '204':
          description: Empty`);

if (!parsed.ok) {
  throw new Error(parsed.error);
}

const schema = parsed.value;

function renderPanel() {
  return render(
    <HtmlDocumentationPanel
      allEndpoints={schema.endpoints}
      models={extractSchemaModels(schema.schema)}
      schema={{
        serverUrl: schema.serverUrl,
        title: schema.title,
        version: schema.version,
      }}
      securitySchemes={schema.securitySchemes}
      visibleEndpoints={[schema.endpoints[0]]}
    />,
  );
}

describe("HtmlDocumentationPanel", () => {
  beforeEach(() => {
    vi.mocked(downloadHtmlDocumentationFile).mockReset();
    vi.mocked(downloadHtmlDocumentationFile).mockReturnValue(true);
    vi.mocked(previewHtmlDocumentation).mockReset();
    vi.mocked(previewHtmlDocumentation).mockReturnValue(true);
  });

  it("summarizes the generated document and follows the workspace scope", async () => {
    const user = userEvent.setup();

    renderPanel();

    expect(screen.getByText("Offline API documentation")).toBeVisible();
    expect(
      screen.getByText("2 endpoint sections in one searchable offline file."),
    ).toBeVisible();
    const panel = screen
      .getByRole("heading", { name: "Offline API documentation" })
      .closest("section") as HTMLElement;

    expect(
      within(panel).getByText("Documented endpoints").nextElementSibling,
    ).toHaveTextContent("2");
    expect(
      within(panel).getByText("HTTP methods").nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      within(panel).getByText("Related models").nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      within(panel).getByText("Auth schemes").nextElementSibling,
    ).toHaveTextContent("1");

    await user.click(
      within(panel).getByRole("button", { name: "Current view (1)" }),
    );
    expect(
      within(panel).getByText(
        "1 endpoint sections in one searchable offline file.",
      ),
    ).toBeVisible();
  });

  it("updates document content options and reports excluded deprecated sections", async () => {
    const user = userEvent.setup();

    renderPanel();
    const panel = screen
      .getByRole("heading", { name: "Offline API documentation" })
      .closest("section") as HTMLElement;

    await user.click(
      within(panel).getByLabelText("Include deprecated endpoints"),
    );
    expect(
      within(panel).getByText(
        "1 endpoint sections in one searchable offline file.",
      ),
    ).toBeVisible();
    expect(
      within(panel).getByText("Excluded deprecated endpoint sections: 1."),
    ).toBeVisible();

    await user.click(
      within(panel).getByLabelText("Include related schema models"),
    );
    expect(
      within(panel).getByText("Related models").nextElementSibling,
    ).toHaveTextContent("0");
  });

  it("opens and downloads generated documentation with action feedback", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.click(screen.getByRole("button", { name: "Open preview" }));
    expect(previewHtmlDocumentation).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Catalog API"),
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Documentation opened in a new tab.",
    );

    await user.click(screen.getByRole("button", { name: "Download HTML" }));
    expect(downloadHtmlDocumentationFile).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('id="docs-search"'),
      }),
      { title: "Catalog API" },
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Documentation download started.",
    );
  });

  it("shows an alert when the browser blocks a preview", async () => {
    vi.mocked(previewHtmlDocumentation).mockReturnValue(false);
    const user = userEvent.setup();

    renderPanel();
    await user.click(screen.getByRole("button", { name: "Open preview" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not open the preview. Allow popups and try again.",
    );
  });
});
