"use client";
import { useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import {
  CTError,
  CT_LIMITS,
  ctFreshId,
  parseCTJson,
  type CTProject,
  type CTVariable,
  type CTConstraint,
  type CTCondition,
  type CTScalar,
} from "@/lib/combinatorial-model";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
export function CTButton({
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
export function CTField({
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
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    className: inputClass,
    spellCheck: false,
    autoComplete: "off",
  };
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? <textarea {...props} rows={8} /> : <input {...props} />}
    </label>
  );
}
export function CTSelect({
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
export function CTVariableBuilder({
  project,
  append,
}: {
  project: CTProject;
  append: (build: () => CTVariable) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState("New input"),
    [values, setValues] = useState("[false,true]"),
    [omit, setOmit] = useState(false);
  return (
    <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
      <CTField label={t("ct.variableName")} value={name} onChange={setName} />
      <CTField label={t("ct.values")} value={values} onChange={setValues} />
      <label className="text-xs">
        <input
          type="checkbox"
          checked={omit}
          onChange={(e) => setOmit(e.target.checked)}
        />{" "}
        {t("ct.allowOmit")}
      </label>
      <CTButton
        disabled={project.variables.length >= 12}
        onClick={() =>
          append(() => {
            const raw = parseCTJson(values);
            if (!Array.isArray(raw)) throw new CTError("project");
            if (raw.length > CT_LIMITS.choices - Number(omit))
              throw new CTError("limit");
            if (
              raw.some(
                (value) =>
                  value !== null &&
                  !["string", "number", "boolean"].includes(typeof value),
              )
            )
              throw new CTError("project");
            return {
              id: ctFreshId("input", project.variables),
              name,
              location: "custom",
              choices: [
                ...(omit
                  ? [{ id: "absent", label: "Omitted", kind: "omit" as const }]
                  : []),
                ...raw.map((value, i) => ({
                  id: `value-${i + 1}`,
                  label: JSON.stringify(value).slice(0, 150),
                  kind: "value" as const,
                  value: value as CTScalar,
                })),
              ],
            };
          })
        }
      >
        {t("ct.addVariable")}
      </CTButton>
    </div>
  );
}
export function CTConstraintBuilder({
  project,
  append,
}: {
  project: CTProject;
  append: (build: () => CTConstraint) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState("New constraint"),
    [mode, setMode] = useState("forbid");
  const [left, setLeft] = useState(project.variables[0].id),
    [right, setRight] = useState(
      project.variables[1]?.id ?? project.variables[0].id,
    );
  const first =
      project.variables.find((v) => v.id === left) ?? project.variables[0],
    second =
      project.variables.find((v) => v.id === right) ?? project.variables[0];
  const [a, setA] = useState(first.choices[0].id),
    [b, setB] = useState(second.choices[0].id);
  const firstChoice = first.choices.some((c) => c.id === a)
      ? a
      : first.choices[0].id,
    secondChoice = second.choices.some((c) => c.id === b)
      ? b
      : second.choices[0].id;
  return (
    <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
      <CTField label={t("ct.constraintName")} value={name} onChange={setName} />
      <CTSelect label={t("ct.constraintMode")} value={mode} onChange={setMode}>
        <option value="forbid">{t("ct.forbid")}</option>
        <option value="require">{t("ct.require")}</option>
      </CTSelect>
      <CTSelect
        label={t("ct.firstVariable")}
        value={first.id}
        onChange={setLeft}
      >
        {project.variables.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </CTSelect>
      <CTSelect label={t("ct.firstChoice")} value={firstChoice} onChange={setA}>
        {first.choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </CTSelect>
      <CTSelect
        label={t("ct.secondVariable")}
        value={second.id}
        onChange={setRight}
      >
        {project.variables.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </CTSelect>
      <CTSelect
        label={t("ct.secondChoice")}
        value={secondChoice}
        onChange={setB}
      >
        {second.choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </CTSelect>
      <CTButton
        disabled={project.constraints.length >= 32}
        onClick={() =>
          append(() => {
            const x: CTCondition = {
                op: "is",
                variable: first.id,
                choice: firstChoice,
              },
              y: CTCondition = {
                op: "is",
                variable: second.id,
                choice: secondChoice,
              };
            return {
              id: ctFreshId("rule", project.constraints),
              name,
              condition:
                mode === "forbid"
                  ? { op: "not", arg: { op: "all", args: [x, y] } }
                  : { op: "implies", if: x, then: y },
            };
          })
        }
      >
        {t("ct.addConstraint")}
      </CTButton>
    </div>
  );
}
