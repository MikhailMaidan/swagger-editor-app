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

describe("workspace fixture studio", () => {
  it("captures the editor without changing it and remains usable across invalid edits", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-fixtures")!);
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "API fixture studio" }),
    ).toBeInTheDocument();
    await user.click(panel.getByText("API fixture studio"));
    await user.click(
      await panel.findByRole("button", {
        name: "Use current editor as fixture source",
      }),
    );
    await user.click(
      panel.getByRole("button", { name: "Add fixture dataset" }),
    );
    const editor = screen.getByLabelText("OpenAPI schema editor");
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
      ).getByRole("button", { name: "API fixture studio" }),
    ).toBeInTheDocument();
    await user.click(panel.getByRole("button", { name: "Generate fixtures" }));
    await panel.findByRole("region", { name: "Generated fixture datasets" });
    expect(editor).toHaveValue("openapi: [");
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    await screen.findByLabelText("cURL GET /users/{id}", {}, { timeout: 5000 });
    expect(
      panel.getByRole("region", { name: "Generated fixture datasets" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
  });
});
