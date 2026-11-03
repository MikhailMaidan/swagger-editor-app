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
import { flagTranslations } from "@/lib/flag-translations";
afterEach(() => vi.unstubAllGlobals());
describe("workspace feature-flag integration", () => {
  it("preserves REST and existing studios and retains flag results through invalid OpenAPI", async () => {
    vi.stubGlobal("crypto", webcrypto);
    render(<SwaggerWorkspace />);
    const en = flagTranslations.en,
      panel = within(document.getElementById("workspace-tool-flags")!),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      nav.getByRole("button", { name: en["flag.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByText(en["flag.title"], { selector: "summary" }));
    await panel.findByRole("button", { name: en["flag.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["flag.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["flag.runAll"] }));
    await waitFor(
      () =>
        expect(panel.getByRole("status")).toHaveTextContent(
          "32/32 expectations passed",
        ),
      { timeout: 8000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
      "queue",
      "slo",
      "sync",
      "transfers",
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
    expect(panel.getByRole("status")).toHaveTextContent(
      "32/32 expectations passed",
    );
    expect(
      nav.getByRole("button", { name: en["flag.title"] }),
    ).toBeInTheDocument();
  });
});
