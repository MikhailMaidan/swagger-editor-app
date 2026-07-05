import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AboutPage from "./about/page";
import ApiReferencePage from "./api-reference/page";
import HistoryPage from "./history/page";
import Home from "./page";
import SchemasPage from "./schemas/page";
import SignInPage from "./sign-in/page";
import SignUpPage from "./sign-up/page";

describe("app pages", () => {
  it("renders the main Swagger editor and viewer placeholders", () => {
    render(<Home />);

    const editor = screen.getByRole("textbox", {
      name: "OpenAPI schema editor",
    });

    expect((editor as HTMLTextAreaElement).value).toContain("openapi: 3.0.0");
    expect(
      screen.getByRole("heading", { name: "RSSwag Demo API" }),
    ).toBeVisible();
    expect(screen.getAllByText("/users/{id}")).toHaveLength(2);
  });

  it("renders the complete About page content", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { name: "RSSwag OpenAPI UI" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "RS School" })).toHaveAttribute(
      "href",
      "https://rs.school/",
    );
    expect(screen.getByText("Mikhail Maidan")).toBeVisible();
    expect(screen.getByText(/responsible for everything/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "MikhailMaidan" })).toHaveAttribute(
      "href",
      "https://github.com/MikhailMaidan",
    );
  });

  it("renders the protected History placeholder", () => {
    render(<HistoryPage />);

    expect(screen.getByRole("heading", { name: "History" })).toBeVisible();
    expect(screen.getByText(/not executed any requests yet/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Editor" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "API Reference" })).toHaveAttribute(
      "href",
      "/api-reference",
    );
  });

  it("renders secondary placeholder pages", () => {
    render(<ApiReferencePage />);
    expect(
      screen.getByRole("heading", { name: "Endpoint Documentation" }),
    ).toBeVisible();

    render(<SchemasPage />);
    expect(
      screen.getByRole("heading", { name: "Saved OpenAPI Schemas" }),
    ).toBeVisible();
  });

  it("renders sign in and sign up pages", () => {
    render(<SignInPage />);
    expect(screen.getByRole("heading", { name: "Sign In" })).toBeVisible();

    render(<SignUpPage />);
    expect(screen.getByRole("heading", { name: "Sign Up" })).toBeVisible();
  });
});
