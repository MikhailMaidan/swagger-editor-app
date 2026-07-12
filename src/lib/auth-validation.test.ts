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
});
