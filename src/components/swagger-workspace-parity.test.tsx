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

describe("workspace environment comparison", () => {
  it("uses visible read operations, navigates to endpoints, and preserves plans across invalid schema edits", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-parity")!);
    await user.click(panel.getByText("Environment comparison runner"));
    await panel.findByLabelText("Comparison plan name");
    fireEvent.change(panel.getByLabelText("Comparison plan name"), {
      target: { value: "Release candidate" },
    });
    await user.click(
      panel.getByRole("button", { name: "Add visible GET/HEAD endpoints" }),
    );
    expect(panel.getByText("Comparison cases: 1/20")).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "View comparison endpoint" }),
    );
    expect(
      screen.getByRole("searchbox", { name: /Filter endpoints by method/ }),
    ).toHaveValue("/users/{id}");
    const editor = screen.getByLabelText("OpenAPI schema editor");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          panel.getByRole("button", { name: "Run Mock comparison" }),
        ).toBeDisabled(),
      { timeout: 5000 },
    );
    expect(panel.getByLabelText("Comparison plan name")).toHaveValue(
      "Release candidate",
    );
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "Environment comparison runner" }),
    ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    await waitFor(
      () =>
        expect(
          panel.getByRole("button", { name: "Run Mock comparison" }),
        ).toBeEnabled(),
      { timeout: 5000 },
    );
    await user.click(
      panel.getByRole("button", { name: "Run Mock comparison" }),
    );
    await panel.findByText("Mock comparison: all cases matched");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
  });
});
