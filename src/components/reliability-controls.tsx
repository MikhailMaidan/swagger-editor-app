"use client";
import { useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import {
  parseRLJson,
  rlFreshId,
  type RLProject,
  type RLNode,
  type RLCase,
  type RLRoot,
} from "@/lib/reliability-model";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
export function RLButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-violet-600 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
export function RLField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const props = {
    className: inputClass,
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    spellCheck: false,
    autoComplete: "off",
  };
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? <textarea {...props} rows={7} /> : <input {...props} />}
    </label>
  );
}
export function RLSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
export function RLSettings({
  project,
  apply,
}: {
  project: RLProject;
  apply: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState(project.name),
    [hours, setHours] = useState(String(project.windowHours));
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <RLField label={t("rl.projectName")} value={name} onChange={setName} />
      <RLField label={t("rl.window")} value={hours} onChange={setHours} />
      <RLButton
        onClick={() =>
          apply(() => ({
            ...project,
            name,
            windowHours: hours.trim() ? Number(hours) : NaN,
          }))
        }
      >
        {t("rl.applySettings")}
      </RLButton>
    </div>
  );
}
export function RLNodeEditor({
  node,
  apply,
}: {
  node: RLNode;
  apply: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [source, setSource] = useState(JSON.stringify(node, null, 2));
  return (
    <details>
      <summary className="cursor-pointer text-xs font-bold">
        {t("rl.nodeSource")}
      </summary>
      <div className="mt-2 space-y-2">
        <RLField
          label={t("rl.nodeSource")}
          value={source}
          onChange={setSource}
          multiline
        />
        <RLButton onClick={() => apply(() => parseRLJson(source))}>
          {t("rl.applyNode")}
        </RLButton>
      </div>
    </details>
  );
}
export function RLNodeBuilder({
  project,
  append,
}: {
  project: RLProject;
  append: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState("New dependency"),
    [kind, setKind] = useState("event"),
    [probability, setProbability] = useState("0.999"),
    [threshold, setThreshold] = useState("1"),
    [inputs, setInputs] = useState<string[]>(
      project.nodes.slice(0, 2).map((node) => node.id),
    );
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <RLField label={t("rl.nodeName")} value={name} onChange={setName} />
        <RLSelect label={t("rl.nodeKind")} value={kind} onChange={setKind}>
          {(["event", "all", "any", "at-least"] as const).map((item) => (
            <option key={item} value={item}>
              {t(`rl.${item}`)}
            </option>
          ))}
        </RLSelect>
        {kind === "event" ? (
          <RLField
            label={t("rl.probability")}
            value={probability}
            onChange={setProbability}
          />
        ) : kind === "at-least" ? (
          <RLField
            label={t("rl.threshold")}
            value={threshold}
            onChange={setThreshold}
          />
        ) : null}
      </div>
      {kind !== "event" && (
        <fieldset className="grid gap-2 sm:grid-cols-3">
          <legend className="mb-2 text-xs font-bold">{t("rl.inputs")}</legend>
          {project.nodes.map((node) => (
            <label className="text-xs" key={node.id}>
              <input
                type="checkbox"
                aria-label={t("rl.input", { name: node.name })}
                checked={inputs.includes(node.id)}
                onChange={(e) =>
                  setInputs(
                    e.target.checked
                      ? [...inputs, node.id]
                      : inputs.filter((id) => id !== node.id),
                  )
                }
              />{" "}
              {node.name}
            </label>
          ))}
        </fieldset>
      )}
      <RLButton
        disabled={
          project.nodes.length >= 40 ||
          (kind === "event" &&
            project.nodes.filter((n) => n.kind === "event").length >= 16)
        }
        onClick={() =>
          append(() => ({
            id: rlFreshId("node", project.nodes),
            name,
            kind,
            ...(kind === "event"
              ? { probability: probability.trim() ? Number(probability) : NaN }
              : {
                  inputs,
                  ...(kind === "at-least"
                    ? { threshold: threshold.trim() ? Number(threshold) : NaN }
                    : {}),
                }),
          }))
        }
      >
        {t("rl.addNode")}
      </RLButton>
    </div>
  );
}
export function RLCaseEditor({
  scenario,
  apply,
}: {
  scenario: RLCase;
  apply: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState(scenario.name),
    [overrides, setOverrides] = useState(
      JSON.stringify(scenario.overrides, null, 2),
    );
  return (
    <div className="space-y-3">
      <RLField label={t("rl.caseName")} value={name} onChange={setName} />
      <RLField
        label={t("rl.overrides")}
        value={overrides}
        onChange={setOverrides}
        multiline
      />
      <RLButton
        onClick={() =>
          apply(() => ({
            ...scenario,
            name,
            overrides: parseRLJson(overrides),
          }))
        }
      >
        {t("rl.applyCase")}
      </RLButton>
    </div>
  );
}
export function RLRootEditor({
  root,
  apply,
}: {
  root: RLRoot;
  apply: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [target, setTarget] = useState(String(root.minAvailability)),
    [operation, setOperation] = useState(root.operation);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <RLField label={t("rl.target")} value={target} onChange={setTarget} />
      <RLField
        label={t("rl.operation")}
        value={operation}
        onChange={setOperation}
      />
      <RLButton
        onClick={() =>
          apply(() => ({
            ...root,
            operation,
            minAvailability: target.trim() ? Number(target) : NaN,
          }))
        }
      >
        {t("rl.applyOutput")}
      </RLButton>
    </div>
  );
}
