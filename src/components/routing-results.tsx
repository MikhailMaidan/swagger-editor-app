"use client";
import { useState } from "react";
import { useI18n } from "./i18n-provider";
import { RTButton, RTField, RTSelect } from "./routing-controls";
import { isCancelRequestShortcut } from "@/lib/keyboard-shortcut";
import type { RTProject, RTCase } from "@/lib/routing-model";
import type { RTCaseRun } from "@/lib/routing-engine";

export function RoutingResults({
  project,
  scenario,
  run,
}: {
  project: RTProject;
  scenario: RTCase;
  run: RTCaseRun;
}) {
  const { t } = useI18n(),
    [filter, setFilter] = useState("all"),
    [backendFilter, setBackendFilter] = useState(""),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(run.requests[0].requestId),
    [playhead, setPlayhead] = useState(run.journal.length - 1),
    [page, setPage] = useState(0);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    filtered = run.requests.filter(
      (request) =>
        (!backendFilter || request.backend === backendFilter) &&
        (filter === "all" ||
          (filter === "forwarded"
            ? request.backend !== null
            : filter === "rejected"
              ? request.backend === null
              : filter === "upstream-failed"
                ? request.backend !== null && request.status >= 500
                : request.matched === false)) &&
        words.every((word) =>
          `${request.requestId} ${request.route ?? ""} ${request.backend ?? ""} ${request.status} ${request.reason} ${t(`rt.reason.${request.reason}`)}`
            .toLowerCase()
            .includes(word),
        ),
    );
  const currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(filtered.length / 30) - 1),
    ),
    start = currentPage * 30;
  const decision =
      run.requests.find((request) => request.requestId === selected) ??
      run.requests[0],
    original = scenario.requests.find(
      (request) => request.id === decision.requestId,
    ),
    index = Math.min(playhead, run.journal.length - 1),
    frame = run.journal[index];
  const backendName = (id: string | null) =>
    id
      ? (project.backends.find((backend) => backend.id === id)?.name ?? id)
      : "—";
  function inspect(id: string) {
    setSelected(id);
    const event = run.journal.findIndex(
      (entry) => entry.kind === "dispatch" && entry.request === id,
    );
    if (event >= 0) setPlayhead(event);
  }
  const reset = (action: () => void) => {
    action();
    setPage(0);
  };
  return (
    <section
      aria-label={t("rt.results")}
      className="space-y-4 rounded-xl border border-[color:var(--color-brand-border)] p-4"
    >
      <h3 className="text-sm font-bold">{scenario.name}</h3>
      <p data-testid="rt-replay-summary" className="font-semibold">
        {t("rt.summary", {
          forwarded: String(run.forwarded),
          rejected: String(run.rejected),
          failures: String(run.upstreamFailures),
        })}
      </p>
      <p className="text-xs">
        {t(
          run.matched === null
            ? "rt.unrecorded"
            : run.matched
              ? "rt.matched"
              : "rt.failed",
        )}
      </p>
      <section
        aria-label={t("rt.distribution")}
        className="grid gap-2 sm:grid-cols-3"
      >
        {project.backends.map((backend) => (
          <button
            type="button"
            key={backend.id}
            aria-pressed={backendFilter === backend.id}
            onClick={() =>
              reset(() =>
                setBackendFilter((current) =>
                  current === backend.id ? "" : backend.id,
                ),
              )
            }
            className={`rounded-lg border p-3 text-left text-xs ${
              backendFilter === backend.id
                ? "border-violet-600 bg-violet-50"
                : "border-violet-200"
            }`}
          >
            <span className="block font-bold">
              {backend.name}: {run.backendCounts[backend.id]}
            </span>
            <progress
              aria-label={backend.name}
              max={Math.max(1, run.forwarded)}
              value={run.backendCounts[backend.id]}
              className="mt-2 h-2 w-full accent-violet-600"
            />
          </button>
        ))}
      </section>
      <section
        aria-label={t("rt.timeline")}
        className="space-y-2 rounded-lg bg-slate-50 p-3"
      >
        <h4 className="text-xs font-bold">{t("rt.timeline")}</h4>
        <p className="text-xs">{t("rt.timelineHelp")}</p>
        <label className="block text-xs font-semibold">
          {t("rt.playhead")}
          <input
            type="range"
            min={0}
            max={run.journal.length - 1}
            value={index}
            onChange={(e) => setPlayhead(Number(e.target.value))}
            className="mt-2 block w-full accent-violet-600"
          />
        </label>
        <p className="text-xs">
          {t("rt.event", {
            index: String(index + 1),
            total: String(run.journal.length),
            time: String(frame.atMs),
            kind: t(`rt.event.${frame.kind}`),
          })}
          {frame.request ? ` ${frame.request}` : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="p-2">{t("rt.backendColumn")}</th>
                <th className="p-2">{t("rt.active")}</th>
                <th className="p-2">{t("rt.healthy")}</th>
                <th className="p-2">{t("rt.ejectedUntil")}</th>
              </tr>
            </thead>
            <tbody>
              {frame.states.map((state) => (
                <tr key={state.id} className="border-t border-slate-200">
                  <td className="p-2">{backendName(state.id)}</td>
                  <td className="p-2">{state.active}</td>
                  <td className="p-2">
                    {t(
                      state.healthy && state.ejectedUntil <= frame.atMs
                        ? "rt.yes"
                        : "rt.no",
                    )}
                  </td>
                  <td className="p-2">
                    {state.ejectedUntil > frame.atMs ? state.ejectedUntil : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label={t("rt.requests")} className="space-y-3">
        <h4 className="text-xs font-bold">{t("rt.requests")}</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <div
            onKeyDown={(e) => {
              if (isCancelRequestShortcut(e)) reset(() => setQuery(""));
            }}
          >
            <RTField
              label={t("rt.search")}
              value={query}
              onChange={(value) => reset(() => setQuery(value))}
            />
          </div>
          <RTSelect
            label={t("rt.filter")}
            value={filter}
            onChange={(value) => reset(() => setFilter(value))}
          >
            {(
              [
                "all",
                "forwarded",
                "rejected",
                "upstream-failed",
                "changed",
              ] as const
            ).map((item) => (
              <option key={item} value={item}>
                {t(`rt.${item}`)}
              </option>
            ))}
          </RTSelect>
          <RTSelect
            label={t("rt.filterBackend")}
            value={backendFilter}
            onChange={(value) => reset(() => setBackendFilter(value))}
          >
            <option value="">{t("rt.allBackends")}</option>
            {project.backends.map((backend) => (
              <option key={backend.id} value={backend.id}>
                {backend.name}
              </option>
            ))}
          </RTSelect>
        </div>
        <p className="text-xs">
          {t("rt.page", {
            start: String(filtered.length ? start + 1 : 0),
            end: String(Math.min(start + 30, filtered.length)),
            total: String(filtered.length),
          })}
        </p>
        {!filtered.length ? (
          <p className="text-xs">{t("rt.none")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="p-2">{t("rt.request")}</th>
                  <th className="p-2">{t("rt.time")}</th>
                  <th className="p-2">{t("rt.routeColumn")}</th>
                  <th className="p-2">{t("rt.backendColumn")}</th>
                  <th className="p-2">{t("rt.statusColumn")}</th>
                  <th className="p-2">{t("rt.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(start, start + 30).map((request) => (
                  <tr
                    key={request.requestId}
                    className="border-t border-slate-100"
                  >
                    <td className="p-2">
                      <button
                        type="button"
                        aria-label={t("rt.inspect", { id: request.requestId })}
                        className="text-violet-800 underline"
                        onClick={() => inspect(request.requestId)}
                      >
                        {request.requestId}
                      </button>
                    </td>
                    <td className="p-2">
                      {request.atMs}–{request.completedAtMs}
                    </td>
                    <td className="p-2">{request.route ?? "—"}</td>
                    <td className="p-2">{backendName(request.backend)}</td>
                    <td className="p-2">{request.status}</td>
                    <td className="p-2">{t(`rt.reason.${request.reason}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex gap-2">
          <RTButton
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            {t("rt.previous")}
          </RTButton>
          <RTButton
            disabled={start + 30 >= filtered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            {t("rt.next")}
          </RTButton>
        </div>
      </section>
      <section
        aria-label={t("rt.inspector")}
        className="space-y-3 rounded-lg bg-slate-50 p-3"
      >
        <h4 className="text-xs font-bold">
          {decision.requestId} · {t(`rt.reason.${decision.reason}`)}
        </h4>
        <div className="grid gap-3 lg:grid-cols-2">
          <section aria-label={t("rt.original")}>
            <h5 className="text-xs font-bold">{t("rt.original")}</h5>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(original, null, 2)}
            </pre>
          </section>
          <section aria-label={t("rt.destination")}>
            <h5 className="text-xs font-bold">{t("rt.destination")}</h5>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(
                {
                  url: decision.upstreamUrl,
                  headers: decision.headers,
                  route: decision.route,
                  backend: decision.backend,
                  status: decision.status,
                },
                null,
                2,
              )}
            </pre>
          </section>
        </div>
        <h5 className="text-xs font-bold">{t("rt.audit")}</h5>
        <ol className="space-y-1 text-xs">
          {decision.audit.map((trace) => (
            <li key={trace.route}>
              {trace.route}: {t(`rt.rule.${trace.reason}`)}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
