# API data query and federation studio

Open **API data query and federation studio** from the workspace tools. The studio
is independent of the OpenAPI document and remains available when it is invalid.
All work stays in the current tab until exported. It does not fetch datasets,
execute SQL or JavaScript, or write data to browser storage.

## Try the example

1. Select **Load federation demo**. It provides customers, orders and products,
   eight saved queries and ten regression cases.
2. Run the selected revenue query. It filters paid orders, joins customers,
   groups revenue, and sorts totals. Numeric customer ID `2` and string ID `"2"`
   deliberately produce separate groups.
3. Inspect a result row to see its full JSON and contributing table row indices.
   Expand the execution plan to inspect input/output row counts and logical work.
4. Select the line-items, orphan-orders, customers-with-orders or paged-orders
   queries to try array expansion, anti/semi joins and pagination.
5. Run all data cases. The ten passing cases include an expected arithmetic error,
   empty tables, parameter overrides, replacement fixtures and typed identities.

## Import tables

Paste data or read a file, choose a format, and select an import destination:
new table, append, or replace. Reading a file loads the draft; **Import table rows**
applies it. Invalid imports leave the project unchanged.

- JSON accepts an array of records or one object. A JSON Pointer such as
  `/response/items` extracts nested records. Empty selects the root.
- **Wrap values as {value}** accepts primitive arrays and mixed JSON arrays.
- NDJSON accepts one JSON value per nonblank line and applies extraction to each.
- CSV supports quoted commas, doubled quotes and embedded newlines. Headers must
  be unique and nonblank. Values remain strings; cast with a `number` expression
  when needed. CSV requires an empty extraction pointer and object-record mode.
- HAR inspection lists JSON response bodies, including base64-encoded UTF-8
  bodies. Choose a response, then its rows pointer. Unsupported or malformed
  responses are counted as skipped. No recorded requests are replayed.

JSON and NDJSON exports from the existing REST/collection tools can be pasted
here. Tables show a field inventory, a searchable paginated grid, column selection,
and complete selected-row JSON. Search affects the displayed grid only; result
exports always include **all** rows. Escape clears the grid search.

## Build reusable pipelines

Create a query from the selected table or clone an existing query. The ordered
stage builder supports filter, join, derive, select, group, sort, distinct, slice
and unnest. Move, remove or edit individual stages. The selected query JSON also
edits its name, source and source alias. Sources can reference tables or saved
queries; cycles and broken references are rejected atomically.

A source with alias `order` wraps each record as `{ "order": { ... } }`, so a
pointer starts with `/order/`. After a select or group, pointers address the
new output fields directly. Join right keys address the unwrapped right record.
JSON Pointer escapes `/` as `~1` and `~` as `~0`.

For example, this query joins orders with customers and projects two columns:

```json
{
  "id": "customer-orders",
  "name": "Customer orders",
  "from": { "kind": "dataset", "id": "orders" },
  "as": "order",
  "steps": [
    {
      "op": "join",
      "source": { "kind": "dataset", "id": "customers" },
      "as": "customer",
      "mode": "left",
      "nulls": "never",
      "keys": [{ "left": "/order/customerId", "right": "/id" }]
    },
    {
      "op": "select",
      "columns": [
        { "name": "id", "value": { "op": "get", "pointer": "/order/id" } },
        {
          "name": "customerName",
          "value": { "op": "get", "pointer": "/customer/name" }
        }
      ]
    }
  ]
}
```

Advanced stage JSON supports composite join keys, multiple sort keys and nested
expressions. Expressions include `get`, `literal`, `param`, `add`, `subtract`,
`multiply`, `divide`, `lower`, `upper`, `length`, `number`, `string`, and `coalesce`.
Binary arithmetic uses `left`/`right`, unary operations use `value`, and coalesce
uses `values`. A parameter expression is `{ "op": "param", "name": "status" }`;
declare defaults in the project `parameters` array, then override them per run.

