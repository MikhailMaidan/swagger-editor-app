import { describe, expect, it } from "vitest";
import {
  createDemoToken,
  getDisplayName,
  getTokenPayload,
  getUserNameFromToken,
  isTokenValid,
} from "./auth";

describe("auth helpers", () => {
  it("creates readable display names from email addresses", () => {
    expect(getDisplayName("mikhail.maidan@example.com")).toBe(
      "Mikhail Maidan",
    );
    expect(getDisplayName("@example.com")).toBe("User");
  });

  it("creates a valid demo token with user data", () => {
    const token = createDemoToken("alex.smith@example.com");
    const payload = getTokenPayload(token);

    expect(isTokenValid(token)).toBe(true);
    expect(payload?.email).toBe("alex.smith@example.com");
    expect(getUserNameFromToken(token)).toBe("Alex Smith");
  });

  it("rejects malformed or expired tokens", () => {
    const expiredToken = createDemoToken("old@example.com", -10);

    expect(isTokenValid("wrong-token")).toBe(false);
    expect(isTokenValid(expiredToken)).toBe(false);
    expect(getTokenPayload("wrong-token")).toBeNull();
    expect(getUserNameFromToken("wrong-token")).toBe("User");
  });
});
