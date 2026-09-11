import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("workspace test planning", () => {
  it("uses current endpoint filters and opens the selected endpoint without changing the schema", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(
      screen.getByRole("region", { name: "API test-plan workbench" }),
    );
    await user.click(
      panel.getByRole("button", { name: "API test-plan workbench" }),
    );
    await user.selectOptions(panel.getByLabelText("QA result"), "passed");
    const search = screen.getByRole("searchbox", {
      name: /Filter endpoints by method/,
    });
    fireEvent.change(search, { target: { value: "missing-route" } });
    await user.selectOptions(
      panel.getByLabelText("Test-plan endpoint scope"),
      "visible",
    );
    expect(panel.getByText("No cases match this view.")).toBeInTheDocument();
    await user.selectOptions(
      panel.getByLabelText("Test-plan endpoint scope"),
      "all",
    );
    expect(panel.getByLabelText("QA result")).toHaveValue("passed");
    await user.click(
      panel.getByRole("button", { name: "Open test-case endpoint" }),
    );
    expect(search).toHaveValue("/users/{id}");
    const editor = screen.getByLabelText("OpenAPI schema editor");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          panel.getByText("No cases match this view."),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    await waitFor(
      () => expect(panel.getByLabelText("QA result")).toHaveValue("passed"),
      { timeout: 5000 },
    );
  });
});
