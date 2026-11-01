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
import { negotiationTranslations } from "@/lib/negotiation-translations";
describe("workspace negotiation integration", () => {
  it("preserves existing REST and studios and keeps offline negotiations through invalid OpenAPI", async () => {
    render(<SwaggerWorkspace />);
    const en = negotiationTranslations.en,
      panel = within(document.getElementById("workspace-tool-negotiation")!),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      nav.getByRole("button", { name: en["neg.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByText(en["neg.title"], { selector: "summary" }));
    await panel.findByRole("button", { name: en["neg.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["neg.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["neg.runAll"] }));
    await waitFor(
      () => expect(panel.getByRole("status")).toHaveTextContent("36/36"),
      { timeout: 7000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
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
    expect(panel.getByRole("status")).toHaveTextContent("36/36");
    expect(
      nav.getByRole("button", { name: en["neg.title"] }),
    ).toBeInTheDocument();
  });
});
