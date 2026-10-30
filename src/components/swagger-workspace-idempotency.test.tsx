import { webcrypto } from "node:crypto";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { idempotencyTranslations } from "@/lib/idempotency-translations";
afterEach(() => vi.unstubAllGlobals());
describe("workspace duplicate-write integration", () => {
  it("preserves simulations through invalid OpenAPI while retaining REST controls and existing studios", async () => {
    vi.stubGlobal("crypto", webcrypto);
    render(<SwaggerWorkspace />);
    const en = idempotencyTranslations.en,
      panel = within(document.getElementById("workspace-tool-idempotency")!),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      nav.getByRole("button", { name: en["idem.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByText(en["idem.title"], { selector: "summary" }));
    await panel.findByRole("button", { name: en["idem.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["idem.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["idem.runAll"] }));
    await waitFor(
      () => expect(panel.getByRole("status")).toHaveTextContent("20/20"),
      { timeout: 7000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const title of [
      "Authorization policy studio",
      "Rate-limit and quota studio",
      "Distributed trace and latency studio",
      "Webhook signature and replay studio",
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
      { timeout: 7000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent("20/20");
    expect(
      nav.getByRole("button", { name: en["idem.title"] }),
    ).toBeInTheDocument();
  });
});
