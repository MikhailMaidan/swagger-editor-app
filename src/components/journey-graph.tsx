"use client";
import { memo, useMemo } from "react";
import { useI18n } from "./i18n-provider";
import { analyzeJourneyModel } from "@/lib/journey-engine";
import { journeyGraphLayout } from "@/lib/journey-export";
import type { JourneyModel } from "@/lib/journey-project";
export const JourneyGraph = memo(function JourneyGraph({
  model,
  stateId,
  transitionId,
  activeState,
  coveredTransitions = [],
  disabled,
  onState,
  onTransition,
}: {
  model: JourneyModel;
  stateId: string;
  transitionId: string;
  activeState?: string;
  coveredTransitions?: string[];
  disabled: boolean;
  onState: (id: string) => void;
  onTransition: (id: string) => void;
}) {
  const { t } = useI18n(),
    graph = useMemo(() => journeyGraphLayout(model), [model]),
    reachable = useMemo(
      () => new Set(analyzeJourneyModel(model).reachable),
      [model],
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600">{t("journey.legend")}</p>
      <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200 bg-white">
        <svg
          role="group"
          aria-label={t("journey.graph")}
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          className="min-w-[640px] w-full"
        >
          <title>{model.name}</title>
          <defs>
            <marker
              id="rsswag-journey-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8 Z" fill="#64748b" />
            </marker>
          </defs>
          {graph.edges.map((edge) => (
            <g
              key={edge.id}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled}
              aria-pressed={edge.id === transitionId}
              aria-label={t("journey.selectTransition", { name: edge.name })}
              style={{ cursor: disabled ? "default" : "pointer" }}
              onClick={() => {
                if (!disabled) onTransition(edge.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!disabled) onTransition(edge.id);
                }
              }}
            >
              <title>
                {edge.name}: {edge.action} [{edge.statuses.join(", ")}]
              </title>
              <path
                d={edge.path}
                fill="none"
                stroke={
                  edge.id === transitionId
                    ? "#7c3aed"
                    : coveredTransitions.includes(edge.id)
                      ? "#059669"
                      : "#64748b"
                }
                strokeWidth={edge.id === transitionId ? 3 : 1.5}
                strokeDasharray={edge.enabled ? undefined : "5 4"}
                markerEnd="url(#rsswag-journey-arrow)"
              />
              <text
                x={edge.labelX}
                y={edge.labelY}
                textAnchor="middle"
                fontSize="9"
                fill="#475569"
              >
                {edge.label}
              </text>
            </g>
          ))}
          {graph.states.map((state) => (
            <g
              key={state.id}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled}
              aria-pressed={state.id === stateId}
              aria-label={t("journey.selectState", { name: state.name })}
              style={{ cursor: disabled ? "default" : "pointer" }}
              onClick={() => {
                if (!disabled) onState(state.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!disabled) onState(state.id);
                }
              }}
            >
              <title>
                {state.name} ({state.id})
              </title>
              {state.id === model.initial && (
                <text
                  x={state.x + 70}
                  y={state.y - 8}
                  fontSize="10"
                  textAnchor="middle"
                  fill="#047857"
                >
                  {t("journey.initialMarker")}
                </text>
              )}
              <rect
                x={state.x}
                y={state.y}
                width="140"
                height="64"
                rx="12"
                fill={
                  activeState === state.id
                    ? "#fef3c7"
                    : state.id === model.initial
                      ? "#ecfdf5"
                      : "#f8fafc"
                }
                stroke={state.id === stateId ? "#7c3aed" : "#64748b"}
                strokeWidth={state.id === stateId ? 3 : 1.5}
                strokeDasharray={reachable.has(state.id) ? undefined : "5 4"}
              />
              {state.terminal && (
                <rect
                  x={state.x + 5}
                  y={state.y + 5}
                  width="130"
                  height="54"
                  rx="9"
                  fill="none"
                  stroke="#7c3aed"
                />
              )}
              <text
                x={state.x + 70}
                y={state.y + 29}
                textAnchor="middle"
                fontSize="12"
                fill="#0f172a"
              >
                {Array.from(state.name).slice(0, 20).join("")}
              </text>
              <text
                x={state.x + 70}
                y={state.y + 47}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {state.id.slice(0, 18)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
});
