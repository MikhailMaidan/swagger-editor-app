import { webcrypto } from "node:crypto";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA, parseOpenApiSchema } from "@/lib/openapi";
afterEach(() => vi.unstubAllGlobals());
const oauthButton = (panel: ReturnType<typeof within>, name: string) =>
  panel.getByRole("button", { name });
describe("workspace OAuth integration", () => {
  it("adds independent offline authorization tools and retains work through invalid OpenAPI input", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-oauth")!),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "OAuth authorization studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByText("OAuth authorization studio", { selector: "summary" }),
    );
    await user.click(oauthButton(panel, "Run offline OAuth lifecycle demo"));
    await panel.findByText("OAuth state: Access token received");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.getByText("SOAP contract studio", { selector: "summary" }),
    ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(
      panel.getByText("OAuth state: Access token received"),
    ).toBeInTheDocument();
    expect(
      oauthButton(panel, "Use live token for selected API scheme"),
    ).toBeDisabled();
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "OAuth authorization studio" }),
    ).toBeInTheDocument();
  });
  it("hands a live token to the selected scheme and preserves unrelated/manually edited credentials on forget", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "actual-token",
          refresh_token: "actual-refresh",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const parsed = parseOpenApiSchema(DEFAULT_OPENAPI_SCHEMA);
    if (!parsed.ok) throw new Error("Invalid default fixture");
    const schema = {
      ...parsed.value.schema,
      security: [{ OAuth: [] }],
      components: {
        securitySchemes: {
          OAuth: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: "https://identity.example/authorize",
                tokenUrl: "https://identity.example/token",
                scopes: { "read:items": "Read" },
              },
            },
          },
          Other: { type: "http", scheme: "bearer" },
        },
      },
    };
    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: JSON.stringify(schema) },
    });
    await screen.findByLabelText("Credential for OAuth", {}, { timeout: 5000 });
    const panel = within(document.getElementById("workspace-tool-oauth")!);
    await user.click(
      panel.getByText("OAuth authorization studio", { selector: "summary" }),
    );
    fireEvent.change(panel.getByLabelText("Public client ID"), {
      target: { value: "public-client" },
    });
    await user.click(oauthButton(panel, "Save OAuth profile"));
    await user.click(oauthButton(panel, "Prepare PKCE authorization link"));
    const auth = new URL(
        (
          (await panel.findByLabelText(
            "Session authorization URL",
          )) as HTMLInputElement
        ).value,
      ),
      redirect = (
        panel.getByLabelText(
          "Register this exact OAuth redirect URI",
        ) as HTMLInputElement
      ).value;
    fireEvent.change(panel.getByLabelText("Session-only callback URL"), {
      target: {
        value: `${redirect}&iss=https%3A%2F%2Fidentity.example&state=${auth.searchParams.get("state")}&code=one-time-code`,
      },
    });
    await user.click(oauthButton(panel, "Validate callback and exchange code"));
    await panel.findByText("OAuth state: Access token received");
    fireEvent.change(panel.getByLabelText("API authentication target"), {
      target: { value: "OAuth" },
    });
    await user.click(
      oauthButton(panel, "Use live token for selected API scheme"),
    );
    expect(screen.getByLabelText("Credential for OAuth")).toHaveValue(
      "actual-token",
    );
    fireEvent.change(screen.getByLabelText("Credential for OAuth"), {
      target: { value: "manually-replaced" },
    });
    await user.click(oauthButton(panel, "Forget OAuth session credentials"));
    expect(screen.getByLabelText("Credential for OAuth")).toHaveValue(
      "manually-replaced",
    );
    expect(screen.getByLabelText("Credential for Other")).toHaveValue("");
  });
});
