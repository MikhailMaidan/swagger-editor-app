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

describe("workspace AsyncAPI event studio", () => {
  it("keeps event contracts and rehearsals available through invalid OpenAPI edits", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-asyncapi")!);
    await user.click(panel.getByText("AsyncAPI event studio"));
    await user.click(
      panel.getByRole("button", {
        name: "Start an empty AsyncAPI 3.1 contract",
      }),
    );
    await user.click(
      panel.getByText("Add a channel from a JSON example", {
        selector: "summary",
      }),
    );
    await user.click(
      panel.getByRole("button", { name: "Add event channel and operation" }),
    );
    await user.click(
      panel.getByRole("button", {
        name: "Load message example into rehearsal",
      }),
    );
    await user.click(
      panel.getByRole("button", { name: "Record local message rehearsal" }),
    );
    const source = (
      panel.getByLabelText(
        "AsyncAPI source (JSON or YAML)",
      ) as HTMLTextAreaElement
    ).value;
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
      ).getByRole("button", { name: "AsyncAPI event studio" }),
    ).toBeInTheDocument();
    expect(panel.getByLabelText("AsyncAPI source (JSON or YAML)")).toHaveValue(
      source,
    );
    await user.click(panel.getByRole("button", { name: "Replay event 1" }));
    expect(panel.getByText("Local event journal (2/200)")).toBeInTheDocument();
    expect(editor).toHaveValue("openapi: [");
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    expect(
      await screen.findByLabelText(
        "cURL GET /users/{id}",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  });
});
