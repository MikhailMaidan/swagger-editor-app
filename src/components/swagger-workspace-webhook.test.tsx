import { webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { webhookTranslations } from "@/lib/webhook-translations";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
describe("workspace webhook studio integration", () => {
  it("preserves webhook work across invalid OpenAPI input and leaves the editor, REST requests and other studios intact", async () => {
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-webhook")!),
      editor = screen.getByLabelText("OpenAPI schema editor"),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      en = webhookTranslations.en;
    expect(
      nav.getByRole("button", { name: en["hook.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByText(en["hook.title"], { selector: "summary" }));
    await panel.findByRole("button", { name: en["hook.demo"] });
    await act(async () =>
      fireEvent.click(panel.getByRole("button", { name: en["hook.demo"] })),
    );
    await waitFor(() =>
      expect(panel.queryByText(en["hook.busy"])).not.toBeInTheDocument(),
    );
    await act(async () =>
      fireEvent.click(panel.getByRole("button", { name: en["hook.run"] })),
    );
    await waitFor(() =>
      expect(panel.queryByText(en["hook.busy"])).not.toBeInTheDocument(),
    );
    expect(panel.getByRole("status")).toHaveTextContent("12/12");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const title of [
      "JSON-RPC and OpenRPC studio",
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
    expect(panel.getByRole("status")).toHaveTextContent("12/12");
    expect(
      nav.getByRole("button", { name: en["hook.title"] }),
    ).toBeInTheDocument();
  });
});
