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
import { sagaTranslations } from "@/lib/saga-translations";
describe("workspace saga studio integration", () => {
  it("keeps existing REST and studios and preserves saga results through invalid OpenAPI", async () => {
    render(<SwaggerWorkspace />);
    const en = sagaTranslations.en,
      panel = within(document.getElementById("workspace-tool-sagas")!),
      editor = screen.getByLabelText("OpenAPI schema editor"),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" }));
    expect(
      nav.getByRole("button", { name: en["saga.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByText(en["saga.title"], { selector: "summary" }));
    await panel.findByRole("button", { name: en["saga.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["saga.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["saga.runAll"] }));
    await waitFor(
      () =>
        expect(panel.getByRole("status")).toHaveTextContent(
          "9/9 saga expectations passed.",
        ),
      { timeout: 8000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
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
      { timeout: 8000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent(
      "9/9 saga expectations passed.",
    );
    expect(
      nav.getByRole("button", { name: en["saga.title"] }),
    ).toBeInTheDocument();
  });
});
