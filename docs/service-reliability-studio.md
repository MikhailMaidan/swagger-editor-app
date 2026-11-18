# Service reliability and failure-analysis studio

Open **Service reliability and failure-analysis studio** in the workspace testing
tools to model the availability of an API's dependencies. The studio works
independently of the OpenAPI editor, including invalid documents. It sends no
requests, executes no user scripts and writes no project data to browser storage.
Export a project to retain it beyond the current tab.

## Try the example

Load the reliability architecture demo and **Analyze all availability scenarios**.
The graph has two zones, application/database redundancy, shared identity and
gateway dependencies, a checkout provider, and a separate two-of-three replica
quorum. There are 12 basic events, so all 4,096 states are enumerated.

Zone events are shared by application and database branches. The analysis counts
each shared event once, preserving the dependence between those branches rather
than pretending their gate outputs are independent. Compare the baseline, one-zone
outage, regional outage, identity outage and ideal-component what-if scenarios.

Select an output to see its availability, total unavailability, expected downtime
equivalent, event sensitivity and ranked minimal cut sets. Click a cut set to show
that failure combination on the graph. **Find minimal repairs for graph outage**
then lists inclusion-minimal sets of currently failed events to restore; apply a
set to the graph without changing the model probabilities.

## Modeling assumptions

Each `event` is a basic independent Bernoulli event whose `probability` is the
probability of being healthy. All probabilities concern the same authored modeling
context; they are not inferred from observations. Basic events are independent.

Represent a shared failure domain as one event reused through multiple gates. For
example, both a database and application can require the same `zone-a` event. Do
not invent independent copies of a common event merely to draw another branch.
Arbitrary statistical dependence between distinct basic events is not supported.

Gates are monotone and form an acyclic graph:

| Kind       | Healthy when                                       |
| ---------- | -------------------------------------------------- |
| `all`      | Every referenced input is healthy                  |
| `any`      | At least one referenced input is healthy           |
| `at-least` | At least `threshold` referenced inputs are healthy |

Gate inputs must have distinct IDs. They may share upstream events, which the
state enumeration handles. There are no negated events, propagation delays,
retry schedules, failover latencies or repair-duration distributions in this model.
Those require different assumptions and are not inferred by the studio.

An event definition:

```json
{ "id": "zone-a", "name": "Zone A", "kind": "event", "probability": 0.99 }
```

A gate definition:

```json
{
  "id": "database-quorum",
  "name": "Database quorum",
  "kind": "at-least",
  "inputs": ["replica-a", "replica-b", "replica-c"],
  "threshold": 2
}
```

## Availability and numerical behavior

For every event-state mask, the engine evaluates the dependency graph and weights
the result by the product of the corresponding independent basic-event
probabilities. Enumeration is exhaustive within the model bounds; it is not Monte
Carlo sampling. Probabilities are JavaScript floating-point numbers, not arbitrary
precision decimals, and compensated accumulation reduces summation error.

Available and unavailable probability are accumulated separately. Tiny unavailable
probabilities can therefore remain visible even when displayed uptime rounds to
100%. A 100% availability target is tested against zero unavailability, so a tiny
nonzero failure probability still misses that target.

The downtime equivalent is `unavailability × windowHours × 3600`. It is an expected
total-time equivalent for the authored window, not a prediction of incident count,
arrival times, recovery times or the duration of any one outage. Results describe
the model and should not be presented as measured production reliability.

## Minimal cuts and event importance

A minimal cut set is an inclusion-minimal set of failed basic events that makes
an output fail with every other event healthy. It is not necessarily the smallest
set by cardinality. The engine computes every minimal set and an exact count;
the UI shows up to 128 ranked by their joint failure probability.

Cut-set joint probabilities can overlap and **must not be added**. Total output
unavailability is independently computed from disjoint full states. Structural
cut sets remain listed even when an event currently has probability 1 and the
set's current joint probability is zero.

For each basic event, importance shows output availability with that event forced
healthy and with it forced failed. The difference is the modeled sensitivity. The
ideal-component gain is `(1 - current event probability) × sensitivity`. Each gain
changes only one event; gains cannot be added across components. These values are
model comparisons, not cost, implementation or procurement recommendations.
An asterisk marks events with scenario probability overrides.

## Manual outages and probability scenarios

