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
import { POSTMAN_COLLECTION_SCHEMA } from "@/lib/postman-collection";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("workspace Postman migration", () => {
  it("keeps migration available for invalid editor input, imports a working API, and restores the previous document", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor");
    const panel = within(document.getElementById("workspace-tool-migration")!);
    await user.click(panel.getByText("Postman migration studio"));
    await user.click(panel.getByText("Paste collection JSON"));
    fireEvent.change(panel.getByLabelText("Postman collection JSON"), {
      target: {
        value: JSON.stringify({
          info: { name: "Migrated API", schema: POSTMAN_COLLECTION_SCHEMA },
          item: [
            {
              name: "Read catalog",
              request: {
                method: "GET",
                url: "https://example.com/catalog/:id",
              },
              response: [{ code: 200, body: '{"id":1}' }],
            },
          ],
        }),
      },
    });
    await user.click(
      panel.getByRole("button", { name: "Import pasted collection" }),
    );
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
      ).getByRole("button", { name: "Postman migration studio" }),
    ).toBeInTheDocument();
    expect(panel.getByLabelText("Migrated API title")).toHaveValue(
      "Migrated API",
    );
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    await user.click(
      panel.getByRole("button", { name: "Generate migrated OpenAPI" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Apply migrated API to editor" }),
    );
    await screen.findByLabelText(
      "cURL GET /catalog/{id}",
      {},
      { timeout: 5000 },
    );
    await user.click(
      panel.getByRole("button", { name: "Undo migration application" }),
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    await screen.findByLabelText("cURL GET /users/{id}", {}, { timeout: 5000 });
    expect(panel.getByLabelText("Migrated API title")).toHaveValue(
      "Migrated API",
    );
  });
});
