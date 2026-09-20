# RSSwag

RSSwag is a responsive OpenAPI editor, viewer, and REST client built with
Next.js, React, TypeScript, and Tailwind CSS.

## Demo

[Open the deployed application](https://swagger-editor-app-two.vercel.app/)

## Features

- JSON and YAML OpenAPI editing, large-file import confirmation, import feedback, validation, and conversion
- Remote OpenAPI import from public URLs with redirect, timeout, and size safeguards
- Multi-file OpenAPI workbench with folder imports, local file editing, cross-file reference resolution, source diagnostics, circular-reference preservation, JSON/YAML bundles, restorable projects, and reversible editor application
- Traffic-to-OpenAPI studio that discovers an API from HAR captures, groups routes, infers request and response schemas, supports editable path templates and operation selection, and exports or reversibly applies an OpenAPI 3.1 draft
- API transformation workbench with reusable JSON Patch recipes, ordered step editing, source pointer browsing, guarded atomic previews, JSON/YAML variant exports, and reversible editor application
- Live API quality audit with coverage scoring, severity filters, endpoint navigation, JSON export, and localized Markdown sharing
- Persistent API comparison baselines with semantic breaking-change review and JSON reports
- Named local schema checkpoints with validity metadata, restore, download, and delete actions
- OpenAPI 3 and Swagger 2 data-model explorer with dependency analysis, operation usage, generated examples, and TypeScript exports
- Reusable-component registry for OpenAPI 3.0-3.2 and Swagger 2 with transitive reachability, local and external reference diagnostics, cycle detection, dependency search, Mermaid graphs, and JSON reports
- OpenAPI 3 workflow explorer with response-link resolution, runtime-expression handoffs, broken-target and cycle detection, endpoint navigation, Mermaid diagrams, and JSON reports
- Callback and webhook contract explorer with reusable-reference resolution, payload examples, receiver responses, source navigation, diagnostics, Markdown sharing, and JSON reports
- API security posture dashboard with strict, optional, and public access analysis, scheme usage, actionable findings, operation filtering, and shareable reports
- Postman Collection 2.1 and environment exports with filtered-view scope, tag folders, request examples, authentication placeholders, and saved responses
- OpenAPI slice export in JSON or YAML using endpoint filters and favorites, with transitive component retention, optional webhooks, contract previews, and reference diagnostics
- Dependency-free TypeScript Fetch client generation with typed models, request parameters and bodies, success responses, API errors, cancellation, configurable generation scope, and source download
- Self-contained offline HTML documentation with endpoint search, method filtering, light and dark themes, print styles, scoped models and security schemes, browser preview, and download
- Dependency-free Node.js mock-server generation with scoped routes, documented response selection, generated examples, required-input validation, CORS, latency controls, health metadata, and source download
- Standalone CI smoke-test export for GET/HEAD endpoints with configuration templates, runtime authentication, response contract and timing checks, JSON reports, and meaningful exit codes
- Offline HAR traffic inspector with browser capture imports, endpoint matching, undocumented-status detection, operation coverage, latency summaries, search, and aggregate JSON reports
- Manual API test-plan workbench with generated positive, negative, and boundary cases, QA results and notes, endpoint navigation, restorable JSON progress, and Markdown checklists
- API scenario runner with ordered multi-request workflows, typed variable templates, JSON Pointer response extraction, Mock/Live execution, status and timing assertions, optional response contract checks, cancellation, and portable definitions and reports
- Environment comparison runner with reusable GET/HEAD plans, paired baseline/candidate requests, isolated session headers, structural response and contract comparisons, latency checks, offline rehearsals, cancellation, and reports without response values
- API fixture studio with seeded test-data generation, linked datasets, sequence and constant field overrides, schema diagnostics, reusable recipes, and JSON/NDJSON/CSV exports
- API performance lab with bounded concurrent GET/HEAD workloads, warm-up phases, weighted traffic, launch-rate limits, Mock rehearsals, latency percentiles, performance budgets, baseline comparisons, cancellation, and portable JSON/CSV reports
- Local schema picker access with `Ctrl+O` or `Cmd+O`
- Schema downloads with `Ctrl+Shift+S` or `Cmd+Shift+S`
- Localized success and error feedback for schema copy, save, import, and download actions
- Saved-schema and collection export download feedback
- Request-history collection and individual export feedback with blocked-download recovery
- Generated endpoint documentation and Try It Out requests through the server
- Persisted Live/Mock execution modes with explicit or type-correct generated
  schema examples, selectable response media types, and history-safe mock runs
  with documented response headers and configurable, cancellable latency
- Schema-aware parameter controls with enum choices and preflight validation
  for numeric ranges, string lengths, and patterns
- Live advisory request-body contract checks for documented top-level types and
  required JSON properties
- Automatic response contract checks for documented statuses, media types,
  top-level body shapes, and required properties, with copyable JSON reports
- Response comparison workbench with pinned in-memory baselines, structural JSON and header diffs, status and latency changes, ignored fields, searchable change lists, and JSON reports
- Custom response assertion workbench with status, header, JSON Pointer, and timing checks, automatic Live/Mock evaluation, result filters, reusable check-set imports/exports, and value-free JSON reports
- Response data explorer with JSON Pointer navigation, nested-value search, array tables, selectable columns, row filtering, and selected JSON or spreadsheet-safe CSV downloads
- Response schema builder with multiple captured or pasted JSON examples, nested type inference, optional-field analysis, searchable field inventories, and JSON Schema / OpenAPI 3.1 component exports
- Offline Mock contract suite runner across all documented response variants,
  with visible-endpoint scope, pass/partial/fail filtering, and JSON exports
- Live request coverage dashboard that maps saved runs to operations and
  documented response variants, highlights untested or failing behavior, and
  exports privacy-safe aggregate reports
- Persistent request environments with reusable base URLs and shared headers
  across previews and Try It Out execution
- Schema-driven, session-only authentication for API keys, Bearer and Basic
  auth, OAuth 2, and OpenID Connect access tokens, with secret-safe history
- cURL, Fetch, and raw HTTP generation with snippet downloads
- Scoped request execution with `Ctrl+Enter` or `Cmd+Enter` and cancellation
  with `Escape`
- Persistent endpoint request presets for parameters, bodies, response choices,
  and timeouts
- Schema save with `Ctrl+S` or `Cmd+S`, and formatting with `Ctrl+Shift+F` or
  `Cmd+Shift+F`
- Unsaved-change indicators and leave protection for authenticated edits and
  guest drafts that are still pending or failed
- Persistent editor word wrap with `Alt+Z`
- Line navigation with `Ctrl+G` or `Cmd+G`
- In-editor schema search with selected-text prefilling via `Ctrl+F` or `Cmd+F`, plus wrapped `Enter`/`F3` navigation (`Shift` reverses direction)
- Endpoint search focus with `/` outside editable controls
- Shareable endpoint-view links that restore search, filters, favorites, and sorting
- Spreadsheet-safe CSV inventories for the currently visible endpoint view
- Persistent collapsible endpoint details with visible-endpoint bulk controls
- Persistent endpoint favorites with favorites-only filtering
- Persistent endpoint sorting by schema order, path, or HTTP method
- Natural numeric ordering for endpoint paths and saved-schema titles, so version 2 sorts before version 10
- Authentication-aware schema saving and request history
- Multiword search across request-history fields and saved-schema metadata (for example, `GET users 200` or `billing json 2.4`), combined with existing filters
- Escape clears request-history, saved-schema, HAR traffic, test-plan, and response-explorer searches while preserving other filters and keyboard focus
- Server-rendered history analytics in English and Russian

## Local Setup

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Measuring API performance

Open **API performance lab** in the Testing tools to run a repeatable workload
against read endpoints and inspect latency, failures, and throughput.

1. Add individual GET/HEAD operations or **Add visible benchmark endpoints**.
   Existing endpoint filters control the bulk selection; write operations are
   excluded. You can add an operation more than once to test different literal
   parameters. Give each case a name, traffic weight, and expected statuses such
   as `200,204`, `2xx`, or `any`. Reorder or remove cases as needed.
2. Configure measured requests, warm-up requests, concurrency, maximum launches
   per second, per-request timeout, and overall time limit. Cases follow weighted
   round robin; a case with weight 2 appears twice per schedule cycle. Warm-up
   finishes before measurement starts, and each phase restarts the schedule.
   Short runs may not visit every case. The rate is a launch ceiling, not a
   guarantee of achieved throughput. There are no catch-up bursts.
3. Rehearse with **Run Mock benchmark**. Choose a documented response and delay
   for each case to exercise status failures, timeouts, and budgets offline.
   Mock runs ignore credentials and request parameters, send no network traffic,
   and measure simulated browser delays and local processing. They do not
   measure the performance of a deployed API.
4. To measure a service you are authorized to test, select **Live**, provide a
   public HTTP(S) base URL, and choose **Run Live benchmark**. The target replaces
   schema servers and must omit credentials, query strings, and fragments.
   Optional session headers are a JSON object and override case headers by name.
   Changing the target clears them. Requests use the existing server proxy and
   its destination and response-size safeguards; they are not added to history.
   All cases and required parameters are checked before the first request.
5. Inspect the latency chart, per-case metrics, and filterable sample table.
   Configure maximum p95 latency and failure percentage, plus optional minimum
   throughput. Unexpected HTTP statuses, timeouts, and transport failures count
   as failures. You can stop after a configured number of measured failures.
   **Stop benchmark**, the time limit, and the failure limit stop scheduling and
   cancel active client requests. Partial results remain inspectable and
   exportable, and enabled budgets are marked incomplete for partial runs.
6. **Pin benchmark as baseline** and run again to compare p95, mean latency,
   failure rate, and throughput. Import a previously exported report as a
   baseline to compare across sessions. Different modes, workload settings,
   recorded cases, or incomplete runs are flagged. Target URLs, parameter values,
   and credentials are absent from reports, so matching report settings cannot
   establish equivalent inputs or network conditions.
7. Download or copy the JSON report, or download all sample metadata as CSV.
   CSV includes measured and warm-up samples, a zero-based row index, and a
   one-based request sequence number; spreadsheet formula prefixes are escaped.
   Download the workload plan to reuse it. Importing a plan replaces the current
   configuration, resets execution to Mock, and clears session headers. Report
   imports only change the baseline; malformed imports preserve existing work.

Latency uses the browser's monotonic clock from dispatch until completion,
including proxy and network overhead. Proxy-reported timing is a separate sample
field. All completed measured attempts, including HTTP failures, timeouts, and
network errors, contribute to latency and throughput; cancelled attempts and
warm-up requests do not. Percentiles use nearest rank. Throughput divides
completed attempts by the window from the first measured dispatch through the
last completion or stop; per-case throughput uses that same window. No samples
or a zero-length window yield unavailable metrics where appropriate. Small
samples are descriptive checks, not a service-capacity estimate. Browser timer
throttling, background tabs, client load, and the proxy affect measurements;
keep the tab active and compare equivalent conditions.

Limits: 10 cases, weights 1–10, 200 total requests including up to 20 warm-up
requests, 5 concurrent requests, 10 launches/second, 1–30 second request
timeouts, and a configurable 1–120 second run limit. Plans and reports are
limited to 2 MiB. Mock delays support 0–5 seconds. Timing limits depend on
browser scheduling and cannot stop work already being processed by a server.
Plans include target URLs and literal request inputs; use session headers for
credentials when possible. Reports omit targets, parameters, response bodies,
and headers but retain operation names and paths. Nothing runs or persists
automatically. Plans, reports, and baselines survive closing the panel and
invalid editor text, and the lab never modifies the API document.

## Generating linked API test data

Open **API fixture studio** in the Testing tools to build repeatable datasets for
frontend development, demos, and automated tests without making API requests.

1. Choose **Use current editor as fixture source**. The studio captures an
   independent JSON/YAML snapshot and discovers component models, Swagger 2
   definitions, and JSON request/response schemas from ordinary path operations.
   Local references are resolved; external references are never fetched.
2. Choose a schema and **Add fixture dataset**. Give each dataset a unique export
   name and row count. Request mode omits read-only fields; response mode omits
   write-only fields. Model mode includes both. Turn off optional properties to
   generate minimal records, subject to required fields and object constraints.
3. Add **Field overrides** for top-level object properties. A sequence can create
   numeric IDs or strings such as `USR-1`; a JSON constant sets a specific value.
   A dataset reference copies a scalar field from another dataset, cycling through
   its rows. For example, generate `users.id` with a sequence, then reference it
   from `orders.userId`. Parents are generated before their dependents even when
   listed later in the recipe. Missing keys, null/object/array references, and
   dependency cycles stop generation with an actionable error.
4. Set a seed and choose **Generate fixtures**. The same source, recipe, and
   generator version produce the same rows. Adding or reordering unrelated
   datasets does not change an existing dataset's random stream. Large runs
   yield periodically and can be cancelled; cancelled runs publish no partial
   results. Changing the recipe clears the previous results.
5. Review row counts and diagnostics, and page through the JSON preview. Export
   one dataset as a JSON array, NDJSON, or spreadsheet-safe CSV, or all datasets
   as a JSON object keyed by dataset name. CSV includes a zero-based row index,
   uses JSON cells for nested values, and supports up to 64 columns. Previews
   show ten rows at a time and shorten very large values; exports contain all
   rows, including those with diagnostics.
6. **Download fixture recipe** to reuse the configuration. Importing a recipe
   replaces the current configuration, while an invalid import preserves it.
   Recipes contain schema pointers and field overrides, including constants;
   they omit the source document and generated rows. Capture a compatible schema
   before generating. Nothing is persisted automatically or written to the
   editor. Captured sources and recipes remain available while the current
   editor contains incomplete or invalid text.

The generator supports primitive types, enum/const values, object properties,
local references, common schema compositions, numeric ranges and multiples,
string lengths, bounded arrays, and UUID/email/URI/date/date-time/IP formats.
Examples and defaults are not sampled. Generation is intentionally bounded and
does not solve arbitrary JSON Schema constraints: complex compositions may
produce invalid rows, patterns require review, recursive references become
null, and unsupported keywords or unresolved references produce diagnostics.
Every row is checked against the original schema with the app's existing
validator, which itself supports a subset of JSON Schema. A row may count as
both invalid and needing review. Diagnostics are advisory; inspect the output
before using it as a conformant fixture.

Limits are 10 datasets, 500 rows per dataset, 2,000 rows total, 64 overrides per
dataset, 50 items per nested array, 100 properties per generated object, 4,096
characters per generated string, and 12 levels of generated nesting. Source and
recipe files are limited to 2 MiB, source discovery to 500 schemas, displayed
diagnostics to 200, and generated data and individual exports to 8 MiB. Additional
parsing, generation, and validation budgets stop excessive processing. Sequence
values are rounded to six decimal places. Enum/const values and overrides may
contain sensitive data; review exported data and recipes before sharing them.

## Comparing API environments

Open **Environment comparison runner** in the Testing tools to check whether two
deployments behave alike for the same requests. For example, compare an existing
release at `https://api.example.com/v1` with a candidate deployment at
`https://staging.example.com/v1` before changing client traffic.

1. Use **Add comparison case** to select a documented GET or HEAD operation, or
   **Add visible GET/HEAD endpoints** to use the current endpoint view. Bulk add
   excludes operations already in the plan and fills up to the 20-case limit.
   Duplicate a case to exercise different parameters; reorder or remove cases as
   needed. POST, PUT, PATCH, DELETE, OPTIONS, and TRACE cannot be imported or run.
2. Set case parameters. The same values go to both targets; repeated query keys
   are supported and blank values are omitted. Path values use the existing
   request builder's encoding. Case parameters are literal values, not variable
   templates. The **View comparison endpoint** action opens the existing endpoint
   tools without changing the schema.
3. Start with **Mock** to rehearse locally using the two selected documented
   response variants. Mock needs no URLs, credentials, or required request values,
   sends no requests, and suppresses bodies for HEAD/204/304 responses. Choose
   different variants to exercise mismatch reporting. Mock is not verification of
   a deployment or its performance.
4. Select **Live**, then enter baseline and candidate base URLs. Both override the
   schema's root and operation servers. Base path prefixes are retained, so a
   server ending in `/v1` and an operation `/users` requests `/v1/users`. Use public
   HTTP(S) URLs without user information, query strings, or fragments. The existing
   proxy validates public targets, does not follow redirects, and enforces response limits;
   Live execution cannot silently fall back to a mock response.
5. If needed, open **Session headers for each target** and supply separate JSON
   objects such as `{"Authorization":"Bearer …"}`. Names are case insensitive
   when overriding case headers. These headers are in-memory only and are excluded
   from both definition and report exports. Existing workspace authentication and
   request-environment headers are not automatically forwarded. Editing a target
   URL clears that target's headers; a successful plan import clears both sets and
   switches execution back to Mock. Cookie parameters use the existing request
   builder, which produces the outgoing Cookie header when present.
6. Configure comparison rules, then explicitly choose **Run Live comparison**.
   The entire plan is checked against the current schema and required parameters
   for both targets before the first request. Cases execute in order, baseline
   first and candidate second, with at most one request in flight. Each request
   has its own 1–30 second timeout. There are no automatic retries. A failed
   baseline request skips the candidate for that case; a candidate failure retains
   baseline metadata. Later cases continue unless **Stop after the first
   non-matching case** is selected. **Cancel environment comparison** remains
   available when the panel is closed, aborts the active request, and prevents
   further requests. Leaving the component also cancels an active run.

By default the runner compares status, body, and headers, ignoring `date`,
`x-request-id`, and `server-timing`. Header names are case insensitive. JSON objects
are compared structurally regardless of key order; arrays retain their ordering.
For changing timestamps or IDs, list JSON Pointers such as `/updatedAt` or
`/metadata/requestId` in **Ignored body JSON Pointers**, one per line. Each excludes
that subtree during structural comparison. Escape `/` as `~1` and `~` as `~0` in
property names. There are no wildcards, and the root cannot be ignored. Non-JSON
bodies and JSON containing unsafe numeric values are compared as text, where JSON
Pointer exclusions do not apply.

Optional contract checks inspect each response independently against the schema
captured when the run starts: documented status, content type, top-level body type,
and required fields. They are the existing advisory checks, not full recursive
JSON Schema validation. Ignoring response differences or disabling header
comparison does not disable these checks. The **Allowed candidate slowdown** is
an absolute millisecond increase over the baseline sample; zero disables it and
an increase equal to the allowance passes. Sequential single samples can be noisy;
this is a regression signal, not a load test or performance benchmark.

Results show statuses, byte counts, durations, the candidate-minus-baseline timing
delta, contract pass/fail/skip counts, and changed field paths. Filter by result or
search by method, path, status, and outcome. **Matched** means all enabled checks
agree within their scope; identical documented error responses can also match.
Known differences, failed contract checks, or excessive slowdown produce
**Different**. An incomplete comparison without an observed mismatch produces
**Inconclusive**, which does not pass the overall run. Comparison limits are 500
differences, 20,000 structural visits, and 60 levels of nesting; difference paths
longer than 2,048 characters are omitted and mark the comparison as limited.
Requests are limited to 1 MiB response bodies and 128 KiB response headers in the
runner. Limits and request failures never count as a successful match.

Export a plan as `rsswag-environment-plan.json` to keep its URLs, literal case
parameters, mock selections, and comparison rules. Definitions are versioned and
validated on file/paste import; failed imports preserve the current plan. Review
literal parameters and URLs before sharing, and use session headers for secrets.
Exports of `rsswag-environment-report.json` include the plan name, run timestamps,
Mock/Live mode, rules, and results. They exclude target URLs, request parameters,
session headers, raw responses, and before/after response values. Operation paths,
field names, and other metadata can still be sensitive. Reports with cancellation
or request errors can be exported as well. Use individual endpoint tools for
separate inspection of response values.

Plans, session credentials, and results stay in tab memory and are not added to
request history or browser storage. Closing the panel or temporarily making the
main schema invalid preserves the plan; editing its configuration invalidates old
results. Export work before leaving. A run uses a snapshot of the plan and schema;
rerun after changing the API definition. The main editor is never modified by this
tool. Limits are 20 cases, 64 parameters per case, 64 ignored paths/headers, and
2 MiB per definition; each target's session headers are limited to 64 KiB.

## Creating API variants with transformation recipes

Open **API transformation workbench** in the Design tools to derive a variant
from an existing OpenAPI 3 or Swagger 2 definition. A recipe can update metadata,
switch root servers, copy response definitions, reorganize components, or exclude
operations from a particular variant. No API requests are sent.

1. Choose **Use current editor as source** to capture a valid definition. The
   recipe runs against this snapshot, so later editor changes cannot silently
   change its input. Capturing again refreshes the source and preserves the steps.
2. Add a step or use the version/root-server starters. Select an operation, enter
   its target JSON Pointer, and provide a JSON value or source pointer as needed.
   Steps can be reordered, duplicated, edited, and removed. The root-server
   starter is available for OpenAPI 3; Swagger 2 recipes can edit `host`,
   `basePath`, and `schemes` directly. Nested server overrides remain in effect.
3. Use **Browse source JSON Pointers** to search the captured document and fill
   the selected step's target or source. The browser shows the document before
   recipe execution; paths introduced by earlier steps can be entered manually.
4. Choose **Preview transformation**. Steps run in order on an independent copy.
   A failed step stops the recipe, identifies its position, and leaves the editor
   untouched. The final result must pass the editor's existing structural checks.
5. Review the changed paths and the transformed definition. Copy or download the
   result as JSON/YAML, or explicitly **Apply transformation to editor**. If the
   editor has changed since capture, application stops: recapture and preview
   again. **Undo transformation application** restores the exact previous text,
   provided no subsequent editor changes would be overwritten.

Recipes use the standard [JSON Patch format (RFC 6902)](https://www.rfc-editor.org/rfc/rfc6902):
an ordered JSON array with `add`, `remove`, `replace`, `copy`, `move`, and `test`
operations. Import a `.json`/`.jsonpatch` file or paste a recipe, and export recipes
independently of their source documents. A successful import replaces the current
steps; a failed import preserves them. For example:

```json
[
  { "op": "test", "path": "/info/version", "value": "1.0.0" },
  { "op": "replace", "path": "/info/version", "value": "2.0.0" },
  {
    "op": "add",
    "path": "/servers",
    "value": [{ "url": "https://staging.example.com/v2" }]
  },
  {
    "op": "add",
    "path": "/info/description",
    "value": "Staging variant"
  }
]
```

`test` guards assumptions such as an expected version; object key order does not
affect equality, while array order and value types do. `add` sets an object member
or inserts an array item, but requires an existing parent. `replace` and `remove`
require an existing target. `copy` creates an independent value. `move` removes
its source before inserting, so array target indices refer to the array after
removal; moving a value into its own descendant is rejected. Use `/-` to append
to an array. There are no wildcard or recursive selectors.

Pointers follow [JSON Pointer (RFC 6901)](https://www.rfc-editor.org/rfc/rfc6901).
Escape `/` in a key as `~1` and `~` as `~0`: the GET operation on `/users/{id}` is
`/paths/~1users~1{id}/get`. An empty pointer addresses the whole document, while
`/` addresses a property with an empty name. URI fragments such as `#/info` are
not patch pointers. Values must be JSON: strings need quotes, and `null`, arrays,
objects, numbers, and booleans retain their types.

The workbench does not rewrite `$ref` values, operation links, security names, or
discriminator mappings when their targets move. Structural acceptance is not full
OpenAPI validation; review the resulting API with the component registry, quality
audit, and other existing tools. Array changes use compact summaries in the change
list; inspect the full definition to review their contents. JSON/YAML is serialized
again, so comments, anchors, and original formatting are not preserved in output.
Undo preserves the original text exactly.

Source snapshots, recipe edits, and one level of undo stay in tab memory, including
when the panel is closed or the main editor temporarily becomes invalid. Export
recipes and definitions before leaving. Applying a result uses normal editor
draft/save behavior. Sources and recipe values may contain credentials or private
examples; exports retain these values, so review them before sharing.

Processing limits are 2 MiB for each input/recipe and the compact intermediate
document, 100 steps, 50,000 JSON nodes, and 64 levels of nesting. YAML aliases are
bounded and cycles are rejected; non-finite and unsafe integer values are rejected
to avoid silently changing data. Formatted output is limited to 8 MiB. The pointer
browser shows the first 50 search matches, the change list the first 200 changes,
and the text preview the first 50,000 characters; exports contain the full result.

## Discovering an API from traffic

Open **Traffic-to-OpenAPI studio** in the Design tools to create a definition
for an API that does not yet have an OpenAPI document. Export a HAR capture from
your browser's Network panel, then import the `.har` / `.json` file or paste its
JSON. Capture response bodies where your browser supports it; a HAR without body
content can still describe observed routes, parameters, statuses, and media types.
The studio is available even when the main editor is empty or invalid.

1. Select the **API origin** to exclude unrelated hosts in the browser capture.
2. Optionally set **Move path prefix into server URL** to `/api/v1`, for example.
   Only requests at that prefix or below it are selected. The generated server
   becomes `https://your-host/api/v1`, and operation paths omit that prefix.
3. Review the suggested routes. Numeric and UUID path segments become `{id}`, then
   `{id2}`, and so on. Turn suggestions off to start from literal paths, or edit
   whole segments to meaningful names such as `/users/{userId}/orders/{orderId}`.
   Suggestions can include fixed numeric segments such as years, so review them.
4. Search, include, or exclude routes. Search matches methods, edited path templates,
   captured paths, and observed HTTP statuses, so `GET /users/12 404` can find a
   grouped route. Bulk selection acts on all search matches, across pages.
   Routes assigned the same method and path template are merged.
   Different parameter names for the same path shape are rejected, including
   across methods. Literal segments must still match the observed source paths.
5. Set the API title and version, then choose **Generate OpenAPI draft**. Preview,
   copy, or download JSON/YAML, or explicitly apply it to the main editor.

For example, observations of `GET /api/users/12` and `GET /api/users/34` can become
one `GET /users/{userId}` operation on a server ending in `/api`. Responses such as
`{"id":12,"name":"Ada"}` and `{"id":34,"enabled":true}` produce properties for
`id`, `name`, and `enabled`, with their observed types. Captured values are not
copied into examples, defaults, or enums.

Generation combines JSON request bodies for body-capable methods, JSON response
bodies by status and media type, path parameters, and query parameters. Repeated
query keys become arrays with form/explode serialization. Boolean and safe numeric
query values suggest corresponding types; empty values, leading-zero numbers, and
unsafe integers remain strings. The URL query is authoritative; HAR `queryString`
is used when the URL contains no query. JSON media types with a `+json` suffix,
UTF-8 base64 response content, nested arrays, nullable fields, and mixed types are
supported. Empty arrays do not erase item shapes observed in other samples.

Fields and request bodies are optional by default. **Mark fields present in every
observation as required** enables intersection-based inference; path parameters
are always required. This is a draft of observed behavior, not a complete contract:
review types, required fields, authentication, formats, ranges, errors, and routes
that were not exercised. No authentication scheme or security requirement is
inferred from captured credentials. Header and cookie parameters are not inferred.

Missing or invalid JSON bodies, unsupported encodings, and inference limits produce
warnings and broad schemas rather than guessed structures. Requests reporting a
positive body size without captured `postData` also retain their Content-Type with
a broad schema and a warning; a Content-Type header alone does not imply that a
request had a body. Non-JSON media types
are retained; text types use a string schema and other content uses an unconstrained
schema. Form and multipart fields are not inferred. HEAD, 204, and 304 responses
have no generated body. Entries with network-failure status `0`, unsupported
methods, invalid URLs, or invalid response statuses are skipped with warnings.
Warnings describe the whole imported capture, including excluded routes.

Processing is entirely local and sends no API requests. Normalized observations
keep body shapes and query types, but discard body values, query values, URL
credentials, fragments, headers, cookies, and unrelated HAR metadata. Hostnames,
literal paths, and property/parameter names are retained and may themselves be
sensitive; review the generated document before sharing it. Imported captures and
route edits stay in this tab's memory and are not automatically saved to storage
or request history. Export the generated document before leaving the page.

Importing a new capture replaces the discovery draft only after a successful
parse; failed imports preserve it. Changing origin, prefix, or grouping resets
route edits and selections. Changes to generation settings invalidate old output.
**Apply discovered API to editor** explicitly replaces the main document using
its normal draft/save behavior. **Undo discovered API application** restores the
previous editor text only if it has not changed since application. Undo is one
level, held in memory, and replaced by the next application. Closing the panel or
temporarily invalidating the main editor preserves the discovery work.

Limits are 5 MiB per HAR import, 1,000 entries, 500 discovered routes per scope,
128 distinct query parameters per entry, and 10 MiB per generated document.
Each JSON body is limited to 1 MiB, 20,000 nodes, and 64 nesting levels; inference
uses at most 100,000 body nodes across the capture. Up to 25 routes per page,
10 distinct source paths per route, 100 warnings, and 50,000 preview characters
are displayed; full generated definitions are copied/downloaded.

## Working with multi-file definitions

Open **Multi-file OpenAPI workbench** in the Design tools to work with an API
split across local YAML and JSON files. Import a folder to retain its directory
structure, or select individual definition files. Folder imports include only
`.json`, `.yaml`, and `.yml` files. The workbench is also available while the main
editor contains an invalid draft.

For example, import a folder containing:

```text
api/openapi.yaml
api/paths/users.yaml
api/schemas/User.yaml
```

Select `api/openapi.yaml` as **Root API document**. It might contain:

```yaml
openapi: 3.1.0
info:
  title: Modular API
  version: "1.0"
paths:
  /users:
    $ref: ./paths/users.yaml
```

The `api/paths/users.yaml` file can refer to a sibling schema folder:

```yaml
get:
  summary: List users
  responses:
    "200":
      description: Users
      content:
        application/json:
          schema:
            type: array
            items:
              $ref: ../schemas/User.yaml
```

Create missing files with **New file path** and **Create project file**, or use
**Copy editor into project file** to take a snapshot of the current editor.
Select a file to edit its source. These edits affect the in-memory project;
they do not write back to disk or automatically change the main editor.
Paths are case-sensitive. Matching imports are rejected unless **Replace matching
files on import or add** is enabled. Failed imports preserve the existing project.

**Build reference bundle** resolves local and relative-file `$ref` values,
JSON Pointer fragments, operation links, and explicit discriminator mappings.
Click a diagnostic or reference-map entry to focus its source text. Search and
resolution filters help inspect larger projects; unused files are listed separately.
File or root changes clear the previous result so an outdated bundle cannot be
applied accidentally. Every imported file must be parseable before a bundle is
produced, including unused files.

Relative references use the referring file's directory, following the
[OpenAPI rules for relative references](https://spec.openapis.org/oas/v3.1.0.html#relative-references-in-uris).
URI-encoded filenames, escaped JSON Pointer keys, and array indexes are supported.
Existing root components retain their identities. Referenced external fragments
are copied into a collision-free `x-rsswag-bundled` extension and referenced
internally. Repeated targets are reused and cycles stay as references. The root
document's fields and reference siblings are retained; example payloads, defaults,
enums, and extension data are not mistaken for schema references. YAML comments
and formatting remain in project files but are not retained in serialized bundles.
The endpoint viewer follows local Path Item references and bounded reference chains,
so bundled operations work with the existing request tools.

Preview the result and copy or download a JSON/YAML bundle. **Apply bundle to
editor** explicitly replaces the main document and uses its normal draft/save
behavior. **Undo bundle application** restores the previous editor text only if
it has not changed since application. The undo snapshot stays in memory and is
replaced by the next application; export a backup if you need longer-term recovery.

Use **Download project JSON** or **Copy project JSON** to preserve all files,
including unfinished drafts, for a future session. Restoring a project replaces
the workbench without applying anything to the editor. Project files and the undo
snapshot survive panel closing and temporary editor errors but are not persisted
automatically. Exports include full source contents, so they can contain sensitive
examples or literal credentials already present in those files.

The bundler supports OpenAPI 3.0–3.2 and Swagger 2.0 documents with JSON Pointer
references. It performs no network requests or full OpenAPI conformance validation.
Remote references, paths escaping the project, named anchors, custom schema
dialects, schema resource identifiers (`$id` or legacy `id`), and dynamic/recursive
references block bundling instead of producing a document with altered resolution
semantics. Discriminators need explicit mappings. Relative external example values
and relocated relative server/documentation URLs need inline values or absolute URLs;
absolute external example URLs are preserved without fetching their contents.

Limits are 50 files, 2 MiB per file, 8 MiB total source, 16 MiB serialized output or
project import, 1,000 embedded fragments, and 5,000 processed references. Parsing
also limits YAML aliases, nesting to 80 levels, and nodes to 100,000 per file;
bundling processes at most 200,000 nodes. Duplicate keys, cyclic YAML aliases,
non-finite numbers, and integers outside JavaScript's safe range are rejected.
The preview shows up to 50,000 characters; exports contain the complete output.

## Running API scenarios

Open **API scenario runner** in the workspace's Testing tools to build and run
an ordered workflow from the current document. Add up to 20 endpoint steps,
edit their inputs, duplicate or reorder them, and rehearse the complete sequence
with **Run Mock scenario**. Each step has its own documented Mock response,
expected status codes (`200, 201`), status class (`2xx`), or `any`, request timeout,
optional maximum response duration, and optional response contract checks.
Contract checks cover documented status, media type, top-level body shape, and
required properties; a partial result means some checks could not be evaluated.

For example, a user lifecycle scenario can:

1. Call `POST /users` with a request body template such as
   `{"name":"{{name}}","enabled":"{{enabled}}"}`.
2. Extract the response's `/id` JSON Pointer into the variable `userId`.
3. Call `GET /users/{id}` with the `id` path parameter set to `{{userId}}`.
4. Optionally add a `DELETE /users/{id}` step using the same variable.

Set the starting **Session variables (JSON object)** to, for example:

```json
{
  "name": "Ada",
  "enabled": true,
  "token": "your-session-token"
}
```

Use `{{name}}` in parameter values, a server URL override, or request body strings.
An entire JSON string placeholder preserves the variable's scalar type: the
example body sends `enabled` as a boolean. Placeholders inside longer strings
are interpolated with JSON escaping. Variable names use letters, digits, and
underscores, starting with a letter or underscore. Values may be strings,
finite safe numbers, booleans, or null; objects and arrays cannot be variables.
JSON Pointer extraction supports array indexes and escaped keys (`~0` for `~`
and `~1` for `/`); an empty pointer selects the root value.

Configure authentication explicitly with a header parameter such as
`Authorization: Bearer {{token}}`, or the API's query/cookie parameter.
The runner does not automatically copy workspace authentication, environments,
or endpoint request presets. A blank server override uses that endpoint's
documented server. Every step must still match a unique operation in the current
schema before any requests start. A run uses the schema available when it starts.

**Mock rehearsal** uses documented or generated example responses locally,
makes no network requests, and reports zero duration. It verifies the chain and
checks against those examples; it does not simulate server state or measure
performance. **Live requests** sends real requests through the application server,
including POST, PUT, PATCH, and DELETE. Live targets must use public HTTP(S)
addresses; private DNS results and URLs containing credentials, queries, or
fragments are rejected. Put query values in step parameters. Redirects are
reported without following them, and network failures never become Mock results.
As with Try It Out, GET and HEAD do not send request bodies.

Steps execute sequentially. Extracted variables become available only after all
checks and extractions for that step pass. If a step fails, its declared output
variables are cleared so later steps cannot reuse stale values. By default the
run stops at the first unsuccessful step; disable that option to continue with
independent steps. **Cancel scenario** aborts the active request and skips the
remaining steps. Cancellation does not undo requests already received by the API.

Definitions can be copied, downloaded, or imported as versioned JSON. Importing
replaces the current draft and initializes declared session variables to empty
strings; it never runs requests. Invalid imports leave the draft intact. Exports
include authored request templates and variable names, but omit session values
and captured responses. Keep secrets in session variables: literal secrets typed
into a request template would be included in its definition export. Result reports
contain operation paths, outcomes, statuses, durations, issue codes, contract
results, and extracted variable names, without request/response bodies or headers.

The scenario and its session variables stay in memory across panel closing and
temporary schema errors. Export the definition before leaving the page; nothing
is saved to browser storage or request history. Each run starts with the session
variables again, without reusing values captured by an earlier run. Limits are
20 steps, 64 variables, 64 parameters and 10 extractions per step, a 1–30 second
step timeout, 2 MiB definition imports, and 1 MiB Live response bodies. JSON
extraction also respects the response explorer's depth and node limits.

## Planning and tracking API tests

Open **API test-plan workbench** to generate a manual checklist from the current
OpenAPI or Swagger document. It includes a happy path for each operation, missing
required parameters and bodies, enum choices, numeric boundaries, string-length
boundaries, manual pattern reviews, and omitted top-level required body properties.
Start with a working request in Try It Out, apply the suggested change, review
the complete contract, and record **Pending**, **Passed**, **Failed**, or **Blocked**
with up to 1,000 characters of notes. The workbench never executes requests.

Use endpoint scope, search, test-intent and QA-result filters to organize work.
Each case links to its endpoint. JSON and Markdown exports include the entire
selected endpoint scope, irrespective of table filters or pagination. JSON can be
imported to merge matching case results in the selected endpoint scope; unknown,
out-of-scope, or changed cases are counted
and ignored. Invalid imports leave results intact. Imports and result resets can
be undone. Progress stays in memory across panel closing and temporary schema
errors; export JSON before leaving the page to preserve it.

Case identities include normalized input constraints and documented response
codes, so changes to those details produce fresh pending cases. Descriptions,
examples, server addresses, and parameter order do not affect identity. Results
remain manual observations: response body or security changes require a review
and, when appropriate, a result reset. Exports include suggested values and notes,
which can contain sensitive data; no credentials or request history are collected.

The planner supports up to 1,000 cases and skips operations whose constraint
identity exceeds 4,096 characters or whose path exceeds 1,024 characters. String
boundary suggestions cover lengths 0–256; numeric suggestions use finite bounds
inside the safe integer range. Each suggestion targets one rule, not every
constraint simultaneously. Exclusive bounds, formats, nested body rules, complex
schema composition, and exhaustive enum combinations are not generated. Pattern
expressions are displayed for manual review and are never executed. JSON imports
are limited to 16 MiB and 1,000 cases.
JSON exports exceeding the import limit ask you to narrow the endpoint scope.

## Inspecting browser traffic

Use **HAR traffic inspector** to import a `.har` or `.json` file, or paste HAR JSON.
You can [export a HAR capture from Chrome DevTools](https://developer.chrome.com/docs/devtools/network/reference#save-as-har).
Imports support up to 5 MiB and 5,000 entries. Invalid and non-HTTP entries are
counted as skipped; a failed import preserves the previous capture.

Select all endpoints or the current endpoint view, optionally choose a captured
origin, and strip a path prefix such as `/api`. Matching uses the HTTP method and
path, with whole-segment placeholders such as `/users/{id}`. Static routes take
priority and equally specific matches are marked ambiguous. Trailing slashes are
significant; embedded placeholders such as `{id}.json` are not supported. Schema
server URLs are not automatically applied to matching.

Review unmatched requests, undocumented response statuses, HTTP/network failures,
and observed operations. Exact response codes, status ranges, and `default` are
supported; response bodies are not validated. Status 0 and HTTP 400–599 count as
failures. Average, nearest-rank P95, and maximum use known nonnegative HAR total
durations. Search traffic, filter outcomes, sort by duration, and navigate from
the operation coverage table to the corresponding endpoint.

No requests are replayed or stored in history. The inspector retains only request
methods, origins, paths, statuses, and durations in memory; it discards URL
credentials, query values, headers, cookies, and bodies after import. Paths and
origins may still contain identifying values and are visible locally until the
capture is cleared or the page is closed. The capture also survives temporarily
invalid or empty schemas while editing. Copy/download reports include only
aggregates and schema operation paths, never captured URLs or payload values.
Reports reflect endpoint scope, origin, and prefix settings; traffic table search,
sorting, pagination, and result filters do not narrow the report.

## Exporting part of an API

Use the endpoint search, tags, method filters, or favorites to choose operations,
then open **API slice exporter** in the workspace. Its **Current view** scope
exports those operations; **All endpoints** exports the complete operation list.
Choose JSON or YAML, review the preview and component counts, then copy or
download the contract. The editor document stays unchanged.

The export preserves source metadata, server URLs, shared path parameters, and
authentication requirements. Unused reusable components are removed while
transitive and circular dependencies are retained. Webhooks can be included
explicitly. Polymorphic schemas, schema resource IDs, and references to whole
component containers retain all components conservatively.

Missing local references and referenced path items block export and are listed
in the review notes. External references remain external, and links to excluded
operations are flagged for review. JSON/YAML serialization does not preserve
source comments or formatting. The original specification version is retained,
including Swagger 2 reusable definitions.

## Building a schema from response examples

Open **Response schema builder** inside an endpoint. Use **Capture current
response** after a Live or Mock run, or paste a JSON example and select **Add
JSON example**. Each capture is a snapshot; subsequent runs and clearing the
displayed response do not replace the samples. Remove individual examples to
refine the schema, or clear them to start again. Samples survive closing the
builder, but remain only in memory and are lost when the endpoint is unmounted
(for example, by endpoint filtering) or the page is closed.

The builder merges nested object properties and all observed array items.
Properties missing from any observed object at the same location become
optional. Explicit nulls produce nullable type unions; integer and fractional
observations combine as `number`. Empty arrays have unconstrained items until
other examples provide evidence. The field inventory shows schema paths, types,
and the number of objects containing each property; search and pagination only
affect that inventory, not the exported schema.

Review the inferred draft and choose whether consistently present fields should
be required and whether additional object properties are allowed. Examples
cannot establish formats, enums, bounds, or business rules. No examples or
literal response values are embedded in exports, but field names are retained.
Choose **JSON Schema 2020-12** for a standalone schema or **OpenAPI 3.1 component
(YAML)** for a `components.schemas` fragment. The YAML is intended for OpenAPI
3.1 and is not a complete API document. Copy or download the result for review;
the builder never modifies the editor or sends requests.

Limits are 10 samples, 1 MiB per sample, 2 MiB combined, 20,000 JSON values
combined, and 64 nesting levels. Malformed JSON and unsafe numeric values are
rejected without discarding existing examples. Previews are limited to 12,000
characters; exports contain the full schema.

## Comparing endpoint responses

Run an endpoint with **Try It Out**, then select **Pin response baseline** in
**Response comparison** below its response. Run it again to inspect added,
removed, and changed JSON fields, response headers, and status. Latency and body
size are shown separately; changes to those metrics do not count as content
differences. Both Live and Mock responses can be compared.

**Comparison settings** can exclude volatile JSON fields using one JSON Pointer
per line, such as `/timestamp` or `/items/0/id`, and header names separated by
commas. Date, request ID, and server timing headers are ignored by default.
Object-key order and JSON formatting do not affect structural comparisons;
arrays are compared by index. Non-JSON bodies are compared as text.

Filter the change list by area, change type, or path. Copy and download actions
export all detected changes, with value previews excluded by default. Enable
**Include value previews in report** to share them; standard authentication and
cookie header values remain redacted. Container changes show their size instead
of embedding entire objects or arrays.

Clearing a displayed response keeps the baseline for the next request. Baselines
are not stored in request history, local storage, or the database, and are lost
when their endpoint leaves the filtered view or the page closes. Bodies over
1 MiB and comparisons exceeding the depth, value, or change limits are explicitly
marked partial.

## Checking custom response expectations

Open **Response assertions** inside an endpoint to add status, header, JSON, or
timing checks before or after running a request. Checks automatically evaluate
the currently displayed Live or Mock response and reevaluate after each run or
rule edit. Filter results to investigate failed checks or evaluation errors.
Schema-driven response contract checks and response comparisons remain available.

For example, require status `200`, a `content-type` header containing
`application/json`, `/items` to have JSON type `array`, and response time to be
at most `1000` milliseconds. JSON checks support existence, absence, structural
equality, text containment, type, length, and numeric bounds. Body equality
expects a JSON literal (use `"ready"` for a string); header equality and text
containment use plain text. JSON equality ignores object-key order and preserves
array order. Length counts array items or Unicode code points in strings.

Paths use JSON Pointer syntax: `/items/0/id`, with `~1` for `/` and `~0` for `~`
inside property names. An empty path selects the entire body. Missing fields
differ from JSON `null`; an absence check cannot pass on an unreadable body.
Header names are case-insensitive, and header values are trimmed. Numeric
checks do not coerce JSON strings to numbers.

**Import and export checks** copies or downloads a versioned JSON check set.
Paste a saved set and choose **Append imported checks** to add it without
replacing existing checks. Sets contain the names and expected values you enter.
Assertion reports include endpoint method/path, Live/Mock source, counts, and
numbered outcomes for all checks, regardless of the active filter. They omit
response data, check names, and expected values; keep the corresponding check
set with its report.

Checks stay in memory and survive response clearing and endpoint collapsing.
Export them before filtering the endpoint out or closing the page. There is no
automatic request execution or storage in history, local storage, or the database.
Each endpoint supports 50 checks; imports are limited to 2 MiB. JSON evaluation
is limited to 1 MiB, 20,000 values, and 64 nesting levels. Nonfinite numbers and
integers outside JavaScript's safe range produce evaluation errors. Header,
status, and timing checks remain usable when body checks cannot be evaluated.

## Exporting smoke tests for CI

Open **CI smoke-test exporter** to generate a dependency-free Node.js 20+ runner
for the current endpoint view or all endpoints. Only GET and HEAD operations
are included. Choose whether to include deprecated operations, check JSON
shapes, or enforce a response-time budget, then download the runner and its
configuration template. The inventory lists required input placeholders and
documented authentication requirements. Generation does not execute requests.

Set `baseUrl` in the configuration, including any API path prefix, and fill
required parameter placeholders. Configuration entries are keyed by operation,
for example `GET /users/{id}`, with `enabled` and a `parameters` object containing
`path`, `query`, `header`, and `cookie` string maps. Optional parameters can also
be added. Set `enabled` to `false` to skip an operation. Parameter values are
URL-encoded; examples and saved editor credentials are never embedded.

Set `RSSWAG_SMOKE_CONFIG` to the downloaded configuration file path. Optionally
override its base URL with `RSSWAG_BASE_URL` and provide authentication headers
through `RSSWAG_HEADERS_JSON`. Header overrides are case-insensitive; empty
per-operation header placeholders inherit shared headers. For example, in
PowerShell (substitute your downloaded filenames):

```powershell
$env:RSSWAG_SMOKE_CONFIG = './rsswag-my-api-smoke-config.json'
$env:RSSWAG_BASE_URL = 'http://localhost:4010'
node ./rsswag-my-api-smoke-tests.mjs > smoke-report.json
```

The runner issues requests sequentially, does not follow redirects, and requires
documented 2xx responses. It checks documented media types and, when enabled,
JSON validity, recognized top-level types, and required top-level properties.
Exact statuses take precedence over status ranges and `default`. HEAD, 204, and
205 responses omit content checks. This is a smoke test, not complete JSON Schema
validation. The optional timing budget includes response-body reading. Requests
have bounded timeouts and a 1 MiB response-body limit.

Reports contain operation method/path, timing, status, check outcomes, and summary
counts; they omit response bodies, header values, parameter values, and resolved
request URLs. Exit code `0` requires at least one passed test and no failed or
blocked tests. Missing required inputs are blocked, unknown operation keys reject
the configuration, and an empty or entirely skipped suite exits unsuccessfully.
Authentication failures remain failures even if an error response is documented.

## Exploring response data

After a Live or Mock request, open **Response data explorer** beneath the response.
Browse direct children, use the breadcrumb buttons to return to a parent, or enter
a JSON Pointer such as `/items/0/id`. An empty pointer selects the root; use `~1`
for `/` and `~0` for `~` inside keys. Copy the selected pointer for use in custom
response assertions or comparison ignore settings.

Search spans the whole response, matching paths, keys, and scalar values without
case sensitivity. All whitespace-separated search terms must match the same
value. A type filter narrows the results. Copy or download any selected value as
JSON; previews longer than 8,000 characters are shortened, while exports remain
complete. The original response display and download are unchanged.

Select an array and switch **Array display** to **Table**. Arrays of objects use
the union of their direct property names as columns. Primitive, mixed, and
empty-object arrays use a single Value column. Choose columns, filter rows across
the selected columns, or open an individual row for deeper exploration. Both
navigation and tables paginate at 25 entries per page.

**Download filtered CSV** exports every matching row, including other pages,
using the selected columns and original zero-based row indices. Nested values
are serialized as JSON. Missing fields become empty cells; JSON null is written
as `null`. CSV preserves quoted newlines, removes null characters, and prefixes
formula-like string cells and column names with an apostrophe. Numeric cells
remain numeric. Downloads contain the selected response values.

Exploration is local and starts when the panel opens. No response data is added
to persistent storage or history. Closing the explorer or changing the response
body resets its navigation and filters. JSON is limited to 1 MiB, 20,000 values,
and 64 nesting levels. Nonfinite numbers and integers outside JavaScript's safe
range block exploration to avoid rounded exports. Tables allow at most 5,000 rows
and 64 columns; larger arrays can still be browsed and exported as selected JSON
within the overall explorer limits.

## Database Setup

The application supports Supabase persistence and falls back to secure,
server-readable cookies during local development.

1. Create a Supabase project.
2. Run [supabase/schema.sql](./supabase/schema.sql) in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and provide `SUPABASE_URL` and the
   server-only `SUPABASE_SECRET_KEY`.
4. Add the same variables to the Vercel project for Production and Preview.

Never expose `SUPABASE_SECRET_KEY` through a `NEXT_PUBLIC_` variable. An
older revision of `.env.example` mistakenly documented the project URL as
`NEXT_PUBLIC_SUPABASE_URL`; the app still reads that name as a fallback so
deployments configured against it keep working, but `SUPABASE_URL` is the
correct name going forward.

## Quality Checks

```bash
npm run format:check
npm run lint
npm run test
npm run coverage
npm run build
```

Vitest enforces at least 80% coverage for statements, branches, functions,
and lines. Husky runs formatting and lint checks before each commit.

## Author

[Mikhail Maidan](https://github.com/MikhailMaidan) - responsible for everything.

Built for the [RS School React final task](https://github.com/rolling-scopes-school/tasks/blob/master/react/modules/tasks/final.md).
