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
import { consistencyTranslations } from "@/lib/consistency-translations";
describe("workspace consistency studio integration", () => {
  it("keeps existing functionality and concurrency results when OpenAPI becomes invalid", async () => {
    render(<SwaggerWorkspace />);
    const en = consistencyTranslations.en,
      panel = within(document.getElementById("workspace-tool-consistency")!),
      editor = screen.getByLabelText("OpenAPI schema editor"),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" }));
    expect(
      nav.getByRole("button", { name: en["consistency.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(
      panel.getByText(en["consistency.title"], { selector: "summary" }),
    );
    await panel.findByRole("button", { name: en["consistency.demo"] });
    fireEvent.click(
      panel.getByRole("button", { name: en["consistency.demo"] }),
    );
    fireEvent.click(
      panel.getByRole("button", { name: en["consistency.runAll"] }),
    );
    await waitFor(
      () =>
        expect(panel.getByRole("status")).toHaveTextContent(
          "12/12 consistency expectations matched.",
        ),
      { timeout: 10000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
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
      { timeout: 10000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent(
      "12/12 consistency expectations matched.",
    );
    expect(
      nav.getByRole("button", { name: en["consistency.title"] }),
    ).toBeInTheDocument();
  });
});
