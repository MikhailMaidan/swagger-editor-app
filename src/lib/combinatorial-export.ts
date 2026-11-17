import {
  CTError,
  CT_LIMITS,
  normalizeCTRows,
  type CTCondition,
  type CTProject,
  type CTRow,
} from "./combinatorial-model";
import { getByteSize } from "./text-encoding";
import type { CTSpace } from "./combinatorial-engine";

export function ctCaseValues(project: CTProject, row: CTRow) {
  const values: [string, unknown][] = [],
    omitted: string[] = [];
  for (const variable of project.variables) {
    const choice = variable.choices.find(
      (c) => c.id === row.choices[variable.id],
    )!;
    if (choice.kind === "omit") omitted.push(variable.id);
    else values.push([variable.id, choice.value]);
  }
  return { id: row.id, values: Object.fromEntries(values), omitted };
}
export function exportCTSuite(project: CTProject, input: CTRow[]) {
  const rows = normalizeCTRows(input, project.variables);
  const content = JSON.stringify(
    {
      version: 1,
      kind: "rsswag-combinatorial-suite",
      variables: project.variables,
      rows,
    },
    null,
    2,
  );
  if (getByteSize(content) > CT_LIMITS.bytes) throw new CTError("limit");
  return content;
}
export function exportCTNdjson(project: CTProject, input: CTRow[]) {
  return (
    normalizeCTRows(input, project.variables)
      .map((row) => JSON.stringify(ctCaseValues(project, row)))
      .join("\n") + (input.length ? "\n" : "")
  );
}
export function exportCTCsv(project: CTProject, input: CTRow[]) {
  // Only validated identifiers and booleans enter this assignment interchange.
  // Prefixing variable headers avoids collisions with case_id/pinned columns.
  const rows = normalizeCTRows(input, project.variables);
  return (
    [
      ["case_id", "pinned", ...project.variables.map((v) => `choice:${v.id}`)],
      ...rows.map((row) => [
        row.id,
        String(row.pinned),
        ...project.variables.map((v) => row.choices[v.id]),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\r\n") + "\r\n"
  );
}
export type CTManifest = {
  variables: { id: string; choices: string[] }[];
  constraints: { id: string; condition: CTCondition }[];
  tuples: { id: string; terms: { variable: string; choice: string }[] }[];
  feasibleRows: number;
};
export function ctManifest(space: CTSpace): CTManifest {
  return {
    variables: space.project.variables.map((v) => ({
      id: v.id,
      choices: v.choices.map((c) => c.id),
    })),
    constraints: space.project.constraints.map((c) => ({
      id: c.id,
      condition: c.condition,
    })),
    tuples: space.tuples
      .filter((t) => t.feasible)
      .map(({ id, terms }) => ({ id, terms })),
    feasibleRows: space.candidates.length,
  };
}

// Deliberately self-contained: this exact function is also the dependency-free
// exported CI verifier. Its manifest contains choice IDs, never input values.
export function verifyCTPortable(manifest: CTManifest, input: unknown) {
  if (!Array.isArray(input) || input.length > 256)
    throw new Error("Invalid suite: expected at most 256 rows.");
  function record(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }
  function evaluate(
    condition: CTCondition,
    choices: Record<string, unknown>,
  ): boolean {
    if (condition.op === "is")
      return choices[condition.variable] === condition.choice;
    if (condition.op === "not") return !evaluate(condition.arg, choices);
    if (condition.op === "implies")
      return (
        !evaluate(condition.if, choices) || evaluate(condition.then, choices)
      );
    return condition.op === "all"
      ? condition.args.every((arg) => evaluate(arg, choices))
      : condition.args.some((arg) => evaluate(arg, choices));
  }
  const covered = new Set<string>(),
    seen = new Map<string, string>(),
    ids = new Set<string>();
  const rows = input.map((raw, index) => {
    const row = record(raw) ? raw : {},
      choices = record(row.choices) ? row.choices : {};
    const id = typeof row.id === "string" ? row.id : `invalid-${index + 1}`;
    const malformed =
      typeof row.id !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(id) ||
      ids.has(id) ||
      typeof row.name !== "string" ||
      !row.name.trim() ||
      row.name.length > 160 ||
      typeof row.pinned !== "boolean" ||
      Object.keys(choices).length !== manifest.variables.length ||
      manifest.variables.some(
        (v) =>
          !Object.hasOwn(choices, v.id) ||
          typeof choices[v.id] !== "string" ||
          !v.choices.includes(choices[v.id] as string),
      );
    ids.add(id);
    const failedConstraints = malformed
      ? []
      : manifest.constraints
          .filter((c) => !evaluate(c.condition, choices))
          .map((c) => c.id);
    const valid = !malformed && failedConstraints.length === 0;
    const key = JSON.stringify(manifest.variables.map((v) => choices[v.id]));
    const duplicateOf = seen.get(key) ?? null;
    seen.set(key, seen.get(key) ?? id);
    if (valid)
      for (const tuple of manifest.tuples)
        if (tuple.terms.every((term) => choices[term.variable] === term.choice))
          covered.add(tuple.id);
    return { id, valid, malformed, failedConstraints, duplicateOf };
  });
  const missing = manifest.tuples
    .filter((t) => !covered.has(t.id))
    .map((t) => t.id);
  return {
    complete:
      manifest.feasibleRows > 0 &&
      missing.length === 0 &&
      rows.every((r) => r.valid),
    feasibleRows: manifest.feasibleRows,
    feasibleTuples: manifest.tuples.length,
    covered: covered.size,
    missing,
    invalidRows: rows.filter((r) => !r.valid).length,
    rows,
  };
}
export function generateCTVerifier(space: CTSpace, input: CTRow[]) {
  const rows = normalizeCTRows(input, space.project.variables);
  return `// RSSwag finite-domain coverage verifier. Node.js 20+, no dependencies.\n// node coverage.mjs [suite.json]; exit 0 = full feasible interaction coverage.\n// Regenerate this file after changing the model or constraints.\nimport { readFileSync, statSync } from "node:fs";\nconst manifest = ${JSON.stringify(ctManifest(space))};\nconst embeddedRows = ${JSON.stringify(rows)};\nconst verify = ${verifyCTPortable.toString()};\ntry {\n  let rows = embeddedRows;\n  if (process.argv[2]) {\n    if (statSync(process.argv[2]).size > 524288) throw new Error("Suite exceeds 512 KiB.");\n    const source = readFileSync(process.argv[2], "utf8");\n    if (Buffer.byteLength(source, "utf8") > 524288) throw new Error("Suite exceeds 512 KiB.");\n    const parsed = JSON.parse(source.replace(/^\\uFEFF/, ""));\n    rows = Array.isArray(parsed) ? parsed : parsed.rows;\n  }\n  const report = verify(manifest, rows);\n  process.stdout.write(JSON.stringify(report, null, 2) + "\\n");\n  process.exitCode = report.complete ? 0 : 1;\n} catch (error) {\n  process.stderr.write(String(error.message ?? error) + "\\n");\n  process.exitCode = 2;\n}\n`;
}
