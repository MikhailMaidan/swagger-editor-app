"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  COLLECTION_STRATEGIES,
  CollectionError,
  MAX_COLLECTION_BYTES,
  MAX_COLLECTION_FIXTURES,
  MAX_COLLECTION_PLANS,
  collectionDataset,
  collectionError,
  collectionStartUrl,
  collectionUrlKey,
  defaultCollectionPlan,
  demoCollectionProject,
  emptyCollectionProject,
  normalizeCollectionFixture,
  normalizeCollectionPlan,
  parseCollectionJson,
  parseCollectionProject,
  serializeCollectionProject,
  type CollectionFixture,
  type CollectionPlan,
  type CollectionProject,
} from "@/lib/api-collection";
import {
  collectionFixturesFromRun,
  collectionRunReport,
  runCollection,
  type CollectionRun,
} from "@/lib/api-collection-runner";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const numberKeys = [
  "start",
  "pageSize",
  "maxPages",
  "maxRecords",
  "maxBytes",
  "requestTimeoutMs",
  "durationMs",
  "intervalMs",
  "minRecords",
  "expectedMaxRecords",
  "maxDuplicates",
] as const;
type NumberKey = (typeof numberKeys)[number];
type PlanDraft = Omit<CollectionPlan, NumberKey | "assertions"> &
  Record<NumberKey | "assertions", string>;
type FixtureDraft = {
  id: string;
  name: string;
  url: string;
  status: string;
  mime: string;
  link: string;
  body: string;
};
const planDraft = (p: CollectionPlan): PlanDraft => ({
  ...p,
  ...(Object.fromEntries(numberKeys.map((k) => [k, String(p[k])])) as Record<
    NumberKey,
    string
  >),
  assertions: json(p.assertions),
});
const fixtureDraft = (f: CollectionFixture): FixtureDraft => ({
  id: f.id,
  name: f.name,
  url: f.url,
  status: String(f.status),
  mime: f.headers["content-type"] ?? "",
  link: f.headers.link ?? "",
  body: f.body,
});
const number = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);

