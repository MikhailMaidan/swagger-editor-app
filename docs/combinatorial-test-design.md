# Combinatorial test-design studio

Open **Combinatorial test-design studio** in the workspace testing tools to
design a compact set of input combinations. It works independently of the
OpenAPI editor, including while the editor document is invalid. The studio
does not send HTTP requests, run user code, or write browser storage. Export
the project to retain work beyond the current tab.

## Try the example

Load the combinatorial demo, then **Generate compact suite**. The model combines
regions, subscription plans, authentication, formats, compression, and an optional
trace header. Three constraints exclude anonymous paid plans, free CSV exports,
and uncompressed European enterprise requests. The existing smoke test is pinned.

The generator retains that test and covers every feasible pair of choices.
Uncheck an unpinned case to see missing interactions; **Cover missing
interactions** keeps the selected cases and adds enough cases to cover the gaps.
**Save selected suite in project** explicitly saves the working rows. Generation
and selection alone do not replace the saved rows.

Expand the coverage map to inspect a variable group. Filter interactions by
missing, covered, or excluded, and select a covering case to inspect its typed
values and omitted fields. Large interaction lists have 30-row pages.

## What coverage means

For strength `t`, every `t`-variable group contributes its Cartesian product of
choices. An interaction is feasible only when at least one **complete** assignment
satisfies every constraint. The engine enumerates complete assignments with
three-valued partial-condition pruning; an unresolved condition is not treated
as false. Constraints involving other variables can therefore exclude a pair.

The denominator contains only feasible interactions. Excluded interactions are
listed separately. Invalid rows cover nothing, and duplicate assignments do not
increase coverage. A model with no feasible assignment is unsatisfiable; it is
never reported as complete or 100% covered.

Pairwise coverage does not imply three-way coverage. Neither implies full
Cartesian coverage or API correctness. These checks concern the finite domains
you author. The studio does not execute the tests or validate their HTTP results.

The deterministic greedy generator prioritizes the largest number of uncovered
interactions, using the seed to break ties, and removes redundant newly generated
rows. The final size is not guaranteed to be mathematically minimal. Pinned rows
are never removed. Repair preserves every selected row, including unpinned ones.
An invalid retained row must be corrected before generation or repair can proceed.

## Authoring

Add input variables with the form. Values are JSON scalars: strings, finite
numbers, booleans, or null. An omitted choice is separate from `null`, `false`,
zero, and the empty string. Variable and choice IDs are stable interchange keys;
labels are for display. Path variables cannot have an omitted choice.

Use **Combinatorial project source (JSON)** for full editing of existing names,
locations, choices, saved rows and nested constraints. Apply is atomic: errors
leave the committed model and previous results intact. Pending source edits block
execution, imports, exports and other model edits until applied or discarded.
Ten model edits can be undone/redone. Removing a referenced variable is rejected;
edit its constraints first. Adding a variable assigns its first choice to each
saved row; review those rows before relying on them.

A variable definition looks like this:

```json
{
  "id": "format",
  "name": "Response format",
  "location": "query",
  "choices": [
    { "id": "json", "label": "JSON", "kind": "value", "value": "json" },
    { "id": "absent", "label": "Omitted", "kind": "omit" }
  ]
}
```

Each constraint has an `id`, a `name`, and a Boolean `condition` that must hold.
The form creates forbidden pairs and implications. Full source supports:

| Operator  | Fields               | Meaning                                    |
| --------- | -------------------- | ------------------------------------------ |
| `is`      | `variable`, `choice` | This choice is selected                    |
| `not`     | `arg`                | Negate a condition                         |
| `all`     | `args`               | All conditions hold                        |
| `any`     | `args`               | At least one condition holds               |
| `implies` | `if`, `then`         | When the first holds, the second must hold |

Saved rows use complete assignments, for example:

```json
{
  "id": "smoke",
  "name": "Existing smoke test",
  "pinned": true,
  "choices": { "format": "json" }
}
```

Rows with unknown or missing choices are rejected. Rows that violate current
constraints can be imported and audited, so their failed constraint IDs remain
visible. They cannot be retained in a generated valid suite.

## OpenAPI imports

Read the editor operation catalog and explicitly choose an operation to create a
new model. This snapshots documented parameter enums, booleans, examples and
numeric/string boundaries. Optional non-path parameters get an omitted choice.
The editor and its requests, credentials, presets and history remain unchanged.

Review the inferred domains: pattern constraints, full schema validation, request
bodies and business dependencies are not inferred. Large parameter catalogs or
enums are rejected rather than silently truncated. Operation import replaces the
studio model and participates in undo. Reading the catalog alone does not change it.

## Interchange and CI

- **Project JSON** contains the complete model and saved rows, with no trusted
  computed results. Restore it, then rebuild coverage.
- **Assignment suite JSON** includes the variable catalog and selected rows.
  Import its rows into the same model; imports do not replace model definitions.
- **Assignment CSV** has `case_id,pinned,choice:<variable-id>` columns containing
  choice IDs. It preserves omission, has no value/formula cells, and can be
  reimported. CSV does not carry display names; restored names use case IDs.
- **Case NDJSON** contains `{id, values, omitted}` per selected test. `values`
  uses variable IDs and actual typed scalar values; omitted variables are absent
  from `values` and listed in `omitted`. Use the project/catalog to map IDs to
  parameter names and locations.
- **Coverage JSON** contains counts, IDs, missing interactions and row diagnostics
  without scalar input values or choice labels.
- **CI coverage verifier** contains the fixed feasibility manifest and selected
  assignments, without domain values. Run it with Node.js 20 or newer:

  ```sh
  node rsswag-combinatorial-coverage.mjs
  node rsswag-combinatorial-coverage.mjs rsswag-combinatorial-suite.json
  ```

The verifier accepts an assignment suite or a row array. Exit `0` means every
feasible interaction is covered and all rows are valid; `1` means missing
coverage, invalid rows, or an unsatisfiable model; `2` means an unreadable or
malformed input. Regenerate the verifier after changing variables, choices,
strength or constraints. It verifies assignments, not API behavior.

Project/suite JSON and case NDJSON contain authored input values. IDs, row names
and constraints can also contain identifying information. Choose what to share.
Assignment imports append rows atomically; duplicate IDs are rejected.

## Bounds and cancellation

The studio allows 12 variables, 8 choices per variable, 32 constraints, 256 rows,
512 KiB project/assignment inputs, 200,000 search states, 20,000 feasible complete
assignments, 20,000 total interactions and 1,000,000 assignment-to-interaction
links. Conditions allow depth 12 and 256 nodes per constraint. Individual scalar
strings allow 2,048 characters; IDs use ASCII letters, digits, underscores and
hyphens and start with a letter.

Enumeration and greedy generation yield cooperatively and can be cancelled.
Cancellation and limit failures retain previous completed results and publish
no partial feasibility claims. Cancelling an asynchronous file restore also
prevents its later completion from replacing the project. Reduce domains or
interaction strength when a search exceeds the limits.
