"use client";
import { useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import {
  parseDtJson,
  type DTDecision,
  type DTProject,
} from "@/lib/decision-model";
export const dtPretty = (value: unknown) => JSON.stringify(value, null, 2);
const cls =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
export function DTAction({
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
export function DTField({
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
    className: cls,
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
export function DTSelect({
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
        className={cls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
export function DTJsonEdit({
  label,
  value,
  applyLabel,
  apply,
}: {
  label: string;
  value: unknown;
  applyLabel: string;
  apply: (text: string) => void;
}) {
  const [text, setText] = useState(() => dtPretty(value));
  return (
    <div className="space-y-2">
      <DTField label={label} value={text} onChange={setText} multiline />
      <DTAction onClick={() => apply(text)}>{applyLabel}</DTAction>
    </div>
  );
}
export const dtFreshId = (prefix: string, values: { id: string }[]) => {
  let next = 1;
  while (values.some((v) => v.id === `${prefix}-${next}`)) next++;
  return `${prefix}-${next}`;
};
export function DTRuleBuilder({
  decision,
  append,
}: {
  decision: DTDecision;
  append: (make: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState("New rule"),
    [when, setWhen] = useState(
      dtPretty(decision.columns.map(() => ({ op: "any" }))),
    ),
    [output, setOutput] = useState('{"op":"literal","value":null}');
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 p-3">
      <DTField label={t("decision.ruleName")} value={name} onChange={setName} />
      <DTField
        label={t("decision.when")}
        value={when}
        onChange={setWhen}
        multiline
      />
      <DTField
        label={t("decision.outputExpr")}
        value={output}
        onChange={setOutput}
        multiline
      />
      <DTAction
        disabled={decision.rules.length >= 24}
        onClick={() =>
          append(() => ({
            id: dtFreshId("rule", decision.rules),
            name,
            when: parseDtJson(when),
            output: parseDtJson(output),
          }))
        }
      >
        {t("decision.addRule")}
      </DTAction>
    </div>
  );
}
export function DTColumnBuilder({
  project,
  append,
}: {
  project: DTProject;
  append: (make: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState("New column"),
    [source, setSource] = useState(
      project.inputs[0]
        ? `input:${project.inputs[0].id}`
        : project.decisions[0]
          ? `decision:${project.decisions[0].id}`
          : "",
    ),
    [pointer, setPointer] = useState("");
  return (
    <div className="space-y-3">
      <DTField
        label={t("decision.columnName")}
        value={name}
        onChange={setName}
      />
      <DTSelect
        label={t("decision.columnSource")}
        value={source}
        onChange={setSource}
      >
        {project.inputs.map((i) => (
          <option key={`i-${i.id}`} value={`input:${i.id}`}>
            {i.name} (input:{i.id})
          </option>
        ))}
        {project.decisions.map((d) => (
          <option key={`d-${d.id}`} value={`decision:${d.id}`}>
            {d.name} (decision:{d.id})
          </option>
        ))}
      </DTSelect>
      {source.startsWith("decision:") && (
        <DTField
          label={t("decision.columnPointer")}
          value={pointer}
          onChange={setPointer}
        />
      )}
      <DTAction
        disabled={!source}
        onClick={() =>
          append(() => {
            const index = source.indexOf(":"),
              kind = source.slice(0, index),
              id = source.slice(index + 1);
            return {
              name,
              source: kind === "input" ? { kind, id } : { kind, id, pointer },
            };
          })
        }
      >
        {t("decision.addColumn")}
      </DTAction>
    </div>
  );
}
