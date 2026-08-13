import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    expect(screen.getByRole("link", { name: "API Reference" })).toHaveAttribute(
      "href",
      "/#api-viewer",
    );
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    expect(screen.getByRole("button", { name: "English" }).className).toContain(
      "cursor-pointer",
    );
    expect(
      screen.getByRole("navigation", { name: "Main navigation" }).className,
    ).toContain("text-[19px]");
    expect(screen.getByRole("link", { name: "Sign In" }).className).toContain(
      "h-[58px]",
    );
    expect(
      screen.queryByRole("link", { name: "Schemas" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the nav scrollable at every breakpoint instead of letting overflow bleed into the language switcher", () => {
    render(<AppHeader initialIsAuthenticated={false} initialUserName="User" />);

    const navClassName = screen.getByRole("navigation", {
      name: "Main navigation",
    }).className;

    // A breakpoint-gated "overflow-visible" here previously let the desktop
    // nav links (revealed only at xl:) overlap the language switcher at
    // viewport widths where the flex-1 box couldn't fit them yet (~1024px
    // and ~1280-1400px) - overflow-x-auto must stay active unconditionally
    // so excess content scrolls within the nav instead of spilling out.
    expect(navClassName).toContain("overflow-x-auto");
    expect(navClassName).not.toMatch(/overflow-visible/);
  });

  it("activates and scrolls to the viewer when API Reference is selected", async () => {
    const viewer = document.createElement("section");
    viewer.id = "api-viewer";
    viewer.scrollIntoView = vi.fn();
    document.body.appendChild(viewer);

    render(<AppHeader initialIsAuthenticated={false} initialUserName="User" />);

    await userEvent.click(screen.getByRole("link", { name: "API Reference" }));

    expect(window.location.hash).toBe("#api-viewer");
    expect(
      screen
        .getByRole("link", { name: "API Reference" })
        .className.split(/\s+/),
    ).toContain("text-[color:var(--color-brand-purple)]");
    expect(
      screen.getByRole("link", { name: "Home" }).className.split(/\s+/),
    ).not.toContain("text-[color:var(--color-brand-purple)]");
    expect(viewer.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("restores the Home active state after leaving the viewer anchor", async () => {
    const scrollToMock = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => undefined);
    window.history.replaceState(null, "", "/#api-viewer");

    render(<AppHeader initialIsAuthenticated={false} initialUserName="User" />);

    await userEvent.click(screen.getByRole("link", { name: "Home" }));

    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("");
    expect(
      screen.getByRole("link", { name: "Home" }).className.split(/\s+/),
    ).toContain("text-[color:var(--color-brand-purple)]");
    expect(
      screen
        .getByRole("link", { name: "API Reference" })
        .className.split(/\s+/),
    ).not.toContain("text-[color:var(--color-brand-purple)]");

    scrollToMock.mockRestore();
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
    expect(screen.getByRole("link", { name: "Schemas" })).toHaveAttribute(
      "href",
      "/schemas",
    );
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

  it("animates into a compact sticky state after scrolling", async () => {
    render(<AppHeader initialIsAuthenticated={false} initialUserName="User" />);

    const headerShell = screen.getByTestId("app-header-shell");

    expect(headerShell.className).toContain("py-3");
    expect(headerShell).toHaveAttribute("data-sticky-state", "expanded");

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 80,
    });
    fireEvent.scroll(window);

    await waitFor(() =>
      expect(headerShell).toHaveAttribute("data-sticky-state", "compact"),
    );
    expect(headerShell.className).toContain("py-2");
    expect(headerShell.className).toContain("-translate-y-2");
    expect(headerShell.className).toContain(
      "border-[color:var(--color-brand-purple)]",
    );

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 18,
    });
    fireEvent.scroll(window);

    await waitFor(() =>
      expect(headerShell).toHaveAttribute("data-sticky-state", "compact"),
    );

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });
    fireEvent.scroll(window);

    await waitFor(() =>
      expect(headerShell).toHaveAttribute("data-sticky-state", "expanded"),
    );
  });

  it("coalesces rapid scroll events into a single update per animation frame", async () => {
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<AppHeader initialIsAuthenticated={false} initialUserName="User" />);
    rafSpy.mockClear();

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 80,
    });
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    fireEvent.scroll(window);

    expect(rafSpy).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(screen.getByTestId("app-header-shell")).toHaveAttribute(
        "data-sticky-state",
        "compact",
      ),
    );

    rafSpy.mockRestore();
  });
});
