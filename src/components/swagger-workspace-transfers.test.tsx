import { webcrypto } from "node:crypto";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { transferTranslations } from "@/lib/transfer-translations";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
describe("workspace binary transfer integration", () => {
  it("keeps offline binary rehearsals available through invalid OpenAPI and preserves existing tools", async () => {
    render(<SwaggerWorkspace />);
    const en = transferTranslations.en,
      panel = within(document.getElementById("workspace-tool-transfers")!),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      nav.getByRole("button", { name: en["transfer.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(
      panel.getByText(en["transfer.title"], { selector: "summary" }),
    );
    await panel.findByRole("button", { name: en["transfer.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["transfer.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["transfer.runAll"] }));
    await waitFor(
      () =>
        expect(panel.getByRole("status")).toHaveTextContent(
          "8/8 expectations passed",
        ),
      { timeout: 7000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
      "negotiation",
      "journeys",
      "idempotency",
      "authorization",
      "rate-limits",
      "traces",
      "webhook",
      "json-rpc",
      "cors",
      "cache",
    ])
      expect(
        document.getElementById(`workspace-tool-${id}`),
      ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 7000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent("8/8");
    expect(
      nav.getByRole("button", { name: en["transfer.title"] }),
    ).toBeInTheDocument();
  });
});
