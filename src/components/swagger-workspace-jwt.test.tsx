import { webcrypto } from "node:crypto";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("workspace JWT studio", () => {
  it("adds JWT signing and verification alongside existing REST tools and preserves work through invalid OpenAPI edits", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-jwt")!),
      editor = screen.getByLabelText("OpenAPI schema editor");
    const nav = () =>
      within(screen.getByRole("navigation", { name: "Workspace tools" }));
    expect(
      nav().getByRole("button", { name: "JWT and signing-key studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByText("JWT and signing-key studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load JWT verification demo" }),
    );
    await panel.findByText(/RSA demo loaded/);
    await user.click(
      panel.getByRole("button", { name: "Verify JWT signature and claims" }),
    );
    await panel.findByText(
      "Token accepted by policy; signature valid; claims valid.",
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.getByText("WebSocket session studio", { selector: "summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("API design studio", { selector: "summary" }),
    ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(
      panel.getByText(
        "Token accepted by policy; signature valid; claims valid.",
      ),
    ).toBeInTheDocument();
    expect(
      nav().getByRole("button", { name: "JWT and signing-key studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Run JWT verification cases" }),
    );
    await panel.findByText("Completed 5/5 cases: 5 passed, 0 failed.");
    expect(editor).toHaveValue("openapi: [");
  });
});
