import { describe, expect, it } from "vitest";
import { SERVER_SAVED_SCHEMAS_COOKIE } from "@/lib/schema-storage";
import { GET, POST } from "./route";

const currentSchema = {
  createdAt: "2026-07-10T10:00:00.000Z",
  format: "yaml",
  id: "current-schema",
  schemaText: "openapi: 3.0.0",
  title: "Current API",
  updatedAt: "2026-07-10T10:00:00.000Z",
  version: "1.0.0",
};

const oldSchema = {
  createdAt: "2026-07-10T09:00:00.000Z",
  format: "json",
  id: "old-schema",
  schemaText: '{"openapi":"3.0.0"}',
  title: "Old API",
  updatedAt: "2026-07-10T09:00:00.000Z",
  version: "0.9.0",
};

describe("schemas route", () => {
  it("returns an empty saved schemas list", async () => {
    const response = await GET(new Request("http://localhost/api/schemas"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schemas).toEqual([]);
  });

  it("stores a saved schema record in a cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/schemas", {
        body: JSON.stringify(currentSchema),
        headers: {
          cookie: `${SERVER_SAVED_SCHEMAS_COOKIE}=${encodeURIComponent(
            JSON.stringify([oldSchema]),
          )}`,
        },
        method: "POST",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schemas).toMatchObject([
      { id: "current-schema", title: "Current API" },
      { id: "old-schema", title: "Old API" },
    ]);
    expect(response.headers.get("set-cookie")).toContain(
      SERVER_SAVED_SCHEMAS_COOKIE,
    );
  });

  it("rejects malformed saved schemas", async () => {
    const response = await POST(
      new Request("http://localhost/api/schemas", {
        body: JSON.stringify({
          title: "Broken API",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });
});
