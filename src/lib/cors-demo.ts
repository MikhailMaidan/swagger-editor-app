import {
  defaultCorsBudgets,
  defaultCorsCase,
  emptyCorsProject,
  normalizeCorsProject,
  type CorsCase,
} from "./cors-project";
const c = (
  id: string,
  atMs: number,
  options: Partial<CorsCase> = {},
): CorsCase => ({ ...defaultCorsCase(id, atMs), ...options });
const actual = (headers: Record<string, string>, status = 200) => ({
  usePolicy: false,
  status,
  headers,
  body: status === 204 ? "" : '{"ok":true}',
  delayMs: 120,
});
export function demoCorsProject() {
  const p = emptyCorsProject();
  p.name = "Browser CORS lifecycle examples";
  p.scenarios = [
    {
      id: "modes",
      name: "Browser modes and simple requests",
      budgets: defaultCorsBudgets(),
      cases: [
        c("simple", 0, {
          expect: { outcome: "allowed", preflight: "not-needed" },
        }),
        c("local", 1000, {
          origin: "https://api.example",
          credentials: "include",
          expect: { outcome: "allowed" },
        }),
        c("same-origin-mode", 2000, {
          mode: "same-origin",
          expect: { outcome: "blocked" },
        }),
        c("opaque", 3000, {
          mode: "no-cors",
          expect: { outcome: "opaque", status: 0 },
        }),
        c("invalid-no-cors", 4000, {
          mode: "no-cors",
          method: "PUT",
          expect: { outcome: "invalid" },
        }),
      ],
    },
    {
      id: "cache",
      name: "Preflight reuse, expiration and partitions",
      budgets: { ...defaultCorsBudgets(), maxPreflights: 3 },
      cases: [
        c("first", 0, {
          method: "PUT",
          headers: {
            authorization: "Bearer DEMO-ONLY",
            "content-type": "application/json",
          },
          expect: { outcome: "allowed", preflight: "sent" },
        }),
        c("reused", 1000, {
          method: "PUT",
          headers: {
            authorization: "Bearer DEMO-ONLY",
            "content-type": "application/json",
          },
          expect: { outcome: "allowed", preflight: "cached" },
        }),
        c("expired", 601000, {
          method: "PUT",
          headers: { authorization: "Bearer DEMO-ONLY" },
          expect: { outcome: "allowed", preflight: "sent" },
        }),
        c("partition", 602000, {
          partition: "another-top-level-site",
          method: "PUT",
          headers: { authorization: "Bearer DEMO-ONLY" },
          expect: { outcome: "allowed", preflight: "sent" },
        }),
      ],
    },
    {
      id: "credentials",
      name: "Credentialed requests and exposed headers",
      budgets: defaultCorsBudgets(),
      cases: [
        c("credentialed", 0, { credentials: "include" }),
        c("omit", 1000, {
          credentials: "omit",
          expect: { outcome: "allowed", preflight: "not-needed" },
        }),
        c("header-visibility", 2000, {
          response: actual({
            "access-control-allow-origin": "https://app.example",
            "access-control-allow-credentials": "true",
            "access-control-expose-headers": "X-Request-Id, Set-Cookie",
            "x-request-id": "trace-123",
            "set-cookie": "private=demo",
            "content-type": "application/json",
            vary: "Origin",
          }),
          credentials: "include",
          expect: { outcome: "allowed" },
        }),
      ],
    },
    {
      id: "fixtures",
      name: "Captured response failures and HTTP errors",
      budgets: defaultCorsBudgets(),
      cases: [
        c("preflight-denied", 0, {
          method: "PUT",
          preflight: {
            usePolicy: false,
            status: 403,
            headers: {},
            body: "",
            delayMs: 80,
          },
          expect: { outcome: "blocked", preflight: "sent" },
        }),
        c("missing-header", 1000, {
          response: actual({ "content-type": "application/json" }),
          expect: { outcome: "blocked" },
        }),
        c("credential-star", 2000, {
          response: actual({
            "access-control-allow-origin": "*",
            "access-control-allow-credentials": "true",
          }),
          credentials: "include",
          expect: { outcome: "blocked" },
        }),
        c("http-error-visible", 3000, {
          response: { ...defaultCorsCase().response, status: 500 },
          expect: { outcome: "allowed", status: 500 },
        }),
      ],
    },
    {
      id: "header-rules",
      name: "Header safelists and explicit authorization",
      budgets: defaultCorsBudgets(),
      cases: [
        c("text-post", 0, {
          method: "POST",
          headers: { "content-type": "text/plain;charset=UTF-8" },
          expect: { outcome: "allowed", preflight: "not-needed" },
        }),
        c("json-post", 1000, {
          method: "POST",
          headers: { "content-type": "application/json" },
          expect: { outcome: "allowed", preflight: "sent" },
        }),
        c("authorization-star", 2000, {
          url: "https://api.example/private",
          headers: { authorization: "Bearer DEMO-ONLY" },
          preflight: {
            usePolicy: false,
            status: 204,
            headers: {
              "access-control-allow-origin": "*",
              "access-control-allow-headers": "*",
            },
            body: "",
            delayMs: 80,
          },
          expect: { outcome: "blocked" },
        }),
        c("method-case", 3000, {
          url: "https://api.example/case-sensitive",
          method: "PATCH",
          preflight: {
            usePolicy: false,
            status: 204,
            headers: {
              "access-control-allow-origin": "*",
              "access-control-allow-methods": "patch",
            },
            body: "",
            delayMs: 80,
          },
          expect: { outcome: "blocked" },
        }),
      ],
    },
  ];
  return normalizeCorsProject(p);
}
