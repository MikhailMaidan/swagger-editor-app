import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("workspace API transformations", () => {
  it("preserves the recipe through invalid editor input, applies a new endpoint, and undoes the application", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor");
    const panel = within(document.getElementById("workspace-tool-transform")!);
    await user.click(panel.getByText("API transformation workbench"));
    await user.click(
      panel.getByRole("button", { name: "Use current editor as source" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Add transformation step" }),
    );
    fireEvent.change(panel.getByLabelText("Target JSON Pointer"), {
      target: { value: "/paths/~1transformed" },
    });
    fireEvent.change(panel.getByLabelText("Step value (JSON)"), {
      target: {
        value:
          '{"get":{"summary":"Added by recipe","responses":{"200":{"description":"OK"}}}}',
      },
    });
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(panel.getByText("Recipe steps: 1/100")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "API transformation workbench" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Preview transformation" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Apply transformation to editor" }),
    );
    expect(editor).toHaveValue("openapi: [");
    expect(panel.getByRole("alert")).toHaveTextContent("editor changed");
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    await user.click(
      panel.getByRole("button", { name: "Use current editor as source" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Preview transformation" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Apply transformation to editor" }),
    );
    await screen.findByLabelText(
      "cURL GET /transformed",
      {},
      { timeout: 5000 },
    );
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Undo transformation application" }),
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /transformed"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(panel.getByText("Recipe steps: 1/100")).toBeInTheDocument();
  });
});
