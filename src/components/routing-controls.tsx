"use client";
import { useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import {
  parseRTJson,
  rtFreshId,
  type RTProject,
  type RTCase,
} from "@/lib/routing-model";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
export function RTButton({
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
export function RTField({
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
      {multiline ? <textarea {...props} rows={8} /> : <input {...props} />}
    </label>
  );
}
export function RTSelect({
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
export function RTJsonEditor({
  label,
  action,
  value,
  apply,
}: {
  label: string;
  action: string;
  value: unknown;
  apply: (build: () => unknown) => void;
}) {
  const [source, setSource] = useState(JSON.stringify(value, null, 2));
  return (
    <details>
      <summary className="cursor-pointer text-xs font-bold">{label}</summary>
      <div className="mt-3 space-y-2">
        <RTField label={label} value={source} onChange={setSource} multiline />
        <RTButton onClick={() => apply(() => parseRTJson(source))}>
          {action}
        </RTButton>
      </div>
    </details>
  );
}
export function RTSettings({
  project,
  apply,
}: {
  project: RTProject;
  apply: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState(project.name),
    [failures, setFailures] = useState(String(project.health.failureThreshold)),
    [cooldown, setCooldown] = useState(String(project.health.cooldownMs));
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <RTField label={t("rt.projectName")} value={name} onChange={setName} />
      <RTField
        label={t("rt.failureThreshold")}
        value={failures}
        onChange={setFailures}
      />
      <RTField
        label={t("rt.cooldown")}
        value={cooldown}
        onChange={setCooldown}
      />
      <RTButton
        onClick={() =>
          apply(() => ({
            ...project,
            name,
            health: {
              failureThreshold: failures.trim() ? Number(failures) : NaN,
              cooldownMs: cooldown.trim() ? Number(cooldown) : NaN,
            },
          }))
        }
      >
        {t("rt.applySettings")}
      </RTButton>
    </div>
  );
}
export function RTRouteBuilder({
  project,
  poolId,
  append,
}: {
  project: RTProject;
  poolId: string;
  append: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [name, setName] = useState("New route"),
    [method, setMethod] = useState("GET"),
    [path, setPath] = useState("/v1/{*rest}"),
    [rewrite, setRewrite] = useState("");
  return (
    <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
      <RTField label={t("rt.routeName")} value={name} onChange={setName} />
      <RTSelect label={t("rt.method")} value={method} onChange={setMethod}>
        {[
          "*",
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "HEAD",
          "OPTIONS",
          "TRACE",
        ].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </RTSelect>
      <RTField label={t("rt.path")} value={path} onChange={setPath} />
      <RTField label={t("rt.rewrite")} value={rewrite} onChange={setRewrite} />
      <RTButton
        disabled={project.routes.length >= 20}
        onClick={() =>
          append(() => ({
            id: rtFreshId("route", project.routes),
            name,
            enabled: true,
            methods: [method],
            path,
            filters: [],
            pool: poolId,
            rewrite: rewrite || null,
            setHeaders: {},
          }))
        }
      >
        {t("rt.addRoute")}
      </RTButton>
    </div>
  );
}
export function RTTrafficBuilder({
  scenario,
  append,
}: {
  scenario: RTCase;
  append: (build: () => unknown) => void;
}) {
  const { t } = useI18n(),
    [url, setUrl] = useState("/v1/items"),
    [headers, setHeaders] = useState("{}"),
    [at, setAt] = useState("0"),
    [status, setStatus] = useState("200"),
    [duration, setDuration] = useState("25"),
    [method, setMethod] = useState("GET");
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <p className="text-xs">{t("rt.requestHelp")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <RTField label={t("rt.requestUrl")} value={url} onChange={setUrl} />
        <RTSelect label={t("rt.method")} value={method} onChange={setMethod}>
          {[
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "HEAD",
            "OPTIONS",
            "TRACE",
          ].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </RTSelect>
        <RTField label={t("rt.arrival")} value={at} onChange={setAt} />
        <RTField label={t("rt.status")} value={status} onChange={setStatus} />
        <RTField
          label={t("rt.duration")}
          value={duration}
          onChange={setDuration}
        />
      </div>
      <RTField
        label={t("rt.requestHeaders")}
        value={headers}
        onChange={setHeaders}
        multiline
      />
      <RTButton
        disabled={scenario.requests.length >= 200}
        onClick={() =>
          append(() => ({
            id: rtFreshId("request", scenario.requests),
            method,
            url,
            headers: parseRTJson(headers),
            atMs: at.trim() ? Number(at) : NaN,
            outcome: {
              status: Number(status),
              durationMs: duration.trim() ? Number(duration) : NaN,
            },
            backendOutcomes: {},
          }))
        }
      >
        {t("rt.addRequest")}
      </RTButton>
    </div>
  );
}
