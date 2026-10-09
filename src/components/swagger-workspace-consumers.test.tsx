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

describe("workspace consumer compatibility", () => {
  it("preserves consumer profiles through editor errors and checks a pasted candidate without replacing the editor", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-consumers")!);
    await user.click(panel.getByText("Consumer compatibility workbench"));
    await user.click(panel.getByRole("button", { name: "Add consumer" }));
    await user.click(
      panel.getByRole("button", {
        name: "Capture current editor as reference",
      }),
    );
    await user.click(
      panel.getByRole("button", { name: "Select all response fields" }),
    );
    await user.click(
      panel.getByRole("button", {
        name: "Add dependency to selected consumer",
      }),
    );
    await user.click(
      panel.getByRole("button", {
        name: "Check current editor against consumers",
      }),
    );
    expect(
      panel.getByRole("region", { name: "Consumer impact report" }),
    ).toBeInTheDocument();
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "Consumer compatibility workbench" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", {
        name: "Check current editor against consumers",
      }),
    );
    expect(panel.getByRole("alert")).toHaveTextContent("valid OpenAPI");
    fireEvent.change(
      panel.getByLabelText("Candidate OpenAPI definition (JSON/YAML)"),
      { target: { value: DEFAULT_OPENAPI_SCHEMA } },
    );
    await user.click(
      panel.getByRole("button", { name: "Check pasted candidate" }),
    );
    expect(
      panel.getByRole("region", { name: "Consumer impact report" }),
    ).toBeInTheDocument();
    expect(editor).toHaveValue("openapi: [");
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    expect(
      await screen.findByLabelText(
        "cURL GET /users/{id}",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  });
});
