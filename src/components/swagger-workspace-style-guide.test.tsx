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

const SCHEMA_WITH_STYLE_ISSUES = `openapi: 3.0.3
info:
  title: Style Checks
  version: 1.0.0
paths:
  /order_items:
    get:
      summary: List order items
      responses:
        '200':
          description: OK
`;

describe("workspace API style guide", () => {
  it("lints the current schema and highlights a finding in the editor", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: SCHEMA_WITH_STYLE_ISSUES } });

    const panel = within(
      screen.getByRole("region", { name: "API style guide" }),
    );
    const revealButton = await panel.findByRole(
      "button",
      {
        name: "Show Path segment casing finding at /paths/~1order_items in the editor",
      },
      { timeout: 3000 },
    );

    await user.click(revealButton);

    await waitFor(() => expect(editor).toHaveFocus());
    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      "/order_items",
    );

    const nav = screen.getByRole("navigation", { name: "Workspace tools" });

    expect(
      within(nav).getByRole("button", { name: "Style guide" }),
    ).toHaveAttribute("aria-controls", "workspace-tool-style-guide");
  });
});
