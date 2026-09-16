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

describe("workspace multi-file definitions", () => {
  it("loads a referenced operation into the existing endpoint tools, supports undo, and retains the project during invalid main-editor drafts", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-bundle")!);
    await user.click(panel.getByText("Multi-file OpenAPI workbench"));
    const root =
      'openapi: 3.1.0\ninfo:\n  title: Imported project\n  version: "1"\npaths:\n  /modular:\n    $ref: path.yaml\n';
    const path =
      'get:\n  summary: Modular operation\n  responses:\n    "200":\n      description: OK\n';
    const files = [
      new File([root], "openapi.yaml"),
      new File([path], "path.yaml"),
    ];
    Object.defineProperty(files[0], "text", { value: async () => root });
    Object.defineProperty(files[1], "text", { value: async () => path });
    await user.upload(panel.getByLabelText("Import definition files"), files);
    const editor = screen.getByLabelText("OpenAPI schema editor");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    await user.click(
      panel.getByRole("button", { name: "Build reference bundle" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Apply bundle to editor" }),
    );
    expect(editor).not.toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    await screen.findByLabelText("cURL GET /modular", {}, { timeout: 5000 });
    await user.click(
      panel.getByRole("button", { name: "Undo bundle application" }),
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /modular"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(panel.getByText("Project files: 2/50")).toBeInTheDocument();
    expect(panel.getByLabelText("Root API document")).toHaveValue(
      "openapi.yaml",
    );
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "Multi-file OpenAPI workbench" }),
    ).toBeInTheDocument();
  });
});
