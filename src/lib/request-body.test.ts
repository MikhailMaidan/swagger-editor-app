import { describe, expect, it } from "vitest";
import { hasInvalidJsonBody, isJsonMediaType } from "./request-body";

describe("request body helpers", () => {
  it("recognizes standard and structured JSON media types", () => {
    expect(isJsonMediaType("application/json")).toBe(true);
    expect(isJsonMediaType("Application/Problem+JSON; charset=utf-8")).toBe(
      true,
    );
    expect(isJsonMediaType("application/xml")).toBe(false);
  });

  it("only rejects malformed, non-empty JSON bodies", () => {
    expect(hasInvalidJsonBody("application/json", '{"active":true}')).toBe(
      false,
    );
    expect(hasInvalidJsonBody("application/json", "  ")).toBe(false);
    expect(hasInvalidJsonBody("application/json", '{"active":')).toBe(true);
    expect(hasInvalidJsonBody("application/xml", "<active>")).toBe(false);
  });
});
