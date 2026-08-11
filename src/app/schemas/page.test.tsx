import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { SERVER_SAVED_SCHEMAS_COOKIE } from "@/lib/schema-storage";
import SchemasPage from "./page";

describe("SchemasPage", () => {
  it("does not leak a stale saved-schemas cookie to a signed-out visitor", async () => {
    globalThis.__COOKIE_MOCK__.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === SERVER_SAVED_SCHEMAS_COOKIE
          ? {
              value: JSON.stringify([
                {
                  createdAt: "2026-07-06T08:00:00.000Z",
                  format: "yaml",
                  id: "leaked",
                  schemaText: "openapi: 3.0.0",
                  title: "Someone Else's API",
                  updatedAt: "2026-07-06T08:00:00.000Z",
                  version: "1.0.0",
                },
              ]),
            }
          : undefined,
      ),
    });

    render(await SchemasPage());

    expect(screen.queryByText("Someone Else's API")).not.toBeInTheDocument();
    expect(
      screen.getByText(/have not saved any schemas yet/i),
    ).toBeVisible();
  });

  it("shows saved schemas for an authenticated visitor", async () => {
    const values: Record<string, string> = {
      [AUTH_TOKEN_COOKIE]: createDemoToken("mikhail@example.com"),
      [SERVER_SAVED_SCHEMAS_COOKIE]: JSON.stringify([
        {
          createdAt: "2026-07-06T08:00:00.000Z",
          format: "yaml",
          id: "own-schema",
          schemaText: "openapi: 3.0.0",
          title: "My Own API",
          updatedAt: "2026-07-06T08:00:00.000Z",
          version: "1.0.0",
        },
      ]),
    };

    globalThis.__COOKIE_MOCK__.mockResolvedValue({
      get: vi.fn((name: string) =>
        values[name] ? { value: values[name] } : undefined,
      ),
    });

    render(await SchemasPage());

    expect(screen.getByText("My Own API")).toBeVisible();
  });
});
