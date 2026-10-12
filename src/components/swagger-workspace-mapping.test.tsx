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

describe("workspace payload mapping studio", () => {
  it("preserves existing REST tools and mapping work while the OpenAPI editor becomes invalid", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-mapping")!);
    await user.click(
      panel.getByText("Payload mapping studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load customer mapping demo" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Run payload mapping" }),
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    const input = (
      panel.getByLabelText("Mapping input JSON") as HTMLTextAreaElement
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
      ).getByRole("button", { name: "Payload mapping studio" }),
    ).toBeInTheDocument();
    expect(panel.getByLabelText("Mapping input JSON")).toHaveValue(input);
    expect(panel.getByText("1/30 saved mapping cases.")).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Run all mapping cases" }),
    );
    expect(
      panel.getByText("1 passed, 0 failed, 0 partial."),
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
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
  });
});
