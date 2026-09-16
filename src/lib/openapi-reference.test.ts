import { describe, expect, it } from "vitest";
import { extractEndpoints } from "./openapi";

const response = { description: "Resolved response" };
describe("local reference chains in endpoint extraction", () => {
  it("retains intermediate alias descriptions while resolving the final response content", () => {
    const schema = {
      paths: {
        "/items": { get: { responses: { "200": { $ref: "#/responses/A" } } } },
      },
      responses: {
        A: { $ref: "#/responses/B", description: "Alias description" },
        B: { $ref: "#/responses/C", description: "Deeper description" },
        C: {
          description: "Target description",
          content: { "application/json": { schema: { type: "string" } } },
        },
      },
    };
    expect(extractEndpoints(schema)[0].responses[0]).toMatchObject({
      description: "Alias description",
      contentTypes: ["application/json"],
      schema: { type: "string" },
    });
  });
  it("resolves path items and response chains while keeping explicit path operations", () => {
    const schema = {
      paths: {
        "/items": {
          $ref: "#/shared/path",
          post: { summary: "Local operation", responses: { "201": response } },
        },
      },
      shared: {
        path: { $ref: "#/shared/actual" },
        actual: {
          get: {
            summary: "Referenced operation",
            responses: { "200": { $ref: "#/shared/alias" } },
          },
        },
        alias: { $ref: "#/shared/response" },
        response,
      },
    };
    const original = JSON.stringify(schema);
    expect(
      extractEndpoints(schema).map((entry) => ({
        method: entry.method,
        summary: entry.summary,
        response: entry.responses[0].description,
      })),
    ).toEqual([
      {
        method: "GET",
        summary: "Referenced operation",
        response: "Resolved response",
      },
      {
        method: "POST",
        summary: "Local operation",
        response: "Resolved response",
      },
    ]);
    expect(JSON.stringify(schema)).toBe(original);
  });
  it("decodes pointer URI fragments and follows array indexes", () => {
    expect(
      extractEndpoints({
        paths: { "/items": { $ref: "#/shared/a%20b~1c~0/0" } },
        shared: { "a b/c~": [{ get: { responses: { "200": response } } }] },
      })[0].responses[0].description,
    ).toBe("Resolved response");
  });
  it.each([
    "#/shared/A",
    "#/constructor/prototype",
    "#/shared/%zz",
    "#/shared/bad~2key",
  ])("leaves unresolved or circular references bounded: %s", ($ref) => {
    const schema = {
      paths: { "/items": { $ref, get: { responses: { "200": response } } } },
      shared: { A: { $ref: "#/shared/B" }, B: { $ref: "#/shared/A" } },
    };
    expect(extractEndpoints(schema)).toHaveLength(1);
    expect(extractEndpoints(schema)[0].responses[0].description).toBe(
      "Resolved response",
    );
  });
});
