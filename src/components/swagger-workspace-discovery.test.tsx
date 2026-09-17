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

describe("workspace traffic discovery", () => {
  it("discovers an API without a valid editor document, integrates with endpoint tools and supports undo", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    const panel = within(document.getElementById("workspace-tool-discovery")!);
    await user.click(panel.getByText("Traffic-to-OpenAPI studio"));
    await user.click(panel.getByText("Paste a HAR capture"));
    fireEvent.change(panel.getByLabelText("HAR JSON for discovery"), {
      target: {
        value: JSON.stringify({
          log: {
            entries: [
              {
                request: {
                  method: "GET",
                  url: "https://api.example.com/discovered",
                },
                response: {
                  status: 200,
                  content: {
                    mimeType: "application/json",
                    text: '{"ok":true}',
                  },
                },
              },
            ],
          },
        }),
      },
    });
    await user.click(
      panel.getByRole("button", { name: "Discover API from pasted HAR" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Generate OpenAPI draft" }),
    );
    expect(editor).toHaveValue("openapi: [");
    await user.click(
      panel.getByRole("button", { name: "Apply discovered API to editor" }),
    );
    await screen.findByLabelText("cURL GET /discovered", {}, { timeout: 5000 });
    await user.click(
      panel.getByRole("button", { name: "Undo discovered API application" }),
    );
    expect(editor).toHaveValue("openapi: [");
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /discovered"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(panel.getByText("Selected routes: 1/1")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "Traffic-to-OpenAPI studio" }),
    ).toBeInTheDocument();
  });
});
