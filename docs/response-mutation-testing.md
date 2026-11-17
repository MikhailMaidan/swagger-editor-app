# API response mutation-testing studio

Open **API response mutation-testing studio** in the workspace testing tools to
find response changes that your assertion set does not detect. It works even when
the main OpenAPI document is invalid. It runs entirely on local response fixtures:
no API calls, user-supplied scripts, credentials handoffs or storage writes occur.
Export a project to retain the work beyond the current tab.

## Try the example

Load the mutation-testing demo and **Test all response assertions**. Two fixtures
have the same JSON response. The weak fixture checks only status and two headers;
the strict fixture also checks exact JSON and both timing bounds. Select a fixture
or its score card to compare results. The strict fixture detects all default demo
mutations; the weak fixture leaves body/timing changes undetected.

The strict checks are illustrative, not universal recommendations: real APIs often
allow additional fields, changing values and a range of durations. Mutation scores
describe the chosen examples, operators and checks, not overall API correctness.

In the weak fixture, select a survivor to inspect the original and mutated response
side by side. **Preview detecting assertion** proposes a rule only if the existing
assertion evaluator confirms that it passes the unchanged baseline and fails the
selected mutant. Review it, then explicitly add it. Run again to see which faults
the new rule detects.

## Fixtures and checks

A fixture contains an HTTP status, headers, body, nonnegative duration, optional
JSON Pointer scope, checks and an optional regression budget. Apply fixture edits
explicitly. Add or duplicate fixtures to compare different payloads or check sets.
Fixture import and editing do not change the main editor, request presets,
authentication or history.

Checks use the same operators, JSON Pointer semantics, Unicode string lengths and
numeric safety rules as the existing Try It Out response assertion workbench.
Import its exported assertion JSON, add checks with the form, or export the enabled
checks back to that workbench. The studio does not alter that evaluator.

Use **Mutation project source (JSON)** to edit existing rule definitions, fixture
IDs, nested payloads, budgets and saved waivers. Applying source is atomic. Invalid
edits retain the committed project and previous results. Pending source edits block
execution, imports, exports and other model edits until applied or discarded. Ten
project edits support undo/redo. Imported computed results are discarded.

## Mutation operators

| Group    | Changes                                                                      |
| -------- | ---------------------------------------------------------------------------- |
| Protocol | Change HTTP status or timing; remove or change a header                      |
| Object   | Remove a property; add an unexpected property                                |
| Value    | Replace with null; change type; replace numbers with 0/1/-1; invert booleans |
| String   | Empty a string; replace its value                                            |
| Array    | Empty it; drop an item; duplicate the first item                             |
| Syntax   | Append invalid JSON, when explicitly enabled                                 |

JSON changes splice ranges in the original response text. Untouched number
literals, string escapes, formatting, property order and a leading BOM survive.
Numeric 0/1/-1 no-ops are recognized without first rounding the original token.
Raw duplicate mutation plans are skipped; general semantic equivalence is not
proved. Different operators can represent similar observable faults.

Scope limits JSON mutations to the selected subtree, including its removal. Empty
scope means the whole body. Status, header and timing mutations remain independent
of body scope. An unknown scope, non-JSON body, duplicate JSON object keys, or an
excessively deep/large structure produces a visible diagnostic. JSON mutation
planning discards the entire ambiguous/limited tree rather than using a partial
one; protocol mutations can still run.

The per-fixture mutant cap selects a deterministic prefix. A visible truncation
warning means the score does not include every possible plan. Increase the cap,
choose fewer operators or narrow the body scope to investigate other changes.

## Scoring and the baseline gate

Every tested fixture needs an enabled check, and every enabled check must pass the
unchanged response before its mutants run. A failed or unreadable baseline blocks
that fixture and has no score.

| Outcome      | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| Killed       | At least one assertion returns `fail`                             |
| Survived     | Every enabled assertion returns `pass`                            |
| Inconclusive | No assertion fails, but at least one returns `error`              |
| Waived       | An explicit reason excludes this mutation from evaluation/scoring |

