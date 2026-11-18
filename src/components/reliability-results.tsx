"use client";
import { useI18n } from "./i18n-provider";
import type { RLAnalysis, RLRootResult } from "@/lib/reliability-engine";
import type { RLProject } from "@/lib/reliability-model";

export const rlPercent = (value: number) =>
  `${Number((value * 100).toPrecision(9))}%`;
const scientific = (value: number) => Number(value.toPrecision(8)).toString();
export function ReliabilityResults({
  project,
  baseline,
  analysis,
  rootId,
  showCut,
}: {
  project: RLProject;
  baseline: RLAnalysis;
  analysis: RLAnalysis;
  rootId: string;
  showCut: (events: string[]) => void;
}) {
  const { t } = useI18n(),
    root = analysis.roots.find((r) => r.node === rootId)!,
    reference = baseline.roots.find((r) => r.node === rootId)!;
  const name = (id: string) =>
    project.nodes.find((node) => node.id === id)?.name ?? id;
  const details = (value: RLRootResult) => (
    <>
      <td className="p-2">{rlPercent(value.availability)}</td>
      <td className="p-2 font-mono">{scientific(value.unavailability)}</td>
      <td className="p-2">{scientific(value.expectedDowntimeSeconds)}</td>
      <td className="p-2">
        {t(value.meetsTarget ? "rl.targetMet" : "rl.targetMissed")}
      </td>
    </>
  );
  return (
    <section
      aria-label={t("rl.results")}
      className="space-y-4 rounded-xl border border-[color:var(--color-brand-border)] p-4"
    >
      <h3 className="text-sm font-bold">
        {name(root.node)}
        {root.operation ? ` · ${root.operation}` : ""}
      </h3>
      <p className="text-xs">
        {t("rl.states", { count: String(analysis.states) })}
      </p>
      <p className="text-xs text-slate-600">{t("rl.probabilityHelp")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              <th className="p-2">{t("rl.scenario")}</th>
              <th className="p-2">{t("rl.availability")}</th>
              <th className="p-2">{t("rl.unavailability")}</th>
              <th className="p-2">{t("rl.downtime")}</th>
              <th className="p-2">{t("rl.target")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100">
              <th className="p-2">{t("rl.baseline")}</th>
              {details(reference)}
            </tr>
            <tr
              className="border-t border-slate-100"
              data-testid="rl-scenario-summary"
            >
              <th className="p-2">
                {
                  project.cases.find(
                    (scenario) => scenario.id === analysis.caseId,
                  )?.name
                }
              </th>
              {details(root)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs font-semibold">
        {t(
          analysis.matched === null
            ? "rl.expectMissing"
            : analysis.matched
              ? "rl.expectMatched"
              : "rl.expectFailed",
        )}
      </p>
      <section aria-label={t("rl.importance")} className="space-y-2">
        <h4 className="text-xs font-bold">{t("rl.importance")}</h4>
        <p className="text-xs text-slate-600">{t("rl.importanceHelp")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="p-2">{t("rl.component")}</th>
                <th className="p-2">{t("rl.probability")}</th>
                <th className="p-2">{t("rl.conditionalHealthy")}</th>
                <th className="p-2">{t("rl.conditionalFailed")}</th>
                <th className="p-2">{t("rl.gain")}</th>
              </tr>
            </thead>
            <tbody>
              {root.importance.map((item) => (
                <tr key={item.event} className="border-t border-slate-100">
                  <td className="p-2 font-semibold">
                    {name(item.event)}
                    {item.overridden ? " *" : ""}
                  </td>
                  <td className="p-2">{scientific(item.probability)}</td>
                  <td className="p-2">{rlPercent(item.whenHealthy)}</td>
                  <td className="p-2">{rlPercent(item.whenFailed)}</td>
                  <td className="p-2 font-mono">
                    {scientific(item.gainIfPerfect)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label={t("rl.cuts")} className="space-y-2">
        <h4 className="text-xs font-bold">{t("rl.cuts")}</h4>
        <p className="text-xs text-slate-600">{t("rl.cutHelp")}</p>
        <p className="text-xs">
          {t("rl.cutCount", {
            count: String(root.cutsetCount),
            shown: String(root.cutsets.length),
          })}
        </p>
        {root.cutsetsTruncated && (
          <p className="text-xs text-amber-800">{t("rl.setLimit")}</p>
        )}
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="p-2">{t("rl.cuts")}</th>
                <th className="p-2">{t("rl.joint")}</th>
              </tr>
            </thead>
            <tbody>
              {root.cutsets.map((cut, index) => (
                <tr
                  key={cut.events.join("|")}
                  className="border-t border-slate-100"
                >
                  <td className="p-2">
                    <button
                      type="button"
                      className="text-left text-violet-800 underline"
                      aria-label={t("rl.inspectCut", {
                        index: String(index + 1),
                      })}
                      onClick={() => showCut(cut.events)}
                    >
                      {cut.events.map(name).join(" + ")}
                    </button>
                  </td>
                  <td className="p-2 font-mono">
                    {scientific(cut.jointProbability)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
