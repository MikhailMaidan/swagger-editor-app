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

describe("workspace API collection studio", () => {
  it("adds independent pagination collection, preserves REST tools, and survives invalid editor input", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-collection")!),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "API collection studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByText("API collection studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load five-pattern pagination demo" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Run all offline collection plans" }),
    );
    await panel.findByText("Finished 5/5 plans: 5 passed, 0 failed.");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.getByText("Streaming HTTP studio", { selector: "summary" }),
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
      panel.getByText("Finished 5/5 plans: 5 passed, 0 failed."),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "API collection studio" }),
    ).toBeInTheDocument();
    expect(editor).toHaveValue("openapi: [");
  });
});
