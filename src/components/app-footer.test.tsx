import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { AppFooter } from "./app-footer";

describe("AppFooter", () => {
  it("shows the brand, tagline, and public navigation for guests", () => {
    render(<AppFooter />);

    expect(screen.getByLabelText("RSSwag home page")).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByText(/OpenAPI editor, viewer, REST client/i),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(
      screen.queryByRole("link", { name: "Schemas" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "History" }),
    ).not.toBeInTheDocument();
  });

  it("shows the resource links pointing at the real GitHub repo and RS School", () => {
    render(<AppFooter />);

    expect(
      screen.getByRole("link", { name: /View Source on GitHub/i }),
    ).toHaveAttribute(
      "href",
      "https://github.com/MikhailMaidan/swagger-editor-app",
    );
    expect(
      screen.getByRole("link", { name: /RS School Course/i }),
    ).toHaveAttribute("href", "https://rs.school/");
  });

  it("opens external resource links in a new tab safely", () => {
    render(<AppFooter />);

    const githubLink = screen.getByRole("link", {
      name: /View Source on GitHub/i,
    });

    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(githubLink).toHaveAttribute("rel", "noreferrer");
  });

  it("includes the copyright line with the current year", () => {
    render(<AppFooter />);

    expect(
      screen.getByText(new RegExp(`© ${new Date().getFullYear()} RSSwag`)),
    ).toBeVisible();
  });

  it("adds Schemas and History links once a user is authenticated", () => {
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail.maidan@example.com"),
    );

    render(<AppFooter initialIsAuthenticated initialUserName="Mikhail" />);

    expect(screen.getByRole("link", { name: "Schemas" })).toHaveAttribute(
      "href",
      "/schemas",
    );
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "/history",
    );
  });
});
