# Decision-table automation studio

Open **Decision-table automation studio** in the workspace testing tools to author
business rules, explain outcomes, analyze finite catalogs and export executable
decisions. It works independently of the OpenAPI document, including invalid
documents. Work stays in tab memory; no requests or user-supplied code run.

## Try the example

Load the decision automation demo and run all regressions. Twelve cases cover
normal outputs, gaps, conflicts, blocked dependencies, arithmetic errors and
missing/null handling. The rules are illustrative, editable examples.

Evaluate shipping with the initial EU context: its output is `10`. Inspect the
membership dependency to see how its tier was chosen. Analyze the shipping
catalogs: all 48 contexts are explored, with 32 matches and 16 APAC gaps. The
membership table demonstrates overlapping rows and a row never selected in its
catalog.

Search for a matched output of `0`. With the example costs, changing subtotal
from `50` to catalog value `100` costs one, while changing membership costs three.
Adopt the suggestion to update the input draft, then evaluate it explicitly.

## Typed inputs

An input defines an ID, name, scalar type, required/nullable flags, positive
integer change cost, and finite catalog:

```json
{
  "id": "member",
  "name": "Membership",
  "type": "boolean",
  "required": false,
  "nullable": true,
  "cost": 3,
  "catalog": [
    { "present": false },
    { "present": true, "value": false },
    { "present": true, "value": true },
    { "present": true, "value": null }
  ]
}
```

Missing and null differ. Missing catalog cells require an optional input; null
requires `nullable`. Contexts are flat JSON objects keyed by input IDs. Unknown
fields and wrong types are rejected. Strings are limited to 256 UTF-8 bytes.
Otherwise valid runtime values can lie **outside** the catalogs.

Only required inputs referenced by the selected decision's transitive definition
must be present. This includes possible references in unselected output expressions,
keeping the input contract stable across row selections. Other declared inputs may
be omitted; supplied values are still type checked.

Add inputs with the form and customize catalogs/costs through definition JSON.
References and saved case inputs must remain valid when applying source edits.

## Tables, conditions and hit policies

A column reads an input or a scalar JSON Pointer value from another decision's
output. Row conditions align with columns by position. Adding a column appends
`any` to existing rows; removing one removes its corresponding conditions.

| Policy   | Behavior                                                                  |
| -------- | ------------------------------------------------------------------------- |
| `unique` | Select one matching row; multiple matches conflict even if outputs agree. |
| `first`  | Select the earliest matching row; all matches remain explained.           |
| `all`    | Collect matching outputs in table order.                                  |
| `sum`    | Sum matching numeric outputs; wrong types and unsafe totals are errors.   |

No matching rows produce `no-match` unless a fallback exists. Empty `all`/`sum`
tables do not implicitly return `[]`/zero: supply those literal fallbacks.
`fallback: null` disables fallback; `{ "op": "literal", "value": null }` is a
valid null fallback output. Rows can be moved, removed, cloned with their table,
or edited through JSON. Cycles and broken references are rejected atomically.

Conditions are `any`, `present`, `missing`, `eq`, `ne`, `in`, `notIn`, `prefix`,
and numeric `range`. Equality/membership use `value`/`values`; prefix uses a
case-sensitive string `value`. Range uses `min`/`max` (null is unbounded) and
explicit `minInclusive`/`maxInclusive` booleans. Comparisons use strict scalar
types. Missing cells fail comparisons, including `ne`/`notIn`; null is present.

Output expressions support `literal`, `ref`, `add`, `subtract`, `multiply`,
`divide`, and `coalesce`:

```json
{
  "op": "add",
  "left": {
    "op": "ref",
    "ref": { "kind": "decision", "id": "shipping", "pointer": "" }
  },
  "right": { "op": "literal", "value": 5 }
}
```

Input references use `{ "kind": "input", "id": "subtotal" }`. Arithmetic uses
`left`/`right`, propagates missing/null, and rejects wrong types, division by zero,
non-finite results and unsafe integer results. A bare missing output is an error.
Coalesce uses `values`, selecting the first present non-null value, or null.

Pointers access own properties; `~1` escapes `/`, `~0` escapes `~`. A missing
dependency property is missing. Structural values cannot be table columns, but
literal outputs may contain objects and arrays. A failed dependency blocks its
consumer; coalesce does not hide dependency failures.

## Explanations and source editing

Outcomes are `matched`, `default`, `no-match`, `conflict`, `blocked`, or `error`.
Dependencies run at most once per evaluation. Only selected output expressions
execute, while all row conditions are explained, including under first-hit policy.
Fallbacks run only without matches. Explanations show actual dependency execution,
resolved columns, per-cell matches and selected rows.

Work is a deterministic logical operation count, excluding validation and
serialization, not elapsed time. The last evaluation retains its actual context:
recording uses it even if the input draft has changed. Source edits clear results
and retain five undo/redo entries. Apply/discard a project draft before actions.
Cancelled work and late file reads do not publish partial results. OpenAPI and
existing request execution are untouched.

