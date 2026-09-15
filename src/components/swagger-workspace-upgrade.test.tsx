import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { readSchemaCheckpoints } from "@/lib/schema-checkpoints";
import { SwaggerWorkspace } from "./swagger-workspace";

const SWAGGER_SCHEMA = `swagger: "2.0"
info:
  title: Legacy Pets
  version: 1.0.0
host: pets.example.com
basePath: /v1
paths:
  /pets/{petId}:
    get:
      parameters:
        - name: petId
          in: path
          required: true
          type: integer
      responses:
        "200":
          description: A pet
          schema:
            $ref: "#/definitions/Pet"
definitions:
  Pet:
    type: object
    properties:
      name:
        type: string
`;

describe("workspace OpenAPI upgrade assistant", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("upgrades a Swagger 2.0 document in the editor and keeps a restorable checkpoint", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: SWAGGER_SCHEMA } });

    await screen.findByText(
      "Swagger 2.0 → OpenAPI 3.0.3",
      {},
      { timeout: 3000 },
    );

    const panel = within(
      screen.getByRole("region", { name: "OpenAPI upgrade assistant" }),
    );

    await user.click(panel.getByRole("button", { name: "Preview upgrade" }));
    expect(panel.getByText("All 1 endpoints are preserved.")).toBeVisible();
    await user.click(panel.getByRole("button", { name: "Apply to editor" }));

    expect(editor.value).toContain("openapi: 3.0.3");
    expect(editor.value).toMatch(/\$ref: ["']?#\/components\/schemas\/Pet/);
    expect(
      screen.getByText(
        "Upgraded to OpenAPI 3.0.3. The previous document was saved as a checkpoint.",
      ),
    ).toBeVisible();
    expect(readSchemaCheckpoints()).toMatchObject([
      { name: "Before upgrade to OpenAPI 3.0.3", schemaText: SWAGGER_SCHEMA },
    ]);
    expect(
      await screen.findByText("Before upgrade to OpenAPI 3.0.3"),
    ).toBeVisible();

    await waitFor(() =>
      expect(
        screen.getByText("OpenAPI 3.0 → OpenAPI 3.1.0"),
      ).toBeInTheDocument(),
    );
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "OpenAPI upgrade" }),
    ).toHaveAttribute("aria-controls", "workspace-tool-upgrade");
  });
});
