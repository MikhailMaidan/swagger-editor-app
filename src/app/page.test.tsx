import { within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import Home from "./page";

// Rendered with react-dom/server instead of RTL's render(): RTL's render()
// flushes mount effects (wrapped in act()) before returning, so by the time
// any assertion runs, useClientAuthState's effect has already resynced to
// the client's own auth storage and the very mismatch this page.tsx fix
// prevents would be masked. renderToStaticMarkup never runs effects, so it
// captures exactly the first HTML the server sends - the one a browser
// paints before hydration - which is what was actually flashing wrong.
function renderServerMarkup(element: ReactElement) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(element);
  document.body.appendChild(container);
  return within(container);
}

describe("Home", () => {
  it("renders the authenticated save-button state in the very first server markup", async () => {
    globalThis.__COOKIE_MOCK__.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === AUTH_TOKEN_COOKIE
          ? { value: createDemoToken("mikhail@example.com") }
          : undefined,
      ),
    });

    const markup = renderServerMarkup(await Home());

    expect(
      markup.getByRole("button", { name: "Save schema" }),
    ).not.toBeDisabled();
    expect(
      markup.queryByText("Sign in to save and restore schemas."),
    ).not.toBeInTheDocument();
  });

  it("keeps the save button disabled in the first server markup for a signed-out visitor", async () => {
    globalThis.__COOKIE_MOCK__.mockResolvedValue({
      get: vi.fn(() => undefined),
    });

    const markup = renderServerMarkup(await Home());

    expect(markup.getByRole("button", { name: "Save schema" })).toBeDisabled();
    expect(
      markup.getByText("Sign in to save and restore schemas."),
    ).toBeVisible();
  });
});