The score is `killed / (killed + survived + inconclusive)`, rounded to two decimal
places. Errors alone do not count as successful detection. For example, malformed
JSON makes body assertions return `unreadable-body`; it remains inconclusive unless
another assertion actually fails. An empty denominator has no score, never 100%.

The matrix shows each check's failures, evaluation errors and mutations detected
by that check alone. Click a check to filter its failures/errors. Mutant lists also
have outcome filters, multiword path/operator search, Escape to clear search and
30-row pagination.

## Reviewing waivers and smaller check sets

Some changes are intentional API behavior. A waiver requires a reason and uses
the fixture ID plus a stable operator/path/variant key. It does not depend on a
temporary mutant row number. Waived cases are excluded from the denominator.
After changing a fixture or operator scope, review waivers; unmatched entries are
reported as stale and retained in project source until explicitly removed.

**Preview smaller check subset** uses a deterministic greedy cover of the currently
detected mutants. It retains enabled pinned checks and proposes enough other checks
to preserve those observed detections. Applying the proposal disables other rules;
it does not delete them. This does not prove those rules redundant for other inputs
or production behavior. Review the proposal before applying it.

## Regression budgets

Run the fixtures, then record a selected budget or all current budgets. Recording
requires a passing baseline and at least one scored mutant. It saves:

- the current score as `minScore`;
- the current survivor/inconclusive counts as ceilings;
- permission for truncation only if the recorded run was truncated.

Run again to compare against the saved budgets. A blocked baseline, empty score,
lower score, excessive counts, or newly unapproved truncation fails the budget.
Edit thresholds explicitly in project source when the desired acceptance policy
differs from the recorded values.

## OpenAPI imports

Read the editor's operation catalog, choose a response variant, and explicitly add
its fixture. The studio snapshots its documented example or existing generated
mock response, along with status/media-type/body-shape/required-field starter checks.
It does not call the endpoint. Review generated values and advisory starter checks;
they are not a full JSON Schema contract validator.

The fixture imports independently of existing response assertion sets, which use
the **Import existing response assertions** action. Import appends checks and
assigns unique IDs; it does not silently drop rules at the 50-check limit.

## Exports and CI

Project JSON contains full fixtures, checks, operators, budgets and waiver reasons.
Restoring it does not trust saved results. The quality report contains result
counts, check/mutant IDs, paths and waiver reasons, with no response bodies, header
values, assertion literals or mutation replacement values. IDs, paths and reasons
can still identify your domain.

The SDK and CI runner contain full fixture and assertion values. Review the content
before sharing. Both bundle the same assertion and mutation engines used by the
application, with no third-party runtime dependencies, HTTP calls or dynamic code
evaluation.

For an offline SDK:

```js
import {
  definition,
  testAssertions,
  mtReport,
} from "./rsswag-mutation-toolkit.mjs";
const runs = await testAssertions(definition);
console.log(mtReport(runs));
```

For Node.js 20 or newer:

```sh
node rsswag-mutation-tests.mjs
node rsswag-mutation-tests.mjs updated-project.json
```

The runner uses the embedded project or a supplied project file and emits the same
quality report as the app. Exit `0` means every recorded fixture budget matched;
`1` means a regression; `2` means invalid input, a limit/runtime error, or a fixture
without a recorded budget. Record all budgets and rerun before adopting it in CI.

The checked-in runtime bundle is generated from shared source. After changing its
engine dependencies, regenerate and verify it:

```sh
node scripts/build-mutation-runtime.mjs
node scripts/build-mutation-runtime.mjs --check
```

## Bounds and cancellation

Limits are 6 fixtures, 50 checks per fixture, 64 KiB baseline bodies, 32 headers,
128 mutants per fixture, 512 mutants per run, 2 MiB project files, and JSON depth
20 / 2,000 nodes. Expansion mutations are bounded to 128 KiB. Statuses must be
100–599, durations finite and between 0–600,000 ms, and headers cannot contain
newlines/NUL or duplicate case-insensitive names. IDs start with an ASCII letter
and contain letters, digits, hyphens or underscores.

Runs yield cooperatively and can be cancelled. Cancellation and hard-limit errors
retain previous completed results and do not publish partial runs. Cancelling a
file restore prevents its later completion from replacing the project. A download
failure retains all work and can be retried.
