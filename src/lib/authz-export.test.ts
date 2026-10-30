import { describe, expect, it, vi } from "vitest";
import { generateAuthzGuard } from "./authz-export";
import { createAuthzEvaluator, type AuthzDecision } from "./authz-engine";
import {
  AUTHZ_OPERATORS,
  newAuthzCase,
  newAuthzRule,
  type AuthzInput,
  type AuthzJson,
  type AuthzPolicy,
} from "./authz-project";
import { demoAuthzProject } from "./authz-studio";
async function artifact(policy: AuthzPolicy) {
  const source = generateAuthzGuard(policy);
  const exported = (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  )) as {
    evaluateAuthorization: (value: unknown) => AuthzDecision;
    createAuthorizationGuard: (options: {
      classify: (request: Request, ...args: unknown[]) => unknown;
      handler: (
        request: Request,
        decision: AuthzDecision,
        ...args: unknown[]
      ) => Response | Promise<Response>;
    }) => (request: Request, ...args: unknown[]) => Promise<Response>;
  };
  return { source, ...exported };
}
describe("standalone authorization guard", () => {
  it.each(["roles", "tenant", "owner"])(
    "executes actual %s ESM with full decision parity",
    async (id) => {
      const p = demoAuthzProject(),
        policy = p.policies.find((p) => p.id === id)!,
        exported = await artifact(policy),
        browser = createAuthzEvaluator(policy);
      for (const c of p.cases)
        expect(exported.evaluateAuthorization(c)).toEqual(browser(c));
      expect(exported.source).not.toContain("document-a");
      expect(exported.source).not.toContain('"alice"');
    },
  );
  it("keeps every operator in parity for values, absent fields and pointer escapes", async () => {
    const values: AuthzJson[] = [
      null,
      false,
      1,
      "1",
      "reader",
      ["reader", 1],
      { b: 2, a: 1 },
    ];
    for (const operator of AUTHZ_OPERATORS) {
      const policy = {
        id: "p",
        name: "p",
        rules: [
          {
            ...newAuthzRule(),
            actions: ["*"],
            conditions: [
              {
                operator,
                left: { source: "subject" as const, pointer: "/a~1b" },
                right: { source: "resource" as const, pointer: "/value" },
              },
            ],
          },
        ],
      };
      const exported = await artifact(policy),
        browser = createAuthzEvaluator(policy);
      for (const a of values)
        for (const b of values) {
          const c = {
            ...newAuthzCase(),
            subject: { "a/b": a },
            resource: { value: b },
          };
          expect(exported.evaluateAuthorization(c)).toEqual(browser(c));
        }
      expect(
        exported.evaluateAuthorization({ ...newAuthzCase(), subject: {} }),
      ).toEqual(browser({ ...newAuthzCase(), subject: {} }));
    }
  });
  it("awaits trusted classification and forwards admitted bodies, context and decisions unchanged", async () => {
    const policy = demoAuthzProject().policies[2],
      { createAuthorizationGuard } = await artifact(policy),
      c = demoAuthzProject().cases[0];
    const classify = vi.fn(async (_request: Request, ctx: unknown) => {
      await Promise.resolve();
      return { ...c, context: ctx };
    });
    const handler = vi.fn(
      async (request: Request, decision: AuthzDecision, ctx: unknown) =>
        new Response(
          JSON.stringify({
            body: await request.text(),
            effect: decision.effect,
            ctx,
          }),
          { status: 201 },
        ),
    );
    const guard = createAuthorizationGuard({ classify, handler }),
      context = { mfa: true },
      request = new Request("https://local.example", {
        method: "POST",
        body: "exact-request-body",
      });
    const response = await guard(request, context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      body: "exact-request-body",
      effect: "allow",
      ctx: context,
    });
    expect(handler.mock.calls[0][0]).toBe(request);
    expect(classify).toHaveBeenCalledWith(request, context);
  });
  it("returns generic noncacheable 403 refusals without rule or attribute disclosures", async () => {
    const { createAuthorizationGuard } = await artifact(
        demoAuthzProject().policies[1],
      ),
      handler = vi.fn(() => new Response("business"));
    const c = demoAuthzProject().cases.find(
      (c) => c.id === "cross-tenant-reader",
    )!;
    const request = new Request("https://local.example", {
      method: "POST",
      body: "private-body",
    });
    const response = await createAuthorizationGuard({
      classify: () => c,
      handler,
    })(request);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(handler).not.toHaveBeenCalled();
    expect(request.body?.locked || request.bodyUsed).toBe(true);
  });
  it("fails closed for invalid/oversized/cyclic input and rejected classifiers", async () => {
    const { createAuthorizationGuard, evaluateAuthorization } = await artifact(
        demoAuthzProject().policies[0],
      ),
      handler = vi.fn(() => new Response("business"));
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const inputs: unknown[] = [
      undefined,
      {},
      { ...newAuthzCase(), subject: [] },
      { ...newAuthzCase(), context: cycle },
      { ...newAuthzCase(), context: { text: "x".repeat(65536) } },
      { ...newAuthzCase(), resource: { n: NaN } },
    ];
    for (const input of inputs) {
      expect(() => evaluateAuthorization(input)).toThrow();
      const response = await createAuthorizationGuard({
        classify: () => input,
        handler,
      })(new Request("https://local.example"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "authorization_unavailable",
      });
    }
    expect(
      (
        await createAuthorizationGuard({
          classify: async () => {
            throw Error("private failure");
          },
          handler,
        })(new Request("https://local.example"))
      ).status,
    ).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });
  it("preserves handler errors after a grant and emits empty HEAD refusals", async () => {
    const { createAuthorizationGuard } = await artifact(
        demoAuthzProject().policies[0],
      ),
      c = demoAuthzProject().cases[0];
    await expect(
      createAuthorizationGuard({
        classify: () => c,
        handler: () => {
          throw Error("business failure");
        },
      })(new Request("https://local.example")),
    ).rejects.toThrow("business failure");
    const response = await createAuthorizationGuard({
      classify: () => ({ ...c, subject: null }),
      handler: () => new Response("business"),
    })(new Request("https://local.example", { method: "HEAD" }));
    expect(response.status).toBe(403);
    expect(response.body).toBeNull();
  });
  it("snapshots policies, escapes source-sensitive labels and keeps an empty policy closed", async () => {
    const policy: AuthzPolicy = {
        id: "p",
        name: "</script>`\u2028\u2029",
        rules: [],
      },
      exported = await artifact(policy);
    expect(exported.source).not.toContain("</script>");
    expect(exported.source).not.toContain("\u2028");
    expect(exported.evaluateAuthorization(newAuthzCase()).reason).toBe(
      "default-deny",
    );
    const rule = { ...newAuthzRule(), actions: ["*"], conditions: [] };
    policy.rules.push(rule);
    expect(exported.evaluateAuthorization(newAuthzCase()).effect).toBe("deny");
    expect(
      (await artifact(policy)).evaluateAuthorization({
        ...newAuthzCase(),
        subject: null,
      } as AuthzInput).effect,
    ).toBe("allow");
  });
});
