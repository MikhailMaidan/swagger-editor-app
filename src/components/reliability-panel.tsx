"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  RLButton,
  RLField,
  RLSelect,
  RLSettings,
  RLNodeEditor,
  RLNodeBuilder,
  RLCaseEditor,
  RLRootEditor,
} from "./reliability-controls";
import { ReliabilityGraph } from "./reliability-graph";
import { ReliabilityResults, rlPercent } from "./reliability-results";
import {
  RLError,
  RL_LIMITS,
  emptyRLProject,
  normalizeRLProject,
  parseRLProject,
  serializeRLProject,
  rlFreshId,
  type RLProject,
} from "@/lib/reliability-model";
import {
  analyzeRLProject,
  evaluateRLProject,
  findRLRepairs,
  recordRLExpectation,
  rlReport,
  type RLRun,
  type RLRepairs,
  type RLProgress,
} from "@/lib/reliability-engine";
import { demoRLProject } from "@/lib/reliability-demo";
import { generateRLRunner, generateRLToolkit } from "@/lib/reliability-export";
import { parseOpenApiSchema } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";

const actions = "flex flex-wrap gap-2";
const box =
  "space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4";
export const ReliabilityPanel = memo(function ReliabilityPanel({
  getSchemaText,
}: {
  getSchemaText?: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState<RLProject>(emptyRLProject),
    [draft, setDraft] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  const [past, setPast] = useState<RLProject[]>([]),
    [future, setFuture] = useState<RLProject[]>([]),
    [selectedNode, setSelectedNode] = useState("service"),
    [rootId, setRootId] = useState("service"),
    [caseId, setCaseId] = useState("baseline");
  const [down, setDown] = useState<Set<string>>(new Set()),
    [run, setRun] = useState<RLRun | null>(null),
    [repairs, setRepairs] = useState<RLRepairs | null>(null);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<RLProgress>({
      phase: "truth",
      done: 0,
      total: 0,
      caseId: null,
    }),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [catalog, setCatalog] = useState<string[]>([]),
    [operation, setOperation] = useState("0");
  const mounted = useRef(false),
    generation = useRef(0),
    controller = useRef<AbortController | null>(null),
    svgRef = useRef<SVGSVGElement | null>(null);
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
  const source = useMemo(() => serializeRLProject(project), [project]),
    dirty = draft !== null && draft !== source;
  const evaluation = useMemo(
    () => evaluateRLProject(project, [...down]),
    [project, down],
  );
  const node =
      project.nodes.find((item) => item.id === selectedNode) ??
      project.nodes[0],
    root =
      project.roots.find((item) => item.node === rootId) ?? project.roots[0],
    scenario =
      project.cases.find((item) => item.id === caseId) ?? project.cases[0];
  const nodeState = evaluation.nodes.find((item) => item.id === node.id)!,
    analysis = run?.cases.find((item) => item.caseId === scenario.id);
  const name = (id: string) =>
    project.nodes.find((item) => item.id === id)?.name ?? id;
  function diagnose(e: unknown) {
    setError(t(`rl.error.${e instanceof RLError ? e.code : "project"}`));
  }
  function safe(action: () => void, allowDraft = false) {
    if (busy) return;
    setError("");
    if (dirty && !allowDraft) {
      setError(t("rl.dirty"));
      return;
    }
    try {
      action();
    } catch (e) {
      diagnose(e);
    }
  }
  function publish(raw: unknown, record = true) {
    const next = normalizeRLProject(raw);
    generation.current++;
    if (record) {
      setPast((old) => [...old, project].slice(-10));
      setFuture([]);
    }
    setProject(next);
    setDraft(null);
    setRevision((v) => v + 1);
    setRun(null);
    setRepairs(null);
    setMessage(t("rl.ready"));
    setDown(
      (old) =>
        new Set(
          [...old].filter((id) =>
            next.nodes.some((n) => n.id === id && n.kind === "event"),
          ),
        ),
    );
    if (!next.nodes.some((n) => n.id === selectedNode))
      setSelectedNode(next.roots[0].node);
    if (!next.roots.some((r) => r.node === rootId))
      setRootId(next.roots[0].node);
    if (!next.cases.some((c) => c.id === caseId)) setCaseId(next.cases[0].id);
  }
  function outage(ids: string[]) {
    safe(() => {
      evaluateRLProject(project, ids);
      setDown(new Set(ids));
      setRepairs(null);
    });
  }
  function save(content: string, suffix: string, type: string) {
    setMessage(
      downloadTextFile(content, `rsswag-reliability-${suffix}`, type)
        ? t("rl.downloaded")
        : t("rl.downloadFailed"),
    );
  }
  function cancel() {
    controller.current?.abort();
    generation.current++;
    setBusy(false);
    setMessage(t("rl.cancelled"));
  }
  async function work(kind: "selected" | "all" | "repair") {
    if (busy) return;
    setError("");
    if (dirty) {
      setError(t("rl.dirty"));
      return;
    }
    const token = ++generation.current,
      abort = new AbortController(),
      active = () => mounted.current && generation.current === token;
    controller.current = abort;
    setBusy(true);
    setMessage("");
    setProgress({ phase: "truth", done: 0, total: 0, caseId: null });
    try {
      const options = {
        signal: abort.signal,
        onProgress: (value: RLProgress) => {
          if (active()) setProgress(value);
        },
      };
      if (kind === "repair") {
        const result = await findRLRepairs(
          project,
          root.node,
          [...down],
          options,
        );
        if (active()) setRepairs(result);
      } else {
        const result = await analyzeRLProject(
          project,
          kind === "all" ? undefined : [scenario.id],
          options,
        );
        if (active())
          setRun(
            kind === "all"
              ? result
              : {
                  baseline: result.baseline,
                  cases: project.cases.flatMap(
                    (c) =>
                      result.cases.find((r) => r.caseId === c.id) ??
                      run?.cases.find((r) => r.caseId === c.id) ??
                      [],
                  ),
                },
          );
      }
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
      setError(t("rl.dirty"));
      return;
    }
    if (file.size > RL_LIMITS.bytes) {
      diagnose(new RLError("limit"));
      return;
    }
    const token = ++generation.current;
    setBusy(true);
    setProgress({ phase: "truth", done: 0, total: 0, caseId: null });
    try {
      const text = await file.text();
      if (mounted.current && generation.current === token) {
        publish(parseRLProject(text));
        setBusy(false);
      }
    } catch (e) {
      if (mounted.current && generation.current === token) {
        diagnose(e);
        setBusy(false);
      }
    }
  }
  function record(all: boolean) {
    safe(() => {
      const targets = all ? project.cases : [scenario];
      const expected = new Map(
        targets.map((item) => {
          const result = run?.cases.find((r) => r.caseId === item.id);
          if (!result) throw new RLError("expectation");
          return [item.id, recordRLExpectation(result)];
        }),
      );
      publish({
        ...project,
        cases: project.cases.map((item) =>
          expected.has(item.id)
            ? { ...item, expected: expected.get(item.id) }
            : item,
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
        {t("rl.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm">{t("rl.description")}</p>
          <p className="text-xs text-slate-600">{t("rl.help")}</p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-xs">
            {busy
              ? t("rl.busy", {
                  phase: t(`rl.phase.${progress.phase}`),
                  done: String(progress.done),
                  total: String(progress.total),
                })
              : message}
          </p>
          {busy && <RLButton onClick={cancel}>{t("rl.cancel")}</RLButton>}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className={actions}>
              <RLButton
                onClick={() =>
                  safe(() => {
                    publish(emptyRLProject());
                    setDown(new Set());
                  })
                }
              >
                {t("rl.new")}
              </RLButton>
              <RLButton
                onClick={() =>
                  safe(() => {
                    publish(demoRLProject());
                    setDown(new Set());
                  })
                }
              >
                {t("rl.demo")}
              </RLButton>
              <RLButton
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
                {t("rl.undo")}
              </RLButton>
              <RLButton
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
                {t("rl.redo")}
              </RLButton>
              <RLButton
                onClick={() =>
                  safe(() => save(source, "project.json", "application/json"))
                }
              >
                {t("rl.exportProject")}
              </RLButton>
              <label className="text-xs font-semibold">
                {t("rl.restore")}
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
            <RLSettings
              key={`settings-${revision}`}
              project={project}
              apply={(build) => safe(() => publish(build()))}
            />
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("rl.source")}
              </summary>
              <div className="mt-3 space-y-2">
                <RLField
                  label={t("rl.source")}
                  value={draft ?? source}
                  onChange={setDraft}
                  multiline
                />
                <div className={actions}>
                  <RLButton
                    onClick={() =>
                      safe(() => publish(parseRLProject(draft ?? source)), true)
                    }
                  >
                    {t("rl.apply")}
                  </RLButton>
                  <RLButton onClick={() => safe(() => setDraft(null), true)}>
                    {t("rl.discard")}
                  </RLButton>
                </div>
              </div>
            </details>
            <ReliabilityGraph
              project={project}
              states={evaluation.nodes}
              selected={node.id}
              select={setSelectedNode}
              svgRef={svgRef}
            />
            <section aria-label={t("rl.events")} className={box}>
              <h3 className="text-sm font-bold">{t("rl.events")}</h3>
              <p className="text-xs">{t("rl.outageHelp")}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {project.nodes
                  .filter((n) => n.kind === "event")
                  .map((event) => (
                    <label key={event.id} className="text-xs">
                      <input
                        type="checkbox"
                        aria-label={t("rl.failEvent", { name: event.name })}
                        checked={down.has(event.id)}
                        onChange={(e) =>
                          outage(
                            e.target.checked
                              ? [...down, event.id]
                              : [...down].filter((id) => id !== event.id),
                          )
                        }
                      />{" "}
                      {event.name}
                    </label>
                  ))}
              </div>
              <div className={actions}>
                <RLButton onClick={() => outage([])}>
                  {t("rl.clearOutage")}
                </RLButton>
                <RLButton
                  disabled={project.cases.length >= RL_LIMITS.cases}
                  onClick={() =>
                    safe(() => {
                      const next = {
                        id: rlFreshId("outage", project.cases),
                        name: "Graph outage",
                        overrides: Object.fromEntries(
                          [...down].map((id) => [id, 0]),
                        ),
                        expected: null,
                      };
                      publish({ ...project, cases: [...project.cases, next] });
                      setCaseId(next.id);
                    })
                  }
                >
                  {t("rl.captureOutage")}
                </RLButton>
              </div>
            </section>
            <section aria-label={t("rl.nodeDetails")} className={box}>
              <RLSelect
                label={t("rl.node")}
                value={node.id}
                onChange={setSelectedNode}
              >
                {project.nodes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </RLSelect>
              <p className="text-xs font-semibold">
                {node.name} · {t(nodeState.up ? "rl.up" : "rl.down")}
              </p>
              {node.kind !== "event" && (
                <>
                  <p className="text-xs">
                    {t("rl.gateState", {
                      healthy: String(nodeState.healthyInputs),
                      total: String(node.inputs.length),
                      required: String(nodeState.required),
                    })}
                  </p>
                  {nodeState.failedInputs.length > 0 && (
                    <p className="text-xs">
                      {nodeState.failedInputs.map(name).join(", ")}
                    </p>
                  )}
                </>
              )}
              <RLNodeEditor
                key={`${node.id}-${revision}`}
                node={node}
                apply={(build) =>
                  safe(() =>
                    publish({
                      ...project,
                      nodes: project.nodes.map((item) =>
                        item.id === node.id ? build() : item,
                      ),
                    }),
                  )
                }
              />
              <div className={actions}>
                <RLButton
                  onClick={() =>
                    safe(() => {
                      if (
                        project.roots.some((item) => item.node === node.id) ||
                        project.nodes.some(
                          (item) =>
                            item.kind !== "event" &&
                            item.inputs.includes(node.id),
                        ) ||
                        project.cases.some((item) =>
                          Object.hasOwn(item.overrides, node.id),
                        )
                      )
                        throw new RLError("reference");
                      publish({
                        ...project,
                        nodes: project.nodes.filter(
                          (item) => item.id !== node.id,
                        ),
                      });
                    })
                  }
                >
                  {t("rl.removeNode")}
                </RLButton>
                <RLButton
                  disabled={
                    project.roots.length >= RL_LIMITS.roots ||
                    project.roots.some((item) => item.node === node.id)
                  }
                  onClick={() =>
                    safe(() => {
                      publish({
                        ...project,
                        roots: [
                          ...project.roots,
                          {
                            node: node.id,
                            minAvailability: 0.999,
                            operation: "",
                          },
                        ],
                        cases: project.cases.map((item) => ({
                          ...item,
                          expected: null,
                        })),
                      });
                      setRootId(node.id);
                    })
                  }
                >
                  {t("rl.addOutput")}
                </RLButton>
              </div>
            </section>
            <RLNodeBuilder
              key={`builder-${revision}`}
              project={project}
              append={(build) =>
                safe(() =>
                  publish({ ...project, nodes: [...project.nodes, build()] }),
                )
              }
            />
            <section aria-label={t("rl.outputs")} className={box}>
              <h3 className="text-sm font-bold">{t("rl.outputs")}</h3>
              <p className="text-xs">{t("rl.outputHelp")}</p>
              <RLSelect
                label={t("rl.output")}
                value={root.node}
                onChange={(id) => {
                  setRootId(id);
                  setRepairs(null);
                }}
              >
                {project.roots.map((item) => (
                  <option key={item.node} value={item.node}>
                    {name(item.node)}
                  </option>
                ))}
              </RLSelect>
              <RLRootEditor
                key={`${root.node}-${revision}`}
                root={root}
                apply={(build) =>
                  safe(() =>
                    publish({
                      ...project,
                      roots: project.roots.map((item) =>
                        item.node === root.node ? build() : item,
                      ),
                    }),
                  )
                }
              />
              <RLButton
                disabled={project.roots.length <= 1}
                onClick={() =>
                  safe(() =>
                    publish({
                      ...project,
                      roots: project.roots.filter(
                        (item) => item.node !== root.node,
                      ),
                      cases: project.cases.map((item) => ({
                        ...item,
                        expected: item.expected
                          ? Object.fromEntries(
                              Object.entries(item.expected).filter(
                                ([id]) => id !== root.node,
                              ),
                            )
                          : null,
                      })),
                    }),
                  )
                }
              >
                {t("rl.removeOutput")}
              </RLButton>
              {getSchemaText && (
                <details>
                  <summary className="cursor-pointer text-xs font-bold">
                    {t("rl.schema")}
                  </summary>
                  <div className="mt-3 space-y-2">
                    <p className="text-xs">{t("rl.schemaHelp")}</p>
                    <RLButton
                      onClick={() =>
                        safe(() => {
                          const parsed = parseOpenApiSchema(getSchemaText());
                          if (!parsed.ok || !parsed.value.endpoints.length)
                            throw new RLError("schema");
                          setCatalog(
                            parsed.value.endpoints.map((endpoint) =>
                              `${endpoint.method} ${endpoint.path}`.slice(
                                0,
                                160,
                              ),
                            ),
                          );
                          setOperation("0");
                        })
                      }
                    >
                      {t("rl.readSchema")}
                    </RLButton>
                    {catalog.length > 0 && (
                      <>
                        <RLSelect
                          label={t("rl.schemaOperation")}
                          value={operation}
                          onChange={setOperation}
                        >
                          {catalog.map((label, i) => (
                            <option key={i} value={i}>
                              {label}
                            </option>
                          ))}
                        </RLSelect>
                        <RLButton
                          onClick={() =>
                            safe(() =>
                              publish({
                                ...project,
                                roots: project.roots.map((item) =>
                                  item.node === root.node
                                    ? {
                                        ...item,
                                        operation: catalog[Number(operation)],
                                      }
                                    : item,
                                ),
                              }),
                            )
                          }
                        >
                          {t("rl.useOperation")}
                        </RLButton>
                      </>
                    )}
                  </div>
                </details>
              )}
            </section>
            <section aria-label={t("rl.cases")} className={box}>
              <h3 className="text-sm font-bold">{t("rl.cases")}</h3>
              <p className="text-xs">{t("rl.caseHelp")}</p>
              <RLSelect
                label={t("rl.case")}
                value={scenario.id}
                onChange={setCaseId}
              >
                {project.cases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </RLSelect>
              <div className={actions}>
                <RLButton
                  disabled={project.cases.length >= RL_LIMITS.cases}
                  onClick={() =>
                    safe(() => {
                      const next = {
                        id: rlFreshId("scenario", project.cases),
                        name: "New probability scenario",
                        overrides: {},
                        expected: null,
                      };
                      publish({ ...project, cases: [...project.cases, next] });
                      setCaseId(next.id);
                    })
                  }
                >
                  {t("rl.addCase")}
                </RLButton>
                <RLButton
                  disabled={project.cases.length >= RL_LIMITS.cases}
                  onClick={() =>
                    safe(() => {
                      const copy = {
                        ...scenario,
                        id: rlFreshId("scenario", project.cases),
                        name: `Copy: ${scenario.name}`.slice(0, 160),
                        expected: null,
                      };
                      publish({ ...project, cases: [...project.cases, copy] });
                      setCaseId(copy.id);
                    })
                  }
                >
                  {t("rl.copyCase")}
                </RLButton>
                <RLButton
                  disabled={project.cases.length <= 1}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        cases: project.cases.filter(
                          (item) => item.id !== scenario.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("rl.removeCase")}
                </RLButton>
                <RLButton
                  onClick={() =>
                    outage(
                      project.nodes
                        .filter(
                          (item) =>
                            item.kind === "event" &&
                            (Object.hasOwn(scenario.overrides, item.id)
                              ? scenario.overrides[item.id]
                              : item.probability) === 0,
                        )
                        .map((item) => item.id),
                    )
                  }
                >
                  {t("rl.showCase")}
                </RLButton>
              </div>
              <RLCaseEditor
                key={`${scenario.id}-${revision}`}
                scenario={scenario}
                apply={(build) =>
                  safe(() =>
                    publish({
                      ...project,
                      cases: project.cases.map((item) =>
                        item.id === scenario.id ? build() : item,
                      ),
                    }),
                  )
                }
              />
            </section>
            <div className={actions}>
              <RLButton onClick={() => void work("selected")}>
                {t("rl.analyze")}
              </RLButton>
              <RLButton onClick={() => void work("all")}>
                {t("rl.analyzeAll")}
              </RLButton>
              <RLButton onClick={() => void work("repair")}>
                {t("rl.findRepairs")}
              </RLButton>
              <RLButton disabled={!analysis} onClick={() => record(false)}>
                {t("rl.record")}
              </RLButton>
              <RLButton disabled={!run} onClick={() => record(true)}>
                {t("rl.recordAll")}
              </RLButton>
            </div>
            <p className="text-xs">{t("rl.recordHelp")}</p>
            {run && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {run.cases.map((item) => {
                  const output = item.roots.find((r) => r.node === root.node)!;
                  return (
                    <button
                      key={item.caseId}
                      type="button"
                      onClick={() => setCaseId(item.caseId!)}
                      className="rounded-xl border border-violet-200 p-3 text-left text-xs"
                    >
                      <span className="block font-bold">
                        {project.cases.find((c) => c.id === item.caseId)!.name}
                      </span>
                      <progress
                        max={1}
                        value={output.availability}
                        aria-label={`${name(root.node)} ${item.caseId}`}
                        className="mt-2 h-2 w-full accent-violet-600"
                      />
                      <span className="block">
                        {rlPercent(output.availability)} ·{" "}
                        {t(
                          item.matched === null
                            ? "rl.expectMissing"
                            : item.matched
                              ? "rl.expectMatched"
                              : "rl.expectFailed",
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {run && analysis && (
              <ReliabilityResults
                project={project}
                baseline={run.baseline}
                analysis={analysis}
                rootId={root.node}
                showCut={outage}
              />
            )}
            {repairs && (
              <section aria-label={t("rl.repairs")} className={box}>
                <h3 className="text-sm font-bold">{t("rl.repairs")}</h3>
                <p className="text-xs">{t("rl.repairHelp")}</p>
                {repairs.alreadyHealthy ? (
                  <p className="text-xs">{t("rl.alreadyHealthy")}</p>
                ) : (
                  <>
                    <p className="text-xs">
                      {t("rl.repairCount", {
                        count: String(repairs.total),
                        shown: String(repairs.sets.length),
                      })}
                    </p>
                    {repairs.truncated && (
                      <p className="text-xs text-amber-800">
                        {t("rl.setLimit")}
                      </p>
                    )}
                    <div className="flex max-h-72 flex-wrap gap-2 overflow-auto">
                      {repairs.sets.map((set, index) => (
                        <button
                          type="button"
                          key={set.join("|")}
                          aria-label={t("rl.applyRepair", {
                            index: String(index + 1),
                          })}
                          className="rounded border border-violet-200 p-2 text-xs text-violet-800"
                          onClick={() =>
                            outage([...down].filter((id) => !set.includes(id)))
                          }
                        >
                          {set.map(name).join(" + ")}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
            <p className="text-xs text-slate-600">{t("rl.exportHelp")}</p>
            <div className={actions}>
              <RLButton
                disabled={!run}
                onClick={() =>
                  safe(() => {
                    if (run)
                      save(
                        JSON.stringify(rlReport(run), null, 2),
                        "report.json",
                        "application/json",
                      );
                  })
                }
              >
                {t("rl.exportReport")}
              </RLButton>
              <RLButton
                onClick={() =>
                  safe(() =>
                    save(
                      generateRLToolkit(project),
                      "toolkit.mjs",
                      "text/javascript",
                    ),
                  )
                }
              >
                {t("rl.exportToolkit")}
              </RLButton>
              <RLButton
                onClick={() =>
                  safe(() =>
                    save(
                      generateRLRunner(project),
                      "tests.mjs",
                      "text/javascript",
                    ),
                  )
                }
              >
                {t("rl.exportRunner")}
              </RLButton>
              <RLButton
                onClick={() =>
                  safe(() => {
                    if (svgRef.current)
                      save(
                        svgRef.current.outerHTML,
                        "architecture.svg",
                        "image/svg+xml",
                      );
                  })
                }
              >
                {t("rl.exportSvg")}
              </RLButton>
            </div>
            <p className="text-xs text-slate-500">{t("rl.limits")}</p>
          </fieldset>
        </div>
      )}
    </details>
  );
});
