import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";

const SCHEMA_WITH_EXAMPLE_ISSUES = `openapi: 3.0.3
info:
  title: Example Checks
  version: 1.0.0
paths:
  /orders/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
          example: abc
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                required: [id]
                properties:
                  id:
                    type: integer
              example:
                total: 5
`;

describe("workspace example validation", () => {
  it("validates documented examples and highlights one in the editor", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: SCHEMA_WITH_EXAMPLE_ISSUES } });

    await screen.findByText("0% conform", {}, { timeout: 3000 });

    const panel = within(
      screen.getByRole("region", { name: "Example validator" }),
    );

    expect(panel.getByText('Required property "id" is missing.')).toBeVisible();

    await user.click(
      panel.getByRole("button", {
        name: "Show example for 200 · application/json in the editor",
      }),
    );

    await waitFor(() => expect(editor).toHaveFocus());
    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      "total: 5",
    );

    const nav = screen.getByRole("navigation", { name: "Workspace tools" });

    expect(
      within(nav).getByRole("button", { name: "Examples 2" }),
    ).toHaveAttribute("aria-controls", "workspace-tool-examples");
    expect(
      document
        .getElementById("workspace-tool-examples")
        ?.contains(screen.getByRole("region", { name: "Example validator" })),
    ).toBe(true);
  });
});
