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

describe("workspace documentation localization", () => {
  it("retains translations through invalid editor input and reversibly publishes while preserving existing operations", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-localization")!);
    await user.click(
      panel.getByText("API documentation localization studio", {
        selector: "summary",
      }),
    );
    await user.click(
      panel.getByRole("button", {
        name: "Capture or refresh documentation from editor",
      }),
    );
    fireEvent.change(panel.getByLabelText("New translation language code"), {
      target: { value: "fr" },
    });
    await user.click(
      panel.getByRole("button", { name: "Add translation language" }),
    );
    fireEvent.change(panel.getByLabelText("Translation (fr)"), {
      target: { value: "API de démonstration" },
    });
    await user.click(
      panel.getByRole("button", {
        name: "Mark translation reviewed for current source",
      }),
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
      ).getByRole("button", { name: "API documentation localization studio" }),
    ).toBeInTheDocument();
    expect(panel.getByLabelText("Translation (fr)")).toHaveValue(
      "API de démonstration",
    );
    await user.click(
      panel.getByRole("button", { name: "Preview localized documentation" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Apply localized OpenAPI to editor" }),
    );
    expect(
      await screen.findByLabelText(
        "cURL GET /users/{id}",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    const result = JSON.parse((editor as HTMLTextAreaElement).value);
    expect(result.info.title).toBe("API de démonstration");
    expect(result.paths["/users/{id}"].get).toBeDefined();
    expect(result.paths["/users/{id}"].post).toBeDefined();
    await user.click(
      panel.getByRole("button", { name: "Undo last localization application" }),
    );
    expect(editor).toHaveValue("openapi: [");
  });
});
