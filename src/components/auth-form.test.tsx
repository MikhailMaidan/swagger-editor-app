import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth";
import { AuthForm } from "./auth-form";

describe("AuthForm", () => {
  it("renders sign in copy and a link to sign up", () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.getByRole("heading", { name: "Sign In" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });

  it("renders sign up copy and a link to sign in", () => {
    render(<AuthForm mode="sign-up" />);

    expect(screen.getByRole("heading", { name: "Sign Up" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("shows validation errors before submitting invalid data", async () => {
    const user = userEvent.setup();

    render(<AuthForm mode="sign-in" />);

    await user.type(screen.getByLabelText("Email"), "wrong-email");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(
      screen.getByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Password must contain at least one digit."),
    ).toBeInTheDocument();
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).not.toHaveBeenCalled();
  });

  it("saves auth state and redirects on valid submit", async () => {
    const user = userEvent.setup();

    render(<AuthForm mode="sign-up" />);

    await user.type(screen.getByLabelText("Email"), "mikhail@example.com");
    await user.type(screen.getByLabelText("Password"), "Пароль12!");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(window.localStorage.getItem(AUTH_TOKEN_COOKIE)).toBeTruthy();
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).toHaveBeenCalledWith("/");
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.refresh).toHaveBeenCalled();
  });
});
