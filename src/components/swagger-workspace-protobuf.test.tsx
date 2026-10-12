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

describe("workspace Protobuf studio", () => {
  it("retains RPC drafts, saved exchanges and offline tools through invalid OpenAPI edits and preserves all existing operations", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor"),
      panel = within(document.getElementById("workspace-tool-protobuf")!);
    await user.click(
      panel.getByText("Protocol Buffers and gRPC studio", {
        selector: "summary",
      }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load demo Protobuf contract" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Save as new RPC exchange" }),
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    const draft = (
      panel.getByLabelText(
        "RPC request messages (JSON array)",
      ) as HTMLTextAreaElement
    ).value;
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
      ).getByRole("button", { name: "Protocol Buffers and gRPC studio" }),
    ).toBeInTheDocument();
    expect(
      panel.getByLabelText("RPC request messages (JSON array)"),
    ).toHaveValue(draft);
    expect(panel.getByText("1/50 saved exchanges.")).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Run offline RPC rehearsal" }),
    );
    expect(
      panel.getByLabelText("RPC rehearsal results (first 16,000 characters)"),
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
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
  });
});
