"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  MTButton,
  MTField,
  MTSelect,
  MTCheckBuilder,
  MTFixtureEditor,
} from "./mutation-controls";
import { MTResults } from "./mutation-results";
import {
  MTError,
  MT_LIMITS,
  MT_OPERATORS,
  emptyMTProject,
  normalizeMTProject,
  parseMTProject,
  serializeMTProject,
  mtFreshId,
  type MTProject,
} from "@/lib/mutation-model";
import {
  runMTProject,
  mtReport,
  mtRecordedExpectation,
  reduceMTChecks,
  suggestMTAssertion,
  materializeMTMutation,
  type MTFixtureRun,
  type MTProgress,
} from "@/lib/mutation-engine";
import { demoMTProject } from "@/lib/mutation-demo";
import { fixtureFromMTOperation, importMTChecks } from "@/lib/mutation-import";
import { generateMTRunner, generateMTToolkit } from "@/lib/mutation-export";
import {
  serializeResponseAssertions,
  type ResponseAssertion,
} from "@/lib/response-assertions";
import { parseOpenApiSchema, type EndpointSummary } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";

const box =
  "space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4";
const actions = "flex flex-wrap gap-2";
function MTSettings({
  project,
  apply,
}: {
  project: MTProject;
  apply: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState(project.name),
    [max, setMax] = useState(String(project.maxMutants));
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MTField label={t("mt.projectName")} value={name} onChange={setName} />
      <MTField label={t("mt.maxMutants")} value={max} onChange={setMax} />
      <MTButton
        onClick={() =>
          apply(() => ({
            ...project,
            name,
            maxMutants: max.trim() ? Number(max) : NaN,
          }))
        }
      >
        {t("mt.applySettings")}
      </MTButton>
    </div>
  );
}
export const MutationPanel = memo(function MutationPanel({
  getSchemaText,
}: {
  getSchemaText?: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState<MTProject>(emptyMTProject),
    [draft, setDraft] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [fixtureId, setFixtureId] = useState("response-1");
  const [past, setPast] = useState<MTProject[]>([]),
    [future, setFuture] = useState<MTProject[]>([]),
    [runs, setRuns] = useState<MTFixtureRun[]>([]);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<MTProgress>({
      fixtures: 0,
      completed: 0,
      total: 0,
    });
  const [suggestion, setSuggestion] = useState<{
      key: string;
      rule: ResponseAssertion;
    } | null>(null),
    [reduction, setReduction] = useState<string[] | null>(null),
    [importText, setImportText] = useState("");
  const [catalog, setCatalog] = useState<EndpointSummary[]>([]),
    [operation, setOperation] = useState("0"),
    [responseIndex, setResponseIndex] = useState("0");
  const mounted = useRef(false),
    generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const clock = generation,
      job = controller;
    return () => {
      mounted.current = false;
      clock.current++;
      job.current?.abort();
    };
  }, []);
  const source = useMemo(() => serializeMTProject(project), [project]),
    dirty = draft !== null && draft !== source;
  const fixture =
      project.fixtures.find((f) => f.id === fixtureId) ?? project.fixtures[0],
    run = runs.find((r) => r.fixtureId === fixture.id);
  function diagnose(e: unknown) {
    setError(t(`mt.error.${e instanceof MTError ? e.code : "project"}`));
  }
  function safe(action: () => void, allowDraft = false) {
    if (busy) return;
    setError("");
    if (dirty && !allowDraft) {
      setError(t("mt.dirty"));
      return;
    }
    try {
      action();
    } catch (e) {
      diagnose(e);
    }
  }
  function choose(id: string) {
    setFixtureId(id);
    setSuggestion(null);
    setReduction(null);
  }
  function publish(raw: unknown, record = true) {
    const next = normalizeMTProject(raw);
    generation.current++;
    if (record) {
      setPast((old) => [...old, project].slice(-10));
      setFuture([]);
    }
    setProject(next);
    setDraft(null);
    setRevision((v) => v + 1);
    setRuns([]);
    setSuggestion(null);
    setReduction(null);
    setMessage(t("mt.ready"));
    if (!next.fixtures.some((f) => f.id === fixtureId))
      setFixtureId(next.fixtures[0].id);
  }
  function updateFixture(raw: unknown) {
    publish({
      ...project,
      fixtures: project.fixtures.map((f) => (f.id === fixture.id ? raw : f)),
    });
  }
  function save(content: string, suffix: string, type: string) {
    setMessage(
      downloadTextFile(content, `rsswag-mutation-${suffix}`, type)
        ? t("mt.downloaded")
        : t("mt.downloadFailed"),
    );
  }
  function cancel() {
    controller.current?.abort();
    generation.current++;
    setBusy(false);
    setMessage(t("mt.cancelled"));
  }
  async function test(all: boolean) {
    if (busy) return;
    setError("");
    if (dirty) {
      setError(t("mt.dirty"));
      return;
    }
    const token = ++generation.current,
      abort = new AbortController(),
      active = () => mounted.current && generation.current === token;
    controller.current = abort;
    setBusy(true);
    setMessage("");
    setProgress({
      fixtures: all ? project.fixtures.length : 1,
      completed: 0,
      total: 0,
    });
    try {
      const result = await runMTProject(
        project,
        all ? undefined : [fixture.id],
        {
          signal: abort.signal,
          onProgress: (value) => {
            if (active()) setProgress(value);
          },
        },
      );
      if (!active()) return;
      setRuns(
        all
          ? result
          : project.fixtures.flatMap(
              (f) =>
                result.find((r) => r.fixtureId === f.id) ??
                runs.find((r) => r.fixtureId === f.id) ??
                [],
            ),
      );
      setSuggestion(null);
      setReduction(null);
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
      setError(t("mt.dirty"));
      return;
    }
    if (file.size > MT_LIMITS.bytes) {
      diagnose(new MTError("limit"));
      return;
    }
    const token = ++generation.current;
    setBusy(true);
    setProgress({ fixtures: 0, completed: 0, total: 0 });
    try {
      const text = await file.text();
      if (mounted.current && token === generation.current) {
        publish(parseMTProject(text));
        setBusy(false);
      }
    } catch (e) {
      if (mounted.current && token === generation.current) {
        diagnose(e);
        setBusy(false);
      }
    }
  }
  function record(all: boolean) {
    safe(() => {
      const targets = all ? project.fixtures : [fixture];
      const budgets = new Map(
        targets.map((f) => {
          const result = runs.find((r) => r.fixtureId === f.id);
          if (!result) throw new MTError("expectation");
          return [f.id, mtRecordedExpectation(result)];
        }),
      );
      publish({
        ...project,
        fixtures: project.fixtures.map((f) =>
          budgets.has(f.id) ? { ...f, expectation: budgets.get(f.id) } : f,
        ),
      });
    });
  }
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-5 shadow-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-base font-bold text-[color:var(--color-ink)]">
        {t("mt.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm">{t("mt.description")}</p>
          <p className="text-xs text-slate-600">{t("mt.help")}</p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-xs">
            {busy
              ? t("mt.busy", {
                  fixtures: String(progress.fixtures),
                  completed: String(progress.completed),
                  total: String(progress.total),
                })
              : message}
          </p>
          {busy && <MTButton onClick={cancel}>{t("mt.cancel")}</MTButton>}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className={actions}>
              <MTButton onClick={() => safe(() => publish(emptyMTProject()))}>
                {t("mt.new")}
              </MTButton>
              <MTButton onClick={() => safe(() => publish(demoMTProject()))}>
                {t("mt.demo")}
              </MTButton>
              <MTButton
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
                {t("mt.undo")}
              </MTButton>
              <MTButton
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
                {t("mt.redo")}
              </MTButton>
              <MTButton
                onClick={() =>
                  safe(() => save(source, "project.json", "application/json"))
                }
              >
                {t("mt.exportProject")}
              </MTButton>
              <label className="text-xs font-semibold">
                {t("mt.restore")}
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
            <MTSettings
              key={`settings-${revision}`}
              project={project}
              apply={(build) => safe(() => publish(build()))}
            />
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("mt.source")}
              </summary>
              <div className="mt-3 space-y-2">
                <MTField
                  label={t("mt.source")}
                  value={draft ?? source}
                  onChange={setDraft}
                  multiline
                />
                <div className={actions}>
                  <MTButton
                    onClick={() =>
                      safe(() => publish(parseMTProject(draft ?? source)), true)
                    }
                  >
                    {t("mt.apply")}
                  </MTButton>
                  <MTButton onClick={() => safe(() => setDraft(null), true)}>
                    {t("mt.discard")}
                  </MTButton>
                </div>
              </div>
            </details>
            <section aria-label={t("mt.operators")} className={box}>
              <h3 className="text-sm font-bold">{t("mt.operators")}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MT_OPERATORS.map((op) => (
                  <label key={op} className="text-xs">
                    <input
                      type="checkbox"
                      checked={project.operators.includes(op)}
                      onChange={(e) =>
                        safe(() =>
                          publish({
                            ...project,
                            operators: e.target.checked
                              ? [...project.operators, op]
                              : project.operators.filter((item) => item !== op),
                          }),
                        )
                      }
                    />{" "}
                    {t(`mt.op.${op}`)}
                  </label>
                ))}
              </div>
            </section>
            <section aria-label={t("mt.fixtures")} className={box}>
              <h3 className="text-sm font-bold">{t("mt.fixtures")}</h3>
              <MTSelect
                label={t("mt.fixture")}
                value={fixture.id}
                onChange={choose}
              >
                {project.fixtures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </MTSelect>
              <div className={actions}>
                <MTButton
                  disabled={project.fixtures.length >= MT_LIMITS.fixtures}
                  onClick={() =>
                    safe(() => {
                      const next = {
                        ...emptyMTProject().fixtures[0],
                        id: mtFreshId("response", project.fixtures),
                      };
                      publish({
                        ...project,
                        fixtures: [...project.fixtures, next],
                      });
                      choose(next.id);
                    })
                  }
                >
                  {t("mt.addFixture")}
                </MTButton>
                <MTButton
                  disabled={project.fixtures.length >= MT_LIMITS.fixtures}
                  onClick={() =>
                    safe(() => {
                      const copy = {
                        ...fixture,
                        id: mtFreshId("response", project.fixtures),
                        name: `Copy: ${fixture.name}`.slice(0, 160),
                        expectation: null,
                      };
                      publish({
                        ...project,
                        fixtures: [...project.fixtures, copy],
                      });
                      choose(copy.id);
                    })
                  }
                >
                  {t("mt.copyFixture")}
                </MTButton>
                <MTButton
                  disabled={project.fixtures.length <= 1}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        fixtures: project.fixtures.filter(
                          (f) => f.id !== fixture.id,
                        ),
                        waivers: project.waivers.filter(
                          (w) => w.fixture !== fixture.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("mt.removeFixture")}
                </MTButton>
              </div>
              <MTFixtureEditor
                key={`${fixture.id}-${revision}`}
                fixture={fixture}
                apply={(build) => safe(() => updateFixture(build()))}
              />
            </section>
            <section aria-label={t("mt.checks")} className={box}>
              <h3 className="text-sm font-bold">{t("mt.checks")}</h3>
              <p className="text-xs">{t("mt.checkHelp")}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th className="p-2">{t("mt.enabled")}</th>
                      <th className="p-2">{t("mt.pinned")}</th>
                      <th className="p-2">{t("mt.check")}</th>
                      <th className="p-2">{t("mt.expected")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {fixture.checks.map((check) => (
                      <tr key={check.id} className="border-t border-slate-100">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            aria-label={t("mt.enableCheck", { id: check.id })}
                            checked={check.enabled}
                            onChange={(e) =>
                              safe(() =>
                                updateFixture({
                                  ...fixture,
                                  checks: fixture.checks.map((c) =>
                                    c.id === check.id
                                      ? { ...c, enabled: e.target.checked }
                                      : c,
                                  ),
                                }),
                              )
                            }
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            aria-label={t("mt.pinCheck", { id: check.id })}
                            checked={check.pinned}
                            onChange={(e) =>
                              safe(() =>
                                updateFixture({
                                  ...fixture,
                                  checks: fixture.checks.map((c) =>
                                    c.id === check.id
                                      ? { ...c, pinned: e.target.checked }
                                      : c,
                                  ),
                                }),
                              )
                            }
                          />
                        </td>
                        <td className="p-2">
                          <p className="font-semibold">
                            {check.rule.name || check.id}
                          </p>
                          <code>
                            {check.id} · {check.rule.target}{" "}
                            {check.rule.path || "/"} {check.rule.operator}
                          </code>
                        </td>
                        <td className="max-w-xs break-all p-2">
                          {check.rule.expected}
                        </td>
                        <td className="p-2">
                          <MTButton
                            onClick={() =>
                              safe(() =>
                                updateFixture({
                                  ...fixture,
                                  checks: fixture.checks.filter(
                                    (c) => c.id !== check.id,
                                  ),
                                }),
                              )
                            }
                          >
                            {t("mt.removeCheck", { id: check.id })}
                          </MTButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <MTCheckBuilder
                key={`builder-${fixture.id}-${revision}`}
                append={(rule) =>
                  safe(() =>
                    updateFixture({
                      ...fixture,
                      checks: [
                        ...fixture.checks,
                        {
                          id: mtFreshId("check", fixture.checks),
                          enabled: true,
                          pinned: false,
                          rule,
                        },
                      ],
                    }),
                  )
                }
              />
              <MTButton
                onClick={() =>
                  safe(() =>
                    save(
                      serializeResponseAssertions(
                        fixture.checks
                          .filter((c) => c.enabled)
                          .map((c) => c.rule),
                      ),
                      "assertions.json",
                      "application/json",
                    ),
                  )
                }
              >
                {t("mt.exportChecks")}
              </MTButton>
              <details>
                <summary className="cursor-pointer text-xs font-bold">
                  {t("mt.checkImport")}
                </summary>
                <div className="mt-3 space-y-2">
                  <MTField
                    label={t("mt.checkImportText")}
                    value={importText}
                    onChange={setImportText}
                    multiline
                  />
                  <MTButton
                    onClick={() =>
                      safe(() =>
                        updateFixture({
                          ...fixture,
                          checks: importMTChecks(importText, fixture),
                        }),
                      )
                    }
                  >
                    {t("mt.importChecks")}
                  </MTButton>
                </div>
              </details>
            </section>
            {getSchemaText && (
              <details>
                <summary className="cursor-pointer text-sm font-bold">
                  {t("mt.schema")}
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="text-xs">{t("mt.schemaHelp")}</p>
                  <MTButton
                    onClick={() =>
                      safe(() => {
                        const parsed = parseOpenApiSchema(getSchemaText());
                        if (!parsed.ok || !parsed.value.endpoints.length)
                          throw new MTError("schema");
                        setCatalog(parsed.value.endpoints);
                        setOperation("0");
                        setResponseIndex("0");
                      })
                    }
                  >
                    {t("mt.readSchema")}
                  </MTButton>
                  {catalog.length > 0 && (
                    <>
                      <MTSelect
                        label={t("mt.operation")}
                        value={operation}
                        onChange={(value) => {
                          setOperation(value);
                          setResponseIndex("0");
                        }}
                      >
                        {catalog.map((endpoint, i) => (
                          <option key={i} value={i}>
                            {endpoint.method} {endpoint.path}
                          </option>
                        ))}
                      </MTSelect>
                      <MTSelect
                        label={t("mt.response")}
                        value={responseIndex}
                        onChange={setResponseIndex}
                      >
                        {catalog[Number(operation)]?.responses.map(
                          (response, i) => (
                            <option key={i} value={i}>
                              {response.status} · {response.description}
                            </option>
                          ),
                        )}
                      </MTSelect>
                      <MTButton
                        onClick={() =>
                          safe(() => {
                            const next = fixtureFromMTOperation(
                              catalog[Number(operation)],
                              Number(responseIndex),
                              project.fixtures,
                            );
                            publish({
                              ...project,
                              fixtures: [...project.fixtures, next],
                            });
                            choose(next.id);
                          })
                        }
                      >
                        {t("mt.importResponse")}
                      </MTButton>
                    </>
                  )}
                </div>
              </details>
            )}
            <p className="text-xs text-slate-600">{t("mt.scoreHelp")}</p>
            <div className={actions}>
              <MTButton onClick={() => void test(false)}>
                {t("mt.run")}
              </MTButton>
              <MTButton onClick={() => void test(true)}>
                {t("mt.runAll")}
              </MTButton>
              <MTButton disabled={!run} onClick={() => record(false)}>
                {t("mt.record")}
              </MTButton>
              <MTButton disabled={!runs.length} onClick={() => record(true)}>
                {t("mt.recordAll")}
              </MTButton>
            </div>
            <p className="text-xs">{t("mt.recordHelp")}</p>
            {runs.length > 0 && (
              <section
                aria-label={t("mt.compare")}
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {runs.map((result) => (
                  <button
                    key={result.fixtureId}
                    type="button"
                    onClick={() => choose(result.fixtureId)}
                    className="rounded-xl border border-violet-200 p-3 text-left text-xs"
                  >
                    <span className="block font-bold">
                      {
                        project.fixtures.find((f) => f.id === result.fixtureId)!
                          .name
                      }
                    </span>
                    <progress
                      aria-label={`${t("mt.score")}: ${result.fixtureId}`}
                      max={100}
                      value={result.score ?? 0}
                      className="mt-2 h-2 w-full accent-violet-600"
                    />
                    <span className="block">
                      {result.blocked
                        ? t("mt.blocked")
                        : result.score === null
                          ? t("mt.noScore")
                          : `${result.score}%`}{" "}
                      ·{" "}
                      {t(
                        result.matched === null
                          ? "mt.budgetMissing"
                          : result.matched
                            ? "mt.budgetMatched"
                            : "mt.budgetFailed",
                      )}
                    </span>
                  </button>
                ))}
              </section>
            )}
            {run && (
              <MTResults
                key={`${fixture.id}-${revision}`}
                fixture={fixture}
                run={run}
                suggestion={suggestion}
                reduction={reduction}
                reduce={() =>
                  safe(() => setReduction(reduceMTChecks(fixture, run)))
                }
                applyReduction={() =>
                  safe(() => {
                    if (!reduction) throw new MTError("reference");
                    updateFixture({
                      ...fixture,
                      checks: fixture.checks.map((c) => ({
                        ...c,
                        enabled: reduction.includes(c.id),
                      })),
                    });
                  })
                }
                suggest={(mutant) =>
                  safe(() => {
                    const rule = suggestMTAssertion(fixture, mutant);
                    if (!rule) throw new MTError("suggestion");
                    setSuggestion({ key: mutant.key, rule });
                  })
                }
                addSuggestion={() =>
                  safe(() => {
                    if (!suggestion) throw new MTError("reference");
                    updateFixture({
                      ...fixture,
                      checks: [
                        ...fixture.checks,
                        {
                          id: mtFreshId("check", fixture.checks),
                          enabled: true,
                          pinned: false,
                          rule: suggestion.rule,
                        },
                      ],
                    });
                  })
                }
                waive={(mutant, reason) =>
                  safe(() =>
                    publish({
                      ...project,
                      waivers: [
                        ...project.waivers.filter(
                          (w) =>
                            w.fixture !== fixture.id || w.key !== mutant.key,
                        ),
                        { fixture: fixture.id, key: mutant.key, reason },
                      ],
                    }),
                  )
                }
                unwaive={(mutant) =>
                  safe(() =>
                    publish({
                      ...project,
                      waivers: project.waivers.filter(
                        (w) => w.fixture !== fixture.id || w.key !== mutant.key,
                      ),
                    }),
                  )
                }
                exportResponse={(mutant) =>
                  safe(() =>
                    save(
                      materializeMTMutation(fixture.response, mutant).body,
                      `${fixture.id}-${mutant.id}.txt`,
                      "text/plain;charset=utf-8",
                    ),
                  )
                }
              />
            )}
            <p className="text-xs text-slate-600">{t("mt.exportHelp")}</p>
            <div className={actions}>
              <MTButton
                disabled={!runs.length}
                onClick={() =>
                  safe(() =>
                    save(
                      JSON.stringify(mtReport(runs), null, 2),
                      "report.json",
                      "application/json",
                    ),
                  )
                }
              >
                {t("mt.exportReport")}
              </MTButton>
              <MTButton
                onClick={() =>
                  safe(() =>
                    save(
                      generateMTToolkit(project),
                      "toolkit.mjs",
                      "text/javascript",
                    ),
                  )
                }
              >
                {t("mt.exportToolkit")}
              </MTButton>
              <MTButton
                onClick={() =>
                  safe(() =>
                    save(
                      generateMTRunner(project),
                      "tests.mjs",
                      "text/javascript",
                    ),
                  )
                }
              >
                {t("mt.exportRunner")}
              </MTButton>
            </div>
            <p className="text-xs text-slate-500">{t("mt.limits")}</p>
          </fieldset>
        </div>
      )}
    </details>
  );
});
