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

describe("workspace SOAP contract studio", () => {
  it("adds independent SOAP regression tools, keeps REST behavior, and survives invalid OpenAPI input", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-soap")!),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "SOAP contract studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByText("SOAP contract studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load SOAP customer demo" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Run all SOAP response cases" }),
    );
    await panel.findByText("Checked 5/5 cases: 5 passed, 0 failed.");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.getByText("API collection studio", { selector: "summary" }),
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
      panel.getByText("Checked 5/5 cases: 5 passed, 0 failed."),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "SOAP contract studio" }),
    ).toBeInTheDocument();
    expect(editor).toHaveValue("openapi: [");
  });
});
