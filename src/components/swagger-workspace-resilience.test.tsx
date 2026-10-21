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

describe("workspace resilience lab", () => {
  it("adds offline resilience experiments without changing REST behavior and preserves them through invalid editor text", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-resilience")!),
      editor = screen.getByLabelText("OpenAPI schema editor");
    const nav = () =>
      within(screen.getByRole("navigation", { name: "Workspace tools" }));
    expect(
      nav().getByRole("button", { name: "API resilience lab" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByText("API resilience lab", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load resilience comparison demo" }),
    );
    await user.click(
      panel.getByRole("button", {
        name: "Compare policies for selected scenario",
      }),
    );
    await panel.findByRole("table", { name: "Resilience experiment results" });
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.getByText("JWT and signing-key studio", { selector: "summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("WebSocket session studio", { selector: "summary" }),
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
      panel.getByRole("table", { name: "Resilience experiment results" }),
    ).toBeInTheDocument();
    expect(
      nav().getByRole("button", { name: "API resilience lab" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Run resilience regression matrix" }),
    );
    await panel.findByText(/Completed 9\/9 simulations/);
    expect(editor).toHaveValue("openapi: [");
  });
});
