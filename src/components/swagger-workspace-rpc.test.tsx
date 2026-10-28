import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { rpcTranslations } from "@/lib/rpc-translations";
import { demoRpcProject } from "@/lib/rpc-studio";

describe("workspace JSON-RPC integration", () => {
  it("retains RPC work through invalid OpenAPI input while preserving the editor, REST requests and existing studios", async () => {
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-json-rpc")!),
      editor = screen.getByLabelText("OpenAPI schema editor"),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      en = rpcTranslations.en;
    expect(
      nav.getByRole("button", { name: en["rpc.title"] }),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        panel.getByText(en["rpc.title"], { selector: "summary" }),
      );
    });
    await panel.findByRole("button", { name: en["rpc.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["rpc.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["rpc.runAll"] }));
    expect(panel.getByRole("status")).toHaveTextContent("7/7");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const title of [
      "CORS policy studio",
      "HTTP cache studio",
      "OAuth authorization studio",
    ])
      expect(
        screen.getByText(title, { selector: "summary" }),
      ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent("7/7");
    expect(
      nav.getByRole("button", { name: en["rpc.title"] }),
    ).toBeInTheDocument();
    expect(panel.getByLabelText(en["rpc.projectName"])).toHaveValue(
      demoRpcProject().name,
    );
  });
});
