# RSSwag

RSSwag is a responsive OpenAPI editor, viewer, and REST client built with
Next.js, React, TypeScript, and Tailwind CSS.

## Demo

[Open the deployed application](https://swagger-editor-app-two.vercel.app/)

## Features

- JSON and YAML OpenAPI editing, large-file import confirmation, import feedback, validation, and conversion
- Remote OpenAPI import from public URLs with redirect, timeout, and size safeguards
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
- Escape clears request-history and saved-schema search text while preserving other filters and keyboard focus
- Server-rendered history analytics in English and Russian

## Local Setup

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
