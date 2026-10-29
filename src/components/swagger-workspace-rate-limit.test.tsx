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
import { rateTranslations } from "@/lib/rate-translations";
describe("workspace rate-limit studio integration", () => {
  it("retains quota work through invalid OpenAPI while preserving existing REST controls and studios", async () => {
    render(<SwaggerWorkspace />);
    const panel = within(
        document.getElementById("workspace-tool-rate-limits")!,
      ),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor"),
      en = rateTranslations.en;
    expect(
      nav.getByRole("button", { name: en["rate.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByText(en["rate.title"], { selector: "summary" }));
    await panel.findByRole("button", { name: en["rate.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["rate.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["rate.runAll"] }));
    await waitFor(
      () =>
        expect(
          panel.queryByText(en["rate.busy"], { exact: false }),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent("16/16");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const title of [
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
      { timeout: 5000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent("16/16");
    expect(
      nav.getByRole("button", { name: en["rate.title"] }),
    ).toBeInTheDocument();
  });
});
