import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("try-it-out route", () => {
  it("returns a mock response with request analytics", async () => {
    const response = await POST(
      new Request("http://localhost/api/try-it-out", {
        body: JSON.stringify({
          method: "POST",
          path: "/users/{id}",
          requestBody: JSON.stringify({ name: "Mikhail" }),
          requestValues: [{ label: "Path: id", value: "42" }],
          responseBody: JSON.stringify({ id: "42", name: "Mikhail" }),
          status: "200",
        }),
        method: "POST",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      body: '{"id":"42","name":"Mikhail"}',
      status: "200",
    });
    expect(data.requestSize).toBeGreaterThan(0);
    expect(data.responseSize).toBeGreaterThan(0);
    expect(data.durationMs).toBeGreaterThan(0);
  });

  it("rejects broken payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/try-it-out", {
        body: "not-json",
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });
});
