import { describe, expect, it } from "vitest";
import { formatResponseHeaders } from "./response-headers";

describe("response header helpers", () => {
  it("formats response headers as a stable HTTP-style block", () => {
    expect(
      formatResponseHeaders({
        "x-request-id": "request-42",
        "content-type": "application/json",
      }),
    ).toBe("content-type: application/json\nx-request-id: request-42");
  });

  it("returns an empty string when no response headers are available", () => {
    expect(formatResponseHeaders({})).toBe("");
  });
});
