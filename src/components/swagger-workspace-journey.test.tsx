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
import { journeyTranslations } from "@/lib/journey-translations";
describe("workspace API journey integration", () => {
  it("retains model analysis and traces through invalid OpenAPI while preserving existing REST controls and studios", async () => {
    render(<SwaggerWorkspace />);
    const en = journeyTranslations.en,
      panel = within(document.getElementById("workspace-tool-journeys")!),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      nav.getByRole("button", { name: en["journey.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(
      panel.getByText(en["journey.title"], { selector: "summary" }),
    );
    await panel.findByRole("button", { name: en["journey.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["journey.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["journey.runAll"] }));
    await waitFor(
      () => expect(panel.getByRole("status")).toHaveTextContent("30/30"),
      { timeout: 7000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const title of [
      "Idempotency and duplicate-write studio",
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
    expect(panel.getByRole("status")).toHaveTextContent("30/30");
    expect(
      nav.getByRole("button", { name: en["journey.title"] }),
    ).toBeInTheDocument();
  });
});
