"use client";
import { useMemo, useState } from "react";
import { useI18n } from "./i18n-provider";
import { DQAction, DQField, dqPretty } from "./data-query-controls";
import type { DQRecord } from "@/lib/data-query-model";
import type { DQLineage, DQPlan } from "@/lib/data-query-engine";
export function DataQueryGrid({
  rows,
  lineage,
}: {
  rows: DQRecord[];
  lineage?: DQLineage[];
}) {
  const { t } = useI18n();
  const fields = useMemo(
    () =>
      Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(
        0,
        128,
      ),
    [rows],
  );
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [columns, setColumns] = useState<string[] | null>(null),
    [selected, setSelected] = useState<number | null>(null);
  const matches = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .filter(
          ({ row }) =>
            !search ||
            JSON.stringify(row).toLowerCase().includes(search.toLowerCase()),
        ),
    [rows, search],
  );
  const visible = (columns ?? fields.slice(0, 8)).filter((c) =>
      fields.includes(c),
    ),
    pages = Math.max(1, Math.ceil(matches.length / 25)),
    current = Math.min(page, pages - 1);
  return (
    <div className="space-y-3">
      <div
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setSearch("");
            setPage(0);
          }
        }}
      >
        <DQField
          label={t("dataQuery.search")}
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
        />
      </div>
      <details>
        <summary className="cursor-pointer text-xs font-bold">
          {t("dataQuery.visible")}
        </summary>
        <div className="flex flex-wrap gap-3 p-2">
          {fields.map((field) => (
            <label key={field} className="text-xs">
              <input
                type="checkbox"
                checked={visible.includes(field)}
                disabled={!visible.includes(field) && visible.length >= 16}
                onChange={(e) =>
                  setColumns(
                    e.target.checked
                      ? [...visible, field]
                      : visible.filter((c) => c !== field),
                  )
                }
              />{" "}
              {field}
            </label>
          ))}
        </div>
      </details>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              <th>#</th>
              {visible.map((field) => (
                <th className="p-2" key={field}>
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matches
              .slice(current * 25, current * 25 + 25)
              .map(({ row, index }) => (
                <tr key={index} className="border-t border-slate-200">
                  <td className="p-2">
                    <button
                      type="button"
                      className="font-bold text-violet-700 underline"
                      aria-label={t("dataQuery.row", { index: String(index) })}
                      onClick={() => setSelected(index)}
                    >
                      {index}
                    </button>
                  </td>
                  {visible.map((field) => (
                    <td
                      className="max-w-64 break-all p-2 font-mono"
                      key={field}
                    >
                      {Object.hasOwn(row, field)
                        ? JSON.stringify(row[field]).slice(0, 240)
                        : "∅"}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs">
        {t("dataQuery.page", {
          page: String(current + 1),
          total: String(pages),
          count: String(matches.length),
        })}
      </p>
      <div className="flex gap-2">
        <DQAction disabled={current === 0} onClick={() => setPage(current - 1)}>
          {t("dataQuery.previous")}
        </DQAction>
        <DQAction
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          {t("dataQuery.next")}
        </DQAction>
      </div>
      {selected !== null && rows[selected] && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-bold">{t("dataQuery.rowJson")}</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">
            {dqPretty(rows[selected])}
          </pre>
          {lineage?.[selected] && (
            <>
              <p className="text-xs font-bold">{t("dataQuery.lineage")}</p>
              <ul className="text-xs">
                {lineage[selected].sources.map((s) => (
                  <li key={`${s.datasetId}:${s.row}`}>
                    {s.datasetId}[{s.row}]
                  </li>
                ))}
              </ul>
              {lineage[selected].truncated && (
                <p className="text-xs">{t("dataQuery.truncated")}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
export function DataQueryPlan({ plan }: { plan: DQPlan[] }) {
  const { t } = useI18n(),
    max = Math.max(1, ...plan.map((p) => Math.max(p.input, p.output)));
  return (
    <details open>
      <summary className="cursor-pointer text-xs font-bold">
        {t("dataQuery.plan")}
      </summary>
      <ol className="space-y-2 py-3">
        {plan.map((p, i) => (
          <li
            key={i}
            className="grid grid-cols-[minmax(120px,1fr)_2fr] gap-3 text-xs"
          >
            <span className="break-all">
              {p.queryId} · {p.step}: {p.op}
              <br />
              {p.input} → {p.output} · work: {p.work}
              {p.lookups !== undefined
                ? ` · lookups: ${p.lookups} · matches: ${p.matches}`
                : ""}
            </span>
            <span className="self-center bg-slate-100">
              <span
                className="block min-h-2 bg-violet-500"
                style={{ width: `${(100 * p.output) / max}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
