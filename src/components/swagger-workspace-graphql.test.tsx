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

describe("workspace GraphQL studio", () => {
  it("keeps GraphQL contracts, drafts, and offline rehearsal available through invalid OpenAPI edits without replacing existing editor content", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-graphql")!);
    await user.click(
      panel.getByText("GraphQL contract studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load demo GraphQL contract" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Save as new GraphQL operation" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Run offline GraphQL rehearsal" }),
    );
    const draft = (
      panel.getByLabelText("GraphQL operation document") as HTMLTextAreaElement
    ).value;
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
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
      ).getByRole("button", { name: "GraphQL contract studio" }),
    ).toBeInTheDocument();
    expect(panel.getByLabelText("GraphQL operation document")).toHaveValue(
      draft,
    );
    expect(panel.getByText(/1\/50 saved operations/)).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Run offline GraphQL rehearsal" }),
    );
    expect(
      panel.getByLabelText(
        "Offline GraphQL response (first 16,000 characters)",
      ),
    ).toBeInTheDocument();
    expect(editor).toHaveValue("openapi: [");
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    expect(
      await screen.findByLabelText(
        "cURL GET /users/{id}",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
  });
});
