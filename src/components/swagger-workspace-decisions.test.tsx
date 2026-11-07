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
import { decisionTranslations } from "@/lib/decision-translations";
describe("workspace decision automation integration", () => {
  it("retains existing REST and tools and preserves decision results while OpenAPI is invalid", async () => {
    render(<SwaggerWorkspace />);
    const en = decisionTranslations.en,
      panel = within(document.getElementById("workspace-tool-decisions")!),
      editor = screen.getByLabelText("OpenAPI schema editor"),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" }));
    expect(
      nav.getByRole("button", { name: en["decision.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(
      panel.getByText(en["decision.title"], { selector: "summary" }),
    );
    await panel.findByRole("button", { name: en["decision.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["decision.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["decision.runAll"] }));
    await waitFor(
      () =>
        expect(panel.getByRole("status")).toHaveTextContent(
          "12/12 decision expectations matched.",
        ),
      { timeout: 15000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
      "consistency",
      "data-query",
      "sagas",
      "event-store",
      "flags",
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
      { timeout: 15000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent(
      "12/12 decision expectations matched.",
    );
    expect(
      nav.getByRole("button", { name: en["decision.title"] }),
    ).toBeInTheDocument();
  });
});
