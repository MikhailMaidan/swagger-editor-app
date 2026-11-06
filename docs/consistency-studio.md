# API concurrency and consistency studio

Use **API concurrency and consistency studio** in the workspace testing tools to
investigate overlapping API calls. It checks recorded operations against explicit
sequential object models, searches for a legal ordering, and reports a witness or
a violation. It is independent of the OpenAPI editor, including invalid documents.
Work remains in tab memory until exported; no requests or user code are executed.

## Try the examples

Load the concurrency examples, then run all consistency regressions. Twelve
histories cover overlapping writes/reads, stale reads, lost increments, competing
compare-and-swaps, FIFO order, duplicated dequeue results, pending effects and
cross-object client ordering.

Select **Stale read violates real-time order** and compare both models. The read
returns the initial value after a write has completed. Linearizability rejects
that order; sequential consistency can explain it by placing the independent
client's read before the write. Both models preserve each client's operation
order. Linearizability additionally preserves the order of non-overlapping calls,
as described by [Herlihy and Wing](https://www.cs.cmu.edu/~wing/publications/HerlihyWing90.pdf).

The checker handles pending operations by optionally including them with inferred
responses, or omitting them. An included pending call cannot precede a completed
call that ended before it began in linearizability mode. This follows the pending
operation correction discussed by
[Sela, Herlihy and Petrank](https://arxiv.org/html/2105.06737v2).

## Define object behavior

Each named object uses one of three built-in specifications:

| Model            | Operation input                     | Required response                                                        | Effect                                  |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| Register `read`  | `null`                              | Current JSON value                                                       | None                                    |
| Register `write` | New JSON value                      | `null` acknowledgement                                                   | Replace value                           |
| Register `cas`   | `{ "expected": ..., "value": ... }` | Boolean                                                                  | Replace only on canonical JSON equality |
| Counter `read`   | `null`                              | Current safe integer                                                     | None                                    |
| Counter `add`    | Safe integer delta                  | **New** safe integer total                                               | Atomic addition                         |
| Queue `enqueue`  | JSON item                           | `null` acknowledgement                                                   | Append item                             |
| Queue `dequeue`  | `null`                              | `{ "found": true, "value": ... }` or `{ "found": false, "value": null }` | Remove first item, if present           |
| Queue `peek`     | `null`                              | Same shape as dequeue                                                    | None                                    |

Counter overflow lies outside the bounded counter specification and is an illegal
transition. The counter is not a floating-point or arbitrary-precision model.
Queue `found` distinguishes an actual null item from an empty queue. Register and
CAS equality preserves JSON types and ignores object property ordering.

Add models with the form or edit the complete object specification JSON to rename,
change or remove them. References are validated before any edit is applied.
No JavaScript expressions or custom executable specifications are accepted.

## Record operations

A history contains at most 24 operations:

```json
{
  "id": "write-1",
  "client": "client-a",
  "objectId": "value",
  "method": "write",
  "start": 0,
  "end": 10,
  "input": 1,
  "output": null
}
```

Times are nonnegative integer ticks on **one shared scale**, up to `1000000000000`.
A completed response must occur after invocation. A response at the same tick as
another invocation precedes it. Arbitrary time units are fine when applied
consistently; independent machine clocks require alignment before import.

A client is a sequential stream. Overlapping calls on the same client ID, or
another call after a pending invocation on that client, are rejected. Give
concurrent calls distinct client IDs. Client order applies across all objects,
including under sequential consistency; the checker searches globally rather
than independently accepting each object.

Pending calls have `end: null` and `output: null`. Their input remains known.
The checker may infer their response and state effect when needed to explain
completed operations. Empty histories and histories containing only pending
invocations are compatible with an empty witness.

Use the operation form to append calls, or select a call below the timeline to
edit its complete JSON or delete it. Histories can be cloned and edited separately.
Project/history JSON exposes names, expected verdicts and advanced edits.

## Inspect results

- **Compatible**: a legal witness ordering exists for this supplied history/model.
- **Violation**: the search exhaustively rejected every permitted ordering.
- **Inconclusive**: a state, transition-work or memory limit prevented a conclusion.

Compatibility of a finite observation does not establish correctness of every
execution. Missing operations, incorrect mappings or clock assumptions can change
the answer. An inconclusive search is never presented as a violation.

The timeline shows invocation/response intervals; amber dashed intervals are
pending. Select an operation for original input/output JSON. Witness playback
shows inferred pending responses and each affected reference object's state.
The precedence list explains required client and real-time ordering. The deepest
sampled dead end shows one failed branch and expected outputs; it is not a unique
root-cause explanation or a standalone proof. A violation verdict comes from
exhaustive bounded search, not from that sampled branch alone.

Search uses memoized backtracking over placed operations and reference states.
It tries calls in deterministic invocation-time/ID order and yields periodically
for cancellation. Source input is cloned before asynchronous work; cancelled or
late file reads never publish partial analysis. Edits clear previous results and
retain five undo/redo entries. Apply or discard the project draft before actions.

## Find a failing prefix

After a violation, select **Find earliest failing prefix**. It scans observed
response cutoffs in increasing order, retaining **every** call invoked before the
cutoff. Calls still in flight become pending, with unknown output. The original
initial state is retained. It does not manufacture a smaller example by silently
deleting writes that could explain later reads.

If a prefix search is inconclusive, it stops without claiming an earliest failure.
Otherwise the first invalid prefix can be saved as a separate regression history.
The original history remains intact. This is earliest among the recorded response
cutoffs, not a minimum-cardinality operation subset. Equal response times form one
cutoff. Both modes scan explicitly; no monotonicity assumption is used for the
weaker model. The entire prefix search shares a 250,000-attempt budget.

## Import capture data

Paste a JSON array or NDJSON operation records and replace or append to the
selected history. Invalid imports are atomic. Files are read into the text draft
and applied explicitly. Imports and projects are limited to 2 MiB.

HAR import uses explicit mappings, for example:

```json
[
  {
    "method": "PUT",
    "path": "/value",
    "objectId": "value",
    "operation": "write",
    "input": { "kind": "body", "pointer": "/value" },
    "output": { "kind": "literal", "value": null }
  },
  {
    "method": "GET",
    "path": "/value",
    "objectId": "value",
    "operation": "read",
    "input": { "kind": "literal", "value": null },
    "output": { "kind": "body", "pointer": "/value" }
  }
]
```

HTTP method/path matching is exact; query strings do not affect path matching.
Input `body` pointers address request `postData` JSON; output pointers address
response `content` JSON. Empty selects the root. RFC 6901 escapes and base64 UTF-8
response bodies are supported. Literal mappings translate acknowledgements or
ignored protocol envelopes; map actual domain semantics deliberately.

Only 2xx responses with valid timestamps and positive recorded durations are
accepted. Times become relative microsecond ticks from the earliest mapped call;
sub-microsecond durations that round to zero are rejected. More than 24 mapped
calls is an error, not a silent truncation. Captures may contain up to 1,000 entries.

By default each request gets its own client. Optionally identify an explicitly
sequential client using exactly one named request header. Missing, duplicate or
invalid client-header values are diagnosed. Overlapping calls assigned to one
client are rejected. Requests, credentials and response bodies are never fetched.

Inspect the preview and its per-entry skipped reasons. Applying a partial capture
requires an explicit checkbox. Omitted calls, unrelated traffic, timestamp
precision and capture completeness affect how to interpret the result. The
project retains extracted domain values and client IDs, not URLs or raw headers.

## Regression and portable exports

Record a completed compatible/violation verdict as an expectation, then run all
histories. Expected violations can pass, allowing known-bad examples to verify
the checker. Unchecked histories remain unchecked, and inconclusive analyses
cannot be recorded as passing expectations. Per-history modes and budgets are
preserved. A suite does not modify source histories or the interactive analysis.

Projects, witness views and the Node runner contain private values. Analysis
reports omit operation inputs, observed/inferred outputs, client names, initial
and reference states, and rejected expected values. They retain object-free
operation IDs, history IDs, verdicts, counters and precedence constraints; IDs
themselves are not redacted. Timeline SVG exports retain operation/client labels.

The standalone SDK contains the validator, checker, suite runner and prefix
search, without fixtures, dependencies, network or browser storage:

```js
import {
  analyzeConsistency,
  runConsistencySuite,
} from "./consistency-checker.mjs";

const result = await analyzeConsistency(project, "history-1", {
  cancelled: () => controller.signal.aborted,
  progress: ({ states, attempts }) => console.log(states, attempts),
});
const regressions = await runConsistencySuite(project);
```

`mode` can override a single analysis; `maxAttempts` can reduce its transition
budget. A cancellation rejects with code `cancelled`; a bounded search returns an
inconclusive result. The studio compares both modes without changing source.

The private Node runner executes with:

```sh
node consistency-tests.mjs > consistency-report.json
```

It exits zero only for a nonempty suite where every history has a matching
compatible/violation expectation. Mismatches, unchecked histories, inconclusive
results and empty suites exit nonzero. Reports exclude operation/state values.

## Development bounds

There are at most 8 objects, 16 histories and 24 operations per history. Queue
initial states contain at most 16 items. JSON values are limited to 2 KiB, depth
12 and 512 nodes. Histories allow 1–50,000 expanded search states, with a default
of 20,000. Each analysis allows at most 250,000 candidate transitions, 16 MiB of
estimated memo-key memory and 64 KiB of reference state on transitions. These
bounds intentionally limit exponential searches; they do not certify larger logs.

The SDK runtime is generated from the model/engine TypeScript during development:

```sh
node scripts/build-consistency-toolkit.mjs
node scripts/build-consistency-toolkit.mjs --check
```

Regenerate after editing or formatting those sources. Export tests load native
ES modules, run actual Node child processes and verify generated-source freshness.
