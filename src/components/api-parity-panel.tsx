"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  createParityCase,
  createParityPlan,
  MAX_PARITY_BYTES,
  MAX_PARITY_CASES,
  ParityError,
  parseParityHeaders,
  parseParityPlan,
  runApiParity,
  serializeParityPlan,
  serializeParityReport,
  type ParityCase,
  type ParityPlan,
  type ParityReport,
  type ParityResult,
  type ParitySide,
} from "@/lib/api-parity";
import type { CurlParameter, EndpointSummary } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const key = (endpoint: { method: string; path: string }) =>
  `${endpoint.method.toUpperCase()} ${endpoint.path}`;
type Feedback = {
  key: TranslationKey;
  error: boolean;
  caseIndex?: number | null;
  side?: ParitySide | null;
};

export const ApiParityPanel = memo(function ApiParityPanel({
  allEndpoints,
  visibleEndpoints,
  onSelectEndpoint,
}: {
  allEndpoints: EndpointSummary[];
  visibleEndpoints: EndpointSummary[];
  onSelectEndpoint: (method: string, path: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<ParityPlan>(createParityPlan);
  const [mode, setMode] = useState<"mock" | "live">("mock");
  const [pathsText, setPathsText] = useState("");
  const [headersText, setHeadersText] = useState(
    "date, x-request-id, server-timing",
  );
  const [sessionHeaders, setSessionHeaders] = useState({
    baseline: "{}",
    candidate: "{}",
  });
  const [search, setSearch] = useState("");
  const [choice, setChoice] = useState("");
  const [selected, setSelected] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<{
    caseIndex: number;
    side: ParitySide;
  } | null>(null);
  const [results, setResults] = useState<ParityResult[]>([]);
  const [report, setReport] = useState<ParityReport | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [resultFilter, setResultFilter] = useState("all");
  const [resultSearch, setResultSearch] = useState("");
  const [resultId, setResultId] = useState("");
  const generation = useRef(0);
  const exports = useRef(0);
  const counter = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      exports.current++;
      controller.current?.abort();
    },
    [],
  );
  const endpoints = useMemo(
    () =>
      allEndpoints.filter((endpoint) => /^(GET|HEAD)$/i.test(endpoint.method)),
    [allEndpoints],
  );
  const choices = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return endpoints.filter((endpoint) =>
      terms.every((term) =>
        `${key(endpoint)} ${endpoint.summary}`.toLowerCase().includes(term),
      ),
    );
  }, [endpoints, search]);
  const chosen =
    choices.find((endpoint) => key(endpoint) === choice) ?? choices[0];
  const entry = plan.cases.find((item) => item.id === selected);
  const endpoint = entry
    ? endpoints.find((endpoint) => key(endpoint) === key(entry))
    : undefined;
  const filteredResults = useMemo(() => {
    const terms = resultSearch
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return results.filter(
      (result) =>
        (resultFilter === "all" ||
          (resultFilter === "issues"
            ? result.outcome !== "matched"
            : result.outcome === resultFilter)) &&
        terms.every((term) =>
          `${key(result)} ${result.baseline?.status ?? ""} ${result.candidate?.status ?? ""} ${result.outcome}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [results, resultFilter, resultSearch]);
  const selectedResult =
    filteredResults.find((result) => result.id === resultId) ??
    filteredResults[0];
  function invalidate() {
    generation.current++;
    exports.current++;
    setReport(null);
    setResults([]);
    setActive(null);
    setFeedback(null);
    setLoading(false);
  }
  function changePlan(patch: Partial<ParityPlan>) {
    invalidate();
    setPlan((current) => ({ ...current, ...patch }));
  }
  function changeCase(patch: Partial<ParityCase>) {
    if (entry)
      changePlan({
        cases: plan.cases.map((item) =>
          item.id === entry.id ? { ...item, ...patch } : item,
        ),
      });
  }
  function nextId() {
    let id: string;
    do {
      id = `comparison-${++counter.current}`;
    } while (plan.cases.some((entry) => entry.id === id));
    return id;
  }
  function add() {
    if (!chosen || plan.cases.length >= MAX_PARITY_CASES) return;
    const next = createParityCase(chosen, nextId());
    changePlan({ cases: [...plan.cases, next] });
    setSelected(next.id);
  }
  function addVisible() {
    const included = new Set(plan.cases.map(key));
    const next = [...plan.cases];
    for (const endpoint of visibleEndpoints) {
      if (next.length >= MAX_PARITY_CASES) break;
      if (!/^(GET|HEAD)$/i.test(endpoint.method) || included.has(key(endpoint)))
        continue;
      next.push(createParityCase(endpoint, nextId()));
      included.add(key(endpoint));
    }
    changePlan({ cases: next });
    setSelected(next[next.length - 1]?.id ?? "");
  }
  function move(index: number, direction: number) {
    const cases = [...plan.cases];
    [cases[index], cases[index + direction]] = [
      cases[index + direction],
      cases[index],
    ];
    changePlan({ cases });
  }
  function compiled(): ParityPlan {
    return {
      ...plan,
      ignoredBodyPaths: pathsText
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter(Boolean),
      ignoredHeaders: headersText
        .split(/[,\r\n]/)
        .map((header) => header.trim())
        .filter(Boolean),
    };
  }
  function fail(error: unknown) {
    setFeedback(
      error instanceof ParityError
        ? {
            key: `parity.error.${error.code}`,
            error: true,
            caseIndex: error.caseIndex,
            side: error.side,
          }
        : { key: "parity.error.read", error: true },
    );
  }
  function accept(text: string) {
    exports.current++;
    try {
      const next = parseParityPlan(text);
      invalidate();
      setPlan(next);
      setSelected(next.cases[0]?.id ?? "");
      setPathsText(next.ignoredBodyPaths.join("\n"));
      setHeadersText(next.ignoredHeaders.join(", "));
      // Imported targets must not receive credentials entered for a previous plan.
      setSessionHeaders({ baseline: "{}", candidate: "{}" });
      setMode("mock");
      setInput("");
      setFeedback({ key: "parity.imported", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File) {
    const token = ++generation.current;
    exports.current++;
    setFeedback(null);
    setLoading(true);
    try {
      if (file.size > MAX_PARITY_BYTES) throw new ParityError("limit");
      const text = await file.text();
      if (token === generation.current) accept(text);
    } catch (error) {
      if (token === generation.current) fail(error);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  async function run() {
    if (controller.current) return;
    invalidate();
    const token = generation.current;
    const activeController = new AbortController();
    controller.current = activeController;
    setRunning(true);
    try {
      const headers = { baseline: {}, candidate: {} } as Record<
        ParitySide,
        Record<string, string>
      >;
      if (mode === "live")
        for (const side of ["baseline", "candidate"] as const) {
          try {
            headers[side] = parseParityHeaders(sessionHeaders[side]);
          } catch (error) {
            if (error instanceof ParityError) error.side = side;
            throw error;
          }
        }
      const result = await runApiParity(compiled(), endpoints, {
        mode,
        headers,
        signal: activeController.signal,
        onProgress: (rows, active) => {
          if (token === generation.current) {
            setResults(rows);
            setActive(active);
          }
        },
      });
      if (token === generation.current) setReport(result);
    } catch (error) {
      if (token === generation.current) fail(error);
    } finally {
      if (controller.current === activeController) {
        controller.current = null;
        setRunning(false);
        setActive(null);
      }
    }
  }
  async function exportData(kind: "plan" | "report", copy: boolean) {
    const token = ++exports.current;
    setFeedback(null);
    try {
      if (kind === "report" && !report) return;
      const value =
        kind === "plan"
          ? serializeParityPlan(compiled())
          : serializeParityReport(report!);
      const ok = copy
        ? await writeTextToClipboard(value)
        : downloadTextFile(
            value,
            `rsswag-environment-${kind}.json`,
            "application/json",
          );
      if (token === exports.current)
        setFeedback({
          key: ok
            ? copy
              ? "parity.copied"
              : "parity.downloaded"
            : copy
              ? "parity.error.copy"
              : "parity.error.download",
          error: !ok,
        });
    } catch (error) {
      if (token === exports.current) fail(error);
    }
  }
  const blocked = running || loading;
  return (
    <section className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-navy)]">
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer px-5 py-4 text-sm font-extrabold">
          {t("parity.title")}
        </summary>
        {open && (
          <div className="space-y-4 border-t border-[color:var(--color-brand-border)] p-5 text-sm">
            <p>{t("parity.description")}</p>
            <p className="text-xs text-slate-600">{t("parity.privacy")}</p>
            <fieldset
              disabled={blocked}
              className="min-w-0 space-y-4 disabled:opacity-70"
            >
              <legend className="sr-only">{t("parity.configure")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  {t("parity.name")}
                  <input
                    className={inputClass}
                    value={plan.name}
                    maxLength={120}
                    onChange={(event) =>
                      changePlan({ name: event.target.value })
                    }
                  />
                </label>
                <label className="text-xs font-bold">
                  {t("parity.mode")}
                  <select
                    className={inputClass}
                    value={mode}
                    onChange={(event) => {
                      invalidate();
                      setMode(event.target.value as "mock" | "live");
                    }}
                  >
                    <option value="mock">{t("parity.mock")}</option>
                    <option value="live">{t("parity.live")}</option>
                  </select>
                </label>
                {(["baseline", "candidate"] as const).map((side) => (
                  <label key={side} className="text-xs font-bold">
                    {t(`parity.${side}Url`)}
                    <input
                      className={inputClass}
                      type="url"
                      value={plan[`${side}Url`]}
                      maxLength={2048}
                      placeholder="https://api.example.com/v1"
                      onChange={(event) => {
                        changePlan({ [`${side}Url`]: event.target.value });
                        setSessionHeaders((current) => ({
                          ...current,
                          [side]: "{}",
                        }));
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-600">
                {mode === "live" ? t("parity.liveHelp") : t("parity.mockHelp")}
              </p>
              {mode === "live" && (
                <details className="rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer font-bold">
                    {t("parity.credentials")}
                  </summary>
                  <p className="my-2 text-xs">{t("parity.credentialsHelp")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["baseline", "candidate"] as const).map((side) => (
                      <label key={side} className="text-xs font-bold">
                        {t(`parity.${side}Headers`)}
                        <textarea
                          className={`${inputClass} font-mono`}
                          rows={4}
                          spellCheck={false}
                          value={sessionHeaders[side]}
                          onChange={(event) => {
                            invalidate();
                            setSessionHeaders((current) => ({
                              ...current,
                              [side]: event.target.value,
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`${buttonClass} mt-2`}
                    onClick={() => {
                      invalidate();
                      setSessionHeaders({ baseline: "{}", candidate: "{}" });
                    }}
                  >
                    {t("parity.clearHeaders")}
                  </button>
                </details>
              )}
              <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer font-bold">
                  {t("parity.rules")}
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold">
                    {t("parity.timeout")}
                    <input
                      className={inputClass}
                      type="number"
                      min={1000}
                      max={30000}
                      step={1000}
                      value={plan.timeoutMs}
                      onChange={(event) =>
                        changePlan({ timeoutMs: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="text-xs font-bold">
                    {t("parity.slowdown")}
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      max={60000}
                      value={plan.maxSlowdownMs}
                      onChange={(event) =>
                        changePlan({
                          maxSlowdownMs: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="text-xs font-bold">
                    {t("parity.ignorePaths")}
                    <textarea
                      className={`${inputClass} font-mono`}
                      rows={3}
                      value={pathsText}
                      onChange={(event) => {
                        invalidate();
                        setPathsText(event.target.value);
                      }}
                      placeholder="/updatedAt"
                      spellCheck={false}
                    />
                  </label>
                  <label className="text-xs font-bold">
                    {t("parity.ignoreHeaders")}
                    <textarea
                      className={inputClass}
                      rows={3}
                      value={headersText}
                      onChange={(event) => {
                        invalidate();
                        setHeadersText(event.target.value);
                      }}
                    />
                  </label>
                </div>
                <p className="my-3 text-xs text-slate-600">
                  {t("parity.rulesHelp")}
                </p>
                <div className="flex flex-wrap gap-4 text-xs">
                  {(
                    [
                      "checkContract",
                      "compareHeaders",
                      "stopOnFailure",
                    ] as const
                  ).map((option) => (
                    <label key={option} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={plan[option]}
                        onChange={(event) =>
                          changePlan({ [option]: event.target.checked })
                        }
                      />
                      {t(`parity.${option}`)}
                    </label>
                  ))}
                </div>
              </details>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  {t("parity.search")}
                  <input
                    type="search"
                    className={inputClass}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setSearch("");
                      }
                    }}
                  />
                </label>
                <label className="text-xs font-bold">
                  {t("parity.endpoint")}
                  <select
                    className={inputClass}
                    value={chosen ? key(chosen) : ""}
                    onChange={(event) => setChoice(event.target.value)}
                  >
                    {!choices.length && (
                      <option value="">{t("parity.noEndpoints")}</option>
                    )}
                    {choices.map((endpoint, index) => (
                      <option
                        key={`${key(endpoint)}-${index}`}
                        value={key(endpoint)}
                      >
                        {key(endpoint)} — {endpoint.summary}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!chosen || plan.cases.length >= MAX_PARITY_CASES}
                  onClick={add}
                >
                  {t("parity.add")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    plan.cases.length >= MAX_PARITY_CASES ||
                    !visibleEndpoints.some(
                      (endpoint) =>
                        /^(GET|HEAD)$/i.test(endpoint.method) &&
                        !plan.cases.some(
                          (entry) => key(entry) === key(endpoint),
                        ),
                    )
                  }
                  onClick={addVisible}
                >
                  {t("parity.addVisible")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!plan.cases.length}
                  onClick={() => {
                    changePlan({ cases: [] });
                    setSelected("");
                  }}
                >
                  {t("parity.clear")}
                </button>
              </div>
              <p className="text-xs">
                {t("parity.count", {
                  count: String(plan.cases.length),
                  max: String(MAX_PARITY_CASES),
                })}
              </p>
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <ol
                  aria-label={t("parity.cases")}
                  className="max-h-96 space-y-2 overflow-auto"
                >
                  {plan.cases.map((item, index) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 p-2"
                    >
                      <button
                        type="button"
                        className={`${buttonClass} min-w-0 flex-1 break-all text-left`}
                        aria-pressed={selected === item.id}
                        onClick={() => setSelected(item.id)}
                      >
                        {index + 1}. {key(item)} — {item.name}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        aria-label={t("parity.up", {
                          index: String(index + 1),
                        })}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        aria-label={t("parity.down", {
                          index: String(index + 1),
                        })}
                        disabled={index === plan.cases.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        aria-label={t("parity.remove", {
                          index: String(index + 1),
                        })}
                        onClick={() => {
                          const cases = plan.cases.filter(
                            (entry) => entry.id !== item.id,
                          );
                          changePlan({ cases });
                          if (selected === item.id)
                            setSelected(cases[0]?.id ?? "");
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ol>
                {entry && (
                  <fieldset className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-3">
                    <legend className="px-1 font-bold">
                      {t("parity.editCase")}
                    </legend>
                    <label className="block text-xs font-bold">
                      {t("parity.caseName")}
                      <input
                        className={inputClass}
                        value={entry.name}
                        maxLength={120}
                        onChange={(event) =>
                          changeCase({ name: event.target.value })
                        }
                      />
                    </label>
                    <p className="break-all text-xs font-bold">{key(entry)}</p>
                    {!endpoint && (
                      <p role="alert" className="text-xs text-red-700">
                        {t("parity.error.missing-endpoint")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={!endpoint}
                        onClick={() =>
                          onSelectEndpoint(entry.method, entry.path)
                        }
                      >
                        {t("parity.viewEndpoint")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={plan.cases.length >= MAX_PARITY_CASES}
                        onClick={() => {
                          const next = {
                            ...entry,
                            id: nextId(),
                            parameters: entry.parameters.map((parameter) => ({
                              ...parameter,
                            })),
                          };
                          changePlan({ cases: [...plan.cases, next] });
                          setSelected(next.id);
                        }}
                      >
                        {t("parity.duplicate")}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">
                      {t("parity.parametersHelp")}
                    </p>
                    {entry.parameters.map((parameter, index) => (
                      <div
                        key={index}
                        className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-2"
                      >
                        <label className="text-xs">
                          {t("parity.parameterLocation", {
                            index: String(index + 1),
                          })}
                          <select
                            className={inputClass}
                            value={parameter.location}
                            onChange={(event) =>
                              changeCase({
                                parameters: entry.parameters.map(
                                  (item, position) =>
                                    position === index
                                      ? {
                                          ...item,
                                          location: event.target
                                            .value as CurlParameter["location"],
                                        }
                                      : item,
                                ),
                              })
                            }
                          >
                            {["path", "query", "header", "cookie"].map(
                              (location) => (
                                <option key={location} value={location}>
                                  {location}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="text-xs">
                          {t("parity.parameterName", {
                            index: String(index + 1),
                          })}
                          <input
                            className={inputClass}
                            value={parameter.name}
                            maxLength={256}
                            onChange={(event) =>
                              changeCase({
                                parameters: entry.parameters.map(
                                  (item, position) =>
                                    position === index
                                      ? { ...item, name: event.target.value }
                                      : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="text-xs sm:col-span-2">
                          {t("parity.parameterValue", {
                            index: String(index + 1),
                          })}
                          <input
                            className={inputClass}
                            value={parameter.value}
                            maxLength={8192}
                            onChange={(event) =>
                              changeCase({
                                parameters: entry.parameters.map(
                                  (item, position) =>
                                    position === index
                                      ? { ...item, value: event.target.value }
                                      : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() =>
                            changeCase({
                              parameters: entry.parameters.filter(
                                (_, position) => position !== index,
                              ),
                            })
                          }
                        >
                          {t("parity.removeParameter", {
                            index: String(index + 1),
                          })}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={entry.parameters.length >= 64}
                      onClick={() =>
                        changeCase({
                          parameters: [
                            ...entry.parameters,
                            { location: "query", name: "", value: "" },
                          ],
                        })
                      }
                    >
                      {t("parity.addParameter")}
                    </button>
                    {mode === "mock" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(["baseline", "candidate"] as const).map((side) => (
                          <label key={side} className="text-xs font-bold">
                            {t(`parity.${side}Mock`)}
                            <select
                              className={inputClass}
                              value={entry[`${side}MockStatus`]}
                              onChange={(event) =>
                                changeCase({
                                  [`${side}MockStatus`]: event.target.value,
                                })
                              }
                            >
                              {!endpoint?.responses.some(
                                (response) =>
                                  response.status ===
                                  entry[`${side}MockStatus`],
                              ) && (
                                <option value={entry[`${side}MockStatus`]}>
                                  {entry[`${side}MockStatus`] || "—"}
                                </option>
                              )}
                              {endpoint?.responses.map((response, index) => (
                                <option
                                  key={`${response.status}-${index}`}
                                  value={response.status}
                                >
                                  {response.status}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                )}
              </div>
              <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer font-bold">
                  {t("parity.portable")}
                </summary>
                <p className="my-2 text-xs">{t("parity.portableHelp")}</p>
                <label className="block text-xs font-bold">
                  {t("parity.file")}
                  <input
                    className={inputClass}
                    type="file"
                    accept=".json,application/json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void read(file);
                    }}
                  />
                </label>
                <label className="mt-2 block text-xs font-bold">
                  {t("parity.input")}
                  <textarea
                    className={`${inputClass} font-mono`}
                    rows={4}
                    value={input}
                    spellCheck={false}
                    onChange={(event) => {
                      exports.current++;
                      setFeedback(null);
                      setInput(event.target.value);
                    }}
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!input.trim()}
                    onClick={() => accept(input)}
                  >
                    {t("parity.import")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => void exportData("plan", true)}
                  >
                    {t("parity.copyPlan")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => void exportData("plan", false)}
                  >
                    {t("parity.downloadPlan")}
                  </button>
                </div>
              </details>
              <button
                type="button"
                className={buttonClass}
                disabled={!plan.cases.length || !endpoints.length}
                onClick={() => void run()}
              >
                {mode === "live" ? t("parity.runLive") : t("parity.runMock")}
              </button>
            </fieldset>
            {loading && (
              <p role="status" className="text-xs">
                {t("parity.loading")}
              </p>
            )}
            {feedback && (
              <p
                role={feedback.error ? "alert" : "status"}
                className={`text-xs ${feedback.error ? "text-red-700" : "text-emerald-700"}`}
              >
                {feedback.caseIndex != null &&
                  `${t("parity.caseNumber", { index: String(feedback.caseIndex + 1) })} · `}
                {feedback.side && `${t(`parity.${feedback.side}`)}: `}
                {t(feedback.key)}
              </p>
            )}
            {results.length > 0 && (
              <section aria-label={t("parity.results")} className="space-y-3">
                <p className="font-bold">
                  {t("parity.progress", {
                    done: String(results.length),
                    total: String(plan.cases.length),
                  })}
                </p>
                {report && (
                  <p role="status" className="text-sm font-bold">
                    {t("parity.finished", {
                      mode: t(`parity.${report.mode}`),
                      outcome: t(`parity.report.${report.outcome}`),
                    })}
                  </p>
                )}
                <p className="text-xs">{t("parity.resultHelp")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold">
                    {t("parity.resultSearch")}
                    <input
                      type="search"
                      className={inputClass}
                      value={resultSearch}
                      onChange={(event) => setResultSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setResultSearch("");
                        }
                      }}
                    />
                  </label>
                  <label className="text-xs font-bold">
                    {t("parity.resultFilter")}
                    <select
                      className={inputClass}
                      value={resultFilter}
                      onChange={(event) => setResultFilter(event.target.value)}
                    >
                      {[
                        "all",
                        "issues",
                        "matched",
                        "different",
                        "inconclusive",
                        "error",
                        "cancelled",
                        "skipped",
                      ].map((filter) => (
                        <option key={filter} value={filter}>
                          {t(`parity.outcome.${filter}` as TranslationKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <caption className="sr-only">{t("parity.results")}</caption>
                    <thead>
                      <tr>
                        {[
                          "case",
                          "outcome",
                          "baseline",
                          "candidate",
                          "delta",
                        ].map((column) => (
                          <th key={column} className="p-2">
                            {t(`parity.column.${column}` as TranslationKey)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((result) => (
                        <tr
                          key={result.id}
                          className="border-t border-slate-200"
                        >
                          <td className="p-2">
                            <button
                              type="button"
                              className={buttonClass}
                              aria-pressed={selectedResult?.id === result.id}
                              onClick={() => setResultId(result.id)}
                            >
                              {key(result)} ·{" "}
                              {plan.cases.findIndex(
                                (entry) => entry.id === result.id,
                              ) + 1}
                            </button>
                          </td>
                          <td className="p-2">
                            {t(`parity.outcome.${result.outcome}`)}
                          </td>
                          <td className="p-2">
                            {result.baseline
                              ? `${result.baseline.status} · ${result.baseline.durationMs} ms`
                              : "—"}
                          </td>
                          <td className="p-2">
                            {result.candidate
                              ? `${result.candidate.status} · ${result.candidate.durationMs} ms`
                              : "—"}
                          </td>
                          <td className="p-2">
                            {result.durationDeltaMs === null
                              ? "—"
                              : `${result.durationDeltaMs > 0 ? "+" : ""}${result.durationDeltaMs} ms`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filteredResults.length && (
                  <p className="text-xs">{t("parity.noResults")}</p>
                )}
                {selectedResult && (
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
                    <p className="break-all font-bold">
                      {key(selectedResult)} ·{" "}
                      {t(`parity.outcome.${selectedResult.outcome}`)}
                    </p>
                    {selectedResult.issue && (
                      <p>
                        {selectedResult.side &&
                          `${t(`parity.${selectedResult.side}`)}: `}
                        {t(`parity.error.${selectedResult.issue}`)}
                      </p>
                    )}
                    {selectedResult.limited && <p>{t("parity.limited")}</p>}
                    {selectedResult.slowdown && (
                      <p>{t("parity.slowdownFailed")}</p>
                    )}
                    {selectedResult.bodyMode && (
                      <p>
                        {t("parity.bodyMode", {
                          mode: selectedResult.bodyMode,
                        })}
                      </p>
                    )}
                    {(["baseline", "candidate"] as const).map((side) => {
                      const info = selectedResult[side];
                      return (
                        info && (
                          <p key={side}>
                            {t(`parity.${side}`)} ·{" "}
                            {t("parity.bytes", {
                              bytes: String(info.bodyBytes),
                            })}{" "}
                            ·{" "}
                            {info.contract
                              ? t("parity.contractCounts", {
                                  passed: String(info.contract.passed),
                                  failed: String(info.contract.failed),
                                  skipped: String(info.contract.skipped),
                                })
                              : t("parity.contractOff")}
                          </p>
                        )
                      );
                    })}
                    <p>
                      {t("parity.differences", {
                        count: String(selectedResult.differences.length),
                      })}
                    </p>
                    <ul className="max-h-64 space-y-1 overflow-auto">
                      {selectedResult.differences.map((difference, index) => (
                        <li className="break-all font-mono" key={index}>
                          {t(`parity.area.${difference.area}`)} ·{" "}
                          {t(`parity.kind.${difference.kind}`)} ·{" "}
                          {difference.path || t("parity.root")}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={
                        !endpoints.some(
                          (endpoint) => key(endpoint) === key(selectedResult),
                        )
                      }
                      onClick={() =>
                        onSelectEndpoint(
                          selectedResult.method,
                          selectedResult.path,
                        )
                      }
                    >
                      {t("parity.viewEndpoint")}
                    </button>
                  </div>
                )}
                {report && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => void exportData("report", true)}
                    >
                      {t("parity.copyReport")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => void exportData("report", false)}
                    >
                      {t("parity.downloadReport")}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </details>
      {running && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-3">
          <p role="status" className="text-xs">
            {active
              ? t("parity.running", {
                  index: String(active.caseIndex + 1),
                  total: String(plan.cases.length),
                  side: t(`parity.${active.side}`),
                })
              : t("parity.starting")}
          </p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => controller.current?.abort()}
          >
            {t("parity.cancel")}
          </button>
        </div>
      )}
    </section>
  );
});
