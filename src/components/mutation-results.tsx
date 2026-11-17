"use client";
import { useMemo, useState } from "react";
import { useI18n } from "./i18n-provider";
import { MTButton, MTField, MTSelect } from "./mutation-controls";
import {
  materializeMTMutation,
  mtCheckMatrix,
  type MTFixtureRun,
  type MTMutantRun,
} from "@/lib/mutation-engine";
import type { MTFixture } from "@/lib/mutation-model";
import type { ResponseAssertion } from "@/lib/response-assertions";

export function MTResults({
  fixture,
  run,
  suggestion,
  reduction,
  reduce,
  applyReduction,
  suggest,
  addSuggestion,
  waive,
  unwaive,
  exportResponse,
}: {
  fixture: MTFixture;
  run: MTFixtureRun;
  suggestion: { key: string; rule: ResponseAssertion } | null;
  reduction: string[] | null;
  reduce: () => void;
  applyReduction: () => void;
  suggest: (mutant: MTMutantRun) => void;
  addSuggestion: () => void;
  waive: (mutant: MTMutantRun, reason: string) => void;
  unwaive: (mutant: MTMutantRun) => void;
  exportResponse: (mutant: MTMutantRun) => void;
}) {
  const { t } = useI18n(),
    [filter, setFilter] = useState("survived"),
    [query, setQuery] = useState(""),
    [checkFilter, setCheckFilter] = useState(""),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState("");
  const matrix = useMemo(() => mtCheckMatrix(run), [run]);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = run.mutants.filter(
    (m) =>
      (filter === "all" || m.outcome === filter) &&
      (!checkFilter ||
        m.results[run.checkIds.indexOf(checkFilter)]?.outcome === "fail" ||
        m.results[run.checkIds.indexOf(checkFilter)]?.outcome === "error") &&
      terms.every((term) =>
        `${m.id} ${m.operator} ${m.pointer} ${m.variant}`
          .toLowerCase()
          .includes(term),
      ),
  );
  const currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(filtered.length / 30) - 1),
    ),
    start = currentPage * 30;
  const mutant = run.mutants.find((m) => m.key === selected);
  const changed = mutant
    ? materializeMTMutation(fixture.response, mutant)
    : null;
  const reset = (action: () => void) => {
    action();
    setPage(0);
  };
  return (
    <section
      aria-label={t("mt.results")}
      className="space-y-4 rounded-xl border border-[color:var(--color-brand-border)] p-4"
    >
      <h3 className="text-sm font-bold">{fixture.name}</h3>
      <p className="font-semibold" data-testid="mt-score-summary">
        {run.blocked
          ? t("mt.blocked")
          : run.score === null
            ? t("mt.noScore")
            : t("mt.summary", {
                score: String(run.score),
                killed: String(run.killed),
                survived: String(run.survived),
                inconclusive: String(run.inconclusive),
                waived: String(run.waived),
              })}
      </p>
      <p className="text-xs">
        {t(
          run.matched === null
            ? "mt.budgetMissing"
            : run.matched
              ? "mt.budgetMatched"
              : "mt.budgetFailed",
        )}
      </p>
      {run.truncated && (
        <p className="text-xs text-amber-800">{t("mt.truncated")}</p>
      )}
      {run.diagnostic && (
        <p className="text-xs text-amber-800">
          {t(`mt.diagnostic.${run.diagnostic}`)}
        </p>
      )}
      {run.staleWaivers > 0 && (
        <p className="text-xs">
          {t("mt.staleWaivers", { count: String(run.staleWaivers) })}
        </p>
      )}
      <details open={run.blocked}>
        <summary className="cursor-pointer text-xs font-bold">
          {t("mt.baseline")}
        </summary>
        <ul className="mt-2 space-y-1 text-xs">
          {run.baseline.map((result, index) => (
            <li key={run.checkIds[index]}>
              {fixture.checks.find((c) => c.id === run.checkIds[index])?.rule
                .name || run.checkIds[index]}
              : {result.outcome}
              {result.issue ? ` (${result.issue})` : ""}
            </li>
          ))}
        </ul>
      </details>
      {!run.blocked && (
        <>
          <section aria-label={t("mt.matrix")} className="space-y-2">
            <h4 className="text-xs font-bold">{t("mt.matrix")}</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">{t("mt.check")}</th>
                    <th className="p-2">{t("mt.kills")}</th>
                    <th className="p-2">{t("mt.errors")}</th>
                    <th className="p-2">{t("mt.uniqueKills")}</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="p-2">
                        <button
                          type="button"
                          aria-label={t("mt.inspectCheck", { id: item.id })}
                          className="text-violet-800 underline"
                          onClick={() =>
                            reset(() => {
                              setCheckFilter(item.id);
                              setFilter("all");
                            })
                          }
                        >
                          {fixture.checks.find((c) => c.id === item.id)?.rule
                            .name || item.id}
                        </button>
                      </td>
                      <td className="p-2">
                        <span
                          className="mr-2 inline-block h-2 rounded bg-violet-500"
                          style={{
                            width: `${Math.max(1, (item.kills / Math.max(1, run.mutants.length)) * 80)}px`,
                          }}
                        />
                        {item.kills}
                      </td>
                      <td className="p-2">{item.errors}</td>
                      <td className="p-2">{item.uniqueKills}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MTButton disabled={!run.killed} onClick={reduce}>
              {t("mt.reduce")}
            </MTButton>
            {reduction && (
              <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-xs">
                <p>{t("mt.reduction", { ids: reduction.join(", ") })}</p>
                <p>{t("mt.reductionHelp")}</p>
                <MTButton onClick={applyReduction}>
                  {t("mt.applyReduction")}
                </MTButton>
              </div>
            )}
          </section>
          <section aria-label={t("mt.mutants")} className="space-y-3">
            <h4 className="text-xs font-bold">{t("mt.mutants")}</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div
                onKeyDown={(e) => {
                  if (e.key === "Escape") reset(() => setQuery(""));
                }}
              >
                <MTField
                  label={t("mt.search")}
                  value={query}
                  onChange={(value) => reset(() => setQuery(value))}
                />
              </div>
              <MTSelect
                label={t("mt.filter")}
                value={filter}
                onChange={(value) => reset(() => setFilter(value))}
              >
                {(
                  [
                    "survived",
                    "killed",
                    "inconclusive",
                    "waived",
                    "all",
                  ] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {t(`mt.${value}`)}
                  </option>
                ))}
              </MTSelect>
              <MTSelect
                label={t("mt.checkFilter")}
                value={checkFilter}
                onChange={(value) => reset(() => setCheckFilter(value))}
              >
                <option value="">{t("mt.allChecks")}</option>
                {run.checkIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </MTSelect>
            </div>
            <p className="text-xs">
              {t("mt.page", {
                start: String(filtered.length ? start + 1 : 0),
                end: String(Math.min(start + 30, filtered.length)),
                total: String(filtered.length),
              })}
            </p>
            {!filtered.length ? (
              <p className="text-xs">{t("mt.noMutants")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th className="p-2">{t("mt.mutation")}</th>
                      <th className="p-2">{t("mt.path")}</th>
                      <th className="p-2">{t("mt.outcome")}</th>
                      <th className="p-2">{t("mt.kills")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(start, start + 30).map((m) => (
                      <tr
                        key={m.key}
                        className={`border-t border-slate-100 ${m.outcome === "survived" ? "bg-amber-50/60" : ""}`}
                      >
                        <td className="p-2">
                          <button
                            type="button"
                            aria-label={t("mt.inspectMutant", { id: m.id })}
                            onClick={() => setSelected(m.key)}
                            className="text-violet-800 underline"
                          >
                            {m.id} · {t(`mt.op.${m.operator}`)}
                          </button>
                        </td>
                        <td className="p-2 font-mono">
                          {m.pointer || "/"}
                          {m.variant ? ` (${m.variant})` : ""}
                        </td>
                        <td className="p-2">{t(`mt.${m.outcome}`)}</td>
                        <td className="p-2">{m.killedBy.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex gap-2">
              <MTButton
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                {t("mt.previous")}
              </MTButton>
              <MTButton
                disabled={start + 30 >= filtered.length}
                onClick={() => setPage(currentPage + 1)}
              >
                {t("mt.next")}
              </MTButton>
            </div>
          </section>
          <section
            aria-label={t("mt.inspector")}
            className="space-y-3 rounded-lg bg-slate-50 p-3"
          >
            <h4 className="text-xs font-bold">{t("mt.inspector")}</h4>
            {!mutant || !changed ? (
              <p className="text-xs">{t("mt.chooseMutant")}</p>
            ) : (
              <>
                <p className="text-xs font-semibold">
                  {t(`mt.op.${mutant.operator}`)} · {mutant.pointer || "/"} ·{" "}
                  {t(`mt.${mutant.outcome}`)}
                </p>
                <div className="grid gap-3 lg:grid-cols-2">
                  {(
                    [
                      ["mt.original", fixture.response],
                      ["mt.changed", changed],
                    ] as const
                  ).map(([label, response]) => (
                    <section key={label} aria-label={t(label)}>
                      <h5 className="text-xs font-bold">{t(label)}</h5>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                        {JSON.stringify(
                          {
                            status: response.status,
                            durationMs: response.durationMs,
                            headers: response.headers,
                          },
                          null,
                          2,
                        )}
                        {"\n"}
                        {response.body}
                      </pre>
                    </section>
                  ))}
                </div>
                <ul className="space-y-1 text-xs">
                  {mutant.results.map((result, i) => (
                    <li key={run.checkIds[i]}>
                      {run.checkIds[i]}: {result.outcome}
                      {result.issue ? ` (${result.issue})` : ""}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <MTButton onClick={() => suggest(mutant)}>
                    {t("mt.suggest")}
                  </MTButton>
                  <MTButton onClick={() => exportResponse(mutant)}>
                    {t("mt.exportResponse")}
                  </MTButton>
                </div>
                {suggestion?.key === mutant.key && (
                  <div className="space-y-2 rounded-lg border border-violet-200 p-3">
                    <h5 className="text-xs font-bold">{t("mt.suggestion")}</h5>
                    <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
                      {JSON.stringify(suggestion.rule, null, 2)}
                    </pre>
                    <p className="text-xs">{t("mt.suggestionHelp")}</p>
                    <MTButton onClick={addSuggestion}>
                      {t("mt.addSuggestion")}
                    </MTButton>
                  </div>
                )}
                <MTWaiverEditor
                  key={mutant.key}
                  mutant={mutant}
                  waive={waive}
                  unwaive={unwaive}
                />
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}
function MTWaiverEditor({
  mutant,
  waive,
  unwaive,
}: {
  mutant: MTMutantRun;
  waive: (mutant: MTMutantRun, reason: string) => void;
  unwaive: (mutant: MTMutantRun) => void;
}) {
  const { t } = useI18n(),
    [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-xs">{t("mt.waiverHelp")}</p>
      {mutant.waiver ? (
        <>
          <p className="text-xs">{mutant.waiver}</p>
          <MTButton onClick={() => unwaive(mutant)}>{t("mt.unwaive")}</MTButton>
        </>
      ) : (
        <>
          <MTField
            label={t("mt.waiverReason")}
            value={reason}
            onChange={setReason}
          />
          <MTButton onClick={() => waive(mutant, reason)}>
            {t("mt.waive")}
          </MTButton>
        </>
      )}
    </div>
  );
}
