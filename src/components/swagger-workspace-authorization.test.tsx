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
import { authzTranslations } from "@/lib/authz-translations";
describe("workspace authorization studio integration", () => {
  it("preserves access cases through invalid OpenAPI and retains existing REST and studio functionality", async () => {
    render(<SwaggerWorkspace />);
    const panel = within(
        document.getElementById("workspace-tool-authorization")!,
      ),
      en = authzTranslations.en,
      editor = screen.getByLabelText("OpenAPI schema editor"),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" }));
    expect(
      nav.getByRole("button", { name: en["authz.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(
      panel.getByText(en["authz.title"], { selector: "summary" }),
    );
    await panel.findByRole("button", { name: en["authz.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["authz.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["authz.runAll"] }));
    await waitFor(
      () => expect(panel.getByRole("status")).toHaveTextContent("36/36"),
      { timeout: 5000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const title of [
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
      { timeout: 5000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent("36/36");
    expect(
      nav.getByRole("button", { name: en["authz.title"] }),
    ).toBeInTheDocument();
  });
});
