import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { AppHeader } from "./app-header";

describe("AppHeader", () => {
  it("shows public navigation and auth links for non-authenticated users", () => {
    render(<AppHeader initialIsAuthenticated={false} initialUserName="User" />);

    expect(screen.getByLabelText("RSSwag home page")).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });

  it("shows history and sign out controls for authenticated users", () => {
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail.maidan@example.com"),
    );

    render(
      <AppHeader initialIsAuthenticated initialUserName="Mikhail Maidan" />,
    );

    expect(screen.getByText("Mikhail Maidan")).toBeVisible();
    expect(screen.getByRole("link", { name: /history/i })).toHaveAttribute(
      "href",
      "/history",
    );
    expect(screen.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  it("clears auth state and redirects to main page on sign out", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    render(
      <AppHeader initialIsAuthenticated initialUserName="Mikhail Maidan" />,
    );

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    expect(window.localStorage.getItem(AUTH_TOKEN_COOKIE)).toBeNull();
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).toHaveBeenCalledWith("/");
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.refresh).toHaveBeenCalled();
  });

  it("animates into a compact sticky state after scrolling", () => {
    render(<AppHeader initialIsAuthenticated={false} initialUserName="User" />);

    const headerShell = screen.getByTestId("app-header-shell");

    expect(headerShell.className).toContain("py-3");

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 80,
    });
    fireEvent.scroll(window);

    expect(headerShell.className).toContain("py-2");
    expect(headerShell.className).toContain(
      "border-[color:var(--color-brand-purple)]",
    );
  });
});