The graph's checkboxes are a separate structural snapshot. They allow an event to
be set healthy/failed even if its authored probability is 0 or 1. This separation
supports counterfactual inspection without silently changing probability analysis.
Selecting a node works with mouse, Enter or Space, and a native select offers the
same inspection. The inspector explains the required and actual healthy inputs.

Scenario overrides explicitly replace basic-event probabilities:

```json
{
  "id": "zone-outage",
  "name": "Zone A unavailable",
  "overrides": { "zone-a": 0 },
  "expected": null
}
```

Unspecified events retain model probabilities. **Show scenario's certain failures
in graph** sets all effective probability-0 events failed in the manual snapshot;
other snapshot events become healthy. **Save graph outage as probability scenario**
creates a new scenario forcing its failed events to probability 0, leaving all
other event probabilities at their model defaults.

Repair sets are inclusion-minimal subsets of the current failed events whose
restoration makes the selected output healthy. They are ranked by size, with up
to 128 shown and the exact total retained. Restoring a set changes only graph
checkboxes. It does not change the model or real systems. Already-healthy outputs
return no required repairs.

## Authoring, outputs and regressions

Use the node builder for new events/gates and the selected-node JSON editor for
existing definitions. New gates reference existing nodes; source editing can
restructure the full graph. Removal rejects nodes still used by a dependency,
output or scenario override. Cycles, duplicate inputs and dangling references are
rejected atomically.

Add up to four analyzed outputs from selected graph nodes. Each has a minimum
availability target and optional operation label. Adding an output clears recorded
scenario expectations so all outputs can be recorded together. Removing one
retains expectations for the remaining outputs. OpenAPI catalog access copies
only a chosen operation label; dependencies and probabilities are authored
explicitly and the editor remains unchanged.

Run scenarios, then record selected/all reliability expectations. Recording stores
unavailable-probability ranges for every output, with tolerance relative to the
computed probability (`1e-8`, capped at an absolute `1e-10`). A zero probability
records an exact zero range. Run again to check for model behavior changes.

These expectations are separate from output availability targets. A deliberately
modeled outage can correctly match its recorded expectation while missing its
availability target. The CI runner checks recorded model expectations; inspect
`meetsTarget` through the SDK/report if your own release policy also gates targets.

Use **Reliability project source (JSON)** to edit full models, scenario expectation
ranges and IDs. Applying invalid source retains the committed model/results.
Pending source edits block execution, imports and exports until applied or
discarded. Ten model edits can be undone/redone. Merely switching outage checkboxes
does not invalidate probability results because it does not change probabilities.

## Exports and standalone use

- Project JSON contains architecture, probabilities, output labels, scenarios and
  expectations. Restore it and rerun; imported computed analysis is not trusted.
- Report JSON contains baseline/scenario metrics, conditional importance, cut
  counts, displayed cut sets and expectation outcomes.
- Architecture SVG captures the current graph snapshot with portable colors/text.
- The SDK and CI runner bundle the same source engine used in the application,
  with no external runtime dependencies, network calls or dynamic code evaluation.

For the SDK:

```js
import {
  definition,
  analyzeArchitecture,
  evaluateRLProject,
  findRLRepairs,
} from "./rsswag-reliability-toolkit.mjs";

const analysis = await analyzeArchitecture(definition);
const snapshot = evaluateRLProject(definition, ["zone-a"]);
const repairs = await findRLRepairs(definition, "service", ["zone-a", "auth"]);
```

For Node.js 20 or newer:

```sh
node rsswag-reliability-tests.mjs
node rsswag-reliability-tests.mjs updated-project.json
```

Exit `0` means every scenario's recorded expectations matched; `1` means changed
model behavior; `2` means malformed input, a limit/runtime error, or missing
recorded expectations. All exports contain authored architecture information.

After changing engine dependencies, regenerate the checked-in runtime:

```sh
node scripts/build-reliability-runtime.mjs
node scripts/build-reliability-runtime.mjs --check
```

## Limits and cancellation

The studio allows 40 nodes, 16 independent basic events, 16 inputs per gate,
4 outputs, 8 scenarios, dependency depth 20 and 512 KiB project files. Up to
65,536 states are evaluated. Cut/repair list truncation never truncates probability
enumeration or total set counts. There is no silent event or scenario sampling.

Work yields cooperatively and can be cancelled. Cancellation or hard-limit errors
retain previous completed results rather than publishing partial availability.
Cancelling an asynchronous file restore prevents its later completion from
replacing the current project. Failed downloads retain all work for retry.