## Catalog coverage and counterfactuals

Coverage enumerates the Cartesian product of catalogs for transitively referenced
inputs, counting statuses, overlapping matches, and root row matches/selections.
Up to twelve private issue contexts can be loaded into the input draft. A first-hit
overlap is not a conflict; only unique policy turns multiple matches into conflict.

Complete coverage is complete **only within the configured finite catalogs**.
Zero selections mean not observed selected in the explored portion, not globally
unreachable. At most 4,096 candidates and 2,000,000 work units are explored; larger
products/budget exhaustion return partial results. Counts/work describe completed
evaluations, excluding an interrupted candidate. Coverage reports omit examples.

For counterfactuals, choose a status and optionally an exact JSON output. Empty
output ignores it. Specify mutable input IDs to freeze other fields; empty UI text
uses referenced inputs, while programmatic `[]` freezes all inputs.

Candidates combine each mutable input's catalog with its baseline value, even
when outside the catalog. Missing/null transitions differ. Cost sums positive
weights for changed fields. Ties resolve deterministically by input/catalog order.
A proven optimum requires completing this finite search. Partial candidates remain
provisional. A zero-cost match is optimal immediately because costs cannot be
negative. No complete-search candidate rules out only these finite choices, not
arbitrary runtime values. Adopting a suggestion changes the context draft only.

## Cases, imports and privacy

Recording saves status and matching/selected row IDs. Enable exact private output
when desired. Edit case JSON for other expectations; unchecked cases remain
unchecked. Expected conflict/blocked/error outcomes can deliberately pass.

Import a JSON array or NDJSON of flat contexts as uniquely named unchecked cases
for the selected decision. Imports validate atomically. Reading a context file
loads its draft without applying it. Project restoration drops imported runtime
results and initializes a context from its first case or catalogs.

Projects, literals, case fixtures, outputs and analysis examples can contain private
values. Reports omit contexts, outputs, literal expectations and resolved values.
They retain IDs, statuses, per-cell booleans, selections and work counters; IDs are
not redacted. Counterfactual reports retain cost and changed input IDs, not values.

## Portable SDK and HTTP service

The SDK includes no project data, third-party runtime, network calls or storage:

```js
import {
  createDecisionEvaluator,
  analyzeDecisionCatalog,
  findDecisionCounterfactual,
} from "./decision-sdk.mjs";

const evaluate = createDecisionEvaluator(project);
const context = { region: "EU", subtotal: 50, member: false };
const result = evaluate("shipping", context);
const coverage = await analyzeDecisionCatalog(project, "shipping");
const suggestion = await findDecisionCounterfactual(
  project,
  "shipping",
  context,
  { status: "matched", output: 0 },
);
```

Compiled evaluators snapshot their definition once. Async analyses snapshot inputs
and accept cancellation/progress callbacks. No user JavaScript is evaluated.

The handler export **embeds private definitions, literals and catalogs**, omitting
cases. It exports `handler` and a default Fetch-compatible function without starting
or publishing a server. Integrate it with your routing/access controls:

```http
POST /decide
Content-Type: application/json

{"decisionId":"shipping","context":{"region":"EU","subtotal":50,"member":false}}
```

Valid evaluations return HTTP 200 with `decisionId`, `status`, `output`, `matched`
and `selected`. This includes domain no-match/conflict/blocked/error outcomes;
clients inspect `status`. Invalid envelopes/contexts return 400, unknown
routes/decisions 404, unsupported methods 405 (`Allow: POST`), stalled reads 408,
bodies over 16 KiB 413, unsupported media types 415, and internal evaluation-limit
failures 500. Streamed body reads have a five-second timeout and abort handling;
errors do not echo input values.

The OpenAPI 3.1 export describes the envelope, transitive required inputs and
public outcomes. It includes input metadata, without catalogs, rule outputs or
cases. Catalog samples do not become restrictive enums. Import it with the existing
OpenAPI tools when desired; nothing is automatically applied.

The private Node runner executes as:

```sh
node decision-tests.mjs > decision-report.json
```

Exit zero requires a nonempty suite where every case is checked and matches.
The executable contains fixtures; its reports omit values.

## Bounds and maintenance

Projects permit 8 inputs (1–8 catalog cells each), 12 decisions, 8 columns and
24 rows per decision, 24 cases, and 2 MiB of source. Literal JSON is limited to
4 KiB, depth 16 and 1,024 nodes; expressions to 128 nodes/depth 8. Final outputs
are limited to 64 KiB/4,096 nodes. Each evaluation has a 50,000-work budget;
analyses additionally have their candidate/aggregate work bounds.

Generate portable code from the TypeScript model, engine and service after editing
or formatting those sources:

```sh
node scripts/build-decision-toolkit.mjs
node scripts/build-decision-toolkit.mjs --check
```

Export tests load native ES modules, execute the real Node runner, exercise HTTP
Request/Response handlers, and check generated-source freshness.
