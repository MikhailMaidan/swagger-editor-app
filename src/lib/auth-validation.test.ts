import { describe, expect, it } from "vitest";
import {
  hasAuthFormErrors,
  validateAuthForm,
  validateEmail,
  validatePassword,
} from "./auth-validation";

describe("auth validation", () => {
  it("accepts valid email and unicode password values", () => {
    const errors = validateAuthForm("mikhail@example.com", "Пароль12!");

    expect(errors).toEqual({});
    expect(hasAuthFormErrors(errors)).toBe(false);
  });

  it("returns email validation errors", () => {
    expect(validateEmail("")).toBe("Email is required.");
    expect(validateEmail("not-email")).toBe("Enter a valid email address.");
  });

  it("trims surrounding whitespace before validating an email", () => {
    expect(validateEmail("  mikhail@example.com  ")).toBe("");
    expect(validateEmail("   ")).toBe("Email is required.");
  });

  it("returns password validation errors for each rule", () => {
    expect(validatePassword("")).toBe("Password is required.");
    expect(validatePassword("A1!")).toBe(
      "Password must contain at least 8 characters.",
    );
    expect(validatePassword("12345678!")).toBe(
      "Password must contain at least one letter.",
    );
    expect(validatePassword("Password!")).toBe(
      "Password must contain at least one digit.",
    );
    expect(validatePassword("Password1")).toBe(
      "Password must contain at least one special character.",
    );
  });

  it("only requires a non-empty password for sign-in, not the sign-up complexity policy", () => {
    expect(validateAuthForm("mikhail@example.com", "", "sign-in")).toEqual({
      password: "Password is required.",
    });
    expect(
      validateAuthForm("mikhail@example.com", "simple", "sign-in"),
    ).toEqual({});
  });

  it("still enforces the full password complexity policy for sign-up", () => {
    expect(
      validateAuthForm("mikhail@example.com", "simple", "sign-up"),
    ).toEqual({
      password: "Password must contain at least 8 characters.",
    });
  });
});
