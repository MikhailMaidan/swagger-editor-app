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
    expect(getDisplayName("mikhail.maidan@example.com")).toBe("Mikhail Maidan");
    expect(getDisplayName("@example.com")).toBe("User");
  });

  it("creates a valid demo token with user data", () => {
    const token = createDemoToken("alex.smith@example.com");
    const payload = getTokenPayload(token);

    expect(isTokenValid(token)).toBe(true);
    expect(payload?.email).toBe("alex.smith@example.com");
    expect(getUserNameFromToken(token)).toBe("Alex Smith");
  });

  it.each([
    {
      name: { label: "Alex" },
      email: "alex.smith@example.com",
      expected: "Alex Smith",
    },
    { name: ["Alex"], email: "alex.smith@example.com", expected: "Alex Smith" },
    { name: 42, email: "alex.smith@example.com", expected: "Alex Smith" },
    { name: true, email: "alex.smith@example.com", expected: "Alex Smith" },
    { name: "", email: { address: "alex@example.com" }, expected: "User" },
    { name: "", email: ["alex@example.com"], expected: "User" },
    { name: "", email: 42, expected: "User" },
    { name: "", email: true, expected: "User" },
    {
      name: "Display Name",
      email: { address: "alex@example.com" },
      expected: "Display Name",
    },
  ])(
    "resolves a string display name for malformed claims: %j",
    ({ name, email, expected }) => {
      const baseToken = createDemoToken("alex.smith@example.com");
      const [header, , signature] = baseToken.split(".");
      const body = Buffer.from(
        JSON.stringify({
          ...getTokenPayload(baseToken),
          name,
          email,
        }),
      ).toString("base64url");
      const token = `${header}.${body}.${signature}`;

      expect(isTokenValid(token)).toBe(true);
      expect(getUserNameFromToken(token)).toBe(expected);
    },
  );

  it("rejects malformed or expired tokens", () => {
    const expiredToken = createDemoToken("old@example.com", -10);

    expect(isTokenValid("wrong-token")).toBe(false);
    expect(isTokenValid(expiredToken)).toBe(false);
    expect(
      isTokenValid(
        createDemoToken("mikhail@example.com").replace(/\.demo$/, ".forged"),
      ),
    ).toBe(false);
    expect(getTokenPayload("wrong-token")).toBeNull();
    expect(getUserNameFromToken("wrong-token")).toBe("User");
  });

  it.each([
    { sub: "", email: "" },
    { sub: "", email: null },
    { sub: null, email: "" },
    { sub: "", email: 42 },
    { sub: 42, email: "" },
  ])("rejects tokens without a usable user identity: %j", (claims) => {
    const baseToken = createDemoToken("alex.smith@example.com");
    const [header, , signature] = baseToken.split(".");
    const body = Buffer.from(
      JSON.stringify({
        ...getTokenPayload(baseToken),
        ...claims,
      }),
    ).toString("base64url");

    expect(isTokenValid(`${header}.${body}.${signature}`)).toBe(false);
  });

  it.each(["1e999", "-1e999"])(
    "rejects a token with a non-finite expiration of %s",
    (expiration) => {
      const [header] = createDemoToken("alex.smith@example.com").split(".");
      const body = Buffer.from(
        `{"sub":"alex.smith@example.com","exp":${expiration}}`,
      ).toString("base64url");

      expect(isTokenValid(`${header}.${body}.demo`)).toBe(false);
    },
  );
});
