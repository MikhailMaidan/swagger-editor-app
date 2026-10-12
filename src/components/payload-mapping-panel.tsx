"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  createMappingModule,
  demoMappingProject,
  emptyMappingProject,
  mappingCasesReport,
  mappingError,
  MappingError,
  mappingPointerInventory,
  mappingRunReport,
  MAPPING_OPERATORS,
  MAX_MAPPING_CASES,
  MAX_MAPPING_PAYLOAD_BYTES,
  MAX_MAPPING_PROJECT_BYTES,
  newMappingRule,
  newMappingStage,
  parseMappingInput,
  parseMappingProject,
  parseMappingRecipe,
  readMappingContract,
  runMappingCases,
  runMappingProject,
  serializeMappingProject,
  validateMappingRecipe,
  type MappingCase,
  type MappingCaseResult,
  type MappingContract,
  type MappingRule,
  type MappingRun,
  type MappingStage,
  type MappingValidation,
} from "@/lib/payload-mapping";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
type FileKind = "project" | "recipe" | "input" | "contract";

export const PayloadMappingPanel = memo(function PayloadMappingPanel({
  getSchemaText,
}: {
  getSchemaText: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState(emptyMappingProject);
  const [stageId, setStageId] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [contract, setContract] = useState<MappingContract | null>(null);
  const [source, setSource] = useState("");
  const [run, setRun] = useState<MappingRun | null>(null);
  const [caseResults, setCaseResults] = useState<MappingCaseResult[]>([]);
  const [resultId, setResultId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [caseName, setCaseName] = useState("Example");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
    detail?: string;
  } | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const recipe = project.recipe;
  const stage = recipe.stages.find((s) => s.id === stageId) ?? recipe.stages[0];
  const rule = stage.rules.find((r) => r.id === ruleId) ?? stage.rules[0];
  const selectedCase =
    project.cases.find((c) => c.id === caseId) ?? project.cases[0];
  const selectedResult =
    caseResults.find((c) => c.id === resultId) ?? caseResults[0];
  const dirty = source !== project.contract;
  const ruleCount = recipe.stages.reduce((n, s) => n + s.rules.length, 0);
  const pointers = useMemo(() => {
    try {
      return mappingPointerInventory(project.input);
    } catch {
      return [];
    }
  }, [project.input]);
  const displayedRules = stage.rules.filter((r) =>
    `${r.source} ${r.target} ${r.operator}`
      .toLowerCase()
      .includes(ruleSearch.toLowerCase().trim()),
  );
  const preview = previewId
    ? run?.execution.stages.find((s) => s.id === previewId)?.output
    : run?.execution.output;
  function invalidate() {
    setRun(null);
    setCaseResults([]);
    setResultId("");
    setFeedback(null);
  }
  function fail(error: unknown) {
    const e = mappingError(error);
    setFeedback({
      key: `mappingStudio.error.${e.code}`,
      error: true,
      detail: [e.stage, e.rule, e.path].filter(Boolean).join(" · "),
    });
  }
  function editStage(patch: Partial<MappingStage>) {
    setProject({
      ...project,
      recipe: {
        ...recipe,
        stages: recipe.stages.map((s) =>
          s.id === stage.id ? { ...s, ...patch } : s,
        ),
      },
    });
    invalidate();
  }
  function editRule(patch: Partial<MappingRule>) {
    if (rule)
      editStage({
        rules: stage.rules.map((r) =>
          r.id === rule.id ? { ...r, ...patch } : r,
        ),
      });
  }
  function editCase(patch: Partial<MappingCase>) {
    if (!selectedCase) return;
    setProject({
      ...project,
      cases: project.cases.map((c) =>
        c.id === selectedCase.id ? { ...c, ...patch } : c,
      ),
    });
    setCaseResults([]);
    setFeedback(null);
  }
  function acceptContract(parsed: MappingContract) {
    setContract(parsed);
    setSource(parsed.source);
    setProject((previous) => ({
      ...previous,
      contract: parsed.source,
      inputBinding: parsed.bindings.some((b) => b.id === previous.inputBinding)
        ? previous.inputBinding
        : "",
      outputBinding: parsed.bindings.some(
        (b) => b.id === previous.outputBinding,
      )
        ? previous.outputBinding
        : "",
    }));
    invalidate();
    setFeedback({ key: "mappingStudio.contractLoaded", error: false });
  }
  function loadContract(text = source) {
    try {
      acceptContract(readMappingContract(text));
    } catch (error) {
      fail(error);
    }
  }
  function demo() {
    try {
      setProject(demoMappingProject());
      setContract(null);
      setSource("");
      setStageId("");
      setRuleId("");
      setRuleSearch("");
      setCaseId("");
      setPreviewId("");
      invalidate();
      setFeedback({ key: "mappingStudio.demoLoaded", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File, kind: FileKind) {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (
        file.size >
        (kind === "input"
          ? MAX_MAPPING_PAYLOAD_BYTES
          : MAX_MAPPING_PROJECT_BYTES)
      )
        throw new MappingError("limit");
      const text = await file.text();
      if (token !== generation.current) return;
      if (kind === "project") {
        const restored = parseMappingProject(text);
        setProject(restored);
        setContract(
          restored.contract ? readMappingContract(restored.contract) : null,
        );
        setSource(restored.contract);
        setStageId("");
        setRuleId("");
        setCaseId("");
        setPreviewId("");
        invalidate();
      } else if (kind === "recipe") {
        setProject({ ...project, recipe: parseMappingRecipe(text) });
        setStageId("");
        setRuleId("");
        invalidate();
      } else if (kind === "input") {
        parseMappingInput(text);
        setProject({ ...project, input: text });
        invalidate();
      } else acceptContract(readMappingContract(text));
      setFeedback({ key: `mappingStudio.imported.${kind}`, error: false });
    } catch (error) {
      if (token === generation.current) fail(error);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function execute(all = false) {
    if (dirty) return;
    setFeedback(null);
    try {
      if (all) {
        setCaseResults([]);
        setCaseResults(runMappingCases(project));
        setFeedback({ key: "mappingStudio.casesFinished", error: false });
      } else {
        setRun(null);
        setRun(runMappingProject(project));
        setPreviewId("");
        setFeedback({ key: "mappingStudio.finished", error: false });
      }
    } catch (error) {
      fail(error);
    }
  }
  function addStage() {
    const next = newMappingStage();
    setProject({
      ...project,
      recipe: { ...recipe, stages: [...recipe.stages, next] },
    });
    setStageId(next.id);
    setRuleId("");
    invalidate();
  }
  function addRule() {
    const next = newMappingRule();
    let n = 1;
    while (stage.rules.some((r) => r.target === `/field${n}`)) n++;
    next.target = `/field${n}`;
    editStage({ rules: [...stage.rules, next] });
    setRuleId(next.id);
  }
  function moveStage(direction: -1 | 1) {
    const stages = [...recipe.stages],
      index = stages.findIndex((s) => s.id === stage.id);
    if (index + direction < 0 || index + direction >= stages.length) return;
    [stages[index], stages[index + direction]] = [
      stages[index + direction],
      stages[index],
    ];
    setProject({ ...project, recipe: { ...recipe, stages } });
    invalidate();
  }
  function moveRule(direction: -1 | 1) {
    if (!rule) return;
    const rules = [...stage.rules],
      index = rules.findIndex((r) => r.id === rule.id);
    if (index + direction < 0 || index + direction >= rules.length) return;
    [rules[index], rules[index + direction]] = [
      rules[index + direction],
      rules[index],
    ];
    editStage({ rules });
  }
  function saveCase() {
    try {
      if (!caseName.trim() || caseName.length > 200)
        throw new MappingError("case");
      parseMappingInput(project.input);
      const c: MappingCase = {
        id: crypto.randomUUID(),
        name: caseName,
        input: project.input,
        expected: run ? JSON.stringify(run.execution.output, null, 2) : "",
        compareExpected: Boolean(run),
      };
      setProject({ ...project, cases: [...project.cases, c] });
      setCaseId(c.id);
      setCaseResults([]);
      setFeedback({ key: "mappingStudio.caseSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function download(text: string, suffix: string, mime = "application/json") {
    if (getByteSize(text) > MAX_MAPPING_PROJECT_BYTES)
      throw new MappingError("limit");
    const name =
      recipe.name
        .trim()
        .replace(/[^\p{L}\p{N}_-]+/gu, "-")
        .slice(0, 80) || "mapping";
    const ok = downloadTextFile(text, `${name}-${suffix}`, mime);
    setFeedback({
      key: ok ? "mappingStudio.downloaded" : "mappingStudio.downloadFailed",
      error: !ok,
    });
  }
  function exportItem(
    kind: "recipe" | "project" | "module" | "output" | "report" | "cases",
  ) {
    try {
      if (kind === "recipe")
        download(
          JSON.stringify(validateMappingRecipe(recipe), null, 2),
          "recipe.json",
        );
      if (kind === "project")
        download(serializeMappingProject(project), "project.json");
      if (kind === "module")
        download(
          createMappingModule(recipe),
          "mapper.mjs",
          "text/javascript;charset=utf-8",
        );
      if (kind === "output" && preview !== undefined)
        download(JSON.stringify(preview, null, 2), "output.json");
      if (kind === "report" && run)
        download(
          JSON.stringify(mappingRunReport(run), null, 2),
          "run-report.json",
        );
      if (kind === "cases")
        download(
          JSON.stringify(mappingCasesReport(caseResults), null, 2),
          "cases-report.json",
        );
    } catch (error) {
      fail(error);
    }
  }
  const validation = (value: MappingValidation, label: TranslationKey) => (
    <div className="space-y-1 text-xs">
      <p className="font-semibold">
        {t(label)}: {t(`mappingStudio.validation.${value.status}`)}
      </p>
      <ul className="break-words">
        {value.issues.slice(0, 100).map((i, n) => (
          <li key={n}>
            {i.instancePath || "/"} · {i.keyword} ·{" "}
            {t(`mappingStudio.severity.${i.severity}`)}
          </li>
        ))}
      </ul>
    </div>
  );
  const files = (kind: FileKind) => (
    <label className="text-xs font-semibold">
      {t(`mappingStudio.import.${kind}`)}
      <input
        type="file"
        accept={kind === "contract" ? ".json,.yaml,.yml" : ".json"}
        className={inputClass}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void read(f, kind);
        }}
      />
    </label>
  );
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("mappingStudio.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-[color:var(--color-brand-navy)]">
          <p className="text-sm">{t("mappingStudio.description")}</p>
          <p className="text-xs text-slate-600">{t("mappingStudio.help")}</p>
          {loading && <p role="status">{t("mappingStudio.loading")}</p>}
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className="break-words text-xs"
            >
              {t(feedback.key)}
              {feedback.detail && (
                <span className="ml-2">{feedback.detail}</span>
              )}
            </p>
          )}
          <fieldset
            disabled={loading}
            className="space-y-4 disabled:opacity-60"
          >
            <legend className="sr-only">{t("mappingStudio.title")}</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {files("project")}
              {files("recipe")}
              {files("input")}
              {files("contract")}
            </div>
            <label className="block text-xs font-semibold">
              {t("mappingStudio.name")}
              <input
                maxLength={200}
                className={inputClass}
                value={recipe.name}
                onChange={(e) => {
                  setProject({
                    ...project,
                    recipe: { ...recipe, name: e.target.value },
                  });
                  invalidate();
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={demo}>
                {t("mappingStudio.demo")}
              </button>
              {(["recipe", "project", "module"] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  className={buttonClass}
                  disabled={k === "project" && dirty}
                  onClick={() => exportItem(k)}
                >
                  {t(`mappingStudio.export.${k}`)}
                </button>
              ))}
            </div>
            <section
              aria-label={t("mappingStudio.pipeline")}
              className="space-y-3 rounded-xl border p-3"
            >
              <h3 className="text-sm font-bold">
                {t("mappingStudio.pipeline")}
              </h3>
              <p className="text-xs text-slate-600">
                {t("mappingStudio.pipelineHelp")}
              </p>
              <p className="text-xs">
                {t("mappingStudio.count", {
                  stages: String(recipe.stages.length),
                  rules: String(ruleCount),
                })}
              </p>
              <label className="block text-xs font-semibold">
                {t("mappingStudio.stage")}
                <select
                  className={inputClass}
                  value={stage.id}
                  onChange={(e) => {
                    setStageId(e.target.value);
                    setRuleId("");
                    setRuleSearch("");
                  }}
                >
                  {recipe.stages.map((s, i) => (
                    <option key={s.id} value={s.id}>
                      {i + 1}. {s.name}
                      {!s.enabled ? ` (${t("mappingStudio.disabled")})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={recipe.stages.length >= 12}
                  onClick={addStage}
                >
                  {t("mappingStudio.addStage")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={recipe.stages.length <= 1}
                  onClick={() => {
                    setProject({
                      ...project,
                      recipe: {
                        ...recipe,
                        stages: recipe.stages.filter((s) => s.id !== stage.id),
                      },
                    });
                    setStageId("");
                    setRuleId("");
                    invalidate();
                  }}
                >
                  {t("mappingStudio.removeStage")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={recipe.stages[0].id === stage.id}
                  onClick={() => moveStage(-1)}
                >
                  {t("mappingStudio.stageUp")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={recipe.stages.at(-1)?.id === stage.id}
                  onClick={() => moveStage(1)}
                >
                  {t("mappingStudio.stageDown")}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold">
                  {t("mappingStudio.stageName")}
                  <input
                    className={inputClass}
                    maxLength={200}
                    value={stage.name}
                    onChange={(e) => editStage({ name: e.target.value })}
                  />
                </label>
                <label className="text-xs font-semibold">
                  {t("mappingStudio.base")}
                  <select
                    className={inputClass}
                    value={stage.base}
                    onChange={(e) =>
                      editStage({
                        base: e.target.value as MappingStage["base"],
                      })
                    }
                  >
                    {(["object", "array", "input"] as const).map((base) => (
                      <option key={base} value={base}>
                        {t(`mappingStudio.base.${base}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={stage.enabled}
                  onChange={(e) => editStage({ enabled: e.target.checked })}
                />
                {t("mappingStudio.enableStage")}
              </label>
              <label className="block text-xs font-semibold">
                {t("mappingStudio.ruleSearch")}
                <input
                  className={inputClass}
                  value={ruleSearch}
                  onChange={(e) => setRuleSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setRuleSearch("");
                  }}
                />
              </label>
              <div
                className="max-h-48 space-y-1 overflow-auto"
                aria-label={t("mappingStudio.rules")}
              >
                {displayedRules.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    className={`${buttonClass} block w-full break-all text-left`}
                    aria-pressed={r.id === rule?.id}
                    onClick={() => setRuleId(r.id)}
                  >
                    {r.source || t("mappingStudio.root")} →{" "}
                    {r.target || t("mappingStudio.root")} ·{" "}
                    {t(`mappingStudio.operator.${r.operator}`)}
                    {!r.enabled && ` (${t("mappingStudio.disabled")})`}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={ruleCount >= 200}
                  onClick={addRule}
                >
                  {t("mappingStudio.addRule")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!rule}
                  onClick={() => {
                    editStage({
                      rules: stage.rules.filter((r) => r.id !== rule?.id),
                    });
                    setRuleId("");
                  }}
                >
                  {t("mappingStudio.removeRule")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!rule || stage.rules[0]?.id === rule.id}
                  onClick={() => moveRule(-1)}
                >
                  {t("mappingStudio.ruleUp")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!rule || stage.rules.at(-1)?.id === rule.id}
                  onClick={() => moveRule(1)}
                >
                  {t("mappingStudio.ruleDown")}
                </button>
              </div>
              {rule && (
                <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold">
                      {t("mappingStudio.sourcePointer")}
                      <input
                        className={`${inputClass} font-mono`}
                        value={rule.source}
                        maxLength={2048}
                        onChange={(e) => editRule({ source: e.target.value })}
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      {t("mappingStudio.targetPointer")}
                      <input
                        className={`${inputClass} font-mono`}
                        value={rule.target}
                        maxLength={2048}
                        onChange={(e) => editRule({ target: e.target.value })}
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      {t("mappingStudio.operator")}
                      <select
                        className={inputClass}
                        value={rule.operator}
                        onChange={(e) =>
                          editRule({
                            operator: e.target.value as MappingRule["operator"],
                          })
                        }
                      >
                        {MAPPING_OPERATORS.map((o) => (
                          <option key={o} value={o}>
                            {t(`mappingStudio.operator.${o}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold">
                      {t("mappingStudio.missing")}
                      <select
                        className={inputClass}
                        value={rule.missing}
                        onChange={(e) =>
                          editRule({
                            missing: e.target.value as MappingRule["missing"],
                          })
                        }
                      >
                        {(["error", "omit", "default"] as const).map((m) => (
                          <option key={m} value={m}>
                            {t(`mappingStudio.missing.${m}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {(rule.operator === "constant" ||
                    rule.missing === "default") && (
                    <label className="block text-xs font-semibold">
                      {t("mappingStudio.literal")}
                      <textarea
                        spellCheck={false}
                        rows={3}
                        className={`${inputClass} font-mono`}
                        value={rule.value}
                        onChange={(e) => editRule({ value: e.target.value })}
                      />
                    </label>
                  )}
                  {(rule.operator === "join" || rule.operator === "split") && (
                    <label className="block text-xs font-semibold">
                      {t("mappingStudio.argument")}
                      <input
                        className={inputClass}
                        value={rule.argument}
                        onChange={(e) => editRule({ argument: e.target.value })}
                      />
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => editRule({ enabled: e.target.checked })}
                    />
                    {t("mappingStudio.enableRule")}
                  </label>
                </div>
              )}
            </section>
            <section
              className="space-y-3 rounded-xl border p-3"
              aria-label={t("mappingStudio.contract")}
            >
              <h3 className="text-sm font-bold">
                {t("mappingStudio.contract")}
              </h3>
              <p className="text-xs text-slate-600">
                {t("mappingStudio.contractHelp")}
              </p>
              <p className="text-xs text-slate-600">
                {t("mappingStudio.patternHelp")}
              </p>
              <label className="block text-xs font-semibold">
                {t("mappingStudio.contractSource")}
                <textarea
                  spellCheck={false}
                  rows={5}
                  className={`${inputClass} font-mono`}
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    invalidate();
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => loadContract(getSchemaText())}
                >
                  {t("mappingStudio.capture")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => loadContract()}
                >
                  {t("mappingStudio.loadContract")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    setContract(null);
                    setSource("");
                    setProject({
                      ...project,
                      contract: "",
                      inputBinding: "",
                      outputBinding: "",
                    });
                    invalidate();
                  }}
                >
                  {t("mappingStudio.clearContract")}
                </button>
              </div>
              {dirty && (
                <p role="status" className="text-xs">
                  {t("mappingStudio.dirty")}
                </p>
              )}
              {contract && (
                <p className="text-xs">
                  {contract.title} ·{" "}
                  {t("mappingStudio.bindingCount", {
                    count: String(contract.bindings.length),
                  })}
                </p>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {(["inputBinding", "outputBinding"] as const).map((key) => (
                  <label key={key} className="text-xs font-semibold">
                    {t(`mappingStudio.${key}`)}
                    <select
                      className={inputClass}
                      value={project[key]}
                      disabled={dirty}
                      onChange={(e) => {
                        setProject({ ...project, [key]: e.target.value });
                        invalidate();
                      }}
                    >
                      <option value="">{t("mappingStudio.noBinding")}</option>
                      {contract?.bindings.map((b) => (
                        <option value={b.id} key={b.id}>
                          {b.direction === "none"
                            ? b.label
                            : b.label.replace(
                                ` ${b.direction}`,
                                ` ${t(`mappingStudio.direction.${b.direction}`)}`,
                              )}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>
            <section
              className="space-y-3 rounded-xl border p-3"
              aria-label={t("mappingStudio.rehearsal")}
            >
              <h3 className="text-sm font-bold">
                {t("mappingStudio.rehearsal")}
              </h3>
              <label className="block text-xs font-semibold">
                {t("mappingStudio.input")}
                <textarea
                  spellCheck={false}
                  rows={9}
                  className={`${inputClass} font-mono`}
                  value={project.input}
                  onChange={(e) => {
                    setProject({ ...project, input: e.target.value });
                    invalidate();
                  }}
                />
              </label>
              <details className="rounded-lg border p-2">
                <summary className="cursor-pointer text-xs font-semibold">
                  {t("mappingStudio.pointers")}
                </summary>
                <p className="mt-2 text-xs text-slate-600">
                  {t("mappingStudio.pointerHelp")}
                </p>
                <ul className="max-h-48 overflow-auto text-xs">
                  {pointers.map((p) => (
                    <li key={p.pointer} className="break-all">
                      {p.pointer || t("mappingStudio.root")} · {p.type}
                    </li>
                  ))}
                </ul>
              </details>
              <button
                type="button"
                className={buttonClass}
                disabled={dirty}
                onClick={() => execute()}
              >
                {t("mappingStudio.run")}
              </button>
              {run && (
                <div className="space-y-3">
                  <p role="status" className="text-xs">
                    {t("mappingStudio.runSummary", {
                      stages: String(run.execution.stages.length),
                      steps: String(run.execution.steps),
                    })}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {validation(
                      run.inputValidation,
                      "mappingStudio.inputValidation",
                    )}
                    {validation(
                      run.outputValidation,
                      "mappingStudio.outputValidation",
                    )}
                  </div>
                  <label className="block text-xs font-semibold">
                    {t("mappingStudio.previewStage")}
                    <select
                      className={inputClass}
                      value={previewId}
                      onChange={(e) => setPreviewId(e.target.value)}
                    >
                      <option value="">{t("mappingStudio.finalOutput")}</option>
                      {run.execution.stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {recipe.stages.find((stage) => stage.id === s.id)
                            ?.name ?? s.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold">
                    {t("mappingStudio.output")}
                    <textarea
                      readOnly
                      rows={10}
                      className={`${inputClass} font-mono`}
                      value={JSON.stringify(preview, null, 2).slice(0, 16000)}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => exportItem("output")}
                    >
                      {t("mappingStudio.export.output")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => exportItem("report")}
                    >
                      {t("mappingStudio.export.report")}
                    </button>
                  </div>
                  <ul
                    className="space-y-1 text-xs"
                    aria-label={t("mappingStudio.trace")}
                  >
                    {run.execution.stages.map((s) => (
                      <li key={s.id}>
                        {recipe.stages.find((stage) => stage.id === s.id)
                          ?.name ?? s.id}{" "}
                        · {s.byteLength} B
                        <ul className="ml-3">
                          {s.rules.map((r) => (
                            <li key={r.id}>
                              {recipe.stages
                                .flatMap((stage) => stage.rules)
                                .find((rule) => rule.id === r.id)?.target ||
                                t("mappingStudio.root")}
                              :{" "}
                              {t("mappingStudio.ruleSummary", {
                                mapped: String(r.mapped),
                                omitted: String(r.omitted),
                                defaults: String(r.defaults),
                              })}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            <section
              className="space-y-3 rounded-xl border p-3"
              aria-label={t("mappingStudio.cases")}
            >
              <h3 className="text-sm font-bold">{t("mappingStudio.cases")}</h3>
              <p className="text-xs text-slate-600">
                {t("mappingStudio.casesHelp")}
              </p>
              <p className="text-xs">
                {t("mappingStudio.caseCount", {
                  count: String(project.cases.length),
                  max: String(MAX_MAPPING_CASES),
                })}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-48 flex-1 text-xs font-semibold">
                  {t("mappingStudio.newCaseName")}
                  <input
                    className={inputClass}
                    maxLength={200}
                    value={caseName}
                    onChange={(e) => setCaseName(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={project.cases.length >= MAX_MAPPING_CASES || dirty}
                  onClick={saveCase}
                >
                  {t("mappingStudio.saveCase")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!project.cases.length || dirty}
                  onClick={() => execute(true)}
                >
                  {t("mappingStudio.runCases")}
                </button>
              </div>
              {selectedCase && (
                <>
                  <label className="block text-xs font-semibold">
                    {t("mappingStudio.selectedCase")}
                    <select
                      className={inputClass}
                      value={selectedCase.id}
                      onChange={(e) => setCaseId(e.target.value)}
                    >
                      {project.cases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold">
                    {t("mappingStudio.caseName")}
                    <input
                      maxLength={200}
                      className={inputClass}
                      value={selectedCase.name}
                      onChange={(e) => editCase({ name: e.target.value })}
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold">
                      {t("mappingStudio.caseInput")}
                      <textarea
                        spellCheck={false}
                        rows={7}
                        className={`${inputClass} font-mono`}
                        value={selectedCase.input}
                        onChange={(e) => editCase({ input: e.target.value })}
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      {t("mappingStudio.expected")}
                      <textarea
                        spellCheck={false}
                        rows={7}
                        className={`${inputClass} font-mono`}
                        value={selectedCase.expected}
                        onChange={(e) => editCase({ expected: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedCase.compareExpected}
                      onChange={(e) =>
                        editCase({ compareExpected: e.target.checked })
                      }
                    />
                    {t("mappingStudio.compareExpected")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        setProject({ ...project, input: selectedCase.input });
                        invalidate();
                      }}
                    >
                      {t("mappingStudio.loadCase")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!run || selectedCase.input !== project.input}
                      onClick={() => {
                        if (run)
                          editCase({
                            expected: JSON.stringify(
                              run.execution.output,
                              null,
                              2,
                            ),
                            compareExpected: true,
                          });
                      }}
                    >
                      {t("mappingStudio.captureExpected")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        setProject({
                          ...project,
                          cases: project.cases.filter(
                            (c) => c.id !== selectedCase.id,
                          ),
                        });
                        setCaseId("");
                        setCaseResults([]);
                      }}
                    >
                      {t("mappingStudio.removeCase")}
                    </button>
                  </div>
                </>
              )}
              {caseResults.length > 0 && (
                <div className="space-y-2">
                  <p role="status" className="text-xs">
                    {t("mappingStudio.casesSummary", {
                      passed: String(
                        caseResults.filter((c) => c.status === "passed").length,
                      ),
                      failed: String(
                        caseResults.filter((c) => c.status === "failed").length,
                      ),
                      partial: String(
                        caseResults.filter((c) => c.status === "partial")
                          .length,
                      ),
                    })}
                  </p>
                  <ul className="space-y-1 break-words text-xs">
                    {caseResults.map((c) => (
                      <li key={c.id}>
                        {c.name}: {t(`mappingStudio.caseStatus.${c.status}`)} ·{" "}
                        {t(`mappingStudio.expectedStatus.${c.expected}`)}
                        {c.error &&
                          ` · ${t(`mappingStudio.error.${c.error.code}`)}`}
                      </li>
                    ))}
                  </ul>
                  <label className="block text-xs font-semibold">
                    {t("mappingStudio.inspectCase")}
                    <select
                      className={inputClass}
                      value={selectedResult?.id ?? ""}
                      onChange={(e) => setResultId(e.target.value)}
                    >
                      {caseResults.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedResult?.run && (
                    <label className="block text-xs font-semibold">
                      {t("mappingStudio.caseOutput")}
                      <textarea
                        readOnly
                        rows={7}
                        className={`${inputClass} font-mono`}
                        value={JSON.stringify(
                          selectedResult.run.execution.output,
                          null,
                          2,
                        ).slice(0, 16000)}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => exportItem("cases")}
                  >
                    {t("mappingStudio.export.cases")}
                  </button>
                </div>
              )}
            </section>
          </fieldset>
        </div>
      )}
    </details>
  );
});
