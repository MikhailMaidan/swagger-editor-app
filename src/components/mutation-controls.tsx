"use client";
import { useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import {
  ASSERTION_OPERATORS,
  type ResponseAssertion,
  type AssertionTarget,
} from "@/lib/response-assertions";
import { parseMTJson, type MTFixture } from "@/lib/mutation-model";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
export function MTButton({
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
export function MTField({
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
      {multiline ? <textarea {...props} rows={7} /> : <input {...props} />}
    </label>
  );
}
export function MTSelect({
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
export function MTFixtureEditor({
  fixture,
  apply,
}: {
  fixture: MTFixture;
  apply: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState(fixture.name),
    [status, setStatus] = useState(fixture.response.status),
    [duration, setDuration] = useState(String(fixture.response.durationMs)),
    [body, setBody] = useState(fixture.response.body),
    [headers, setHeaders] = useState(
      JSON.stringify(fixture.response.headers, null, 2),
    ),
    [scope, setScope] = useState(fixture.scope);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MTField label={t("mt.fixtureName")} value={name} onChange={setName} />
        <MTField label={t("mt.status")} value={status} onChange={setStatus} />
        <MTField
          label={t("mt.duration")}
          value={duration}
          onChange={setDuration}
        />
        <MTField label={t("mt.scope")} value={scope} onChange={setScope} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <MTField
          label={t("mt.headers")}
          value={headers}
          onChange={setHeaders}
          multiline
        />
        <MTField
          label={t("mt.body")}
          value={body}
          onChange={setBody}
          multiline
        />
      </div>
      <MTButton
        onClick={() =>
          apply(() => ({
            ...fixture,
            name,
            scope,
            response: {
              ...fixture.response,
              status,
              durationMs: duration.trim() ? Number(duration) : NaN,
              body,
              headers: parseMTJson(headers),
            },
          }))
        }
      >
        {t("mt.applyFixture")}
      </MTButton>
    </div>
  );
}
export function MTCheckBuilder({
  append,
}: {
  append: (rule: ResponseAssertion) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState("New assertion"),
    [target, setTarget] = useState<AssertionTarget>("body"),
    [operator, setOperator] = useState<ResponseAssertion["operator"]>("exists"),
    [path, setPath] = useState("/id"),
    [expected, setExpected] = useState("");
  function chooseTarget(value: string) {
    const next = value as AssertionTarget;
    setTarget(next);
    setOperator(ASSERTION_OPERATORS[next][0]);
    setPath(next === "body" ? "/id" : next === "header" ? "content-type" : "");
    setExpected(next === "status" ? "200" : next === "duration" ? "1000" : "");
  }
  return (
    <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
      <MTField label={t("mt.checkName")} value={name} onChange={setName} />
      <MTSelect label={t("mt.target")} value={target} onChange={chooseTarget}>
        {Object.keys(ASSERTION_OPERATORS).map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </MTSelect>
      <MTSelect
        label={t("mt.operator")}
        value={operator}
        onChange={(v) => setOperator(v as ResponseAssertion["operator"])}
      >
        {ASSERTION_OPERATORS[target].map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </MTSelect>
      {(target === "body" || target === "header") && (
        <MTField label={t("mt.path")} value={path} onChange={setPath} />
      )}
      {operator !== "exists" && operator !== "absent" && (
        <MTField
          label={t("mt.expected")}
          value={expected}
          onChange={setExpected}
        />
      )}
      <MTButton
        onClick={() => append({ name, target, operator, path, expected })}
      >
        {t("mt.addCheck")}
      </MTButton>
    </div>
  );
}
