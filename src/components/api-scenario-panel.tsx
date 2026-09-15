"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import type { EndpointSummary } from "@/lib/openapi";
import {
  createScenarioStep,
  parseScenario,
  parseScenarioVariables,
  runApiScenario,
  serializeScenario,
  serializeScenarioReport,
  validateScenario,
  MAX_SCENARIO_BYTES,
  MAX_SCENARIO_STEPS,
  ScenarioError,
  type ApiScenario,
  type ScenarioIssue,
  type ScenarioStep,
  type ScenarioStepResult,
  type ScenarioReport,
} from "@/lib/api-scenario";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import { getByteSize } from "@/lib/text-encoding";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const emptyPlan = (): ApiScenario => ({
  name: "API scenario",
  variableNames: [],
  steps: [],
  stopOnFailure: true,
});
const endpointKey = (endpoint: { method: string; path: string }) =>
  `${endpoint.method.toUpperCase()} ${endpoint.path}`;

export const ApiScenarioPanel = memo(function ApiScenarioPanel({
  allEndpoints,
  onSelectEndpoint,
}: {
  allEndpoints: EndpointSummary[];
  onSelectEndpoint: (method: string, path: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<ApiScenario>(emptyPlan);
  const [variablesText, setVariablesText] = useState("{}");
  const [search, setSearch] = useState("");
  const [endpointChoice, setEndpointChoice] = useState("");
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"mock" | "live">("mock");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScenarioStepResult[]>([]);
  const [report, setReport] = useState<ScenarioReport | null>(null);
  const [issue, setIssue] = useState<ScenarioIssue | null>(null);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const [importText, setImportText] = useState("");
  const nextId = useRef(0);
  const revision = useRef(0);
  const exportRevision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      revision.current += 1;
      exportRevision.current += 1;
      controller.current?.abort();
    },
    [],
  );
  const endpoints = useMemo(
    () =>
      allEndpoints.filter((endpoint) =>
        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(endpoint.method),
      ),
    [allEndpoints],
  );
  const choices = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return endpoints.filter((endpoint) => {
      const text = `${endpointKey(endpoint)} ${endpoint.summary}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [endpoints, search]);
  const chosen =
    choices.find((endpoint) => endpointKey(endpoint) === endpointChoice) ??
    choices[0];
  const step = plan.steps.find((entry) => entry.id === selected);
  const stepEndpoint = step
    ? endpoints.find((endpoint) => endpointKey(endpoint) === endpointKey(step))
    : undefined;
  const valid = validateScenario(plan);

  function invalidate() {
    revision.current += 1;
    exportRevision.current += 1;
    setIssue(null);
    setFeedback(null);
    setReport(null);
    setResults([]);
  }
  function changePlan(next: ApiScenario) {
    invalidate();
    setPlan(next);
  }
  function changeStep(patch: Partial<ScenarioStep>) {
    if (!step) return;
    changePlan({
      ...plan,
      steps: plan.steps.map((entry) =>
        entry.id === step.id ? { ...entry, ...patch } : entry,
      ),
    });
  }
  function newId() {
    let id: string;
    do {
      id = `step-${++nextId.current}`;
    } while (plan.steps.some((step) => step.id === id));
    return id;
  }
  function addStep() {
    if (!chosen || plan.steps.length >= MAX_SCENARIO_STEPS) return;
    const step = createScenarioStep(chosen, newId());
    changePlan({ ...plan, steps: [...plan.steps, step] });
    setSelected(step.id);
  }
  function moveStep(id: string, direction: number) {
    const index = plan.steps.findIndex((step) => step.id === id);
    const steps = [...plan.steps];
    [steps[index], steps[index + direction]] = [
      steps[index + direction],
      steps[index],
    ];
    changePlan({ ...plan, steps });
  }
  function acceptImport(text: string) {
    try {
      const next = parseScenario(text);
      changePlan(next);
      setSelected(next.steps[0]?.id ?? "");
      setVariablesText(
        JSON.stringify(
          Object.fromEntries(next.variableNames.map((name) => [name, ""])),
          null,
          2,
        ),
      );
      setImportText("");
      setFeedback({ key: "scenario.imported", error: false });
    } catch (error) {
      setIssue(error instanceof ScenarioError ? error.code : "invalid-plan");
    }
  }
  async function loadFile(file: File) {
    const token = ++revision.current;
    setLoading(true);
    try {
      if (file.size > MAX_SCENARIO_BYTES) throw new ScenarioError("limit");
      const text = await file.text();
      if (token === revision.current) acceptImport(text);
    } catch (error) {
      if (token === revision.current)
        setIssue(error instanceof ScenarioError ? error.code : "invalid-plan");
    } finally {
      setLoading(false);
    }
  }
  async function run() {
    if (controller.current) return;
    invalidate();
    let variables;
    try {
      variables = parseScenarioVariables(variablesText);
    } catch {
      setIssue("invalid-variables");
      return;
    }
    const token = revision.current;
    const active = new AbortController();
    controller.current = active;
    setRunning(true);
    try {
      const result = await runApiScenario(plan, endpoints, variables, {
        mode,
        signal: active.signal,
        onProgress: (rows) => {
          if (token === revision.current) setResults(rows);
        },
      });
      if (token === revision.current) setReport(result);
    } catch (error) {
      if (token === revision.current)
        setIssue(error instanceof ScenarioError ? error.code : "network");
    } finally {
      if (controller.current === active) {
        controller.current = null;
        setRunning(false);
      }
    }
  }
  async function exportData(kind: "definition" | "report", copy: boolean) {
    const token = ++exportRevision.current;
    try {
      let content: string;
      if (kind === "report") {
        if (!report) return;
        content = serializeScenarioReport(report);
      } else {
        if (!validateScenario(plan)) throw new ScenarioError("invalid-plan");
        const variables = parseScenarioVariables(variablesText);
        content = serializeScenario({
          ...plan,
          variableNames: Object.keys(variables),
        });
        if (getByteSize(content) > MAX_SCENARIO_BYTES)
          throw new ScenarioError("limit");
      }
      const success = copy
        ? await writeTextToClipboard(content)
        : downloadTextFile(
            content,
            `rsswag-scenario-${kind}.json`,
            "application/json",
          );
      if (token === exportRevision.current)
        setFeedback({
          key: success ? "scenario.exported" : "scenario.exportFailed",
          error: !success,
        });
    } catch (error) {
      if (token === exportRevision.current)
        setIssue(error instanceof ScenarioError ? error.code : "invalid-plan");
    }
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-4"
    >
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("scenario.title")}
      </summary>
      {running ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-2 text-xs"
          role="status"
        >
          {t("scenario.running", {
            count: String(results.length),
            total: String(plan.steps.length),
          })}
          <button
            type="button"
            className={buttonClass}
            onClick={() => controller.current?.abort()}
          >
            {t("scenario.cancel")}
          </button>
        </div>
      ) : null}
      {open ? (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-[color:var(--color-brand-muted)]">
            {t("scenario.description")}
          </p>
          <fieldset
            disabled={running || loading}
            className="min-w-0 space-y-3 disabled:opacity-70"
          >
            <legend className="sr-only">{t("scenario.edit")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold">
                {t("scenario.name")}
                <input
                  className={inputClass}
                  maxLength={120}
                  value={plan.name}
                  onChange={(event) =>
                    changePlan({ ...plan, name: event.target.value })
                  }
                />
              </label>
              <label className="text-xs font-bold">
                {t("scenario.mode")}
                <select
                  className={inputClass}
                  value={mode}
                  onChange={(event) => {
                    invalidate();
                    setMode(event.target.value as "mock" | "live");
                  }}
                >
                  <option value="mock">{t("scenario.mock")}</option>
                  <option value="live">{t("scenario.live")}</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={plan.stopOnFailure}
                onChange={(event) =>
                  changePlan({ ...plan, stopOnFailure: event.target.checked })
                }
              />
              {t("scenario.stopOnFailure")}
            </label>
            <label className="block text-xs font-bold">
              {t("scenario.variables")}
              <textarea
                className={`${inputClass} font-mono`}
                rows={4}
                spellCheck={false}
                value={variablesText}
                onChange={(event) => {
                  invalidate();
                  setVariablesText(event.target.value);
                }}
              />
            </label>
            <p className="text-xs text-[color:var(--color-brand-muted)]">
              {t("scenario.variableHelp")}
            </p>
            <label className="block text-xs font-bold">
              {t("scenario.search")}
              <input
                type="search"
                className={inputClass}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="block text-xs font-bold">
              {t("scenario.endpoint")}
              <select
                className={inputClass}
                value={chosen ? endpointKey(chosen) : ""}
                onChange={(event) => setEndpointChoice(event.target.value)}
              >
                {!choices.length ? (
                  <option value="">{t("scenario.noEndpoints")}</option>
                ) : null}
                {choices.map((endpoint) => (
                  <option
                    key={endpointKey(endpoint)}
                    value={endpointKey(endpoint)}
                  >
                    {endpointKey(endpoint)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={!chosen || plan.steps.length >= MAX_SCENARIO_STEPS}
              onClick={addStep}
            >
              {t("scenario.addStep")}
            </button>
            <button
              type="button"
              className={`${buttonClass} ml-2`}
              onClick={() => {
                changePlan(emptyPlan());
                setSelected("");
                setVariablesText("{}");
                setImportText("");
              }}
            >
              {t("scenario.new")}
            </button>
            <p className="text-xs">
              {t("scenario.stepCount", { count: String(plan.steps.length) })}
            </p>
            <ol aria-label={t("scenario.steps")} className="space-y-2">
              {plan.steps.map((entry, index) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--color-brand-border)] p-2 text-xs"
                >
                  <button
                    type="button"
                    className={`${buttonClass} flex-1 break-all text-left`}
                    aria-pressed={selected === entry.id}
                    aria-label={t("scenario.editStep", {
                      number: String(index + 1),
                    })}
                    onClick={() => setSelected(entry.id)}
                  >
                    {index + 1}. {entry.name || endpointKey(entry)}{" "}
                    <code>{endpointKey(entry)}</code>
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={index === 0}
                    aria-label={t("scenario.moveUp", {
                      number: String(index + 1),
                    })}
                    onClick={() => moveStep(entry.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={index === plan.steps.length - 1}
                    aria-label={t("scenario.moveDown", {
                      number: String(index + 1),
                    })}
                    onClick={() => moveStep(entry.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={plan.steps.length >= MAX_SCENARIO_STEPS}
                    aria-label={t("scenario.duplicate", {
                      number: String(index + 1),
                    })}
                    onClick={() => {
                      const copy = {
                        ...entry,
                        id: newId(),
                        parameters: entry.parameters.map((value) => ({
                          ...value,
                        })),
                        extracts: entry.extracts.map((value) => ({ ...value })),
                      };
                      const steps = [...plan.steps];
                      steps.splice(index + 1, 0, copy);
                      changePlan({ ...plan, steps });
                      setSelected(copy.id);
                    }}
                  >
                    {t("scenario.duplicateLabel")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={t("scenario.removeStep", {
                      number: String(index + 1),
                    })}
                    onClick={() => {
                      changePlan({
                        ...plan,
                        steps: plan.steps.filter(
                          (step) => step.id !== entry.id,
                        ),
                      });
                      if (selected === entry.id) setSelected("");
                    }}
                  >
                    {t("scenario.remove")}
                  </button>
                </li>
              ))}
            </ol>
            {step ? (
              <div className="space-y-3 rounded-xl border border-[color:var(--color-brand-border)] bg-white p-3">
                <h4 className="text-sm font-bold">
                  {t("scenario.stepEditor")}: {endpointKey(step)}
                </h4>
                {!stepEndpoint ? (
                  <p className="text-xs" role="alert">
                    {t("scenario.missing-endpoint")}
                  </p>
                ) : (
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => onSelectEndpoint(step.method, step.path)}
                  >
                    {t("scenario.viewEndpoint")}
                  </button>
                )}
                <label className="block text-xs font-bold">
                  {t("scenario.stepName")}
                  <input
                    className={inputClass}
                    maxLength={120}
                    value={step.name}
                    onChange={(event) =>
                      changeStep({ name: event.target.value })
                    }
                  />
                </label>
                <label className="block text-xs font-bold">
                  {t("scenario.server")}
                  <input
                    className={inputClass}
                    maxLength={2048}
                    value={step.serverUrl}
                    placeholder={stepEndpoint?.serverUrl}
                    onChange={(event) =>
                      changeStep({ serverUrl: event.target.value })
                    }
                  />
                </label>
                <h5 className="text-xs font-bold">
                  {t("scenario.parameters")}
                </h5>
                {step.parameters.map((parameter, index) => (
                  <div
                    key={index}
                    className="grid gap-2 sm:grid-cols-[100px_1fr_2fr_auto]"
                  >
                    <select
                      aria-label={t("scenario.parameterLocation", {
                        number: String(index + 1),
                      })}
                      className={inputClass}
                      value={parameter.location}
                      onChange={(event) =>
                        changeStep({
                          parameters: step.parameters.map((entry, i) =>
                            i === index
                              ? {
                                  ...entry,
                                  location: event.target
                                    .value as typeof parameter.location,
                                }
                              : entry,
                          ),
                        })
                      }
                    >
                      {(["path", "query", "header", "cookie"] as const).map(
                        (location) => (
                          <option key={location} value={location}>
                            {location}
                          </option>
                        ),
                      )}
                    </select>
                    <input
                      aria-label={t("scenario.parameterName", {
                        number: String(index + 1),
                      })}
                      className={inputClass}
                      maxLength={256}
                      value={parameter.name}
                      onChange={(event) =>
                        changeStep({
                          parameters: step.parameters.map((entry, i) =>
                            i === index
                              ? { ...entry, name: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={t("scenario.parameterValue", {
                        number: String(index + 1),
                      })}
                      className={inputClass}
                      maxLength={8192}
                      value={parameter.value}
                      onChange={(event) =>
                        changeStep({
                          parameters: step.parameters.map((entry, i) =>
                            i === index
                              ? { ...entry, value: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={t("scenario.removeParameter", {
                        number: String(index + 1),
                      })}
                      onClick={() =>
                        changeStep({
                          parameters: step.parameters.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      {t("scenario.remove")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={step.parameters.length >= 64}
                  onClick={() =>
                    changeStep({
                      parameters: [
                        ...step.parameters,
                        {
                          location: "header",
                          name: "Authorization",
                          value: "Bearer {{token}}",
                        },
                      ],
                    })
                  }
                >
                  {t("scenario.addParameter")}
                </button>
                <label className="block text-xs font-bold">
                  {t("scenario.contentType")}
                  <input
                    className={inputClass}
                    value={step.contentType}
                    maxLength={256}
                    onChange={(event) =>
                      changeStep({ contentType: event.target.value })
                    }
                  />
                </label>
                <label className="block text-xs font-bold">
                  {t("scenario.body")}
                  <textarea
                    className={`${inputClass} font-mono`}
                    rows={5}
                    spellCheck={false}
                    maxLength={65536}
                    value={step.body}
                    onChange={(event) =>
                      changeStep({ body: event.target.value })
                    }
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold">
                    {t("scenario.expectedStatus")}
                    <input
                      className={inputClass}
                      maxLength={120}
                      value={step.expectedStatus}
                      onChange={(event) =>
                        changeStep({ expectedStatus: event.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs font-bold">
                    {t("scenario.mockStatus")}
                    <select
                      className={inputClass}
                      value={step.mockStatus}
                      onChange={(event) =>
                        changeStep({ mockStatus: event.target.value })
                      }
                    >
                      {!stepEndpoint?.responses.some(
                        (response) => response.status === step.mockStatus,
                      ) ? (
                        <option value={step.mockStatus}>
                          {step.mockStatus || t("scenario.unavailable")}
                        </option>
                      ) : null}
                      {stepEndpoint?.responses.map((response) => (
                        <option key={response.status} value={response.status}>
                          {response.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold">
                    {t("scenario.timeoutLabel")}
                    <input
                      type="number"
                      min={1000}
                      max={30000}
                      className={inputClass}
                      value={step.timeoutMs}
                      onChange={(event) =>
                        changeStep({ timeoutMs: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="text-xs font-bold">
                    {t("scenario.maxDuration")}
                    <input
                      type="number"
                      min={0}
                      max={60000}
                      className={inputClass}
                      value={step.maxDurationMs}
                      onChange={(event) =>
                        changeStep({
                          maxDurationMs: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={step.checkContract}
                    onChange={(event) =>
                      changeStep({ checkContract: event.target.checked })
                    }
                  />
                  {t("scenario.checkContract")}
                </label>
                <h5 className="text-xs font-bold">{t("scenario.extracts")}</h5>
                {step.extracts.map((extract, index) => (
                  <div
                    key={index}
                    className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"
                  >
                    <input
                      className={inputClass}
                      aria-label={t("scenario.extractName", {
                        number: String(index + 1),
                      })}
                      value={extract.name}
                      maxLength={64}
                      onChange={(event) =>
                        changeStep({
                          extracts: step.extracts.map((entry, i) =>
                            i === index
                              ? { ...entry, name: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                    <input
                      className={`${inputClass} font-mono`}
                      aria-label={t("scenario.extractPointer", {
                        number: String(index + 1),
                      })}
                      value={extract.pointer}
                      maxLength={512}
                      onChange={(event) =>
                        changeStep({
                          extracts: step.extracts.map((entry, i) =>
                            i === index
                              ? { ...entry, pointer: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={t("scenario.removeExtract", {
                        number: String(index + 1),
                      })}
                      onClick={() =>
                        changeStep({
                          extracts: step.extracts.filter((_, i) => i !== index),
                        })
                      }
                    >
                      {t("scenario.remove")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={step.extracts.length >= 10}
                  onClick={() =>
                    changeStep({
                      extracts: [
                        ...step.extracts,
                        {
                          name: `value${step.extracts.length + 1}`,
                          pointer: "/id",
                        },
                      ],
                    })
                  }
                >
                  {t("scenario.addExtract")}
                </button>
              </div>
            ) : null}
            {!valid ? (
              <p role="alert" className="text-xs">
                {t("scenario.invalid-plan")}
              </p>
            ) : null}
            <p className="text-xs text-[color:var(--color-brand-muted)]">
              {t(mode === "mock" ? "scenario.mockHelp" : "scenario.liveHelp")}
            </p>
            <button
              type="button"
              className={buttonClass}
              disabled={!valid || !plan.steps.length}
              onClick={() => void run()}
            >
              {t(mode === "mock" ? "scenario.runMock" : "scenario.runLive")}
            </button>
            <details className="rounded-lg border border-[color:var(--color-brand-border)] p-3">
              <summary className="cursor-pointer text-xs font-bold">
                {t("scenario.sharing")}
              </summary>
              <p className="mt-2 text-xs">{t("scenario.sharingHelp")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!valid}
                  onClick={() => void exportData("definition", true)}
                >
                  {t("scenario.copyDefinition")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!valid}
                  onClick={() => void exportData("definition", false)}
                >
                  {t("scenario.downloadDefinition")}
                </button>
              </div>
              <label className="mt-2 block text-xs font-bold">
                {t("scenario.importFile")}
                <input
                  type="file"
                  accept=".json,application/json"
                  className={inputClass}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void loadFile(file);
                  }}
                />
              </label>
              <label className="mt-2 block text-xs font-bold">
                {t("scenario.importText")}
                <textarea
                  className={`${inputClass} font-mono`}
                  rows={3}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                />
              </label>
              <button
                type="button"
                className={`${buttonClass} mt-2`}
                disabled={!importText.trim()}
                onClick={() => acceptImport(importText)}
              >
                {t("scenario.import")}
              </button>
            </details>
          </fieldset>
          {loading ? (
            <p role="status" className="text-xs">
              {t("scenario.loading")}
            </p>
          ) : null}
          {issue ? (
            <p role="alert" className="text-xs">
              {t(`scenario.${issue}`)}
            </p>
          ) : null}
          {feedback ? (
            <p role={feedback.error ? "alert" : "status"} className="text-xs">
              {t(feedback.key)}
            </p>
          ) : null}
          {report ? (
            <p role="status" className="text-sm font-bold">
              {t("scenario.result", {
                outcome: t(`scenario.${report.outcome}`),
                passed: String(
                  report.results.filter((result) => result.outcome === "passed")
                    .length,
                ),
                total: String(report.results.length),
              })}
            </p>
          ) : null}
          {results.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">{t("scenario.results")}</caption>
                <thead>
                  <tr>
                    {(
                      [
                        "step",
                        "outcome",
                        "status",
                        "duration",
                        "outputs",
                      ] as const
                    ).map((key) => (
                      <th key={key} className="p-2">
                        {t(`scenario.column.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={result.id}>
                      <td className="break-all p-2">
                        {index + 1}. {endpointKey(result)}
                      </td>
                      <td className="p-2">
                        {t(`scenario.${result.outcome}`)}
                        {result.issue ? (
                          <p>{t(`scenario.${result.issue}`)}</p>
                        ) : null}
                        {result.contract ? (
                          <p>
                            {t("scenario.contractResult", {
                              result: t(`scenario.${result.contract}`),
                            })}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-2">{result.status ?? "—"}</td>
                      <td className="p-2">
                        {result.durationMs === null
                          ? "—"
                          : `${result.durationMs} ms`}
                      </td>
                      <td className="p-2">
                        {result.extracted.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {report ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                onClick={() => void exportData("report", true)}
              >
                {t("scenario.copyReport")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void exportData("report", false)}
              >
                {t("scenario.downloadReport")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  );
});
