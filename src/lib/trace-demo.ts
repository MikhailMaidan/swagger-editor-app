import { NS_PER_MS, newTraceBudget, type TraceProject } from "./trace-data";
export const DEMO_TRACE_A = "11111111111111111111111111111111";
export const DEMO_TRACE_B = "22222222222222222222222222222222";
export const DEMO_TRACE_C = "33333333333333333333333333333333";
const spanId = (id: number) => id.toString(16).padStart(16, "0");
export function demoTraceSource(): string {
  const base = BigInt("1700000000000000123"),
    at = (ms: number) => (base + BigInt(ms) * NS_PER_MS).toString();
  const make = (
    id: number,
    parent: number,
    name: string,
    start: number,
    end: number,
    kind = 1,
    traceId = DEMO_TRACE_A,
  ) => ({
    traceId,
    spanId: spanId(id),
    ...(parent ? { parentSpanId: spanId(parent) } : {}),
    name,
    startTimeUnixNano: at(start),
    endTimeUnixNano: at(end),
    kind,
    flags: 1,
  });
  const resource = (service: string, spans: unknown[]) => ({
    resource: {
      attributes: [
        { key: "service.name", value: { stringValue: service } },
        { key: "service.namespace", value: { stringValue: "demo" } },
        {
          key: "deployment.environment.name",
          value: { stringValue: "local-fixture" },
        },
      ],
    },
    scopeSpans: [{ scope: { name: "rsswag.demo", version: "1.0" }, spans }],
  });
  return JSON.stringify(
    {
      resourceSpans: [
        resource("gateway", [
          {
            ...make(1, 0, "POST /checkout", 0, 400, 2),
            attributes: [
              { key: "http.request.method", value: { stringValue: "POST" } },
              {
                key: "url.full",
                value: {
                  stringValue:
                    "https://private.example/checkout?token=PRIVATE-DEMO",
                },
              },
            ],
          },
          make(2, 1, "authorize", 20, 60),
          make(3, 1, "orders HTTP client", 50, 350, 3),
          make(12, 0, "GET /health", 900, 950, 2, DEMO_TRACE_C),
        ]),
        resource("orders", [
          make(4, 3, "createOrder", 55, 340, 2),
          make(6, 4, "read cached pricing", 110, 140),
          make(7, 4, "payments HTTP client", 180, 300, 3),
        ]),
        resource("database", [
          {
            ...make(5, 4, "insert order", 100, 220, 3),
            attributes: [
              {
                key: "db.query.text",
                value: { stringValue: "PRIVATE SQL INSERT" },
              },
              {
                key: "db.record.id",
                value: { intValue: "9223372036854775807" },
              },
            ],
          },
        ]),
        resource("payments", [
          make(8, 7, "charge", 185, 290, 2),
          {
            ...make(9, 8, "payment provider", 200, 275, 3),
            status: { code: 2, message: "PRIVATE provider rejection" },
            events: [
              {
                timeUnixNano: at(274),
                name: "PRIVATE exception event",
                attributes: [
                  {
                    key: "exception.message",
                    value: { stringValue: "PRIVATE exception details" },
                  },
                ],
              },
            ],
          },
        ]),
        resource("worker", [
          make(10, 0, "reconcile", 500, 800, 1, DEMO_TRACE_B),
          {
            ...make(11, 999, "consume order event", 550, 700, 5, DEMO_TRACE_B),
            links: [
              { traceId: DEMO_TRACE_A, spanId: spanId(4), attributes: [] },
            ],
          },
        ]),
      ],
      "x-demo-metadata": { retained: true },
    },
    null,
    2,
  );
}
export const emptyTraceProject = (): TraceProject => ({
  kind: "rsswag-trace-project",
  version: 1,
  name: "Distributed trace project",
  source: JSON.stringify(
    {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "example-api" } },
            ],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: DEMO_TRACE_A,
                  spanId: spanId(1),
                  name: "GET /example",
                  kind: 2,
                  startTimeUnixNano: "1700000000000000000",
                  endTimeUnixNano: "1700000000100000000",
                  flags: 1,
                },
              ],
            },
          ],
        },
      ],
    },
    null,
    2,
  ),
  budgets: [newTraceBudget()],
  context: {
    traceparent: `00-${DEMO_TRACE_A}-${spanId(1)}-01`,
    tracestate: "",
  },
});
export function demoTraceProject(): TraceProject {
  const p = emptyTraceProject();
  p.name = "Checkout distributed tracing examples";
  p.source = demoTraceSource();
  const budget = (
    id: string,
    metric: TraceProject["budgets"][number]["metric"],
    max: string,
    operation = "",
  ) => ({ ...newTraceBudget(id), name: id, metric, max, operation });
  p.budgets = [
    budget("checkout-elapsed", "elapsed", "400", "POST /checkout"),
    budget("gateway-exclusive", "self", "70", "POST /checkout"),
    budget("orders-exclusive", "self", "85", "createOrder"),
    budget("database-duration", "duration", "120", "insert order"),
    budget("allowed-errors", "errors", "1"),
    budget("partial-trace-diagnostics", "diagnostics", "1"),
    { ...budget("capture-size", "spans", "12"), minMatches: 12 },
  ];
  p.context.tracestate = "demo=local";
  return p;
}
