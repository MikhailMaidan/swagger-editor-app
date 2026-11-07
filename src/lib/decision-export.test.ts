import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateDecisionSdk,
  generateDecisionRunner,
  generateDecisionService,
  generateDecisionContract,
} from "./decision-export";
import { demoDtProject } from "./decision-demo";
import {
  evaluateDecision,
  analyzeDecisionCatalog,
  findDecisionCounterfactual,
  type DTEvaluation,
  type DTCoverage,
  type DTCounterfactual,
} from "./decision-engine";
import {
  emptyDtProject,
  type DTProject,
  type DTScalar,
} from "./decision-model";
import { createDecisionHandler } from "./decision-service";
import { parseOpenApiSchema } from "./openapi";
type Sdk = {
  evaluateDecision: typeof evaluateDecision;
  analyzeDecisionCatalog: typeof analyzeDecisionCatalog;
  findDecisionCounterfactual: typeof findDecisionCounterfactual;
  createDecisionHandler: typeof createDecisionHandler;
};
const moduleFrom = async (source: string) =>
  await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
const request = (body: unknown, init: RequestInit = {}) =>
  new Request("https://example.test/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
afterEach(() => vi.useRealTimers());
describe("standalone decision engine and service exports", () => {
  it("executes native ESM with exact trace, coverage and counterfactual parity", async () => {
    const source = generateDecisionSdk(),
      sdk = (await moduleFrom(source)) as Sdk,
      p = demoDtProject();
    expect(source).not.toMatch(
      /\bfetch\s*\(|\beval\s*\(|new Function|localStorage|Shipping decision automation/,
    );
    for (const scenario of p.cases)
      expect(
        sdk.evaluateDecision(
          p,
          scenario.decisionId,
          scenario.context,
        ) as DTEvaluation,
      ).toEqual(evaluateDecision(p, scenario.decisionId, scenario.context));
    expect(
      (await sdk.analyzeDecisionCatalog(p, "shipping")) as DTCoverage,
    ).toEqual(await analyzeDecisionCatalog(p, "shipping"));
    const context = {
      region: "EU",
      subtotal: 50,
      member: false,
      express: false,
    };
    expect(
      (await sdk.findDecisionCounterfactual(p, "shipping", context, {
        status: "matched",
        output: 0,
      })) as DTCounterfactual,
    ).toEqual(
      await findDecisionCounterfactual(p, "shipping", context, {
        status: "matched",
        output: 0,
      }),
    );
  });
  it("executes the exported HTTP handler without fixtures and returns only the public result envelope", async () => {
    const p = demoDtProject(),
      source = generateDecisionService(p),
      sdk = (await moduleFrom(source)) as {
        handler: (r: Request) => Promise<Response>;
      };
    const embedded = JSON.parse(
      JSON.parse(source.match(/const project = JSON.parse\((.+)\);/)![1]),
    );
    expect(embedded.cases).toEqual([]);
    for (const scenario of p.cases) {
      const response = await sdk.handler(
        request({ decisionId: scenario.decisionId, context: scenario.context }),
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(Object.keys(result).sort()).toEqual([
        "decisionId",
        "matched",
        "output",
        "selected",
        "status",
      ]);
      expect(result).toMatchObject({
        decisionId: scenario.decisionId,
        status: scenario.expect!.status,
        output: scenario.expect!.output,
      });
    }
  });
  it("rejects unknown routes, methods, media types, envelopes and invalid contexts", async () => {
    const handler = createDecisionHandler(demoDtProject());
    expect(
      (await handler(new Request("https://example.test/other"))).status,
    ).toBe(404);
    const method = await handler(new Request("https://example.test/decide"));
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("POST");
    expect(
      (
        await handler(
          request({}, { headers: { "content-type": "text/plain" } }),
        )
      ).status,
    ).toBe(415);
    expect(
      (await handler(request({ decisionId: "unknown", context: {} }))).status,
    ).toBe(404);
    expect(
      (await handler(request({ decisionId: "shipping", context: {} }))).status,
    ).toBe(400);
    expect(
      (
        await handler(
          request({ decisionId: "membership", context: {}, extra: true }),
        )
      ).status,
    ).toBe(400);
    expect((await handler(request({}, { body: "{" }))).status).toBe(400);
  });
  it("bounds streamed and declared bodies and rejects malformed UTF-8 without echoing values", async () => {
    const handler = createDecisionHandler(demoDtProject());
    expect(
      (
        await handler(
          request(
            {},
            {
              headers: {
                "content-type": "application/json",
                "content-length": "20000",
              },
            },
          ),
        )
      ).status,
    ).toBe(413);
    const stream = (value: Uint8Array) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(value);
          controller.close();
        },
      });
    const big = new Request("https://example.test/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream(new Uint8Array(16385)),
      duplex: "half",
    } as RequestInit);
    expect((await handler(big)).status).toBe(413);
    const invalid = new Request("https://example.test/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream(Uint8Array.of(255)),
      duplex: "half",
    } as RequestInit);
    expect((await handler(invalid)).status).toBe(400);
  });
  it("terminates stalled body reads and respects aborts", async () => {
    const handler = createDecisionHandler(demoDtProject());
    vi.useFakeTimers();
    const stalled = () => new ReadableStream<Uint8Array>({ start() {} });
    const pending = handler(
      new Request("https://example.test/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stalled(),
        duplex: "half",
      } as RequestInit),
    );
    await vi.advanceTimersByTimeAsync(5001);
    expect((await pending).status).toBe(408);
    const controller = new AbortController(),
      aborted = handler(
        new Request("https://example.test/decide", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: stalled(),
          signal: controller.signal,
          duplex: "half",
        } as RequestInit),
      );
    controller.abort();
    expect((await aborted).status).toBe(400);
  });
  it.each(["local", "exported"])(
    "cancels malformed body streams in the %s handler",
    async (mode) => {
      const handler =
        mode === "local"
          ? createDecisionHandler(demoDtProject())
          : (
              (await moduleFrom(generateDecisionService(demoDtProject()))) as {
                handler: (request: Request) => Promise<Response>;
              }
            ).handler;
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.of(255));
        },
        cancel,
      });
      const response = await handler(
        new Request("https://example.test/decide", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          duplex: "half",
        } as RequestInit),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid-body" });
      expect(cancel).toHaveBeenCalledOnce();
      expect(body.locked).toBe(false);
    },
  );
  it("runs Node regression artifacts with useful exits and reports that omit private values", () => {
    const run = (p: DTProject) =>
      spawnSync(process.execPath, ["--input-type=module"], {
        input: generateDecisionRunner(p),
        encoding: "utf8",
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 2 * 1024 * 1024,
      });
    const p = demoDtProject(),
      result = run(p);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).runs).toHaveLength(12);
    expect(result.stdout).not.toMatch(/"context"\s*:|"output"\s*:|"value"\s*:/);
    p.cases = [p.cases[0]];
    p.cases[0].expect!.output = "wrong";
    expect(run(p).status).toBe(1);
    p.cases[0].expect = null;
    expect(run(p).status).toBe(1);
    p.cases = [];
    const empty = run(p);
    expect(empty.status).toBe(1);
    expect(JSON.parse(empty.stdout).runs).toEqual([]);
    expect(empty.stderr).toContain("No decision cases");
  });
  it("generates a parseable OpenAPI contract with transitive required inputs and no catalog values", () => {
    const text = generateDecisionContract(demoDtProject()),
      contract = JSON.parse(text);
    expect(parseOpenApiSchema(text).ok).toBe(true);
    expect(text).not.toContain("APAC");
    expect(text).not.toContain("eu-loyal");
    const schemas =
      contract.paths["/decide"].post.requestBody.content["application/json"]
        .schema.oneOf;
    const total = schemas.find(
      (s: { properties: { decisionId: { const: string } } }) =>
        s.properties.decisionId.const === "total",
    );
    expect(total.properties.context.required).toEqual([
      "region",
      "subtotal",
      "express",
    ]);
    expect(total.properties.context.properties.member.type).toEqual([
      "boolean",
      "null",
    ]);
  });
  it("preserves own JSON keys and escapes embedded script metadata", async () => {
    const p = emptyDtProject();
    p.name = "</script>\u2028";
    p.decisions[0].fallback = {
      op: "literal",
      value: JSON.parse('{"__proto__":{"kept":true}}'),
    };
    const source = generateDecisionService(p);
    expect(source).not.toContain("</script>");
    const artifact = (await moduleFrom(source)) as {
      handler: (r: Request) => Promise<Response>;
    };
    const value = await (
      await artifact.handler(
        request({
          decisionId: "decision",
          context: { amount: 0 } as Record<string, DTScalar>,
        }),
      )
    ).json();
    expect(Object.hasOwn(value.output, "__proto__")).toBe(true);
  });
  it("keeps the portable runtime synchronized with the source engine", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/build-decision-toolkit.mjs", "--check"],
      { encoding: "utf8", windowsHide: true, timeout: 20000 },
    );
    expect(result.status, result.stderr).toBe(0);
  });
});