Filters support `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `in`,
`isMissing`, `isNull`, `all`, `any`, and `not`. Group measures are `count`, `sum`,
`avg`, `min`, `max` and `countDistinct`. A count with `value: null` counts rows;
other aggregate expressions skip missing/null values. Empty global aggregates
produce one row: count/sum are zero, avg/min/max are null.

Join keys and group keys are typed scalars. Missing join keys never match. Null
keys match only when explicitly enabled. Inner and left joins can multiply rows;
semi/anti joins preserve left-row cardinality. Missing projected values are omitted
and remain different from explicit null. All derive/select expressions read the
preceding row, so derive columns do not see sibling new columns. Existing output
fields cannot be overwritten by derive, join or unnest.

Sorting is stable; null/missing placement is independent of direction. Mixed
present types sort as number, string, boolean; strings use JavaScript lexical
ordering. Distinct preserves the first row and merges its source references.
An empty distinct key list compares complete rows using canonical JSON.

## Save and test

Projects contain tables, query definitions, parameter defaults and regression
cases. Imports discard runtime results. Source changes clear previous results;
five undo/redo entries are retained. Apply or discard the project JSON draft
before other operations. Referenced tables and queries cannot be deleted until
their references are updated.

Run a query, then record its result as a case. Recording captures the parameter
overrides from that run, even if the overrides editor has since changed. By default
it records row-count and logical-work budgets. Enable exact private output only
when desired. Edit a case to add pointer/value or missing-field checks, override
datasets, or expect an execution error. Assertions on a missing field require the
specified output row to exist. Cases with no expectations remain **unchecked**.

Each case runs against isolated source fixtures. An expected error can pass;
unexpected errors are located by query and stage and do not stop other cases.
Cancellation does not publish partial runs. Work counts are deterministic logical
operation counts, not elapsed time or a database cost estimate.

Regression reports contain case IDs, verdicts, check indices, error codes and
numeric execution summaries/plans. They omit row values, parameters, literal
expectations, source references and case names. IDs themselves are not redacted.
Project and row exports contain private values. CSV quotes every cell and prefixes
formula-like cells with an apostrophe; use JSON for lossless typed exchange.

**Save result as new table** materializes a completed result without truncation;
the ordinary table limits still apply. Slice a larger result first if needed.

## Compare proposed dataset changes

Enter a JSON array of replacements such as `[{ "id": "customers", "rows": [...] }]`
and a unique output identity pointer. Comparison runs the same query/parameters
against baseline and candidate datasets and reports added, removed, changed and
unchanged records. It does not change the project. Identities must be unique
strings or numbers: `1` and `"1"` differ. Missing, null, structural or duplicate
identities are rejected. Row order alone is not a change. Displayed differences
contain private before/after values.

## Standalone exports

The SDK is a dependency-free ES module. It includes the query definitions and
parameter defaults but omits dataset rows and regression fixtures. Query literals
and metadata can still contain private values; inspect the file before sharing.

```js
import { queryData } from "./data-query-sdk.mjs";

const result = await queryData(
  { orders: orderRecords, customers: customerRecords },
  "customer-orders",
  {},
);
console.log(result.rows, result.lineage, result.plan);
```

Supply all transitively referenced tables by their IDs; unused tables may be
omitted. Caller inputs are validated and cloned. Optional fourth-argument
`cancelled` and `progress` callbacks match the studio engine. No source evaluation
or third-party runtime is needed.

The Node runner **includes all private project fixtures**. Run it as:

```sh
node data-query-tests.mjs > data-query-report.json
```

Exit status is zero only for a nonempty suite where every case has expectations
and passes. Reports omit row values. Runtime errors produce failing cases rather
than successful empty output.

## Bounds and development

Projects: 4 MiB, 8 tables, 12 queries, 12 stages per query, 12 cases and 8 parameters.
Imports/tables: 2 MiB and 2,000 records; an input record is at most 16 KiB.
Each stage/output is limited to 5,000 rows, 4 MiB total and 64 KiB per row. JSON
values have bounded depth/node counts. A run permits 250,000 logical work units.
Lineage retains up to 32 unique source-row references and marks truncated samples.
Intermediate limits apply even when a later slice would reduce the result.

The portable runtime is generated from the TypeScript model and engine:

```sh
node scripts/build-data-query-toolkit.mjs
node scripts/build-data-query-toolkit.mjs --check
```

Regenerate after changing or formatting either source. Export tests execute native
ES modules and the Node runner and compare them to the application engine.
