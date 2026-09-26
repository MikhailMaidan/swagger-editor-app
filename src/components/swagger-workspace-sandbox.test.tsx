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

describe("workspace stateful sandbox", () => {
  it("keeps its local state through editor errors and leaves existing editor functionality intact", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor");
    const panel = within(document.getElementById("workspace-tool-sandbox")!);
    await user.click(panel.getByText("Stateful API sandbox"));
    await user.click(
      panel.getByRole("button", { name: "Validate and start/restart sandbox" }),
    );
    fireEvent.change(panel.getByLabelText("Sandbox request method"), {
      target: { value: "POST" },
    });
    await user.click(panel.getByRole("button", { name: "Send local request" }));
    expect(panel.getByText("Records: 2")).toBeInTheDocument();
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
      ).getByRole("button", { name: "Stateful API sandbox" }),
    ).toBeInTheDocument();
    expect(panel.getByText("Records: 2")).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Undo last sandbox request" }),
    );
    expect(panel.getByText("Records: 1")).toBeInTheDocument();
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
