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
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  it("renders sign up copy and a link to sign in", () => {
    render(<AuthForm mode="sign-up" />);

    expect(screen.getByRole("heading", { name: "Sign Up" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("shows and hides the password without clearing or submitting it", async () => {
    const user = userEvent.setup();

    render(<AuthForm mode="sign-in" />);

    const password = screen.getByLabelText("Password");
    const showPassword = screen.getByRole("button", {
      name: "Show password",
    });

    await user.type(password, "secret-value");

    expect(password).toHaveAttribute("type", "password");
    expect(showPassword).toHaveAttribute("aria-pressed", "false");

    await user.click(showPassword);

    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("secret-value");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Hide password" }));

    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("secret-value");
  });

  it("shows sign-up validation errors before submitting invalid data", async () => {
    const user = userEvent.setup();

    render(<AuthForm mode="sign-up" />);

    await user.type(screen.getByLabelText("Email"), "wrong-email");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(
      screen.getByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Password must contain at least one digit."),
    ).toBeInTheDocument();
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).not.toHaveBeenCalled();
  });

  it("does not enforce the sign-up password complexity policy on sign-in", async () => {
    const user = userEvent.setup();

    render(<AuthForm mode="sign-in" />);

    await user.type(screen.getByLabelText("Email"), "mikhail@example.com");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(
      screen.queryByText("Password must contain at least one digit."),
    ).not.toBeInTheDocument();
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).toHaveBeenCalledWith("/");
  });

  it("still requires a non-empty password on sign-in", async () => {
    const user = userEvent.setup();

    render(<AuthForm mode="sign-in" />);

    await user.type(screen.getByLabelText("Email"), "mikhail@example.com");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).not.toHaveBeenCalled();
  });

  it("trims whitespace from the email before validating and saving it", async () => {
    const user = userEvent.setup();

    render(<AuthForm mode="sign-up" />);

    await user.type(screen.getByLabelText("Email"), "  mikhail@example.com  ");
    await user.type(screen.getByLabelText("Password"), "Пароль12!");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(
      screen.queryByText("Enter a valid email address."),
    ).not.toBeInTheDocument();
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).toHaveBeenCalledWith("/");
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
