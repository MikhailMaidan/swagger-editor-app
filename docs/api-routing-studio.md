# API routing and load-balancing studio

Open **Testing → API routing and load-balancing studio** in the workspace. The
studio works independently of OpenAPI validation and is available even when the
main editor contains an invalid document. Its projects stay in memory until you
download them; it does not change the OpenAPI editor or execute HTTP requests.

Use **Load routing and balancing demo**, then **Replay all routing scenarios** to explore
weighted distribution, a canary capacity limit, manual outages, passive ejection
and sticky sessions. Replay uses a virtual clock, so fixture durations do not
cause real waiting.

## Define a policy

A project contains a backend catalog, pools, ordered routes, a passive-health
policy and replay scenarios. Form controls add routes and traffic; expandable
JSON editors expose all fields. Project JSON supports complete portable editing
and restoration. Invalid applies leave the saved project intact. Apply or discard
pending project-source edits before other actions. Undo/redo retains ten project
revisions. Applying a policy or scenario edit clears old run results.

Backends specify an HTTP(S) base URL, positive integer weight, in-flight capacity
and initial manual health. Base URLs may include a path prefix, but cannot contain
credentials, queries or fragments. Pools select backend IDs from that catalog;
capacity and health belong to the backend, shared across all pools.

| Pool algorithm | Selection among healthy backends with free capacity                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `round-robin`  | Smooth weighted round robin; weight 3 receives three times the long-run assignments of weight 1 when eligibility remains constant. |
| `least-active` | Smallest active-request count divided by weight; weighted round robin breaks equal-load ties.                                      |
| `sticky`       | Deterministic weighted hash ranking of the configured header/query value and backend ID.                                           |

Sticky pools take the first query value, or the normalized header value. A missing
or empty value produces a local 400. Health and capacity changes can remap a key;
stickiness is an affinity preference rather than a reserved connection. Hashing
does not provide a security boundary.

Routes run in list order. The first enabled route matching the method, path and
every filter selects its pool. A selected pool's rejection ends the decision.
There is no fallthrough to a later route, request queue or automatic retry.

- Methods are uppercase, or a sole `*` for any method.
- `/items/{id}` captures one nonempty path segment.
- `/assets/{*rest}` captures zero or more trailing segments. A catchall must be
  the final segment. Capture names must be unique within the matching pattern.
- Literal segments match decoded values, case sensitively. Trailing slashes
  matter unless consumed by a catchall. Patterns do not accept arbitrary regular
  expressions or executable code.
- Header names match without case; query names and values are case sensitive.
  Filters support `exists`, `absent`, `equals` and `contains`. For repeated query
  values, equality/contains succeeds if any value matches.
- A null rewrite preserves the incoming path. A rewrite such as
  `/internal/items/{id}` substitutes existing captures, preserving their encoded
  path bytes. Rewrites may repeat captures. The backend path prefix is prepended
  and the incoming query is preserved. URL fragments are discarded.
- `setHeaders` replaces or adds normalized request headers. This is a request
  plan; a transport adapter is responsible for HTTP framing and header handling.

The route audit explains disabled, method, path and filter failures through the
first match. Duplicate-predicate diagnostics identify exact earlier matches,
including patterns differing only in capture names; they are not a general
overlap or coverage proof.

Local decisions are 404 for no match, 400 for a missing sticky key or unsafe
rewrite, and 503 for unavailable backends or exhausted capacity. A forwarded
decision has no local status until its fixture or caller supplies a completion.

## Replay traffic and health

Each scenario has request arrivals (`atMs`), default response fixtures
(`outcome.status`, `outcome.durationMs`), optional `backendOutcomes` by backend ID,
manual `healthEvents`, and optional recorded expectations. Example traffic row:

```json
{
  "id": "read-item",
  "method": "GET",
  "url": "/v1/items/42?expand=owner",
  "headers": { "x-client-id": "example-client" },
  "atMs": 0,
  "outcome": { "status": 200, "durationMs": 120 },
  "backendOutcomes": { "canary": { "status": 503, "durationMs": 20 } }
}
```

Backend references must exist. An origin-relative URL is normalized against
`https://routing.invalid`; routing uses its method/path/query/headers, not that
placeholder origin. Each scenario starts with fresh pool and backend state.

A dispatch reserves one capacity slot until completion. Manual outages prevent
new assignments while existing calls drain. A configured consecutive-5xx
threshold ejects a backend until completion time plus `cooldownMs`; threshold 0
disables passive ejection. A response below 500 clears the failure streak, while
the current cooldown remains in effect. Explicitly marking a backend healthy
clears its streak and ejection. Cooldowns expire at their exact timestamp.

For equal timestamps, completions run first, manual health changes second, then
arrivals; original row order breaks ties. Zero-duration work completes before the
next same-time arrival. Replay drains all admitted work before publishing a run.
Cancel keeps the previous completed results.

