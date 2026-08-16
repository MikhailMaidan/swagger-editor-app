import { describe, expect, it } from "vitest";
import {
  formatJsonBody,
  hasInvalidJsonBody,
  isJsonMediaType,
} from "./request-body";

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

  it("formats valid JSON bodies without touching unsupported content", () => {
    expect(formatJsonBody("application/json", '{"active":true}')).toBe(
      '{\n  "active": true\n}',
    );
    expect(formatJsonBody("application/problem+json", '[{"id":1}]')).toBe(
      '[\n  {\n    "id": 1\n  }\n]',
    );
    expect(formatJsonBody("application/json", '{"active":')).toBeNull();
    expect(formatJsonBody("application/xml", "<active />")).toBeNull();
  });
});
