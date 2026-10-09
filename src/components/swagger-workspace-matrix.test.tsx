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

describe("workspace data-driven workflow tests", () => {
  it("retains matrix data through invalid editor input and runs against the current editor without changing it", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-matrix")!);
    await user.click(panel.getByText("Data-driven workflow tests"));
    await user.click(
      panel.getByRole("button", { name: "Read endpoint choices from editor" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Add endpoint workflow step" }),
    );
    fireEvent.change(panel.getByLabelText("Test-case dataset to load"), {
      target: { value: '[{"id":7,"search":"","sessionId":""}]' },
    });
    await user.click(
      panel.getByRole("button", { name: "Replace cases with pasted dataset" }),
    );
    const workflow = (
      panel.getByLabelText(
        "Workflow JSON (ApiScenario object)",
      ) as HTMLTextAreaElement
    ).value;
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
      ).getByRole("button", { name: "Data-driven workflow tests" }),
    ).toBeInTheDocument();
    expect(
      panel.getByLabelText("Workflow JSON (ApiScenario object)"),
    ).toHaveValue(workflow);
    await user.click(panel.getByRole("button", { name: "Run enabled cases" }));
    expect(panel.getByRole("alert")).toHaveTextContent(
      "valid, bounded OpenAPI editor",
    );
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    await user.click(panel.getByRole("button", { name: "Run enabled cases" }));
    await panel.findByText("Matrix run completed. Review individual outcomes.");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(
      await screen.findByLabelText(
        "cURL GET /users/{id}",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  });
});