export const ApiCollectionPanel = memo(function ApiCollectionPanel() {
  const { t } = useI18n();
  const message = (
    key: TranslationKey,
    values: Record<string, string | number>,
  ) =>
    t(
      key,
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, String(v)]),
      ),
    );
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyCollectionProject),
    [projectName, setProjectName] = useState("API collections");
  const [selectedId, setSelectedId] = useState("starter"),
    [draft, setDraft] = useState(() => planDraft(defaultCollectionPlan()));
  const [fixtureId, setFixtureId] = useState(""),
    [pageDraft, setPageDraft] = useState<FixtureDraft | null>(null);
  const [headers, setHeaders] = useState("{}"),
    [runs, setRuns] = useState<CollectionRun[]>([]),
    [runId, setRunId] = useState(""),
    [total, setTotal] = useState(0);
  const [search, setSearch] = useState(""),
    [recordIndex, setRecordIndex] = useState(0);
  const [busy, setBusy] = useState<"read" | "run" | "copy" | null>(null),
    [progress, setProgress] = useState({ plan: "", pages: 0, records: 0 });
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const generation = useRef(0),
    abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      abort.current?.abort();
    },
    [],
  );
  const selected =
    project.plans.find((p) => p.id === selectedId) ?? project.plans[0];
  const selectedFixture = project.fixtures.find((f) => f.id === fixtureId);
  const planDirty =
    json(draft) !== json(planDraft(selected)) || projectName !== project.name;
  const fixtureDirty =
    !!pageDraft &&
    (!selectedFixture ||
      json(pageDraft) !== json(fixtureDraft(selectedFixture)));
  const pending = planDirty || fixtureDirty;
  const current = runs.find((r) => r.planId === runId);
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matching = (current?.records ?? [])
    .map((value, index) => ({ value, index }))
    .filter(({ value }) =>
      terms.every((term) => JSON.stringify(value).toLowerCase().includes(term)),
    );
  const visible = matching.slice(0, 100),
    inspected = visible.find((r) => r.index === recordIndex) ?? visible[0];
  function fail(e: unknown) {
    setFeedback({
      key: `collection.error.${collectionError(e).code}`,
      error: true,
    });
  }
  function notify(key: TranslationKey) {
    setFeedback({ key, error: false });
  }
  function clearResults() {
    setRuns([]);
    setRunId("");
    setTotal(0);
    setSearch("");
    setRecordIndex(0);
  }
  function choosePlan(p: CollectionPlan) {
    setSelectedId(p.id);
    setDraft(planDraft(p));
    setRunId(p.id);
    setSearch("");
    setRecordIndex(0);
  }
  function chooseFixture(f?: CollectionFixture) {
    setFixtureId(f?.id ?? "");
    setPageDraft(f ? fixtureDraft(f) : null);
  }
  function accept(p: CollectionProject) {
    setProject(p);
    setProjectName(p.name);
    choosePlan(p.plans[0]);
    chooseFixture(p.fixtures[0]);
    setHeaders("{}");
    clearResults();
    setFeedback(null);
  }
  function checked(p: CollectionProject) {
    return parseCollectionProject(serializeCollectionProject(p));
  }
  function savePlan() {
    try {
      const saved = normalizeCollectionPlan({
        ...draft,
        ...Object.fromEntries(numberKeys.map((k) => [k, number(draft[k])])),
        assertions: parseCollectionJson(draft.assertions),
      });
      const p = checked({
        ...project,
        name: projectName,
        plans: project.plans.map((plan) =>
          plan.id === selected.id ? saved : plan,
        ),
      });
      setProject(p);
      setProjectName(p.name);
      choosePlan(p.plans.find((plan) => plan.id === saved.id)!);
      clearResults();
      notify("collection.saved");
    } catch (e) {
      fail(e);
    }
  }
  function saveFixture() {
    if (!pageDraft) return;
    try {
      const saved = normalizeCollectionFixture({
        id: pageDraft.id,
        name: pageDraft.name,
        url: pageDraft.url,
        status: number(pageDraft.status),
        body: pageDraft.body,
        headers: {
          "content-type": pageDraft.mime,
          ...(pageDraft.link ? { link: pageDraft.link } : {}),
        },
      });
      const p = checked({
        ...project,
        fixtures: project.fixtures.map((f) => (f.id === saved.id ? saved : f)),
      });
      setProject(p);
      chooseFixture(p.fixtures.find((f) => f.id === saved.id));
      clearResults();
      notify("collection.saved");
    } catch (e) {
      fail(e);
    }
  }
  function discard() {
    setProjectName(project.name);
    setDraft(planDraft(selected));
    chooseFixture(selectedFixture);
    setFeedback(null);
  }
  function addPlan() {
    try {
      const next = {
        ...defaultCollectionPlan(crypto.randomUUID()),
        name: `Collection ${project.plans.length + 1}`,
      };
      const p = checked({ ...project, plans: [...project.plans, next] });
      setProject(p);
      choosePlan(next);
      clearResults();
      setFeedback(null);
    } catch (e) {
      fail(e);
    }
  }
  function deletePlan() {
    const p = {
      ...project,
      plans: project.plans.filter((plan) => plan.id !== selected.id),
    };
    setProject(p);
    choosePlan(p.plans[0]);
    clearResults();
    setFeedback(null);
  }
  function addFixture() {
    try {
      const id = crypto.randomUUID(),
        url = new URL(collectionStartUrl(selected));
      if (
        project.fixtures.some(
          (f) => collectionUrlKey(f.url) === collectionUrlKey(url.href),
        )
      )
        url.searchParams.set("fixture", id);
      const next = normalizeCollectionFixture({
        id,
        name: `Page ${project.fixtures.length + 1}`,
        url: url.href,
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{\n  "items": [],\n  "next": null\n}',
      });
      const p = checked({ ...project, fixtures: [...project.fixtures, next] });
      setProject(p);
      chooseFixture(next);
      clearResults();
      setFeedback(null);
    } catch (e) {
      fail(e);
    }
  }
  function deleteFixture() {
    const p = {
      ...project,
      fixtures: project.fixtures.filter((f) => f.id !== fixtureId),
    };
    setProject(p);
    chooseFixture(p.fixtures[0]);
    clearResults();
    setFeedback(null);
  }
  async function importFile(file: File) {
    const task = ++generation.current;
    setBusy("read");
    setFeedback(null);
    try {
      if (file.size > MAX_COLLECTION_BYTES)
        throw new CollectionError("max-bytes");
      const source = await file.text();
      if (task !== generation.current) return;
      accept(parseCollectionProject(source));
      notify("collection.imported");
    } catch (e) {
      if (task === generation.current) fail(e);
    } finally {
      if (task === generation.current) setBusy(null);
    }
  }
  async function collect(mode: "offline" | "live", all = false) {
    const task = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    const plans = all ? project.plans : [selected];
    setBusy("run");
    setFeedback(null);
    clearResults();
    setTotal(plans.length);
    const results: CollectionRun[] = [];
    try {
      for (const plan of plans) {
        if (controller.signal.aborted) break;
        setProgress({ plan: plan.name, pages: 0, records: 0 });
        const result = await runCollection(plan, {
          mode,
          fixtures: project.fixtures,
          headers,
          signal: controller.signal,
          onPage(page, count) {
            if (task === generation.current)
              setProgress({
                plan: plan.name,
                pages: page.index,
                records: count,
              });
          },
        });
        if (task !== generation.current) return;
        results.push(result);
        setRuns([...results]);
        setRunId(result.planId);
        if (controller.signal.aborted) break;
      }
    } catch (e) {
      if (task === generation.current) fail(e);
    } finally {
      if (task === generation.current) {
        setBusy(null);
        abort.current = null;
      }
    }
  }
  function capture() {
    if (!current) return;
    try {
      const fixtures = project.fixtures.slice();
      for (const f of collectionFixturesFromRun(current)) {
        const index = fixtures.findIndex(
          (old) => collectionUrlKey(old.url) === collectionUrlKey(f.url),
        );
        if (index >= 0)
          fixtures[index] = {
            ...f,
            id: fixtures[index].id,
            name: fixtures[index].name,
          };
        else fixtures.push({ ...f, id: crypto.randomUUID() });
      }
      const p = checked({ ...project, fixtures });
      setProject(p);
      chooseFixture(p.fixtures[0]);
      notify("collection.captured");
    } catch (e) {
      fail(e);
    }
  }
  function download(
    content: () => string,
    suffix: string,
    mime = "application/json",
  ) {
    try {
      const stem =
        project.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) || "api";
      const ok = downloadTextFile(
        content(),
        `${stem}-collection-${suffix}`,
        mime,
      );
      setFeedback({
        key: ok ? "collection.downloaded" : "collection.downloadError",
        error: !ok,
      });
    } catch (e) {
      fail(e);
    }
  }
  async function copy() {
    if (!current) return;
    const task = ++generation.current;
    setBusy("copy");
    setFeedback(null);
    try {
      const ok = await writeTextToClipboard(
        collectionDataset(current.records, "json"),
      );
      if (task === generation.current)
        setFeedback({
          key: ok ? "collection.copied" : "collection.copyError",
          error: !ok,
        });
    } catch {
      if (task === generation.current)
        setFeedback({ key: "collection.copyError", error: true });
    } finally {
      if (task === generation.current) setBusy(null);
    }
  }
  function field(
    key: TranslationKey,
    value: string,
    change: (value: string) => void,
    multiline = false,
  ) {
    return (
      <label className="block text-xs font-semibold">
        {t(key)}
        {multiline ? (
          <textarea
            className={`${inputClass} font-mono`}
            rows={5}
            value={value}
            onChange={(e) => change(e.target.value)}
          />
        ) : (
          <input
            className={inputClass}
            value={value}
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if (key === "collection.search" && e.key === "Escape") {
                e.preventDefault();
                change("");
              }
            }}
          />
        )}
      </label>
    );
  }
  const reason = (value: CollectionRun["reason"]) =>
    t(
      value === "complete"
        ? "collection.reason.complete"
        : `collection.error.${value}`,
    );
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-bold text-[color:var(--color-brand-purple)]">
        {t("collection.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm">{t("collection.help")}</p>
          <p className="text-xs text-slate-600">{t("collection.privacy")}</p>
          <p className="text-xs text-slate-600">{t("collection.limits")}</p>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={
                feedback.error
                  ? "text-sm text-red-700"
                  : "text-sm text-emerald-700"
              }
            >
              {t(feedback.key)}
            </p>
          )}
          {pending && (
            <p role="status" className="text-xs text-amber-800">
              {t("collection.pending")}
            </p>
          )}
          <fieldset
            disabled={!!busy || pending}
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              className={buttonClass}
              onClick={() => accept(demoCollectionProject())}
            >
              {t("collection.demo")}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => accept(emptyCollectionProject())}
            >
              {t("collection.new")}
            </button>
            <label className={`${buttonClass} cursor-pointer`}>
              {t("collection.import")}
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void importFile(file);
                }}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                download(
                  () => serializeCollectionProject(project),
                  "project.json",
                )
              }
            >
              {t("collection.export")}
            </button>
          </fieldset>
          <fieldset disabled={!!busy} className="space-y-3">
            {field("collection.projectName", projectName, setProjectName)}
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1 text-xs font-semibold">
                {t("collection.plan")}
                <select
                  className={inputClass}
                  value={selectedId}
                  disabled={pending}
                  onChange={(e) =>
                    choosePlan(
                      project.plans.find((p) => p.id === e.target.value)!,
                    )
                  }
                >
                  {project.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={buttonClass}
                disabled={
                  pending || project.plans.length >= MAX_COLLECTION_PLANS
                }
                onClick={addPlan}
              >
                {t("collection.addPlan")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={pending || project.plans.length <= 1}
                onClick={deletePlan}
              >
                {t("collection.deletePlan")}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {field("collection.name", draft.name, (value) =>
                setDraft({ ...draft, name: value }),
              )}
              {field("collection.url", draft.url, (value) =>
                setDraft({ ...draft, url: value }),
              )}
              <label className="text-xs font-semibold">
                {t("collection.strategy")}
                <select
                  className={inputClass}
                  value={draft.strategy}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      strategy: e.target.value as CollectionPlan["strategy"],
                    })
                  }
                >
                  {COLLECTION_STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {t(`collection.strategy.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              {field("collection.itemsPointer", draft.itemsPointer, (value) =>
                setDraft({ ...draft, itemsPointer: value }),
              )}
              {["cursor", "next-url"].includes(draft.strategy) &&
                field("collection.nextPointer", draft.nextPointer, (value) =>
                  setDraft({ ...draft, nextPointer: value }),
                )}
              {["cursor", "page", "offset"].includes(draft.strategy) && (
                <>
                  {field("collection.parameter", draft.parameter, (value) =>
                    setDraft({ ...draft, parameter: value }),
                  )}
                  {field(
                    "collection.sizeParameter",
                    draft.sizeParameter,
                    (value) => setDraft({ ...draft, sizeParameter: value }),
                  )}
                </>
              )}
              <label className="text-xs font-semibold">
                {t("collection.deduplicate")}
                <select
                  className={inputClass}
                  value={draft.deduplicate}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      deduplicate: e.target
                        .value as CollectionPlan["deduplicate"],
                    })
                  }
                >
                  {(["none", "first", "last", "error"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`collection.deduplicate.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              {draft.deduplicate !== "none" &&
                field(
                  "collection.identityPointer",
                  draft.identityPointer,
                  (value) => setDraft({ ...draft, identityPointer: value }),
                )}
              {numberKeys
                .filter(
                  (k) =>
                    (k !== "start" && k !== "pageSize") ||
                    ["page", "offset"].includes(draft.strategy) ||
                    (k === "pageSize" && draft.strategy === "cursor"),
                )
                .map((k) => (
                  <div key={k}>
                    {field(`collection.${k}`, draft[k], (value) =>
                      setDraft({ ...draft, [k]: value }),
                    )}
                  </div>
                ))}
            </div>
            {["page", "offset"].includes(draft.strategy) && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.stopOnShortPage}
                  onChange={(e) =>
                    setDraft({ ...draft, stopOnShortPage: e.target.checked })
                  }
                />
                {t("collection.stopOnShortPage")}
              </label>
            )}
            <p className="text-xs text-slate-600">
              {t("collection.navigationHelp")}
            </p>
            {field(
              "collection.assertions",
              draft.assertions,
              (value) => setDraft({ ...draft, assertions: value }),
              true,
            )}
            <p className="text-xs text-slate-600">
              {t("collection.assertionsHelp")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={savePlan}>
                {t("collection.save")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!pending}
                onClick={discard}
              >
                {t("collection.discard")}
              </button>
            </div>
          </fieldset>
          <fieldset
            disabled={!!busy}
            className="space-y-3 rounded-xl border border-slate-200 p-3"
          >
            <legend className="px-1 text-sm font-bold">
              {t("collection.fixtures")}
            </legend>
            <p className="text-xs text-slate-600">
              {t("collection.fixtureHelp")}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              {project.fixtures.length > 0 ? (
                <label className="min-w-48 flex-1 text-xs font-semibold">
                  {t("collection.fixture")}
                  <select
                    className={inputClass}
                    value={fixtureId}
                    disabled={pending}
                    onChange={(e) =>
                      chooseFixture(
                        project.fixtures.find((f) => f.id === e.target.value),
                      )
                    }
                  >
                    {project.fixtures.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs">{t("collection.noFixtures")}</p>
              )}
              <button
                type="button"
                className={buttonClass}
                disabled={
                  pending || project.fixtures.length >= MAX_COLLECTION_FIXTURES
                }
                onClick={addFixture}
              >
                {t("collection.addFixture")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={pending || !pageDraft}
                onClick={deleteFixture}
              >
                {t("collection.deleteFixture")}
              </button>
            </div>
            {pageDraft && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {field("collection.fixtureName", pageDraft.name, (value) =>
                    setPageDraft({ ...pageDraft, name: value }),
                  )}
                  {field("collection.fixtureUrl", pageDraft.url, (value) =>
                    setPageDraft({ ...pageDraft, url: value }),
                  )}
                  {field(
                    "collection.fixtureStatus",
                    pageDraft.status,
                    (value) => setPageDraft({ ...pageDraft, status: value }),
                  )}
                  {field("collection.fixtureMime", pageDraft.mime, (value) =>
                    setPageDraft({ ...pageDraft, mime: value }),
                  )}
                  {field("collection.fixtureLink", pageDraft.link, (value) =>
                    setPageDraft({ ...pageDraft, link: value }),
                  )}
                </div>
                {field(
                  "collection.fixtureBody",
                  pageDraft.body,
                  (value) => setPageDraft({ ...pageDraft, body: value }),
                  true,
                )}
                <button
                  type="button"
                  className={buttonClass}
                  onClick={saveFixture}
                >
                  {t("collection.saveFixture")}
                </button>
              </>
            )}
          </fieldset>
          <fieldset disabled={!!busy || pending} className="space-y-3">
            {field(
              "collection.headers",
              headers,
              (value) => {
                setHeaders(value);
                clearResults();
              },
              true,
            )}
            <p className="text-xs text-slate-600">{t("collection.liveHelp")}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                onClick={() => void collect("offline")}
              >
                {t("collection.offline")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void collect("offline", true)}
              >
                {t("collection.suite")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void collect("live")}
              >
                {t("collection.live")}
              </button>
            </div>
          </fieldset>
          {busy === "run" && (
            <div className="flex flex-wrap items-center gap-2">
              <p role="status" className="text-xs">
                {message("collection.running", progress)}
              </p>
              <button
                type="button"
                className={buttonClass}
                onClick={() => abort.current?.abort()}
              >
                {t("collection.cancel")}
              </button>
            </div>
          )}
          {runs.length > 0 && (
            <section className="space-y-3" aria-label={t("collection.results")}>
              <p role="status" className="text-sm">
                {message("collection.progress", {
                  count: runs.length,
                  total,
                  passed: runs.filter((r) => r.passed).length,
                  failed: runs.filter((r) => !r.passed).length,
                })}
              </p>
              <fieldset disabled={!!busy || pending} className="space-y-3">
                <label className="block text-xs font-semibold">
                  {t("collection.resultPlan")}
                  <select
                    className={inputClass}
                    value={runId}
                    onChange={(e) => {
                      setRunId(e.target.value);
                      setSearch("");
                      setRecordIndex(0);
                    }}
                  >
                    <option value="">—</option>
                    {runs.map((r) => (
                      <option key={r.planId} value={r.planId}>
                        {r.name}:{" "}
                        {t(
                          r.passed ? "collection.passed" : "collection.failed",
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() =>
                    download(
                      () => json(collectionRunReport(runs, total)),
                      "report.json",
                    )
                  }
                >
                  {t("collection.report")}
                </button>
                {current && (
                  <>
                    <p className="text-sm font-bold">
                      {t(
                        current.passed
                          ? "collection.passed"
                          : "collection.failed",
                      )}{" "}
                      · {current.name}
                    </p>
                    <p className="text-xs">
                      {message("collection.summary", {
                        mode: t(`collection.mode.${current.mode}`),
                        pages: current.pages.length,
                        received: current.received,
                        records: current.records.length,
                        duplicates: current.duplicates,
                        bytes: current.bytes,
                        ms: current.elapsedMs,
                      })}
                    </p>
                    <p className="text-xs">
                      {t("collection.stop", { reason: reason(current.reason) })}
                    </p>
                    <ul
                      className="space-y-1 text-xs"
                      aria-label={t("collection.checks")}
                    >
                      {current.checks.map((c, index) => (
                        <li key={index}>
                          {t(
                            c.passed
                              ? "collection.passed"
                              : "collection.failed",
                          )}{" "}
                          ·{" "}
                          {message(`collection.check.${c.type}`, {
                            index: (c.index ?? 0) + 1,
                            checked: c.checked,
                            failed: c.failed,
                          })}
                        </li>
                      ))}
                    </ul>
                    <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <caption className="p-2 text-left font-bold">
                          {t("collection.journal")}
                        </caption>
                        <thead>
                          <tr>
                            {(
                              [
                                "page",
                                "pageUrl",
                                "pageStatus",
                                "pageItems",
                                "pageOutcome",
                              ] as const
                            ).map((k) => (
                              <th key={k} className="p-2">
                                {t(`collection.${k}`)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {current.pages.map((p) => (
                            <tr
                              key={p.index}
                              className="border-t border-slate-100"
                            >
                              <td className="p-2">{p.index}</td>
                              <td className="max-w-80 break-all p-2 font-mono">
                                {p.url}
                              </td>
                              <td className="p-2">{p.status ?? "—"}</td>
                              <td className="p-2">
                                {p.received} / {p.added} / {p.duplicates}
                              </td>
                              <td className="p-2">
                                {t(
                                  p.accepted
                                    ? "collection.accepted"
                                    : "collection.rejected",
                                )}
                                {p.issue && ` · ${reason(p.issue)}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["json", "ndjson", "csv"] as const).map((format) => (
                        <button
                          type="button"
                          key={format}
                          className={buttonClass}
                          onClick={() =>
                            download(
                              () => collectionDataset(current.records, format),
                              `data.${format}`,
                              format === "csv"
                                ? "text/csv;charset=utf-8"
                                : format === "ndjson"
                                  ? "application/x-ndjson"
                                  : "application/json",
                            )
                          }
                        >
                          {t(`collection.${format}`)}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => void copy()}
                      >
                        {t("collection.copy")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={
                          !current.pages.some((p) => p.body !== undefined)
                        }
                        onClick={capture}
                      >
                        {t("collection.capture")}
                      </button>
                    </div>
                    {field("collection.search", search, setSearch)}
                    <p className="text-xs">
                      {message("collection.recordCount", {
                        shown: matching.length,
                        total: current.records.length,
                      })}
                    </p>
                    {visible.length ? (
                      <>
                        <label className="block text-xs font-semibold">
                          {t("collection.record")}
                          <select
                            className={inputClass}
                            value={inspected?.index ?? 0}
                            onChange={(e) =>
                              setRecordIndex(Number(e.target.value))
                            }
                          >
                            {visible.map((r) => (
                              <option key={r.index} value={r.index}>
                                #{r.index + 1} ·{" "}
                                {JSON.stringify(r.value).slice(0, 100)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs font-semibold">
                          {t("collection.recordData")}
                          <textarea
                            className={`${inputClass} font-mono`}
                            rows={8}
                            readOnly
                            value={
                              inspected
                                ? json(inspected.value).slice(0, 16000)
                                : ""
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <p className="text-xs">{t("collection.noRecords")}</p>
                    )}
                  </>
                )}
              </fieldset>
            </section>
          )}
        </div>
      )}
    </details>
  );
});
