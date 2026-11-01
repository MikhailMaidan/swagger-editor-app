import { describe, expect, it } from "vitest";
import {
  MAX_NEGOTIATION_BYTES,
  emptyNegotiationProject,
  newNegotiationCase,
  normalizeNegotiationProject,
  parseNegotiationProject,
  serializeNegotiationProject,
} from "./negotiation-project";
import {
  compareNegotiationRuns,
  demoNegotiationProject,
  generateNegotiationCases,
  importNegotiationHar,
  negotiationMediaCatalog,
  negotiationReport,
  runNegotiationMatrix,
} from "./negotiation-studio";
import { DEFAULT_OPENAPI_SCHEMA } from "./openapi";
describe("negotiation projects, matrices and artifacts", () => {
  it("round trips known fields while dropping injected results and runtime state", () => {
    const p = emptyNegotiationProject(),
      raw = {
        ...p,
        results: ["private"],
        runtime: { token: "secret" },
        policies: p.policies.map((p) => ({ ...p, malicious: "ignored" })),
      };
    const parsed = parseNegotiationProject("\uFEFF" + JSON.stringify(raw));
    expect(parsed).toEqual(p);
    expect(JSON.parse(serializeNegotiationProject(parsed))).toEqual(p);
    parsed.policies[0].variants[0].name = "changed";
    expect(p.policies[0].variants[0].name).toBe("variant-1");
  });
  it("validates references, dense lists, weights, concrete types and bounded counts", () => {
    for (const modify of [
      (p: ReturnType<typeof emptyNegotiationProject>) => {
        p.policies = [];
      },
      (p) => {
        p.policies[0].variants = [];
      },
      (p) => {
        p.policies[0].variants[0].weight = 0;
      },
      (p) => {
        p.policies[0].variants[0].mediaType = "text/*";
      },
      (p) => {
        p.policies[0].variants[0].language = "en_US";
      },
      (p) => {
        p.cases[0].expect = { missing: { status: 406, variantId: null } };
      },
      (p) => {
        p.cases[0].expect = {
          "policy-1": { status: 200, variantId: "missing" },
        };
      },
      (p) => {
        p.cases[0].expect = {
          "policy-1": { status: 406, variantId: "variant-1" },
        };
      },
      (p) => {
        p.cases.push(p.cases[0]);
      },
      (p) => {
        p.policies.push(p.policies[0]);
      },
      (p) => {
        p.cases = new Array(1);
      },
      (p) => {
        p.cases = Array.from({ length: 201 }, (_, i) =>
          newNegotiationCase(`c${i}`),
        );
      },
      (p) => {
        p.cases[0].request.accept = "x".repeat(8193);
      },
    ] as ((p: ReturnType<typeof emptyNegotiationProject>) => void)[]) {
      const p = emptyNegotiationProject();
      modify(p);
      expect(() => normalizeNegotiationProject(p)).toThrow();
    }
    expect(() =>
      parseNegotiationProject("x".repeat(MAX_NEGOTIATION_BYTES + 1)),
    ).toThrow("limit");
    expect(() => parseNegotiationProject("{")).toThrow("json");
    const p = emptyNegotiationProject();
    p.cases = [];
    expect(normalizeNegotiationProject(p).cases).toEqual([]);
  });
  it("protects expectation maps with own properties, including prototype-like legal IDs", async () => {
    const p = emptyNegotiationProject();
    p.policies[0].id = "constructor";
    const runs = await runNegotiationMatrix(p);
    expect(runs[0]).toMatchObject({ checked: false, passed: false });
    p.cases[0].expect = JSON.parse(
      '{"constructor":{"status":200,"variantId":"variant-1"}}',
    );
    expect((await runNegotiationMatrix(p))[0].passed).toBe(true);
  });
  it("runs 36 demo expectations with independently asserted outcomes and ranking differences", async () => {
    const runs = await runNegotiationMatrix(demoNegotiationProject());
    expect(runs).toHaveLength(36);
    expect(runs.every((r) => r.checked && r.passed)).toBe(true);
    const selected = (policy: string, n: number) =>
      runs.find((r) => r.policyId === policy && r.caseId === `case-${n}`)!
        .decision;
    expect(selected("baseline", 2).variantId).toBe("json-ru");
    expect(selected("baseline", 3).variantId).toBe("json-gzip");
    expect(selected("baseline", 5).variantId).toBe("html-en");
    expect(selected("baseline", 6).status).toBe(406);
    expect(selected("baseline", 7).status).toBe(406);
    expect(selected("baseline", 8).variantId).toBe("json-v2");
    expect(selected("baseline", 9).status).toBe(406);
    expect(selected("baseline", 10).status).toBe(400);
    expect(selected("baseline", 11).status).toBe(406);
    expect(selected("baseline", 12).variantId).toBe("json-ru");
    expect(selected("media-first", 12).variantId).toBe("html-en");
    expect(
      compareNegotiationRuns(runs, "baseline", "media-first").changed,
    ).toBe(1);
    expect(
      compareNegotiationRuns(runs, "baseline", "language-agnostic").rows.every(
        (r) => r.varyChanged,
      ),
    ).toBe(true);
  });
  it("compares metadata and Vary changes even when IDs and statuses are unchanged", async () => {
    const p = emptyNegotiationProject();
    p.policies.push({ ...structuredClone(p.policies[0]), id: "next" });
    p.policies[1].variants[0].mediaType = "application/json;version=2";
    const c = compareNegotiationRuns(
      await runNegotiationMatrix(p),
      "policy-1",
      "next",
    );
    expect(c).toMatchObject({
      changed: 1,
      total: 1,
      rows: [{ representationChanged: true, varyChanged: false }],
    });
  });
  it("snapshots jobs, reports progress, treats unchecked separately and cancels atomically", async () => {
    const p = demoNegotiationProject(),
      progress: number[] = [];
    const promise = runNegotiationMatrix(
      p,
      "case-2",
      () => false,
      (n) => progress.push(n),
    );
    p.cases[1].request.accept = "text/bogus";
    expect((await promise).every((r) => r.passed)).toBe(true);
    expect(progress).toEqual([3]);
    let cancelled = false;
    await expect(
      runNegotiationMatrix(
        p,
        undefined,
        () => cancelled,
        () => {
          cancelled = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    expect(
      (await runNegotiationMatrix(emptyNegotiationProject()))[0],
    ).toMatchObject({ checked: false, passed: false });
    await expect(runNegotiationMatrix(p, "missing")).rejects.toThrow("project");
  });
  it("generates deduplicated Cartesian cases with unique IDs and preserves null versus empty", () => {
    const cases = generateNegotiationCases(
      {
        accept: [null, "", null],
        language: [null, "ru"],
        encoding: [null, "gzip"],
      },
      ["matrix-1"],
    );
    expect(cases).toHaveLength(8);
    expect(cases[0].id).toBe("matrix-2");
    expect(cases[4].request.accept).toBe("");
    expect(cases.every((c) => Object.keys(c.expect).length === 0)).toBe(true);
    expect(() =>
      generateNegotiationCases({
        accept: Array(13).fill(null),
        language: [null],
        encoding: [null],
      }),
    ).toThrow("limit");
    expect(() =>
      generateNegotiationCases({
        accept: Array.from({ length: 12 }, (_, i) => String(i)),
        language: Array.from({ length: 12 }, (_, i) => String(i)),
        encoding: [null, "", "br"],
      }),
    ).toThrow("limit");
    expect(() =>
      generateNegotiationCases({
        accept: new Array(1),
        language: [null],
        encoding: [null],
      }),
    ).toThrow("headers");
  });
  it("imports only negotiation fields, joins repeated lines and keeps malformed fixtures for 400", () => {
    const source = JSON.stringify({
      log: {
        entries: [
          {
            request: {
              url: "https://user:secret@private.test/path?q=secret",
              headers: [
                { name: "Authorization", value: "secret" },
                { name: "Accept", value: "application/json" },
                { name: "accept", value: "text/html;q=0.8" },
                { name: "Accept-Encoding", value: "" },
                { name: "Accept-Language", value: "en;q=2" },
              ],
            },
            response: { status: 200, body: "secret" },
          },
          { request: { headers: [] } },
          { request: { headers: [{ name: "Accept" }] } },
          {},
        ],
      },
    });
    const result = importNegotiationHar(source, ["har-1"]);
    expect(result.skipped).toBe(2);
    expect(result.cases).toHaveLength(2);
    expect(result.cases[0]).toMatchObject({
      id: "har-2",
      request: {
        accept: "application/json, text/html;q=0.8",
        language: "en;q=2",
        encoding: "",
      },
      expect: {},
    });
    expect(result.cases[1].request).toEqual({
      accept: null,
      language: null,
      encoding: null,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret|private\.test|Authorization/,
    );
  });
  it("rejects oversized HARs and excess cases without truncation", () => {
    expect(() =>
      importNegotiationHar(
        JSON.stringify({
          log: {
            entries: Array.from({ length: 201 }, () => ({
              request: { headers: [] },
            })),
          },
        }),
      ),
    ).toThrow("limit");
    expect(() => importNegotiationHar("{")).toThrow("har");
    expect(() =>
      importNegotiationHar(JSON.stringify({ log: { entries: [{}] } })),
    ).toThrow("har");
    expect(() => importNegotiationHar(" ".repeat(5 * 1024 * 1024 + 1))).toThrow(
      "limit",
    );
  });
  it("reads concrete OpenAPI response media types without altering the schema", () => {
    expect(negotiationMediaCatalog(DEFAULT_OPENAPI_SCHEMA)).toContain(
      "application/json",
    );
    expect(() => negotiationMediaCatalog("openapi: [")).toThrow("schema");
    const source = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "types", version: "1" },
      paths: {
        "/x": {
          get: {
            responses: {
              200: {
                description: "OK",
                content: {
                  "*/*": {},
                  "application/xml": {},
                  "application/json": {},
                },
              },
            },
          },
        },
      },
    });
    expect(negotiationMediaCatalog(source)).toEqual([
      "application/xml",
      "application/json",
    ]);
  });
  it("omits preferences, matched ranges and representation metadata from both report modes", async () => {
    const p = emptyNegotiationProject();
    p.policies[0].variants[0].mediaType =
      'application/json;profile="private-profile"';
    p.cases[0].request.accept = 'application/json;profile="private-profile"';
    const runs = await runNegotiationMatrix(p);
    for (const detailed of [false, true]) {
      const report = negotiationReport(runs, detailed),
        encoded = JSON.stringify(report);
      expect(encoded).not.toContain("private-profile");
      expect(encoded).not.toContain("application/json");
      expect(encoded).not.toContain('"range"');
      expect(report.runs[0].candidates !== undefined).toBe(detailed);
    }
  });
});
