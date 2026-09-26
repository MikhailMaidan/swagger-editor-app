"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  createSandboxDemo,
  createSandboxState,
  executeSandboxRequest,
  MAX_SANDBOX_BYTES,
  MAX_SANDBOX_HISTORY,
  MAX_SANDBOX_RESOURCES,
  MAX_SANDBOX_ROUTES,
  parseSandboxJson,
  parseSandboxProject,
  SANDBOX_ACTIONS,
  SandboxError,
  serializeSandboxLog,
  serializeSandboxProject,
  serializeSandboxState,
  snapshotSandboxProject,
  suggestSandboxAction,
  validateSandboxProject,
  type SandboxAction,
  type SandboxLogEntry,
  type SandboxProject,
  type SandboxResource,
  type SandboxResult,
  type SandboxRoute,
  type SandboxState,
} from "@/lib/api-sandbox";
import { readTransformSource } from "@/lib/api-transform";
import { extractEndpoints } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import { truncateJsonPreview } from "@/lib/response-data-explorer";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const previewClass =
  "max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs whitespace-pre-wrap break-all text-slate-100";
const json = (value: unknown) => JSON.stringify(value, null, 2);
type Run = { project: SandboxProject; state: SandboxState };
type History = SandboxLogEntry & {
  before: SandboxState;
  result: SandboxResult;
};
const uniqueKey = (prefix: string, keys: string[]) => {
  let n = 1;
  while (keys.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};

export const ApiSandboxPanel = memo(function ApiSandboxPanel({
  getSchemaText,
}: {
  getSchemaText: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(createSandboxDemo);
  const [resourceKey, setResourceKey] = useState("tasks");
  const [routeKey, setRouteKey] = useState("tasks-list");
  const [seedDrafts, setSeedDrafts] = useState<Record<string, string>>({});
  const [scopeDrafts, setScopeDrafts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [sequence, setSequence] = useState(0);
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/tasks");
  const [body, setBody] = useState('{"title":"New task","done":false}');
  const [inspectedResource, setInspectedResource] = useState("tasks");
  const [operations, setOperations] = useState<
    { method: string; path: string }[]
  >([]);
  const [operation, setOperation] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const resource = draft.resources.find((r) => r.key === resourceKey);
  const route = draft.routes.find((r) => r.key === routeKey);
  const latest = history.at(-1);
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof SandboxError
          ? `sandbox.error.${error.code}`
          : "sandbox.error.read",
      error: true,
    });
  }
  function update(next: SandboxProject) {
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }
  function editResource(patch: Partial<SandboxResource>) {
    update({
      ...draft,
      resources: draft.resources.map((r) =>
        r.key === resourceKey ? { ...r, ...patch } : r,
      ),
    });
  }
  function editRoute(patch: Partial<SandboxRoute>) {
    update({
      ...draft,
      routes: draft.routes.map((r) =>
        r.key === routeKey ? { ...r, ...patch } : r,
      ),
    });
  }
  function materialize() {
    return validateSandboxProject({
      ...draft,
      resources: draft.resources.map((r) => ({
        ...r,
        seed: Object.hasOwn(seedDrafts, r.key)
          ? parseSandboxJson(seedDrafts[r.key])
          : r.seed,
      })),
      routes: draft.routes.map((r) => ({
        ...r,
        scope: Object.hasOwn(scopeDrafts, r.key)
          ? parseSandboxJson(scopeDrafts[r.key])
          : r.scope,
      })),
    });
  }
  function activate(project: SandboxProject) {
    const state = createSandboxState(project);
    setRun({ project, state });
    setDraft(project);
    setSeedDrafts({});
    setScopeDrafts({});
    setHistory([]);
    setSequence(0);
    setDirty(false);
    setInspectedResource(
      project.resources.some((r) => r.key === inspectedResource)
        ? inspectedResource
        : (project.resources[0]?.key ?? ""),
    );
  }
  function start() {
    setFeedback(null);
    try {
      activate(materialize());
      setFeedback({ key: "sandbox.started", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function reset() {
    if (!run) return;
    setRun({ project: run.project, state: createSandboxState(run.project) });
    setHistory([]);
    setSequence(0);
    setFeedback({ key: "sandbox.resetDone", error: false });
  }
  function execute() {
    if (!run || dirty || loading) return;
    setFeedback(null);
    try {
      const result = executeSandboxRequest(run.project, run.state, {
        method,
        path,
        body,
      });
      const entry: History = {
        sequence: sequence + 1,
        method,
        path,
        status: result.response.status,
        route: result.route,
        changed: result.changed,
        before: run.state,
        result,
      };
      setRun({ ...run, state: result.state });
      setSequence(sequence + 1);
      setHistory((previous) =>
        [...previous, entry].slice(-MAX_SANDBOX_HISTORY),
      );
      if (result.route)
        setInspectedResource(
          run.project.routes.find((r) => r.key === result.route)?.resource ??
            inspectedResource,
        );
    } catch (error) {
      fail(error);
    }
  }
  function undo() {
    if (!latest || !run || dirty) return;
    setRun({ ...run, state: latest.before });
    setHistory(history.slice(0, -1));
    setFeedback({ key: "sandbox.undone", error: false });
  }
  function addResource() {
    const key = uniqueKey(
      "resource",
      draft.resources.map((r) => r.key),
    );
    update({
      ...draft,
      resources: [
        ...draft.resources,
        { key, idField: "id", idType: "number", seed: [] },
      ],
    });
    setResourceKey(key);
  }
  function removeResource() {
    const removedRoutes = new Set(
      draft.routes.filter((r) => r.resource === resourceKey).map((r) => r.key),
    );
    setSeedDrafts(
      Object.fromEntries(
        Object.entries(seedDrafts).filter(([key]) => key !== resourceKey),
      ),
    );
    setScopeDrafts(
      Object.fromEntries(
        Object.entries(scopeDrafts).filter(([key]) => !removedRoutes.has(key)),
      ),
    );
    update({
      ...draft,
      resources: draft.resources.filter((r) => r.key !== resourceKey),
      routes: draft.routes.filter((r) => r.resource !== resourceKey),
    });
    setResourceKey(
      draft.resources.find((r) => r.key !== resourceKey)?.key ?? "",
    );
    setRouteKey(
      draft.routes.find((r) => r.resource !== resourceKey)?.key ?? "",
    );
  }
  function renameResource(key: string) {
    if (draft.resources.some((r) => r.key === key && r.key !== resourceKey)) {
      fail(new SandboxError("resource"));
      return;
    }
    update({
      ...draft,
      resources: draft.resources.map((r) =>
        r.key === resourceKey ? { ...r, key } : r,
      ),
      routes: draft.routes.map((r) =>
        r.resource === resourceKey ? { ...r, resource: key } : r,
      ),
    });
    setSeedDrafts(
      Object.fromEntries(
        Object.entries(seedDrafts).map(([k, value]) => [
          k === resourceKey ? key : k,
          value,
        ]),
      ),
    );
    setResourceKey(key);
  }
  function removeRoute() {
    setScopeDrafts(
      Object.fromEntries(
        Object.entries(scopeDrafts).filter(([key]) => key !== routeKey),
      ),
    );
    update({
      ...draft,
      routes: draft.routes.filter((r) => r.key !== routeKey),
    });
    setRouteKey(draft.routes.find((r) => r.key !== routeKey)?.key ?? "");
  }
  function addRoute() {
    if (!resource) return;
    const key = uniqueKey(
      "route",
      draft.routes.map((r) => r.key),
    );
    const selected = operations[Number(operation)];
    const routeMethod = operation !== "" && selected ? selected.method : "GET";
    const routePath = operation !== "" && selected ? selected.path : `/${key}`;
    const action = suggestSandboxAction(routeMethod, routePath);
    const idParameter = ["read", "replace", "merge", "delete"].includes(action)
      ? ([...routePath.matchAll(/\{([^}]+)\}/g)].at(-1)?.[1] ?? "")
      : "";
    update({
      ...draft,
      routes: [
        ...draft.routes,
        {
          key,
          method: routeMethod,
          path: routePath,
          resource: resource.key,
          action,
          idParameter,
          scope: {},
        },
      ],
    });
    setRouteKey(key);
  }
  function capture() {
    setFeedback(null);
    try {
      const source = readTransformSource(getSchemaText());
      const endpoints = extractEndpoints(
        source.document as Record<string, unknown>,
      )
        .filter((e) =>
          ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(
            e.method.toUpperCase(),
          ),
        )
        .map((e) => ({ method: e.method.toUpperCase(), path: e.path }));
      if (endpoints.length > 1000) throw new SandboxError("limit");
      setOperations(endpoints);
      setOperation(endpoints.length ? "0" : "");
      setFeedback({ key: "sandbox.captured", error: false });
    } catch {
      setFeedback({ key: "sandbox.error.source", error: true });
    }
  }
  async function importProject(file: File) {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (file.size > MAX_SANDBOX_BYTES) throw new SandboxError("limit");
      const project = parseSandboxProject(await file.text());
      if (generation.current !== token) return;
      activate(project);
      setResourceKey(project.resources[0]?.key ?? "");
      setRouteKey(project.routes[0]?.key ?? "");
      setOperations([]);
      setOperation("");
      const first = project.routes[0];
      setMethod(first?.method ?? "GET");
      setPath(first?.path ?? "/");
      setBody("");
      setFeedback({ key: "sandbox.imported", error: false });
    } catch (error) {
      if (generation.current === token) fail(error);
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }
  function download(kind: "project" | "state" | "log") {
    if (!run || dirty || loading) return;
    setFeedback(null);
    try {
      const text =
        kind === "project"
          ? serializeSandboxProject(run.project)
          : kind === "state"
            ? serializeSandboxState(run.project, run.state)
            : serializeSandboxLog(run.project, history);
      const ok = downloadTextFile(
        text,
        `stateful-sandbox-${kind}.json`,
        "application/json",
      );
      setFeedback({
        key: ok ? "sandbox.downloaded" : "sandbox.error.download",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t("sandbox.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("sandbox.description")}</p>
          <p className="text-xs text-slate-600">{t("sandbox.help")}</p>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-red-700" : "text-emerald-700"}
            >
              {t(feedback.key)}
            </p>
          )}
          {loading && <p role="status">{t("sandbox.loading")}</p>}
          <label className="block text-xs font-bold">
            {t("sandbox.import")}
            <input
              className={inputClass}
              type="file"
              accept=".json,application/json"
              disabled={loading}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) void importProject(file);
              }}
            />
          </label>
          <fieldset disabled={loading} className="min-w-0 space-y-4">
            <legend className="mb-2 font-bold">
              {t("sandbox.configuration")}
            </legend>
            <label className="block text-xs font-bold">
              {t("sandbox.name")}
              <input
                className={inputClass}
                maxLength={100}
                value={draft.name}
                onChange={(e) => update({ ...draft, name: e.target.value })}
              />
            </label>
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3">
                <h3 className="font-bold">{t("sandbox.resources")}</h3>
                <label className="block text-xs font-bold">
                  {t("sandbox.resource")}
                  <select
                    className={inputClass}
                    value={resourceKey}
                    onChange={(e) => setResourceKey(e.target.value)}
                  >
                    {!draft.resources.length && <option value="">—</option>}
                    {draft.resources.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.key}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={draft.resources.length >= MAX_SANDBOX_RESOURCES}
                    onClick={addResource}
                  >
                    {t("sandbox.addResource")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!resource}
                    onClick={removeResource}
                  >
                    {t("sandbox.removeResource")}
                  </button>
                </div>
                {resource && (
                  <>
                    <label className="block text-xs font-bold">
                      {t("sandbox.resourceKey")}
                      <input
                        className={inputClass}
                        maxLength={32}
                        value={resource.key}
                        onChange={(e) => renameResource(e.target.value)}
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      {t("sandbox.idField")}
                      <input
                        className={inputClass}
                        maxLength={100}
                        value={resource.idField}
                        onChange={(e) =>
                          editResource({ idField: e.target.value })
                        }
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      {t("sandbox.idType")}
                      <select
                        className={inputClass}
                        value={resource.idType}
                        onChange={(e) =>
                          editResource({
                            idType: e.target.value as "number" | "string",
                          })
                        }
                      >
                        <option value="number">{t("sandbox.number")}</option>
                        <option value="string">{t("sandbox.string")}</option>
                      </select>
                    </label>
                    <label className="block text-xs font-bold">
                      {t("sandbox.seed")}
                      <textarea
                        className={`${inputClass} font-mono`}
                        rows={8}
                        maxLength={MAX_SANDBOX_BYTES}
                        spellCheck={false}
                        value={
                          Object.hasOwn(seedDrafts, resource.key)
                            ? seedDrafts[resource.key]
                            : json(resource.seed)
                        }
                        onChange={(e) => {
                          setSeedDrafts({
                            ...seedDrafts,
                            [resource.key]: e.target.value,
                          });
                          setDirty(true);
                          setFeedback(null);
                        }}
                      />
                    </label>
                  </>
                )}
                <p className="text-xs text-slate-600">
                  {t("sandbox.seedHelp")}
                </p>
              </section>
              <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3">
                <h3 className="font-bold">{t("sandbox.routes")}</h3>
                <button type="button" className={buttonClass} onClick={capture}>
                  {t("sandbox.capture")}
                </button>
                <label className="block text-xs font-bold">
                  {t("sandbox.operation")}
                  <select
                    className={inputClass}
                    value={operation}
                    onChange={(e) => setOperation(e.target.value)}
                  >
                    <option value="">{t("sandbox.manual")}</option>
                    {operations.map((op, i) => (
                      <option key={i} value={i}>
                        {op.method} {op.path}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-bold">
                  {t("sandbox.route")}
                  <select
                    className={inputClass}
                    value={routeKey}
                    onChange={(e) => setRouteKey(e.target.value)}
                  >
                    {!draft.routes.length && <option value="">—</option>}
                    {draft.routes.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.method} {r.path} · {r.resource}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={
                      !resource || draft.routes.length >= MAX_SANDBOX_ROUTES
                    }
                    onClick={addRoute}
                  >
                    {t("sandbox.addRoute")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!route}
                    onClick={removeRoute}
                  >
                    {t("sandbox.removeRoute")}
                  </button>
                </div>
                {route && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs font-bold">
                        {t("sandbox.routeMethod")}
                        <select
                          className={inputClass}
                          value={route.method}
                          onChange={(e) =>
                            editRoute({ method: e.target.value })
                          }
                        >
                          {[
                            "GET",
                            "HEAD",
                            "POST",
                            "PUT",
                            "PATCH",
                            "DELETE",
                          ].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-bold">
                        {t("sandbox.action")}
                        <select
                          className={inputClass}
                          value={route.action}
                          onChange={(e) => {
                            const action = e.target.value as SandboxAction;
                            const item = [
                              "read",
                              "replace",
                              "merge",
                              "delete",
                            ].includes(action);
                            editRoute({
                              action,
                              idParameter: item
                                ? route.idParameter || "id"
                                : "",
                            });
                          }}
                        >
                          {SANDBOX_ACTIONS.map((a) => (
                            <option key={a} value={a}>
                              {t(`sandbox.action.${a}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block text-xs font-bold">
                      {t("sandbox.routePath")}
                      <input
                        className={inputClass}
                        maxLength={2048}
                        value={route.path}
                        onChange={(e) => editRoute({ path: e.target.value })}
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      {t("sandbox.routeResource")}
                      <select
                        className={inputClass}
                        value={route.resource}
                        onChange={(e) =>
                          editRoute({ resource: e.target.value })
                        }
                      >
                        {draft.resources.map((r) => (
                          <option key={r.key}>{r.key}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-bold">
                      {t("sandbox.idParameter")}
                      <input
                        className={inputClass}
                        maxLength={100}
                        value={route.idParameter}
                        onChange={(e) =>
                          editRoute({ idParameter: e.target.value })
                        }
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      {t("sandbox.scope")}
                      <textarea
                        className={`${inputClass} font-mono`}
                        rows={2}
                        maxLength={10000}
                        spellCheck={false}
                        value={
                          Object.hasOwn(scopeDrafts, route.key)
                            ? scopeDrafts[route.key]
                            : json(route.scope)
                        }
                        onChange={(e) => {
                          setScopeDrafts({
                            ...scopeDrafts,
                            [route.key]: e.target.value,
                          });
                          setDirty(true);
                          setFeedback(null);
                        }}
                      />
                    </label>
                  </>
                )}
                <p className="text-xs text-slate-600">
                  {t("sandbox.routeHelp")}
                </p>
              </section>
            </div>
            {dirty && run && (
              <p role="status" className="text-amber-800">
                {t("sandbox.dirty")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={start}>
                {t("sandbox.start")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!run || !dirty}
                onClick={() => {
                  if (run) {
                    setDraft(run.project);
                    setSeedDrafts({});
                    setScopeDrafts({});
                    setResourceKey(run.project.resources[0]?.key ?? "");
                    setRouteKey(run.project.routes[0]?.key ?? "");
                    setDirty(false);
                    setFeedback(null);
                  }
                }}
              >
                {t("sandbox.discard")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!run || dirty}
                onClick={() => download("project")}
              >
                {t("sandbox.exportProject")}
              </button>
            </div>
          </fieldset>
          {run && (
            <fieldset disabled={loading || dirty} className="min-w-0 space-y-4">
              <legend className="mb-2 font-bold">{t("sandbox.console")}</legend>
              <p className="text-xs text-slate-600">
                {t("sandbox.consoleHelp")}
              </p>
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                <label className="block text-xs font-bold">
                  {t("sandbox.method")}
                  <select
                    className={inputClass}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {[
                      "GET",
                      "HEAD",
                      "POST",
                      "PUT",
                      "PATCH",
                      "DELETE",
                      "OPTIONS",
                    ].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-bold">
                  {t("sandbox.path")}
                  <input
                    className={inputClass}
                    maxLength={4096}
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-xs font-bold">
                {t("sandbox.body")}
                <textarea
                  className={`${inputClass} font-mono`}
                  rows={4}
                  maxLength={MAX_SANDBOX_BYTES}
                  spellCheck={false}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} onClick={execute}>
                  {t("sandbox.send")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!history.length}
                  onClick={undo}
                >
                  {t("sandbox.undo")}
                </button>
                <button type="button" className={buttonClass} onClick={reset}>
                  {t("sandbox.reset")}
                </button>
              </div>
              {latest && (
                <section
                  aria-label={t("sandbox.response")}
                  className="space-y-2"
                >
                  <h3 className="font-bold">
                    {t("sandbox.response")} · {latest.status}
                  </h3>
                  <pre className={previewClass}>
                    {truncateJsonPreview(json(latest.result.response), 16000)}
                  </pre>
                </section>
              )}
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="min-w-0 space-y-3">
                  <h3 className="font-bold">{t("sandbox.state")}</h3>
                  <label className="block text-xs font-bold">
                    {t("sandbox.inspectResource")}
                    <select
                      className={inputClass}
                      value={inspectedResource}
                      onChange={(e) => setInspectedResource(e.target.value)}
                    >
                      {!run.project.resources.length && (
                        <option value="">—</option>
                      )}
                      {run.project.resources.map((r) => (
                        <option key={r.key}>{r.key}</option>
                      ))}
                    </select>
                  </label>
                  <p>
                    {t("sandbox.recordCount", {
                      count: String(
                        run.state.records[inspectedResource]?.length ?? 0,
                      ),
                    })}
                  </p>
                  <pre
                    aria-label={t("sandbox.records")}
                    className={previewClass}
                  >
                    {truncateJsonPreview(
                      json(run.state.records[inspectedResource] ?? []),
                      16000,
                    )}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => download("state")}
                    >
                      {t("sandbox.exportState")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        try {
                          activate(
                            snapshotSandboxProject(run.project, run.state),
                          );
                          setFeedback({
                            key: "sandbox.checkpointed",
                            error: false,
                          });
                        } catch (error) {
                          fail(error);
                        }
                      }}
                    >
                      {t("sandbox.checkpoint")}
                    </button>
                  </div>
                </section>
                <section className="min-w-0 space-y-3">
                  <h3 className="font-bold">{t("sandbox.history")}</h3>
                  <p className="text-xs text-slate-600">
                    {t("sandbox.historyHelp")}
                  </p>
                  {!history.length ? (
                    <p>{t("sandbox.emptyHistory")}</p>
                  ) : (
                    <ol
                      className="max-h-72 space-y-2 overflow-auto"
                      aria-label={t("sandbox.history")}
                    >
                      {[...history].reverse().map((entry) => (
                        <li
                          key={entry.sequence}
                          className="rounded-lg border border-slate-200 p-2 text-xs break-all"
                        >
                          #{entry.sequence} · {entry.method} {entry.path} ·{" "}
                          {entry.status} ·{" "}
                          {t(
                            entry.changed
                              ? "sandbox.changed"
                              : "sandbox.unchanged",
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!history.length}
                    onClick={() => download("log")}
                  >
                    {t("sandbox.exportLog")}
                  </button>
                </section>
              </div>
            </fieldset>
          )}
        </div>
      )}
    </details>
  );
});
