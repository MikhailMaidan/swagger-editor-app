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
describe("workspace HTTP cache integration", () => {
  it("adds independent cache replay and retains work through invalid OpenAPI input", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-cache")!),
      editor = screen.getByLabelText("OpenAPI schema editor");
    const nav = within(
      screen.getByRole("navigation", { name: "Workspace tools" }),
    );
    expect(
      nav.getByRole("button", { name: "HTTP cache studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByText("HTTP cache studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load HTTP cache lifecycle demo" }),
    );
    await user.click(
      panel.getByRole("button", {
        name: "Run all cache scenarios and policies",
      }),
    );
    expect(panel.getByRole("status")).toHaveTextContent("10/10");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
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
      nav.getByRole("button", { name: "HTTP cache studio" }),
    ).toBeInTheDocument();
    expect(panel.getByLabelText("Cache project name")).toHaveValue(
      "HTTP cache lifecycle examples",
    );
  });
});