Results include assignment counts, local rejections, upstream 5xx counts and
expectation outcomes. Backend distribution bars, result filters, search and
pagination help inspect individual requests. Select a row for the original
request, planned upstream URL/headers and route audit. Move the event slider to
inspect backend health, in-flight counts and ejection after each event. Run totals
describe the whole scenario even when the playhead is on an earlier event.

## Compare policies and record regressions

The candidate editor starts with a copy of the current router configuration.
Change weights, algorithms, routes, capacities or health and compare the selected
scenario. Both policies replay independently from fresh state using the same
traffic. Changes include route, backend, status, rewritten URL and forwarded
headers; header insertion order alone is ignored. A comparison never replaces
the saved project. Reset the candidate explicitly when you want a fresh copy.

Recorded expectations capture each request's exact route ID, backend ID and final
status. Record selected/all completed runs, replay, then export the CI runner.
Expectations deliberately exclude URL/header values. Removing a referenced
route/backend requires updating expectations. Candidate replay drops expectations
only in its independent copy, allowing changed route IDs; traffic fixtures and
health events still need valid backend references. To simulate a referenced
backend outage, mark it unhealthy instead of deleting it.

Run a downloaded runner with Node.js 20 or later:

```sh
node rsswag-routing-tests.mjs
node rsswag-routing-tests.mjs another-routing-project.json
```

The runner writes a JSON report. Exit **0** means every recorded expectation
matched, **1** means a mismatch, and **2** means an invalid project/runtime error
or at least one scenario without recorded expectations. It has no third-party
runtime dependencies and does not contact backend URLs.

## Import and export

- HAR import retains request method, URL, normalized headers, arrival offsets,
  response status and elapsed duration. The earliest timestamp becomes zero;
  fractional durations round up to milliseconds. Response bodies are omitted.
  Duplicate header names ignoring case, status-0 network failures, invalid times,
  oversized captures and invalid entries reject the import atomically. Timestamps
  need an explicit timezone. No entries are silently skipped.
- OpenAPI import snapshots the editor, then copies one operation's method and
  path into a new highest-priority route targeting the selected pool. Review
  rewrites and filters yourself. It does not infer security, traffic or health,
  and leaves the editor unchanged.
- Project JSON restores the full authored policy and scenarios. Candidate exports
  contain just the candidate router configuration. The standalone SDK and CI
  runner embed the authored project.
- Replay and comparison reports omit captured URLs, forwarded headers, sticky
  key values and reservation tokens. They retain IDs, times, statuses and rule
  diagnostics. Project/configuration/SDK/CI downloads contain authored values,
  including any credentials stored in traffic headers.

## Standalone router SDK

The downloaded ESM module exposes the same engine used by the studio:

```js
import {
  definition,
  createRTRouter,
  runRTProject,
  compareRTPolicies,
  rtReport,
} from "./rsswag-routing-toolkit.mjs";

const router = createRTRouter(definition);
const decision = router.dispatch(
  { id: "request-1", method: "GET", url: "/v1/items/42", headers: {} },
  1000,
);

if (decision.token) {
  // Send decision.upstreamUrl / decision.headers using your transport.
  // Complete exactly once with the observed status and completion timestamp.
  router.complete(decision.token, 200, 1120);
}

router.setHealthy(definition.backends[0].id, false, 1120);
console.log(router.snapshot());

const runs = await runRTProject(definition);
console.log(rtReport(runs));
const candidate = structuredClone(definition);
candidate.backends[0].weight = 1;
const comparison = await compareRTPolicies(
  definition,
  candidate,
  definition.cases[0].id,
);
console.log(comparison.changes);
```

Replace sample IDs with those in your project. `dispatch`, `complete`,
`setHealthy` and `advance` accept caller-supplied nondecreasing whole-millisecond
timestamps. Equal timestamps are allowed; rewinds reject. Defaults use the
router's last timestamp. Epoch milliseconds such as `Date.now()` are supported,
but the caller must handle wall-clock rewinds. The router creates no network
connections or health timers. `snapshot()` returns copies. Duplicate/unknown
completion tokens return false and cannot release capacity twice.

`runRTProject(project, optionalCaseIds, options)` and `compareRTPolicies` support
an abort signal and progress callback. Replay yields cooperatively between event
batches and publishes no partial results on cancellation. Projects are normalized
before execution. The exported module also includes project/config normalization,
project parsing, expectation recording and duplicate-route diagnostics.

## Bounds and maintenance

Projects and HAR imports are capped at 2 MiB of UTF-8 data. A project permits 12
backends, 8 pools, 20 routes and 8 scenarios; each scenario has 1–200 requests and
up to 64 manual health events. Weights are 1–100, capacities 1–32, headers are
limited to 32 per definition, and route patterns to 32 segments. Replay arrivals
and completions must fit a one-hour virtual clock; individual durations are at
most ten minutes. Zero routes is valid and rejects every request with 404.

The standalone runtime is generated from the shared TypeScript model and engine:

```sh
node scripts/build-routing-runtime.mjs
node scripts/build-routing-runtime.mjs --check
```

Regenerate it after model/engine changes. Export tests verify freshness, native
ESM behavior, replay parity and CI exit codes.
