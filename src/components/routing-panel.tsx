"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  RTButton,
  RTField,
  RTSelect,
  RTJsonEditor,
  RTSettings,
  RTRouteBuilder,
  RTTrafficBuilder,
} from "./routing-controls";
import { RoutingResults } from "./routing-results";
import {
  emptyRTProject,
  normalizeRTProject,
  normalizeRTConfig,
  parseRTProject,
  parseRTJson,
  serializeRTProject,
  rtFreshId,
  RTError,
  RT_LIMITS,
  type RTProject,
} from "@/lib/routing-model";
import {
  runRTProject,
  compareRTPolicies,
  routingDiagnostics,
  recordRTExpectation,
  rtReport,
  type RTCaseRun,
} from "@/lib/routing-engine";
import { demoRTProject } from "@/lib/routing-demo";
import { importRTHar, routeFromRTOperation } from "@/lib/routing-import";
import { generateRTRunner, generateRTToolkit } from "@/lib/routing-export";
import { parseOpenApiSchema, type EndpointSummary } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";

const box =
    "space-y-3 rounded-xl border border-[color:var(--color-brand-border)] p-4",
  actions = "flex flex-wrap gap-2";
type Comparison = Awaited<ReturnType<typeof compareRTPolicies>>;
export const RoutingPanel = memo(function RoutingPanel({
  getSchemaText,
}: {
  getSchemaText?: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState<RTProject>(emptyRTProject),
    [draft, setDraft] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  const [past, setPast] = useState<RTProject[]>([]),
    [future, setFuture] = useState<RTProject[]>([]),
    [backendId, setBackendId] = useState("primary"),
    [poolId, setPoolId] = useState("api"),
    [routeId, setRouteId] = useState("all"),
    [caseId, setCaseId] = useState("baseline");
  const [runs, setRuns] = useState<RTCaseRun[]>([]),
    [candidate, setCandidate] = useState<string | null>(null),
    [comparison, setComparison] = useState<Comparison | null>(null),
    [harText, setHarText] = useState("");
  const [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [progress, setProgress] = useState({ completed: 0, total: 0, caseId: "" }),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [catalog, setCatalog] = useState<EndpointSummary[]>([]),
    [operation, setOperation] = useState("0");
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
  const source = useMemo(() => serializeRTProject(project), [project]),
    configSource = useMemo(
      () => JSON.stringify(normalizeRTConfig(project), null, 2),
      [project],
    ),
    diagnostics = useMemo(() => routingDiagnostics(project), [project]);
  const dirty = draft !== null && draft !== source,
    backend =
      project.backends.find((item) => item.id === backendId) ??
      project.backends[0],
    pool = project.pools.find((item) => item.id === poolId) ?? project.pools[0],
    route =
      project.routes.find((item) => item.id === routeId) ?? project.routes[0],
    scenario =
      project.cases.find((item) => item.id === caseId) ?? project.cases[0],
    run = runs.find((item) => item.caseId === scenario.id);
  function diagnose(e: unknown) {
    setError(t(`rt.error.${e instanceof RTError ? e.code : "project"}`));
  }
  function safe(action: () => void, allowDraft = false) {
    if (busy) return;
    setError("");
    if (dirty && !allowDraft) {
      setError(t("rt.dirty"));
      return;
    }
    try {
      action();
    } catch (e) {
      diagnose(e);
    }
  }
  function publish(raw: unknown, record = true) {
    const next = normalizeRTProject(raw);
    generation.current++;
    if (record) {
      setPast((old) => [...old, project].slice(-10));
      setFuture([]);
    }
    setProject(next);
    setDraft(null);
    setRevision((v) => v + 1);
    setRuns([]);
    setComparison(null);
    setMessage(t("rt.ready"));
    if (!next.backends.some((item) => item.id === backendId))
      setBackendId(next.backends[0].id);
    if (!next.pools.some((item) => item.id === poolId))
      setPoolId(next.pools[0].id);
    if (!next.routes.some((item) => item.id === routeId))
      setRouteId(next.routes[0]?.id ?? "");
    if (!next.cases.some((item) => item.id === caseId))
      setCaseId(next.cases[0].id);
    return next;
  }
  function save(content: string, suffix: string, type: string) {
    setMessage(
      downloadTextFile(content, `rsswag-routing-${suffix}`, type)
        ? t("rt.downloaded")
        : t("rt.downloadFailed"),
    );
  }
  function cancel() {
    controller.current?.abort();
    generation.current++;
    setBusy(false);
    setReading(false);
    setMessage(t("rt.cancelled"));
  }
  async function work(kind: "selected" | "all" | "compare") {
    if (busy) return;
    setError("");
    if (dirty) {
      setError(t("rt.dirty"));
      return;
    }
    const token = ++generation.current,
      abort = new AbortController(),
      active = () => mounted.current && generation.current === token;
    controller.current = abort;
    setBusy(true);
    setReading(false);
    setMessage("");
    setProgress({ completed: 0, total: 0, caseId: scenario.id });
    try {
      const options = {
        signal: abort.signal,
        onProgress: (value: {
          completed: number;
          total: number;
          caseId: string;
        }) => {
          if (active()) setProgress(value);
        },
      };
      if (kind === "compare") {
        const result = await compareRTPolicies(
          project,
          parseRTJson(candidate ?? configSource),
          scenario.id,
          options,
        );
        if (active()) setComparison(result);
      } else {
        const result = await runRTProject(
          project,
          kind === "all" ? undefined : [scenario.id],
          options,
        );
        if (active())
          setRuns(
            kind === "all"
              ? result
              : project.cases.flatMap(
                  (item) =>
                    result.find((r) => r.caseId === item.id) ??
                    runs.find((r) => r.caseId === item.id) ??
                    [],
                ),
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
  function appendHar(text: string) {
    const next = importRTHar(text, project, project.cases);
    publish({ ...project, cases: [...project.cases, next] });
    setCaseId(next.id);
  }
  async function readFile(file: File, kind: "project" | "har") {
    if (busy) return;
    setError("");
    if (dirty) {
      setError(t("rt.dirty"));
      return;
    }
    if (file.size > RT_LIMITS.bytes) {
      diagnose(new RTError("limit"));
      return;
    }
    const token = ++generation.current;
    setBusy(true);
    setReading(true);
    try {
      const text = await file.text();
      if (mounted.current && generation.current === token) {
        if (kind === "project") publish(parseRTProject(text));
        else appendHar(text);
        setBusy(false);
        setReading(false);
      }
    } catch (e) {
      if (mounted.current && generation.current === token) {
        diagnose(e);
        setBusy(false);
        setReading(false);
      }
    }
  }
  function record(all: boolean) {
    safe(() => {
      const targets = all ? project.cases : [scenario],
        expected = new Map(
          targets.map((item) => {
            const result = runs.find((r) => r.caseId === item.id);
            if (!result) throw new RTError("expectation");
            return [item.id, recordRTExpectation(result)];
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
  function move(index: number, delta: number) {
    safe(() => {
      const routes = [...project.routes];
      [routes[index], routes[index + delta]] = [
        routes[index + delta],
        routes[index],
      ];
      publish({ ...project, routes });
    });
  }
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-5 shadow-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-base font-bold text-[color:var(--color-ink)]">
        {t("rt.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm">{t("rt.description")}</p>
          <p className="text-xs text-slate-600">{t("rt.help")}</p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-xs">
            {busy
              ? reading
                ? t("rt.loading")
                : t("rt.busy", {
                    case: progress.caseId,
                    completed: String(progress.completed),
                    total: String(progress.total),
                  })
              : message}
          </p>
          {busy && <RTButton onClick={cancel}>{t("rt.cancel")}</RTButton>}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <div className={actions}>
              <RTButton onClick={() => safe(() => publish(emptyRTProject()))}>
                {t("rt.new")}
              </RTButton>
              <RTButton onClick={() => safe(() => publish(demoRTProject()))}>
                {t("rt.demo")}
              </RTButton>
              <RTButton
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
                {t("rt.undo")}
              </RTButton>
              <RTButton
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
                {t("rt.redo")}
              </RTButton>
              <RTButton
                onClick={() =>
                  safe(() => save(source, "project.json", "application/json"))
                }
              >
                {t("rt.exportProject")}
              </RTButton>
              <label className="text-xs font-semibold">
                {t("rt.restore")}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="mt-1 block text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void readFile(file, "project");
                  }}
                />
              </label>
            </div>
            <RTSettings
              key={`settings-${revision}`}
              project={project}
              apply={(build) => safe(() => publish(build()))}
            />
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("rt.source")}
              </summary>
              <div className="mt-3 space-y-2">
                <RTField
                  label={t("rt.source")}
                  value={draft ?? source}
                  onChange={setDraft}
                  multiline
                />
                <div className={actions}>
                  <RTButton
                    onClick={() =>
                      safe(() => publish(parseRTProject(draft ?? source)), true)
                    }
                  >
                    {t("rt.apply")}
                  </RTButton>
                  <RTButton onClick={() => safe(() => setDraft(null), true)}>
                    {t("rt.discard")}
                  </RTButton>
                </div>
              </div>
            </details>
            <section aria-label={t("rt.backends")} className={box}>
              <h3 className="text-sm font-bold">{t("rt.backends")}</h3>
              <p className="text-xs">{t("rt.backendHelp")}</p>
              <RTSelect
                label={t("rt.backend")}
                value={backend.id}
                onChange={setBackendId}
              >
                {project.backends.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </RTSelect>
              <div className={actions}>
                <RTButton
                  disabled={project.backends.length >= RT_LIMITS.backends}
                  onClick={() =>
                    safe(() => {
                      const id = rtFreshId("backend", project.backends);
                      publish({
                        ...project,
                        backends: [
                          ...project.backends,
                          {
                            id,
                            name: id,
                            url: `https://${id}.example.test`,
                            weight: 1,
                            capacity: 4,
                            healthy: true,
                          },
                        ],
                      });
                      setBackendId(id);
                    })
                  }
                >
                  {t("rt.addBackend")}
                </RTButton>
                <RTButton
                  disabled={project.backends.length <= 1}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        backends: project.backends.filter(
                          (item) => item.id !== backend.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("rt.removeBackend")}
                </RTButton>
              </div>
              <RTJsonEditor
                key={`backend-${backend.id}-${revision}`}
                label={t("rt.backendSource")}
                action={t("rt.applyBackend")}
                value={backend}
                apply={(build) =>
                  safe(() =>
                    publish({
                      ...project,
                      backends: project.backends.map((item) =>
                        item.id === backend.id ? build() : item,
                      ),
                    }),
                  )
                }
              />
            </section>
            <section aria-label={t("rt.pools")} className={box}>
              <h3 className="text-sm font-bold">{t("rt.pools")}</h3>
              <p className="text-xs">{t("rt.poolHelp")}</p>
              <RTSelect
                label={t("rt.pool")}
                value={pool.id}
                onChange={setPoolId}
              >
                {project.pools.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </RTSelect>
              <RTSelect
                label={t("rt.algorithm")}
                value={pool.algorithm}
                onChange={(algorithm) =>
                  safe(() =>
                    publish({
                      ...project,
                      pools: project.pools.map((item) =>
                        item.id === pool.id ? { ...item, algorithm } : item,
                      ),
                    }),
                  )
                }
              >
                {(["round-robin", "least-active", "sticky"] as const).map(
                  (algorithm) => (
                    <option key={algorithm} value={algorithm}>
                      {t(`rt.${algorithm}`)}
                    </option>
                  ),
                )}
              </RTSelect>
              <div className={actions}>
                <RTButton
                  disabled={project.pools.length >= RT_LIMITS.pools}
                  onClick={() =>
                    safe(() => {
                      const id = rtFreshId("pool", project.pools);
                      publish({
                        ...project,
                        pools: [
                          ...project.pools,
                          {
                            id,
                            name: id,
                            algorithm: "round-robin",
                            members: [backend.id],
                            key: { target: "header", name: "x-client-id" },
                          },
                        ],
                      });
                      setPoolId(id);
                    })
                  }
                >
                  {t("rt.addPool")}
                </RTButton>
                <RTButton
                  disabled={project.pools.length <= 1}
                  onClick={() =>
                    safe(() =>
                      publish({
                        ...project,
                        pools: project.pools.filter(
                          (item) => item.id !== pool.id,
                        ),
                      }),
                    )
                  }
                >
                  {t("rt.removePool")}
                </RTButton>
              </div>
              <RTJsonEditor
                key={`pool-${pool.id}-${revision}`}
                label={t("rt.poolSource")}
                action={t("rt.applyPool")}
                value={pool}
                apply={(build) =>
                  safe(() =>
                    publish({
                      ...project,
                      pools: project.pools.map((item) =>
                        item.id === pool.id ? build() : item,
                      ),
                    }),
                  )
                }
              />
            </section>
            <section aria-label={t("rt.routes")} className={box}>
              <h3 className="text-sm font-bold">{t("rt.routes")}</h3>
              <p className="text-xs">{t("rt.routeHelp")}</p>
              {diagnostics.map((item) => (
                <p className="text-xs text-amber-800" key={item.route}>
                  {t("rt.shadowed", {
                    route: item.route,
                    first: item.shadowedBy,
                  })}
                </p>
              ))}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <tbody>
                    {project.routes.map((item, index) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            aria-label={t("rt.enableRoute", { id: item.id })}
                            checked={item.enabled}
                            onChange={(e) =>
                              safe(() =>
                                publish({
                                  ...project,
                                  routes: project.routes.map((r) =>
                                    r.id === item.id
                                      ? { ...r, enabled: e.target.checked }
                                      : r,
                                  ),
                                }),
                              )
                            }
                          />
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-violet-800 underline"
                            onClick={() => setRouteId(item.id)}
                          >
                            {item.name}
                          </button>
                          <code className="block">
                            {item.methods.join(",")} {item.path} → {item.pool}
                          </code>
                        </td>
                        <td className="p-2">
                          <div className={actions}>
                            <RTButton
                              disabled={index === 0}
                              onClick={() => move(index, -1)}
                            >
                              {t("rt.moveUp", { id: item.id })}
                            </RTButton>
                            <RTButton
                              disabled={index === project.routes.length - 1}
                              onClick={() => move(index, 1)}
                            >
                              {t("rt.moveDown", { id: item.id })}
                            </RTButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {route && (
                <>
                  <RTSelect
                    label={t("rt.route")}
                    value={route.id}
                    onChange={setRouteId}
                  >
                    {project.routes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </RTSelect>
                  <RTJsonEditor
                    key={`route-${route.id}-${revision}`}
                    label={t("rt.routeSource")}
                    action={t("rt.applyRoute")}
                    value={route}
                    apply={(build) =>
                      safe(() =>
                        publish({
                          ...project,
                          routes: project.routes.map((item) =>
                            item.id === route.id ? build() : item,
                          ),
                        }),
                      )
                    }
                  />
                  <RTButton
                    onClick={() =>
                      safe(() =>
                        publish({
                          ...project,
                          routes: project.routes.filter(
                            (item) => item.id !== route.id,
                          ),
                        }),
                      )
                    }
                  >
                    {t("rt.removeRoute")}
                  </RTButton>
                </>
              )}
              <RTRouteBuilder
                key={`route-builder-${revision}`}
                project={project}
                poolId={pool.id}
                append={(build) =>
                  safe(() => {
                    const next = publish({
                      ...project,
                      routes: [build(), ...project.routes],
                    });
                    setRouteId(next.routes[0].id);
                  })
                }
              />
            </section>
            {getSchemaText && (
              <details>
                <summary className="cursor-pointer text-sm font-bold">
                  {t("rt.schema")}
                </summary>
                <div className="mt-3 space-y-2">
                  <p className="text-xs">{t("rt.schemaHelp")}</p>
                  <RTButton
                    onClick={() =>
                      safe(() => {
                        const parsed = parseOpenApiSchema(getSchemaText());
                        if (!parsed.ok || !parsed.value.endpoints.length)
                          throw new RTError("schema");
                        setCatalog(parsed.value.endpoints);
                        setOperation("0");
                      })
                    }
                  >
                    {t("rt.readSchema")}
                  </RTButton>
                  {catalog.length > 0 && (
                    <>
                      <RTSelect
                        label={t("rt.operation")}
                        value={operation}
                        onChange={setOperation}
                      >
                        {catalog.map((endpoint, index) => (
                          <option key={index} value={index}>
                            {endpoint.method} {endpoint.path}
                          </option>
                        ))}
                      </RTSelect>
                      <RTButton
                        onClick={() =>
                          safe(() => {
                            const route = routeFromRTOperation(
                              catalog[Number(operation)],
                              pool.id,
                              project.routes,
                            );
                            publish({
                              ...project,
                              routes: [route, ...project.routes],
                            });
                            setRouteId(route.id);
                          })
                        }
                      >
                        {t("rt.importRoute")}
                      </RTButton>
                    </>
                  )}
                </div>
              </details>
            )}
            <section aria-label={t("rt.cases")} className={box}>
              <h3 className="text-sm font-bold">{t("rt.cases")}</h3>
              <p className="text-xs">{t("rt.caseHelp")}</p>
              <RTSelect
                label={t("rt.case")}
                value={scenario.id}
                onChange={(id) => {
                  setCaseId(id);
                  setComparison(null);
                }}
              >
                {project.cases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </RTSelect>
              <div className={actions}>
                <RTButton
                  disabled={project.cases.length >= RT_LIMITS.cases}
                  onClick={() =>
                    safe(() => {
                      const next = {
                        ...emptyRTProject().cases[0],
                        id: rtFreshId("traffic", project.cases),
                        name: "New traffic scenario",
                      };
                      publish({ ...project, cases: [...project.cases, next] });
                      setCaseId(next.id);
                    })
                  }
                >
                  {t("rt.addCase")}
                </RTButton>
                <RTButton
                  disabled={project.cases.length >= RT_LIMITS.cases}
                  onClick={() =>
                    safe(() => {
                      const next = {
                        ...scenario,
                        id: rtFreshId("traffic", project.cases),
                        name: `Copy: ${scenario.name}`.slice(0, 160),
                        expected: null,
                      };
                      publish({ ...project, cases: [...project.cases, next] });
                      setCaseId(next.id);
                    })
                  }
                >
                  {t("rt.copyCase")}
                </RTButton>
                <RTButton
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
                  {t("rt.removeCase")}
                </RTButton>
              </div>
              <RTJsonEditor
                key={`case-${scenario.id}-${revision}`}
                label={t("rt.caseSource")}
                action={t("rt.applyCase")}
                value={scenario}
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
              <RTTrafficBuilder
                key={`traffic-${scenario.id}-${revision}`}
                scenario={scenario}
                append={(build) =>
                  safe(() =>
                    publish({
                      ...project,
                      cases: project.cases.map((item) =>
                        item.id === scenario.id
                          ? {
                              ...item,
                              expected: null,
                              requests: [...item.requests, build()],
                            }
                          : item,
                      ),
                    }),
                  )
                }
              />
            </section>
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("rt.importHar")}
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs">{t("rt.harHelp")}</p>
                <RTField
                  label={t("rt.harSource")}
                  value={harText}
                  onChange={setHarText}
                  multiline
                />
                <RTButton onClick={() => safe(() => appendHar(harText))}>
                  {t("rt.importHarText")}
                </RTButton>
                <label className="block text-xs font-semibold">
                  {t("rt.harFile")}
                  <input
                    type="file"
                    accept=".har,.json,application/json"
                    className="mt-1 block text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void readFile(file, "har");
                    }}
                  />
                </label>
              </div>
            </details>
            <div className={actions}>
              <RTButton onClick={() => void work("selected")}>
                {t("rt.run")}
              </RTButton>
              <RTButton onClick={() => void work("all")}>
                {t("rt.runAll")}
              </RTButton>
              <RTButton disabled={!run} onClick={() => record(false)}>
                {t("rt.record")}
              </RTButton>
              <RTButton disabled={!runs.length} onClick={() => record(true)}>
                {t("rt.recordAll")}
              </RTButton>
            </div>
            <p className="text-xs">{t("rt.recordHelp")}</p>
            {runs.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-3">
                {runs.map((item) => (
                  <button
                    key={item.caseId}
                    type="button"
                    className="rounded-lg border border-violet-200 p-3 text-left text-xs"
                    onClick={() => {
                      setCaseId(item.caseId);
                      setComparison(null);
                    }}
                  >
                    <span className="block font-bold">
                      {project.cases.find((c) => c.id === item.caseId)!.name}
                    </span>
                    <span>
                      {item.forwarded}/{item.requests.length} ·{" "}
                      {t(
                        item.matched === null
                          ? "rt.unrecorded"
                          : item.matched
                            ? "rt.matched"
                            : "rt.failed",
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {run && (
              <RoutingResults
                key={`${scenario.id}-${revision}`}
                project={project}
                scenario={scenario}
                run={run}
              />
            )}
            <details>
              <summary className="cursor-pointer text-sm font-bold">
                {t("rt.candidate")}
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs">{t("rt.candidateHelp")}</p>
                <RTField
                  label={t("rt.candidateSource")}
                  value={candidate ?? configSource}
                  onChange={(value) => {
                    setCandidate(value);
                    setComparison(null);
                  }}
                  multiline
                />
                <div className={actions}>
                  <RTButton
                    onClick={() =>
                      safe(() => {
                        setCandidate(configSource);
                        setComparison(null);
                      })
                    }
                  >
                    {t("rt.resetCandidate")}
                  </RTButton>
                  <RTButton onClick={() => void work("compare")}>
                    {t("rt.compare")}
                  </RTButton>
                  <RTButton
                    onClick={() =>
                      safe(() =>
                        save(
                          JSON.stringify(
                            normalizeRTConfig(
                              parseRTJson(candidate ?? configSource),
                            ),
                            null,
                            2,
                          ),
                          "candidate.json",
                          "application/json",
                        ),
                      )
                    }
                  >
                    {t("rt.exportCandidate")}
                  </RTButton>
                </div>
                {comparison && (
                  <>
                    <p
                      className="text-xs font-bold"
                      data-testid="rt-comparison-summary"
                    >
                      {t("rt.compareSummary", {
                        count: String(comparison.changes.length),
                      })}
                    </p>
                    <div className="max-h-80 overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr>
                            <th className="p-2">{t("rt.request")}</th>
                            <th className="p-2">{t("rt.baseline")}</th>
                            <th className="p-2">{t("rt.candidateLabel")}</th>
                            <th className="p-2">{t("rt.rewriteChanged")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.changes.map((change) => (
                            <tr
                              key={change.request}
                              className="border-t border-slate-100"
                            >
                              <td className="p-2">{change.request}</td>
                              <td className="p-2">
                                {change.baselineRoute} ·{" "}
                                {change.baselineBackend} ·{" "}
                                {change.baselineStatus}
                              </td>
                              <td className="p-2">
                                {change.candidateRoute} ·{" "}
                                {change.candidateBackend} ·{" "}
                                {change.candidateStatus}
                              </td>
                              <td className="p-2">
                                {t(change.rewriteChanged ? "rt.yes" : "rt.no")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <RTButton
                      onClick={() =>
                        safe(() =>
                          save(
                            JSON.stringify(
                              {
                                version: 1,
                                kind: "rsswag-routing-comparison",
                                changes: comparison.changes,
                                baseline: rtReport([comparison.baseline]),
                                candidate: rtReport([comparison.candidate]),
                              },
                              null,
                              2,
                            ),
                            "comparison.json",
                            "application/json",
                          ),
                        )
                      }
                    >
                      {t("rt.exportComparison")}
                    </RTButton>
                  </>
                )}
              </div>
            </details>
            <p className="text-xs text-slate-600">{t("rt.exportHelp")}</p>
            <div className={actions}>
              <RTButton
                disabled={!runs.length}
                onClick={() =>
                  safe(() =>
                    save(
                      JSON.stringify(rtReport(runs), null, 2),
                      "report.json",
                      "application/json",
                    ),
                  )
                }
              >
                {t("rt.exportReport")}
              </RTButton>
              <RTButton
                onClick={() =>
                  safe(() =>
                    save(
                      generateRTToolkit(project),
                      "toolkit.mjs",
                      "text/javascript",
                    ),
                  )
                }
              >
                {t("rt.exportToolkit")}
              </RTButton>
              <RTButton
                onClick={() =>
                  safe(() =>
                    save(
                      generateRTRunner(project),
                      "tests.mjs",
                      "text/javascript",
                    ),
                  )
                }
              >
                {t("rt.exportRunner")}
              </RTButton>
            </div>
            <p className="text-xs text-slate-500">{t("rt.limits")}</p>
          </fieldset>
        </div>
      )}
    </details>
  );
});
