"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  CTButton,
  CTField,
  CTSelect,
  CTVariableBuilder,
  CTConstraintBuilder,
} from "./combinatorial-controls";
import { CTCoverage } from "./combinatorial-coverage";
import {
  CTError,
  CT_LIMITS,
  emptyCTProject,
  normalizeCTProject,
  parseCTProject,
  serializeCTProject,
  type CTCondition,
  type CTProject,
  type CTRow,
} from "@/lib/combinatorial-model";
import {
  auditCTRows,
  buildCTSpace,
  ctCoverageReport,
  generateCTSuite,
  type CTSpace,
  type CTProgress,
} from "@/lib/combinatorial-engine";
import { demoCTProject } from "@/lib/combinatorial-demo";
import {
  importCTRows,
  projectFromCTEndpoint,
} from "@/lib/combinatorial-import";
import {
  ctCaseValues,
  exportCTCsv,
  exportCTNdjson,
  exportCTSuite,
  generateCTVerifier,
} from "@/lib/combinatorial-export";
import { downloadTextFile } from "@/lib/schema-download";
import { parseOpenApiSchema, type EndpointSummary } from "@/lib/openapi";

const box =
  "space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4";
const actions = "flex flex-wrap gap-2";
function references(condition: CTCondition, variable: string): boolean {
  if (condition.op === "is") return condition.variable === variable;
  if (condition.op === "not") return references(condition.arg, variable);
  if (condition.op === "implies")
    return (
      references(condition.if, variable) || references(condition.then, variable)
    );
  return condition.args.some((arg) => references(arg, variable));
}
function CTSettings({
  project,
  apply,
}: {
  project: CTProject;
  apply: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState(project.name),
    [seed, setSeed] = useState(String(project.seed)),
    [strength, setStrength] = useState(String(project.strength));
  return (
    <section
      aria-label={t("ct.projectName")}
      className="grid gap-3 sm:grid-cols-3"
    >
      <CTField label={t("ct.projectName")} value={name} onChange={setName} />
      <CTSelect
        label={t("ct.strength")}
        value={strength}
        onChange={setStrength}
      >
        {([1, 2, 3] as const)
          .filter((n) => n <= project.variables.length)
          .map((n) => (
            <option key={n} value={n}>
              {t(
                n === 1 ? "ct.single" : n === 2 ? "ct.pairwise" : "ct.threeWay",
              )}
            </option>
          ))}
      </CTSelect>
      <CTField label={t("ct.seed")} value={seed} onChange={setSeed} />
      <CTButton
        onClick={() =>
          apply(() => {
            if (!/^\d+$/.test(seed)) throw new CTError("project");
            return {
              ...project,
              name,
              strength: Number(strength),
              seed: Number(seed),
            };
          })
        }
      >
        {t("ct.applySettings")}
      </CTButton>
    </section>
  );
}

export const CombinatorialPanel = memo(function CombinatorialPanel({
  getSchemaText,
}: {
  getSchemaText?: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState<CTProject>(emptyCTProject),
    [draft, setDraft] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  const [past, setPast] = useState<CTProject[]>([]),
    [future, setFuture] = useState<CTProject[]>([]);
  const [space, setSpace] = useState<CTSpace | null>(null),
    [working, setWorking] = useState<CTRow[]>([]),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [caseId, setCaseId] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<CTProgress>({
      phase: "enumerate",
      states: 0,
      candidates: 0,
      tuples: 0,
    });
  const [rowsText, setRowsText] = useState(""),
    [rowsFormat, setRowsFormat] = useState("json"),
    [catalog, setCatalog] = useState<EndpointSummary[]>([]),
    [operation, setOperation] = useState("0");
  const mounted = useRef(false),
    generation = useRef(0),
    controller = useRef<AbortController | null>(null),
    inspector = useRef<HTMLElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    const currentController = controller,
      currentGeneration = generation;
    return () => {
      mounted.current = false;
      currentGeneration.current++;
      currentController.current?.abort();
    };
  }, []);
  const source = useMemo(() => serializeCTProject(project), [project]),
    dirty = draft !== null && draft !== source;
  const chosen = useMemo(
    () => working.filter((row) => selected.has(row.id)),
    [working, selected],
  );
  const audit = useMemo(
    () => (space ? auditCTRows(space, chosen) : null),
    [space, chosen],
  );
  const fullAudit = useMemo(
    () => (space ? auditCTRows(space, working) : null),
    [space, working],
  );
  const focused = working.find((row) => row.id === caseId);
  function diagnose(e: unknown) {
    setError(t(`ct.error.${e instanceof CTError ? e.code : "project"}`));
  }
  function safe(action: () => void, allowDraft = false) {
    if (busy) return;
    setError("");
    if (dirty && !allowDraft) {
      setError(t("ct.dirty"));
      return;
    }
    try {
      action();
    } catch (e) {
      diagnose(e);
    }
  }
  function publish(raw: unknown, record = true) {
    const next = normalizeCTProject(raw);
    generation.current++;
    if (record) {
      setPast((old) => [...old, project].slice(-10));
      setFuture([]);
    }
    setProject(next);
    setDraft(null);
    setRevision((v) => v + 1);
    setSpace(null);
    setWorking([]);
    setSelected(new Set());
    setCaseId("");
    setMessage(t("ct.ready"));
  }
  function save(content: string, suffix: string, type: string) {
    setMessage(
      downloadTextFile(content, `rsswag-combinatorial-${suffix}`, type)
        ? t("ct.downloaded")
        : t("ct.downloadFailed"),
    );
  }
  function inspect(id: string) {
    setCaseId(id);
    inspector.current?.focus({ preventScroll: true });
  }
  function cancel() {
    controller.current?.abort();
    generation.current++;
    setBusy(false);
    setMessage(t("ct.cancelled"));
  }
  async function run(mode: "audit" | "generate" | "repair") {
    if (busy) return;
    setError("");
    if (dirty) {
      setError(t("ct.dirty"));
      return;
    }
    const token = ++generation.current,
      abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setMessage("");
    setProgress({ phase: "enumerate", states: 0, candidates: 0, tuples: 0 });
    const active = () => mounted.current && token === generation.current;
    try {
      const options = {
        signal: abort.signal,
        onProgress: (value: CTProgress) => {
          if (active()) setProgress(value);
        },
      };
      const analysis = space ?? (await buildCTSpace(project, options));
      const input =
        mode === "repair"
          ? chosen
          : mode === "generate" && space
            ? working
            : project.rows;
      const rows =
        mode === "audit"
          ? input
          : await generateCTSuite(
              analysis,
              input,
              mode === "repair" ? "extend" : "replace",
              options,
            );
      if (!active()) return;
      setSpace(analysis);
      setWorking(rows);
      setSelected(new Set(rows.map((row) => row.id)));
      setCaseId(rows[0]?.id ?? "");
    } catch (e) {
      if (active()) diagnose(e);
    } finally {
      if (active()) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  async function restore(file: File) {
    if (busy) return;
    setError("");
    if (dirty) {
      setError(t("ct.dirty"));
      return;
    }
    if (file.size > CT_LIMITS.bytes) {
      diagnose(new CTError("limit"));
      return;
    }
    const token = ++generation.current;
    setBusy(true);
    try {
      const text = await file.text();
      if (!mounted.current || token !== generation.current) return;
      publish(parseCTProject(text));
      setBusy(false);
    } catch (e) {
      if (mounted.current && token === generation.current) {
        diagnose(e);
        setBusy(false);
      }
    }
  }
  function exportResult(
    kind: "suite" | "csv" | "ndjson" | "report" | "verifier",
  ) {
    safe(() => {
      if (!space) return;
      if (kind === "suite")
        save(exportCTSuite(project, chosen), "suite.json", "application/json");
      else if (kind === "csv")
        save(
          exportCTCsv(project, chosen),
          "assignments.csv",
          "text/csv;charset=utf-8",
        );
      else if (kind === "ndjson")
        save(
          exportCTNdjson(project, chosen),
          "cases.ndjson",
          "application/x-ndjson",
        );
      else if (kind === "report")
        save(
          JSON.stringify(ctCoverageReport(space, chosen), null, 2),
          "coverage.json",
          "application/json",
        );
      else
        save(
          generateCTVerifier(space, chosen),
          "coverage.mjs",
          "text/javascript",
        );
    });
  }
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-5 shadow-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-base font-bold text-[color:var(--color-ink)]">
        {t("ct.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm">{t("ct.description")}</p>
          <p className="text-xs text-slate-600">{t("ct.help")}</p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-xs">
            {busy
              ? t("ct.busy", {
                  states: String(progress.states),
                  candidates: String(progress.candidates),
                  tuples: String(progress.tuples),
                })
              : message}
          </p>
          {busy && <CTButton onClick={cancel}>{t("ct.cancel")}</CTButton>}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className={actions}>
              <CTButton onClick={() => safe(() => publish(emptyCTProject()))}>
                {t("ct.new")}
              </CTButton>
              <CTButton onClick={() => safe(() => publish(demoCTProject()))}>
                {t("ct.demo")}
              </CTButton>
              <CTButton
                disabled={!past.length}
                onClick={() =>
                  safe(() => {
                    const previous = past.at(-1)!;
                    setPast(past.slice(0, -1));
                    setFuture([...future, project]);
                    publish(previous, false);
                  })
                }
              >
                {t("ct.undo")}
              </CTButton>
              <CTButton
                disabled={!future.length}
                onClick={() =>
                  safe(() => {
                    const next = future.at(-1)!;
                    setFuture(future.slice(0, -1));
                    setPast([...past, project]);
                    publish(next, false);
                  })
                }
              >
                {t("ct.redo")}
              </CTButton>
              <CTButton
                onClick={() =>
                  safe(() => save(source, "project.json", "application/json"))
                }
              >
                {t("ct.exportProject")}
              </CTButton>
              <label className="text-xs font-semibold">
                {t("ct.restore")}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="mt-1 block text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void restore(file);
                  }}
                />
              </label>
            </div>
            <CTSettings
              key={`settings-${revision}`}
              project={project}
              apply={(build) => safe(() => publish(build()))}
            />
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("ct.source")}
              </summary>
              <div className="mt-3 space-y-2">
                <CTField
                  label={t("ct.source")}
                  value={draft ?? source}
                  onChange={setDraft}
                  multiline
                />
                <div className={actions}>
                  <CTButton
                    onClick={() =>
                      safe(() => publish(parseCTProject(draft ?? source)), true)
                    }
                  >
                    {t("ct.apply")}
                  </CTButton>
                  <CTButton onClick={() => safe(() => setDraft(null), true)}>
                    {t("ct.discard")}
                  </CTButton>
                </div>
              </div>
            </details>
            <section aria-label={t("ct.variables")} className={box}>
              <h3 className="text-sm font-bold">{t("ct.variables")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th className="p-2">ID</th>
                      <th className="p-2">{t("ct.variable")}</th>
                      <th className="p-2">{t("ct.location")}</th>
                      <th className="p-2">{t("ct.interaction")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {project.variables.map((variable) => (
                      <tr
                        key={variable.id}
                        className="border-t border-slate-100"
                      >
                        <td className="p-2 font-mono">{variable.id}</td>
                        <td className="p-2">{variable.name}</td>
                        <td className="p-2">
                          {variable.location === "custom"
                            ? t("ct.custom")
                            : variable.location}
                        </td>
                        <td className="p-2">
                          {variable.choices
                            .map(
                              (c) =>
                                `${c.id}: ${c.kind === "omit" ? t("ct.omitted") : JSON.stringify(c.value)}`,
                            )
                            .join(" · ")}
                        </td>
                        <td className="p-2">
                          <CTButton
                            disabled={project.variables.length <= 1}
                            onClick={() =>
                              safe(() => {
                                if (
                                  project.constraints.some((c) =>
                                    references(c.condition, variable.id),
                                  )
                                )
                                  throw new CTError("reference");
                                const variables = project.variables.filter(
                                  (v) => v.id !== variable.id,
                                );
                                publish({
                                  ...project,
                                  variables,
                                  strength: Math.min(
                                    project.strength,
                                    variables.length,
                                  ),
                                  rows: project.rows.map((row) => ({
                                    ...row,
                                    choices: Object.fromEntries(
                                      Object.entries(row.choices).filter(
                                        ([id]) => id !== variable.id,
                                      ),
                                    ),
                                  })),
                                });
                              })
                            }
                          >
                            {t("ct.removeVariable")} {variable.id}
                          </CTButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <CTVariableBuilder
                key={`variables-${revision}`}
                project={project}
                append={(build) =>
                  safe(() => {
                    const variable = build();
                    publish({
                      ...project,
                      variables: [...project.variables, variable],
                      rows: project.rows.map((row) => ({
                        ...row,
                        choices: {
                          ...row.choices,
                          [variable.id]: variable.choices[0]?.id,
                        },
                      })),
                    });
                  })
                }
              />
            </section>
            <section aria-label={t("ct.constraints")} className={box}>
              <h3 className="text-sm font-bold">{t("ct.constraints")}</h3>
              {!project.constraints.length && (
                <p className="text-xs">{t("ct.noConstraints")}</p>
              )}
              {project.constraints.map((constraint) => (
                <div
                  key={constraint.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{constraint.name}</p>
                    <pre className="mt-1 max-w-full overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(constraint.condition)}
                    </pre>
                  </div>
                  <CTButton
                    onClick={() =>
                      safe(() =>
                        publish({
                          ...project,
                          constraints: project.constraints.filter(
                            (c) => c.id !== constraint.id,
                          ),
                        }),
                      )
                    }
                  >
                    {t("ct.removeConstraint", { id: constraint.id })}
                  </CTButton>
                </div>
              ))}
              <CTConstraintBuilder
                key={`constraints-${revision}`}
                project={project}
                append={(build) =>
                  safe(() =>
                    publish({
                      ...project,
                      constraints: [...project.constraints, build()],
                    }),
                  )
                }
              />
            </section>
            {getSchemaText && (
              <details>
                <summary className="cursor-pointer text-sm font-bold">
                  {t("ct.schema")}
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="text-xs">{t("ct.schemaHelp")}</p>
                  <CTButton
                    onClick={() =>
                      safe(() => {
                        const result = parseOpenApiSchema(getSchemaText());
                        if (!result.ok || !result.value.endpoints.length)
                          throw new CTError("schema");
                        setCatalog(result.value.endpoints);
                        setOperation("0");
                      })
                    }
                  >
                    {t("ct.readSchema")}
                  </CTButton>
                  {catalog.length > 0 && (
                    <>
                      <CTSelect
                        label={t("ct.operation")}
                        value={operation}
                        onChange={setOperation}
                      >
                        {catalog.map((endpoint, i) => (
                          <option key={i} value={i}>
                            {endpoint.method} {endpoint.path}
                          </option>
                        ))}
                      </CTSelect>
                      <CTButton
                        onClick={() =>
                          safe(() =>
                            publish(
                              projectFromCTEndpoint(catalog[Number(operation)]),
                            ),
                          )
                        }
                      >
                        {t("ct.importOperation")}
                      </CTButton>
                    </>
                  )}
                </div>
              </details>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("ct.rowsImport")}
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs">{t("ct.rowsHelp")}</p>
                <CTSelect
                  label={t("ct.rowsFormat")}
                  value={rowsFormat}
                  onChange={setRowsFormat}
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </CTSelect>
                <CTField
                  label={t("ct.rowsText")}
                  value={rowsText}
                  onChange={setRowsText}
                  multiline
                />
                <CTButton
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        rows: [
                          ...project.rows,
                          ...importCTRows(
                            rowsText,
                            rowsFormat as "json" | "csv",
                            project,
                          ),
                        ],
                      }),
                    )
                  }
                >
                  {t("ct.importRows")}
                </CTButton>
              </div>
            </details>
            <p className="text-xs text-slate-600">{t("ct.generateHelp")}</p>
            <div className={actions}>
              <CTButton onClick={() => void run("audit")}>
                {t("ct.analyze")}
              </CTButton>
              <CTButton onClick={() => void run("generate")}>
                {t("ct.generate")}
              </CTButton>
              {space && (
                <>
                  <CTButton onClick={() => void run("repair")}>
                    {t("ct.repair")}
                  </CTButton>
                  <CTButton
                    onClick={() =>
                      safe(() => publish({ ...project, rows: chosen }))
                    }
                  >
                    {t("ct.adopt")}
                  </CTButton>
                </>
              )}
            </div>
            {space && audit && (
              <section aria-label={t("ct.results")} className={box}>
                <h3 className="text-sm font-bold">{t("ct.results")}</h3>
                <p
                  className="text-sm font-semibold"
                  data-testid="ct-coverage-summary"
                >
                  {t("ct.summary", {
                    rows: String(chosen.length),
                    covered: String(audit.covered.length),
                    total: String(audit.feasibleTuples),
                    percentage: String(audit.percentage),
                    infeasible: String(audit.infeasibleTuples),
                    invalid: String(audit.rows.filter((r) => !r.valid).length),
                  })}
                </p>
                <p className="text-xs text-slate-600">
                  {t("ct.searchSummary", {
                    states: String(space.states),
                    candidates: String(space.candidates.length),
                  })}
                </p>
                {!space.candidates.length && (
                  <p className="text-sm text-amber-800">
                    {t("ct.unsatisfiable")}
                  </p>
                )}
                <section aria-label={t("ct.cases")}>
                  <h4 className="mb-2 text-xs font-bold">{t("ct.cases")}</h4>
                  {!working.length ? (
                    <p className="text-xs">{t("ct.noRows")}</p>
                  ) : (
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr>
                            <th className="p-2">{t("ct.case")}</th>
                            <th className="p-2">{t("ct.pin")}</th>
                            {project.variables.map((v) => (
                              <th className="p-2" key={v.id}>
                                {v.name}
                              </th>
                            ))}
                            <th className="p-2">{t("ct.validation")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {working.map((row) => {
                            const result = fullAudit!.rows.find(
                              (r) => r.id === row.id,
                            )!;
                            return (
                              <tr
                                className="border-t border-slate-100"
                                key={row.id}
                              >
                                <td className="p-2">
                                  <input
                                    type="checkbox"
                                    aria-label={t("ct.selected", {
                                      id: row.id,
                                    })}
                                    checked={selected.has(row.id)}
                                    disabled={row.pinned}
                                    onChange={(e) => {
                                      const next = new Set(selected);
                                      if (e.target.checked) next.add(row.id);
                                      else next.delete(row.id);
                                      setSelected(next);
                                    }}
                                  />{" "}
                                  <button
                                    type="button"
                                    className="font-semibold text-violet-800 underline"
                                    aria-label={t("ct.inspect", { id: row.id })}
                                    onClick={() => inspect(row.id)}
                                  >
                                    {row.name}
                                  </button>
                                </td>
                                <td className="p-2">
                                  <input
                                    type="checkbox"
                                    aria-label={t("ct.pinned", { id: row.id })}
                                    checked={row.pinned}
                                    onChange={(e) => {
                                      const pinned = e.target.checked;
                                      setWorking(
                                        working.map((r) =>
                                          r.id === row.id
                                            ? { ...r, pinned }
                                            : r,
                                        ),
                                      );
                                      if (pinned)
                                        setSelected(
                                          new Set([...selected, row.id]),
                                        );
                                    }}
                                  />
                                </td>
                                {project.variables.map((v) => (
                                  <td className="p-2" key={v.id}>
                                    {
                                      v.choices.find(
                                        (c) => c.id === row.choices[v.id],
                                      )!.label
                                    }
                                  </td>
                                ))}
                                <td className="p-2">
                                  {t(result.valid ? "ct.valid" : "ct.invalid")}
                                  {result.failedConstraints.length > 0 &&
                                    `: ${result.failedConstraints.join(", ")}`}
                                  {result.duplicateOf && (
                                    <span className="block text-slate-500">
                                      {t("ct.duplicate", {
                                        id: result.duplicateOf,
                                      })}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                <section
                  ref={inspector}
                  tabIndex={-1}
                  aria-label={t("ct.caseDetails")}
                  className="rounded-lg bg-slate-50 p-3 outline-violet-500"
                >
                  <h4 className="text-xs font-bold">{t("ct.caseDetails")}</h4>
                  {focused ? (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                      {JSON.stringify(ctCaseValues(project, focused), null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs">{t("ct.chooseCase")}</p>
                  )}
                </section>
                <CTCoverage
                  space={space}
                  audit={audit}
                  rows={chosen}
                  inspect={inspect}
                />
                <p className="text-xs text-slate-600">{t("ct.exportHelp")}</p>
                <div className={actions}>
                  <CTButton onClick={() => exportResult("suite")}>
                    {t("ct.exportSuite")}
                  </CTButton>
                  <CTButton onClick={() => exportResult("csv")}>
                    {t("ct.exportCsv")}
                  </CTButton>
                  <CTButton onClick={() => exportResult("ndjson")}>
                    {t("ct.exportNdjson")}
                  </CTButton>
                  <CTButton onClick={() => exportResult("report")}>
                    {t("ct.exportReport")}
                  </CTButton>
                  <CTButton onClick={() => exportResult("verifier")}>
                    {t("ct.exportVerifier")}
                  </CTButton>
                </div>
              </section>
            )}
            <p className="text-xs text-slate-500">{t("ct.limits")}</p>
          </fieldset>
        </div>
      )}
    </details>
  );
});
