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
import { sloTranslations } from "@/lib/slo-translations";
describe("workspace SLO studio integration", () => {
  it("preserves REST and existing studios and keeps SLO comparisons available through invalid OpenAPI", async () => {
    render(<SwaggerWorkspace />);
    const en = sloTranslations.en,
      panel = within(document.getElementById("workspace-tool-slo")!),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      nav.getByRole("button", { name: en["slo.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByText(en["slo.title"], { selector: "summary" }));
    await panel.findByRole("button", { name: en["slo.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["slo.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["slo.runAll"] }));
    await waitFor(
      () =>
        expect(panel.getByRole("status")).toHaveTextContent(
          "18/18 expectations passed",
        ),
      { timeout: 9000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
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
      "18/18 expectations passed",
    );
    expect(
      nav.getByRole("button", { name: en["slo.title"] }),
    ).toBeInTheDocument();
  });
});
