"use client";
import { useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import {
  lcMethods,
  parseLcJson,
  type LCProject,
  type LCHistory,
  type LCObject,
  type LCOperation,
} from "@/lib/consistency-model";
export const lcPretty = (v: unknown) => JSON.stringify(v, null, 2);
const cls =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
export function LCAction({
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
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-violet-600 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
export function LCField({
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
export function LCSelect({
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
export function LCJsonEdit({
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
  const [text, setText] = useState(() => lcPretty(value));
  return (
    <div className="space-y-2">
      <LCField label={label} value={text} onChange={setText} multiline />
      <LCAction onClick={() => apply(text)}>{applyLabel}</LCAction>
    </div>
  );
}
export const lcFreshId = (prefix: string, values: { id: string }[]) => {
  let n = 1;
  while (values.some((v) => v.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};
const initialOutput = (object: LCObject, method: LCOperation["method"]) =>
  method === "cas"
    ? true
    : method === "write" || method === "enqueue"
      ? null
      : method === "add"
        ? Number(object.initial) + 1
        : object.kind === "queue"
          ? {
              found: object.initial.length > 0,
              value: object.initial[0] ?? null,
            }
          : object.initial;
const initialInput = (object: LCObject, method: LCOperation["method"]) =>
  method === "cas"
    ? { expected: object.initial, value: 1 }
    : method === "write" || method === "add"
      ? 1
      : method === "enqueue"
        ? "item"
        : null;
export function LCOperationBuilder({
  project,
  history,
  append,
}: {
  project: LCProject;
  history: LCHistory;
  append: (make: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [objectId, setObjectId] = useState(project.objects[0].id),
    [method, setMethod] = useState<LCOperation["method"]>(
      lcMethods(project.objects[0].kind)[0],
    ),
    [client, setClient] = useState(`client-${history.operations.length + 1}`),
    [start, setStart] = useState(
      String(
        history.operations.length
          ? Math.max(...history.operations.map((op) => op.end ?? op.start)) + 1
          : 0,
      ),
    ),
    [end, setEnd] = useState(
      String(
        history.operations.length
          ? Math.max(...history.operations.map((op) => op.end ?? op.start)) + 2
          : 1,
      ),
    ),
    [pending, setPending] = useState(false),
    [input, setInput] = useState(
      lcPretty(
        initialInput(project.objects[0], lcMethods(project.objects[0].kind)[0]),
      ),
    ),
    [output, setOutput] = useState(
      lcPretty(
        initialOutput(
          project.objects[0],
          lcMethods(project.objects[0].kind)[0],
        ),
      ),
    );
  const object =
    project.objects.find((o) => o.id === objectId) ?? project.objects[0];
  function reset(spec: LCObject, method: LCOperation["method"]) {
    setMethod(method);
    setInput(lcPretty(initialInput(spec, method)));
    setOutput(lcPretty(initialOutput(spec, method)));
  }
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <LCSelect
          label={t("consistency.object")}
          value={object.id}
          onChange={(id) => {
            setObjectId(id);
            const next = project.objects.find((o) => o.id === id)!;
            reset(next, lcMethods(next.kind)[0]);
          }}
        >
          {project.objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.id})
            </option>
          ))}
        </LCSelect>
        <LCSelect
          label={t("consistency.method")}
          value={method}
          onChange={(v) => reset(object, v as LCOperation["method"])}
        >
          {lcMethods(object.kind).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </LCSelect>
        <LCField
          label={t("consistency.client")}
          value={client}
          onChange={setClient}
        />
        <LCField
          label={t("consistency.start")}
          value={start}
          onChange={setStart}
        />
        {!pending && (
          <LCField label={t("consistency.end")} value={end} onChange={setEnd} />
        )}
      </div>
      <label className="block text-xs">
        <input
          type="checkbox"
          checked={pending}
          onChange={(e) => setPending(e.target.checked)}
        />{" "}
        {t("consistency.pending")}
      </label>
      <LCField
        label={t("consistency.input")}
        value={input}
        onChange={setInput}
      />
      {!pending && (
        <LCField
          label={t("consistency.output")}
          value={output}
          onChange={setOutput}
        />
      )}
      <LCAction
        disabled={history.operations.length >= 24}
        onClick={() =>
          append(() => ({
            id: lcFreshId("op", history.operations),
            client,
            objectId: object.id,
            method,
            start: /^\d+$/.test(start) ? Number(start) : NaN,
            end: pending ? null : /^\d+$/.test(end) ? Number(end) : NaN,
            input: parseLcJson(input),
            output: pending ? null : parseLcJson(output),
          }))
        }
      >
        {t("consistency.addOperation")}
      </LCAction>
    </div>
  );
}
