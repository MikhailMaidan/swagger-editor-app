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

describe("workspace API gateway composition", () => {
  it("preserves sources through invalid editor input, applies combined routes, and restores the original API", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor");
    const panel = within(document.getElementById("workspace-tool-composer")!);
    await user.click(panel.getByText("API gateway composer"));
    await user.click(panel.getByText("Paste a service definition"));
    for (const name of ["catalog", "billing"]) {
      fireEvent.change(panel.getByLabelText("Service definition to add"), {
        target: {
          value: JSON.stringify({
            openapi: "3.1.0",
            info: { title: name, version: "1" },
            paths: {
              [`/${name}`]: {
                get: { responses: { "200": { description: "OK" } } },
              },
            },
          }),
        },
      });
      await user.click(
        panel.getByRole("button", { name: "Add pasted service" }),
      );
    }
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
      ).getByRole("button", { name: "API gateway composer" }),
    ).toBeInTheDocument();
    expect(panel.getByText("Services: 2/8")).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    fireEvent.change(panel.getByLabelText("Gateway server URL"), {
      target: { value: "https://gateway.example.com" },
    });
    await user.click(
      panel.getByRole("button", { name: "Preview gateway composition" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Apply composed API to editor" }),
    );
    await screen.findByLabelText(
      "cURL GET /service-1/catalog",
      {},
      { timeout: 5000 },
    );
    expect(
      screen.getByLabelText("cURL GET /service-2/billing"),
    ).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Undo composition application" }),
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    await screen.findByLabelText("cURL GET /users/{id}", {}, { timeout: 5000 });
    expect(panel.getByText("Services: 2/8")).toBeInTheDocument();
  });
});
