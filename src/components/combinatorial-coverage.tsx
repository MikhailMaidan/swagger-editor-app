"use client";
import { useMemo, useState } from "react";
import { useI18n } from "./i18n-provider";
import { CTButton, CTSelect } from "./combinatorial-controls";
import type { CTSpace, CTAudit } from "@/lib/combinatorial-engine";
import type { CTRow } from "@/lib/combinatorial-model";

export function CTCoverage({
  space,
  audit,
  rows,
  inspect,
}: {
  space: CTSpace;
  audit: CTAudit;
  rows: CTRow[];
  inspect: (id: string) => void;
}) {
  const { t } = useI18n(),
    [filter, setFilter] = useState("missing"),
    [group, setGroup] = useState(""),
    [page, setPage] = useState(0);
  const covered = useMemo(() => new Set(audit.covered), [audit.covered]);
  const validRows = rows.filter(
    (row) => audit.rows.find((r) => r.id === row.id)?.valid,
  );
  const groups = useMemo(() => {
    const result = new Map<
      string,
      { name: string; feasible: number; covered: number; excluded: number }
    >();
    for (const tuple of space.tuples) {
      const key = tuple.terms.map((term) => term.variable).join("|"),
        current = result.get(key) ?? {
          name: tuple.terms
            .map(
              (term) =>
                space.project.variables.find((v) => v.id === term.variable)!
                  .name,
            )
            .join(" × "),
          feasible: 0,
          covered: 0,
          excluded: 0,
        };
      if (tuple.feasible) {
        current.feasible++;
        if (covered.has(tuple.id)) current.covered++;
      } else current.excluded++;
      result.set(key, current);
    }
    return [...result.entries()];
  }, [space, covered]);
  const filtered = space.tuples.filter(
    (tuple) =>
      (!group ||
        tuple.terms.map((term) => term.variable).join("|") === group) &&
      (filter === "all" ||
        (filter === "infeasible"
          ? !tuple.feasible
          : tuple.feasible &&
            (filter === "covered"
              ? covered.has(tuple.id)
              : !covered.has(tuple.id)))),
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / 30) - 1),
    currentPage = Math.min(page, lastPage),
    start = currentPage * 30;
  const change = (set: (value: string) => void, value: string) => {
    set(value);
    setPage(0);
  };
  return (
    <section aria-label={t("ct.interactions")} className="space-y-3">
      <h3 className="text-sm font-bold">{t("ct.interactions")}</h3>
      <details>
        <summary className="cursor-pointer text-xs font-bold">
          {t("ct.coverageMap")}
        </summary>
        <div className="mt-3 grid max-h-72 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(([key, info]) => (
            <button
              type="button"
              key={key}
              aria-label={t("ct.focusGroup", { name: info.name })}
              onClick={() => change(setGroup, key)}
              className="rounded-lg border border-slate-200 p-3 text-left text-xs hover:border-violet-500"
            >
              <span className="block font-semibold">{info.name}</span>
              <progress
                aria-label={info.name}
                max={info.feasible || 1}
                value={info.covered}
                className="mt-2 h-2 w-full accent-violet-600"
              />
              <span className="block">
                {info.covered}/{info.feasible} · {t("ct.infeasible")}:{" "}
                {info.excluded}
              </span>
            </button>
          ))}
        </div>
      </details>
      <div className="grid gap-3 sm:grid-cols-2">
        <CTSelect
          label={t("ct.group")}
          value={group}
          onChange={(v) => change(setGroup, v)}
        >
          <option value="">{t("ct.allGroups")}</option>
          {groups.map(([key, info]) => (
            <option key={key} value={key}>
              {info.name}
            </option>
          ))}
        </CTSelect>
        <CTSelect
          label={t("ct.filter")}
          value={filter}
          onChange={(v) => change(setFilter, v)}
        >
          {(["missing", "covered", "infeasible", "all"] as const).map((f) => (
            <option key={f} value={f}>
              {t(`ct.${f}`)}
            </option>
          ))}
        </CTSelect>
      </div>
      <p className="text-xs">
        {t("ct.page", {
          start: String(filtered.length ? start + 1 : 0),
          end: String(Math.min(start + 30, filtered.length)),
          total: String(filtered.length),
        })}
      </p>
      {!filtered.length ? (
        <p className="text-xs">{t("ct.noInteractions")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="p-2">{t("ct.interaction")}</th>
                <th className="p-2">{t("ct.validation")}</th>
                <th className="p-2">{t("ct.coveringCases")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(start, start + 30).map((tuple) => (
                <tr key={tuple.id} className="border-t border-slate-100">
                  <td className="p-2">
                    {tuple.terms
                      .map((term) => {
                        const variable = space.project.variables.find(
                          (v) => v.id === term.variable,
                        )!;
                        return `${variable.name}: ${variable.choices.find((c) => c.id === term.choice)!.label}`;
                      })
                      .join(" · ")}
                  </td>
                  <td className="p-2">
                    {t(
                      !tuple.feasible
                        ? "ct.infeasible"
                        : covered.has(tuple.id)
                          ? "ct.covered"
                          : "ct.missing",
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {validRows
                        .filter((row) =>
                          tuple.terms.every(
                            (term) =>
                              row.choices[term.variable] === term.choice,
                          ),
                        )
                        .map((row) => (
                          <button
                            type="button"
                            className="rounded bg-violet-50 px-2 py-1 text-violet-800 underline"
                            key={row.id}
                            onClick={() => inspect(row.id)}
                          >
                            {row.id}
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-2">
        <CTButton
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          {t("ct.previous")}
        </CTButton>
        <CTButton
          disabled={currentPage >= lastPage}
          onClick={() => setPage(currentPage + 1)}
        >
          {t("ct.next")}
        </CTButton>
      </div>
    </section>
  );
}
