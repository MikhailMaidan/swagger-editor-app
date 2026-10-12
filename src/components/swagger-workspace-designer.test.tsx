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
import { readDesignDocument, designOperations } from "@/lib/api-designer";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("workspace API designer", () => {
  it("adds operations through reviewed editor updates, keeps old REST functionality, survives invalid editor text, and undoes exact updates", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-designer")!);
    await user.click(
      panel.getByText("API design studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Capture editor into API designer" }),
    );
    fireEvent.change(panel.getByLabelText("Selected designer operation"), {
      target: { value: "" },
    });
    fireEvent.change(panel.getByLabelText("Operation path"), {
      target: { value: "/health" },
    });
    fireEvent.change(panel.getByLabelText("Operation summary"), {
      target: { value: "Health check" },
    });
    await user.click(
      panel.getByRole("button", { name: "Save form to design draft" }),
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    await user.click(
      panel.getByRole("button", { name: "Prepare API design editor preview" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Apply API design to editor" }),
    );
    const updated = readDesignDocument((editor as HTMLTextAreaElement).value),
      original = readDesignDocument(DEFAULT_OPENAPI_SCHEMA);
    expect(designOperations(updated)).toHaveLength(3);
    expect(updated.paths).toMatchObject(original.paths as object);
    expect(
      await screen.findByLabelText("cURL GET /health", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Undo API design editor update" }),
    );
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
      ).getByRole("button", { name: "API design studio" }),
    ).toBeInTheDocument();
    expect(panel.getByLabelText("Operation summary")).toHaveValue(
      "Health check",
    );
    await user.click(
      panel.getByRole("button", { name: "Prepare API design editor preview" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Apply API design to editor" }),
    );
    expect(
      await screen.findByLabelText("cURL GET /health", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
  });
});
