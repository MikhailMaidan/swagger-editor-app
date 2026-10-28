import { describe, expect, it } from "vitest";
import {
  MAX_CORS_BYTES,
  corsHeaders,
  corsOrigin,
  corsUrl,
  defaultCorsCase,
  emptyCorsProject,
  normalizeCorsProject,
  parseCorsProject,
  serializeCorsProject,
} from "./cors-project";
import { demoCorsProject } from "./cors-demo";
describe("portable CORS projects", () => {
  it("round-trips projects and strips imported results and unknown data", () => {
    const p = demoCorsProject();
    expect(parseCorsProject(serializeCorsProject(p))).toEqual(p);
    expect(
      serializeCorsProject(
        normalizeCorsProject({
          ...p,
          results: { passed: true },
          token: "discard",
        }),
      ),
    ).not.toContain("discard");
  });
  it("requires literal modes and credential values without coercion", () => {
    const p = emptyCorsProject();
    for (const change of [
      { mode: ["cors"] },
      { credentials: ["include"] },
      { forcePreflight: "false" },
      { method: "put" },
    ]) {
      expect(() =>
        normalizeCorsProject({
          ...p,
          scenarios: [
            { ...p.scenarios[0], cases: [{ ...defaultCorsCase(), ...change }] },
          ],
        }),
      ).toThrow("project");
    }
    expect(() =>
      normalizeCorsProject({
        ...p,
        policies: [{ ...p.policies[0], credentials: "false" }],
      }),
    ).toThrow("project");
  });
  it("normalizes serialized origins, including default ports, IDNs and null", () => {
    expect(corsOrigin("https://APP.example:443/")).toBe("https://app.example");
    expect(corsOrigin("null")).toBe("null");
    expect(corsOrigin("https://例子.test")).toBe(
      new URL("https://例子.test").origin,
    );
    for (const o of [
      "https://app.example/path",
      "https://app.example?query=1",
      "https://u:p@app.example",
      "file:///path",
      "*",
      "https://app.example/#hash",
    ])
      expect(() => corsOrigin(o)).toThrow();
  });
  it("requires absolute HTTP URLs without credentials, fragments or outer whitespace", () => {
    expect(corsUrl("https://API.example:443/items?a=1")).toBe(
      "https://api.example/items?a=1",
    );
    for (const url of [
      "/items",
      "https://user:pass@api.example",
      "https://api.example/#x",
      " https://api.example/",
      "data:text/plain,hi",
    ])
      expect(() => corsUrl(url)).toThrow("url");
  });
  it("uses HTTP whitespace normalization and rejects ambiguous headers and non-byte values", () => {
    expect(corsHeaders({ "X-Value": " \tvalue\t " })).toEqual({
      "x-value": "value",
    });
    expect(corsHeaders({ "X-Value": "\u00a0value\u00a0" })).toEqual({
      "x-value": "\u00a0value\u00a0",
    });
    for (const h of [
      { A: "one", a: "two" },
      { "bad name": "v" },
      { safe: "a\r\nb" },
      { safe: "Привет" },
      { safe: 2 },
    ])
      expect(() => corsHeaders(h)).toThrow("headers");
  });
  it("bounds names, identities, quotas and ordered schedules", () => {
    const p = emptyCorsProject();
    p.policies[1].id = p.policies[0].id;
    expect(() => normalizeCorsProject(p)).toThrow("project");
    p.policies.pop();
    p.scenarios[0].cases = [
      defaultCorsCase("first", 1000),
      defaultCorsCase("last", 0),
    ];
    expect(() => normalizeCorsProject(p)).toThrow("project");
    p.scenarios[0].cases.reverse();
    p.cacheCapacity = 0;
    expect(() => normalizeCorsProject(p)).toThrow("project");
  });
  it("retains intentionally broken policies for diagnosis but rejects malformed definitions", () => {
    const p = emptyCorsProject();
    p.policies[0].origins = ["*"];
    p.policies[0].credentials = true;
    expect(normalizeCorsProject(p).policies[0].credentials).toBe(true);
    p.policies[0].origins.push("https://app.example");
    expect(() => normalizeCorsProject(p)).toThrow("project");
    p.policies[0].origins = [];
    p.policies[0].methods = ["TRACE" as never];
    expect(() => normalizeCorsProject(p)).toThrow("project");
  });
  it("rejects nonempty preflight/network/null-body responses and oversized UTF-8 bodies", () => {
    const p = emptyCorsProject(),
      c = p.scenarios[0].cases[0];
    c.preflight.body = "bad";
    expect(() => normalizeCorsProject(p)).toThrow("project");
    c.preflight.body = "";
    c.response.status = 204;
    expect(() => normalizeCorsProject(p)).toThrow("project");
    c.response.status = 200;
    c.response.body = "я".repeat(32769);
    expect(() => normalizeCorsProject(p)).toThrow("project");
  });
  it("rejects oversized input before parsing and never trusts malformed JSON", () => {
    expect(() => parseCorsProject(" ".repeat(MAX_CORS_BYTES + 1))).toThrow(
      "limit",
    );
    expect(() => parseCorsProject("{")).toThrow("json");
  });
  it("keeps a near-limit project exportable using compact JSON", () => {
    const p = emptyCorsProject();
    p.scenarios[0].cases = Array.from({ length: 32 }, (_, i) => {
      const c = defaultCorsCase(`c-${i}`);
      c.response.body = "x".repeat(65536);
      return c;
    });
    const last = p.scenarios[0].cases.at(-1)!;
    last.response.body = last.response.body.slice(
      0,
      -(JSON.stringify(p).length - MAX_CORS_BYTES + 10),
    );
    const source = serializeCorsProject(p);
    expect(source.length).toBeLessThanOrEqual(MAX_CORS_BYTES);
    expect(parseCorsProject(source).scenarios[0].cases).toHaveLength(32);
  });
});
