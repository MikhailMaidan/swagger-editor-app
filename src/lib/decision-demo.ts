import {
  normalizeDtProject,
  type DTExpr,
  type DTJson,
  type DTProject,
  type DTCondition,
  type DTRef,
  type DTCase,
  type DTStatus,
} from "./decision-model";
const literal = (value: DTJson): DTExpr => ({ op: "literal", value });
const input = (id: string): DTRef => ({ kind: "input", id });
const decision = (id: string, pointer = ""): DTRef => ({
  kind: "decision",
  id,
  pointer,
});
const any: DTCondition = { op: "any" };
const eq = (value: null | boolean | string | number): DTCondition => ({
  op: "eq",
  value,
});
const range = (
  min: number | null,
  max: number | null,
  maxInclusive = true,
): DTCondition => ({ op: "range", min, max, minInclusive: true, maxInclusive });
export function demoDtProject(): DTProject {
  const scenario = (
    id: string,
    decisionId: string,
    context: DTCase["context"],
    status: DTStatus,
    output: DTJson,
  ): DTCase => ({
    id,
    name: id,
    decisionId,
    context,
    expect: { status, output },
  });
  return normalizeDtProject({
    kind: "rsswag-decision-project",
    version: 1,
    name: "Shipping decision automation",
    inputs: [
      {
        id: "region",
        name: "Region",
        type: "string",
        required: true,
        nullable: false,
        cost: 2,
        catalog: ["EU", "US", "APAC"].map((value) => ({
          present: true,
          value,
        })),
      },
      {
        id: "subtotal",
        name: "Order subtotal",
        type: "number",
        required: true,
        nullable: false,
        cost: 1,
        catalog: [0, 99, 100, 200].map((value) => ({ present: true, value })),
      },
      {
        id: "member",
        name: "Membership",
        type: "boolean",
        required: false,
        nullable: true,
        cost: 3,
        catalog: [
          { present: false },
          ...[false, true, null].map((value) => ({ present: true, value })),
        ],
      },
      {
        id: "express",
        name: "Express delivery",
        type: "boolean",
        required: true,
        nullable: false,
        cost: 1,
        catalog: [false, true].map((value) => ({ present: true, value })),
      },
    ],
    decisions: [
      {
        id: "membership",
        name: "Membership tier",
        policy: "first",
        columns: [{ id: "member", name: "Member", source: input("member") }],
        rules: [
          {
            id: "loyal",
            name: "Loyal member",
            when: [eq(true)],
            output: literal("loyal"),
          },
          {
            id: "known",
            name: "Known membership",
            when: [{ op: "present" }],
            output: literal("standard"),
          },
          {
            id: "guest",
            name: "Guest fallback row",
            when: [any],
            output: literal("guest"),
          },
          {
            id: "shadowed",
            name: "Never selected after catch-all",
            when: [eq(true)],
            output: literal("shadowed"),
          },
        ],
        fallback: null,
      },
      {
        id: "shipping",
        name: "Shipping quote",
        policy: "unique",
        columns: [
          { id: "region", name: "Region", source: input("region") },
          { id: "subtotal", name: "Subtotal", source: input("subtotal") },
          { id: "tier", name: "Tier", source: decision("membership") },
        ],
        rules: [
          {
            id: "eu-loyal",
            name: "EU loyal shipping",
            when: [eq("EU"), any, eq("loyal")],
            output: literal(0),
          },
          {
            id: "eu-bulk",
            name: "EU threshold shipping",
            when: [eq("EU"), range(100, null), { op: "ne", value: "loyal" }],
            output: literal(0),
          },
          {
            id: "eu-standard",
            name: "EU standard shipping",
            when: [
              eq("EU"),
              range(null, 100, false),
              { op: "ne", value: "loyal" },
            ],
            output: literal(10),
          },
          {
            id: "us",
            name: "US shipping",
            when: [eq("US"), any, any],
            output: literal(20),
          },
        ],
        fallback: null,
      },
      {
        id: "charges",
        name: "Additive handling charges",
        policy: "sum",
        columns: [
          { id: "express", name: "Express", source: input("express") },
          { id: "member", name: "Member", source: input("member") },
        ],
        rules: [
          {
            id: "express-fee",
            name: "Express handling",
            when: [eq(true), any],
            output: literal(5),
          },
          {
            id: "handling",
            name: "Standard member handling",
            when: [any, eq(false)],
            output: literal(2),
          },
        ],
        fallback: literal(0),
      },
      {
        id: "total",
        name: "Combined shipping and handling",
        policy: "unique",
        columns: [],
        rules: [
          {
            id: "quote",
            name: "Combined quote",
            when: [],
            output: {
              op: "add",
              left: { op: "ref", ref: decision("shipping") },
              right: { op: "ref", ref: decision("charges") },
            },
          },
        ],
        fallback: null,
      },
      {
        id: "labels",
        name: "All applicable labels",
        policy: "all",
        columns: [
          { id: "member", name: "Member", source: input("member") },
          { id: "express", name: "Express", source: input("express") },
        ],
        rules: [
          {
            id: "loyal-label",
            name: "Loyal label",
            when: [eq(true), any],
            output: literal("loyal"),
          },
          {
            id: "fast-label",
            name: "Express label",
            when: [any, eq(true)],
            output: literal("express"),
          },
        ],
        fallback: literal([]),
      },
      {
        id: "conflicting",
        name: "Deliberately overlapping threshold",
        policy: "unique",
        columns: [
          { id: "subtotal", name: "Subtotal", source: input("subtotal") },
        ],
        rules: [
          {
            id: "low",
            name: "Low range",
            when: [range(null, 100)],
            output: literal("low"),
          },
          {
            id: "high",
            name: "High range",
            when: [range(100, null)],
            output: literal("high"),
          },
        ],
        fallback: null,
      },
      {
        id: "blocked",
        name: "Blocked dependency example",
        policy: "first",
        columns: [
          {
            id: "threshold",
            name: "Threshold",
            source: decision("conflicting"),
          },
        ],
        rules: [
          {
            id: "route",
            name: "Route after threshold",
            when: [any],
            output: literal("routed"),
          },
        ],
        fallback: null,
      },
      {
        id: "bad-math",
        name: "Arithmetic error example",
        policy: "unique",
        columns: [],
        rules: [
          {
            id: "divide",
            name: "Divide by subtotal",
            when: [],
            output: {
              op: "divide",
              left: literal(1),
              right: { op: "ref", ref: input("subtotal") },
            },
          },
        ],
        fallback: null,
      },
      {
        id: "coalesced",
        name: "Missing/null fallback expression",
        policy: "unique",
        columns: [],
        rules: [
          {
            id: "fallback",
            name: "Membership fallback",
            when: [],
            output: {
              op: "coalesce",
              values: [{ op: "ref", ref: input("member") }, literal(false)],
            },
          },
        ],
        fallback: null,
      },
    ],
    cases: [
      scenario(
        "eu-loyal",
        "shipping",
        { region: "EU", subtotal: 50, member: true },
        "matched",
        0,
      ),
      scenario(
        "eu-bulk",
        "shipping",
        { region: "EU", subtotal: 100, member: false },
        "matched",
        0,
      ),
      scenario(
        "eu-standard",
        "shipping",
        { region: "EU", subtotal: 99, member: false },
        "matched",
        10,
      ),
      scenario("us", "shipping", { region: "US", subtotal: 0 }, "matched", 20),
      scenario(
        "gap",
        "shipping",
        { region: "APAC", subtotal: 0, member: true },
        "no-match",
        null,
      ),
      scenario(
        "combined",
        "total",
        { region: "EU", subtotal: 50, member: false, express: false },
        "matched",
        12,
      ),
      scenario(
        "all-labels",
        "labels",
        { member: true, express: true },
        "matched",
        ["loyal", "express"],
      ),
      scenario(
        "no-labels",
        "labels",
        { member: false, express: false },
        "default",
        [],
      ),
      scenario("overlap", "conflicting", { subtotal: 100 }, "conflict", null),
      scenario("dependency", "blocked", { subtotal: 100 }, "blocked", null),
      scenario("arithmetic", "bad-math", { subtotal: 0 }, "error", null),
      scenario("missing", "coalesced", {}, "matched", false),
    ],
  });
}
