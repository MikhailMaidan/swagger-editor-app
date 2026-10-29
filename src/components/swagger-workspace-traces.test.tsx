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
import { traceTranslations } from "@/lib/trace-translations";
describe("workspace trace studio integration", () => {
  it("retains trace work through invalid OpenAPI while preserving REST requests and existing studios", async () => {
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-traces")!),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor"),
      en = traceTranslations.en;
    expect(
      nav.getByRole("button", { name: en["trace.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(
      panel.getByText(en["trace.title"], { selector: "summary" }),
    );
    await panel.findByRole("button", { name: en["trace.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["trace.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["trace.run"] }));
    expect(panel.getByRole("status")).toHaveTextContent("7/7");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const title of [
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
    expect(panel.getByRole("status")).toHaveTextContent("7/7");
    expect(
      nav.getByRole("button", { name: en["trace.title"] }),
    ).toBeInTheDocument();
  });
});
