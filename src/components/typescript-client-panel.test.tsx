import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToClipboard } from "@/lib/clipboard";
import { parseOpenApiSchema } from "@/lib/openapi";
import { extractSchemaModels } from "@/lib/schema-models";
import { downloadTypeScriptClientFile } from "@/lib/typescript-client-export";
import { TypeScriptClientPanel } from "./typescript-client-panel";

vi.mock("@/lib/clipboard", () => ({
  writeTextToClipboard: vi.fn(),
}));

vi.mock("@/lib/typescript-client-export", () => ({
  downloadTypeScriptClientFile: vi.fn(),
}));

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info:
  title: Catalog API
  version: 1.0.0
servers:
  - url: https://api.example.com
components:
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
    <TypeScriptClientPanel
      allEndpoints={schema.endpoints}
      models={extractSchemaModels(schema.schema)}
      rootSchema={schema.schema}
      schema={schema}
      visibleEndpoints={[schema.endpoints[0]]}
    />,
  );
}

describe("TypeScriptClientPanel", () => {
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset();
    vi.mocked(writeTextToClipboard).mockResolvedValue(true);
    vi.mocked(downloadTypeScriptClientFile).mockReset();
    vi.mocked(downloadTypeScriptClientFile).mockReturnValue(true);
  });

  it("previews generated methods and updates scope and model options", async () => {
    const user = userEvent.setup();

    renderPanel();

    expect(screen.getByText("TypeScript SDK")).toBeVisible();
    expect(
      screen.getByText("2 methods and 1 model declarations."),
    ).toBeVisible();
    expect(screen.getByText("listItems()")).toBeVisible();
    expect(screen.getByText("getLegacy()")).toBeVisible();
    expect(screen.getByText("Returns Array<Item>")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Current view (1)" }));
    expect(
      screen.getByText("1 methods and 1 model declarations."),
    ).toBeVisible();
    expect(screen.queryByText("getLegacy()")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Include unused schema models"));
    expect(
      screen.getByText("1 methods and 2 model declarations."),
    ).toBeVisible();
  });

  it("excludes deprecated operations and normalizes a custom factory name", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.click(screen.getByLabelText("Include deprecated operations"));
    expect(
      screen.getByText("1 methods and 1 model declarations."),
    ).toBeVisible();
    expect(
      screen.getByText("Excluded deprecated").nextElementSibling,
    ).toHaveTextContent("1");

    await user.type(
      screen.getByLabelText("Client factory name"),
      "store-client",
    );
    expect(screen.getByText("Factory: storeClient")).toBeVisible();
  });

  it("copies and downloads generated TypeScript with feedback", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.click(screen.getByRole("button", { name: "Copy TypeScript" }));
    expect(writeTextToClipboard).toHaveBeenCalledWith(
      expect.stringContaining("export function createCatalogApiClient"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "TypeScript client copied.",
    );

    await user.click(screen.getByRole("button", { name: "Download client" }));
    expect(downloadTypeScriptClientFile).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(
      "TypeScript client download started.",
    );
  });
});
