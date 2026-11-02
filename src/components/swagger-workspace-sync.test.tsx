import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { syncTranslations } from "@/lib/sync-translations";
describe("workspace local-first synchronization integration", () => {
  it("preserves REST and existing studios and keeps synchronization results through invalid OpenAPI", async () => {
    render(<SwaggerWorkspace />);
    const en = syncTranslations.en,
      panel = within(document.getElementById("workspace-tool-sync")!),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      nav.getByRole("button", { name: en["sync.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByText(en["sync.title"], { selector: "summary" }));
    await panel.findByRole("button", { name: en["sync.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["sync.demo"] }));
    await waitFor(() =>
      expect(
        panel.queryByRole("button", { name: en["sync.cancel"] }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(panel.getByRole("button", { name: en["sync.runAll"] }));
    await waitFor(
      () =>
        expect(panel.getByRole("status")).toHaveTextContent(
          "9/9 expectations passed",
        ),
      { timeout: 7000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
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
      "9/9 expectations passed",
    );
    expect(
      nav.getByRole("button", { name: en["sync.title"] }),
    ).toBeInTheDocument();
  });
});
