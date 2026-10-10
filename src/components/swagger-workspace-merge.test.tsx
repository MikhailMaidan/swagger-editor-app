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

describe("workspace three-way merge", () => {
  it("retains versions through invalid editor input and reversibly applies a merged API", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-merge")!);
    await user.click(panel.getByText("OpenAPI three-way merge studio"));
    await user.click(panel.getByRole("button", { name: "Use editor as Base" }));
    const ours = DEFAULT_OPENAPI_SCHEMA.replace(
      "title: RSSwag Demo API",
      "title: Merged Demo API",
    );
    fireEvent.change(editor, { target: { value: ours } });
    await user.click(panel.getByRole("button", { name: "Use editor as Ours" }));
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    await user.click(
      panel.getByRole("button", { name: "Use editor as Theirs" }),
    );
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
      ).getByRole("button", { name: "OpenAPI three-way merge studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", {
        name: "Analyse and preview three-way merge",
      }),
    );
    expect(panel.getByLabelText("Ours source (JSON/YAML)")).toHaveValue(ours);
    await user.click(
      panel.getByRole("button", { name: "Apply merged OpenAPI to editor" }),
    );
    expect(
      await screen.findByLabelText(
        "cURL GET /users/{id}",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(
      JSON.parse((editor as HTMLTextAreaElement).value).paths["/users/{id}"]
        .post,
    ).toBeDefined();
    expect(JSON.parse((editor as HTMLTextAreaElement).value).info.title).toBe(
      "Merged Demo API",
    );
    await user.click(
      panel.getByRole("button", { name: "Undo last merge application" }),
    );
    expect(editor).toHaveValue("openapi: [");
  });
});
