import { describe, expect, it } from "vitest";
import {
  applyOAuthRequestToken,
  removeOAuthRequestToken,
} from "./oauth-request-auth";
import type { SecuritySchemeSummary } from "./openapi";
const scheme = (
  name: string,
  type: SecuritySchemeSummary["type"] = "oauth2",
): SecuritySchemeSummary => ({
  name,
  type,
  description: "",
  bearerFormat: "",
  parameterName: "",
  location: "",
  scheme: "bearer",
});
describe("explicit OAuth token handoff", () => {
  it("updates only a selected compatible scheme", () => {
    const old = {
      other: { enabled: true, token: "manual", username: "", password: "" },
    };
    expect(
      applyOAuthRequestToken(old, [scheme("OAuth")], "OAuth", "opaque-token"),
    ).toEqual({
      ...old,
      OAuth: {
        enabled: true,
        token: "opaque-token",
        username: "",
        password: "",
      },
    });
    expect(
      applyOAuthRequestToken(
        old,
        [scheme("key", "apiKey")],
        "key",
        "opaque-token",
      ),
    ).toBeNull();
  });
  it("forgets an owned credential only while its exact value still matches", () => {
    const values = applyOAuthRequestToken(
      {},
      [scheme("OAuth")],
      "OAuth",
      "owned",
    )!;
    expect(removeOAuthRequestToken(values, "OAuth", "owned")).toEqual({});
    expect(removeOAuthRequestToken(values, "OAuth", "outdated")).toBe(values);
    const disabled = { ...values, OAuth: { ...values.OAuth, enabled: false } };
    expect(removeOAuthRequestToken(disabled, "OAuth", "owned")).toBe(disabled);
  });
});
