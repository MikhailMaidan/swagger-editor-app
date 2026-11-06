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
import { dataQueryTranslations } from "@/lib/data-query-translations";
describe("workspace data query federation integration", () => {
  it("retains REST, existing studios and query results through invalid OpenAPI edits", async () => {
    render(<SwaggerWorkspace />);
    const en = dataQueryTranslations.en,
      panel = within(document.getElementById("workspace-tool-data-query")!),
      editor = screen.getByLabelText("OpenAPI schema editor"),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" }));
    expect(
      nav.getByRole("button", { name: en["dataQuery.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(
      panel.getByText(en["dataQuery.title"], { selector: "summary" }),
    );
    await panel.findByRole("button", { name: en["dataQuery.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["dataQuery.demo"] }));
    fireEvent.click(
      panel.getByRole("button", { name: en["dataQuery.runAll"] }),
    );
    await waitFor(
      () =>
        expect(panel.getByRole("status")).toHaveTextContent(
          "10/10 data query expectations passed.",
        ),
      { timeout: 10000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
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
      "10/10 data query expectations passed.",
    );
    expect(
      nav.getByRole("button", { name: en["dataQuery.title"] }),
    ).toBeInTheDocument();
  });
});
