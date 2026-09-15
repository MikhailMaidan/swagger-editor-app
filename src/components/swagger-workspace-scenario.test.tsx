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

describe("workspace scenarios", () => {
  it("opens scenario endpoints and preserves the draft across invalid schema edits", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const element = document.getElementById("workspace-tool-scenarios")!;
    const panel = within(element);
    await user.click(panel.getByText("API scenario runner"));
    await panel.findByLabelText("Scenario name");
    fireEvent.change(panel.getByLabelText("Scenario name"), {
      target: { value: "Saved in this tab" },
    });
    await user.click(panel.getByRole("button", { name: "Add scenario step" }));
    await user.click(
      panel.getByRole("button", { name: "View scenario endpoint" }),
    );
    expect(
      screen.getByRole("searchbox", { name: /Filter endpoints by method/ }),
    ).toHaveValue("/users/{id}");
    const editor = screen.getByLabelText("OpenAPI schema editor");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          panel.getByRole("button", { name: "Add scenario step" }),
        ).toBeDisabled(),
      { timeout: 5000 },
    );
    expect(panel.getByLabelText("Scenario name")).toHaveValue(
      "Saved in this tab",
    );
    expect(panel.getByText("Scenario steps: 1/20")).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    await waitFor(
      () =>
        expect(
          panel.getByRole("button", { name: "Add scenario step" }),
        ).toBeEnabled(),
      { timeout: 5000 },
    );
    expect(panel.getByLabelText("Scenario name")).toHaveValue(
      "Saved in this tab",
    );
    expect(panel.getByText("Scenario steps: 1/20")).toBeInTheDocument();
  });
});
