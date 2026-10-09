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

describe("workspace data redaction", () => {
  it("works through invalid editor input and applies/undoes a redacted API without dropping existing routes", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-redaction")!);
    const source =
      DEFAULT_OPENAPI_SCHEMA + "\nx-private-example:\n  token: private-token\n";
    fireEvent.change(editor, { target: { value: source } });
    await user.click(panel.getByText("Data redaction studio"));
    await user.click(
      panel.getByRole("button", { name: "Add current editor for redaction" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Add custom redaction rule" }),
    );
    fireEvent.change(panel.getByLabelText("Rule pointer pattern"), {
      target: { value: "/x-private-example/token" },
    });
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
      ).getByRole("button", { name: "Data redaction studio" }),
    ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: source } });
    await user.click(
      panel.getByRole("button", { name: "Preview redacted artifacts" }),
    );
    expect(
      panel.getByLabelText("Redacted output preview (first 16,000 characters)"),
    ).not.toHaveTextContent("private-token");
    expect(editor).toHaveValue(source);
    await user.click(
      panel.getByRole("button", {
        name: "Apply selected redacted API to editor",
      }),
    );
    expect((editor as HTMLTextAreaElement).value).not.toContain(
      "private-token",
    );
    expect(
      await screen.findByLabelText(
        "cURL GET /users/{id}",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Undo redacted API application" }),
    );
    expect(editor).toHaveValue(source);
  });
});
