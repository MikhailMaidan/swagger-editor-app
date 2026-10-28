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
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
describe("workspace CORS studio integration", () => {
  it("keeps the editor and existing tools intact while retaining CORS work through invalid OpenAPI input", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-cors")!),
      editor = screen.getByLabelText("OpenAPI schema editor"),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" }));
    expect(
      nav.getByRole("button", { name: "CORS policy studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByText("CORS policy studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load browser CORS lifecycle demo" }),
    );
    await user.click(
      panel.getByRole("button", {
        name: "Rehearse all CORS scenarios and policies",
      }),
    );
    expect(panel.getByRole("status")).toHaveTextContent("10/10");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.getByText("HTTP cache studio", { selector: "summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("OAuth authorization studio", { selector: "summary" }),
    ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent("10/10");
    expect(
      nav.getByRole("button", { name: "CORS policy studio" }),
    ).toBeInTheDocument();
    expect(panel.getByLabelText("CORS project name")).toHaveValue(
      "Browser CORS lifecycle examples",
    );
  });
});
