"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  addAsyncChannel,
  AsyncError,
  asyncCatalogMarkdown,
  emptyAsyncDocument,
  eventJournalReport,
  exportAsyncDocument,
  MAX_ASYNC_BYTES,
  MAX_EVENT_BYTES,
  parseAsyncProject,
  parseEventHeaders,
  parseEventParameters,
  parseEventPayload,
  readAsyncDocument,
  rehearseEvent,
  replayEvent,
  serializeAsyncProject,
  type AsyncDocument,
  type EventCheck,
  type EventEntry,
} from "@/lib/asyncapi-studio";
import { readTransformSource } from "@/lib/api-transform";
import { extractEndpoints } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const title = "asyncStudio.title";

export const AsyncApiStudioPanel = memo(function AsyncApiStudioPanel({
  getSchemaText,
}: {
  getSchemaText: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [doc, setDoc] = useState<AsyncDocument | null>(null),
    [draft, setDraft] = useState("");
  const [journal, setJournal] = useState<EventEntry[]>([]),
    [projectName, setProjectName] = useState("Event API project");
  const [loading, setLoading] = useState(false),
    [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error: boolean;
    } | null>(null);
  const [search, setSearch] = useState(""),
    [direction, setDirection] = useState<"all" | "send" | "receive">("all"),
    [operationKey, setOperationKey] = useState("");
  const [messageKey, setMessageKey] = useState(""),
    [exampleIndex, setExampleIndex] = useState("0");
  const [payload, setPayload] = useState("{}"),
    [headers, setHeaders] = useState("{}"),
    [parameters, setParameters] = useState("{}");
  const [check, setCheck] = useState<EventCheck | null>(null),
    [eventSearch, setEventSearch] = useState(""),
    [eventFilter, setEventFilter] = useState<"all" | EventCheck["status"]>(
      "all",
    ),
    [page, setPage] = useState(0),
    [selectedSequence, setSelectedSequence] = useState(0);
  const [builderKey, setBuilderKey] = useState("orders"),
    [builderAddress, setBuilderAddress] = useState("orders.created"),
    [builderName, setBuilderName] = useState("OrderCreated"),
    [builderAction, setBuilderAction] = useState<"send" | "receive">("send"),
    [builderExample, setBuilderExample] = useState(
      '{"orderId":1,"status":"created"}',
    );
  const [seeds, setSeeds] = useState<{ label: string; example: string }[]>([]),
    [seedIndex, setSeedIndex] = useState("0");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const dirty = doc ? draft !== doc.text : Boolean(draft.trim());
  const operation = doc?.catalog.operations.find((o) => o.key === operationKey),
    channel = doc?.catalog.channels.find(
      (c) => c.key === operation?.channelKey,
    ),
    message = channel?.messages.find(
      (m) => m.key === messageKey && operation?.messageKeys.includes(m.key),
    );
  const operations = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (doc?.catalog.operations ?? []).filter(
      (op) =>
        (direction === "all" || op.action === direction) &&
        terms.every((term) =>
          `${op.name} ${op.key} ${op.channelKey} ${doc?.catalog.channels.find((c) => c.key === op.channelKey)?.address ?? ""} ${op.messageKeys.join(" ")}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [doc, search, direction]);
  const events = useMemo(() => {
    const terms = eventSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return journal.filter(
      (e) =>
        (eventFilter === "all" || e.check.status === eventFilter) &&
        terms.every((term) =>
          `${e.sequence} ${e.operationKey} ${e.messageKey} ${e.address} ${e.action} ${e.check.status} ${e.check.correlation ?? ""}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [journal, eventSearch, eventFilter]);
  const lastPage = Math.max(0, Math.ceil(events.length / 20) - 1),
    currentPage = Math.min(page, lastPage);
  const selectedEvent = journal.find((e) => e.sequence === selectedSequence);
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof AsyncError
          ? `asyncStudio.error.${error.code}`
          : "asyncStudio.error.document",
      error: true,
    });
  }
  function selectOperation(next: AsyncDocument, key: string) {
    const op = next.catalog.operations.find((o) => o.key === key),
      c = next.catalog.channels.find((c) => c.key === op?.channelKey);
    setOperationKey(key);
    setMessageKey(op?.messageKeys[0] ?? "");
    setExampleIndex("0");
    setCheck(null);
    setPayload("{}");
    setHeaders("{}");
    setParameters(
      json(
        Object.fromEntries(
          (c?.parameters ?? []).map((p) => [p.name, p.defaultValue ?? ""]),
        ),
      ),
    );
  }
  function adopt(
    next: AsyncDocument,
    nextJournal: EventEntry[] = [],
    name = next.catalog.title,
  ) {
    setDoc(next);
    setDraft(next.text);
    setJournal(nextJournal);
    setProjectName(name.length > 120 ? name.trim().slice(0, 120) : name);
    setPage(0);
    setSearch("");
    setDirection("all");
    setEventSearch("");
    setEventFilter("all");
    setSelectedSequence(0);
    selectOperation(next, next.catalog.operations[0]?.key ?? "");
  }
  function loadDraft() {
    try {
      adopt(readAsyncDocument(draft));
      setFeedback({ key: "asyncStudio.loaded", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File, project: boolean) {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (file.size > MAX_ASYNC_BYTES) throw new AsyncError("limit");
      const text = await file.text();
      if (token !== generation.current) return;
      if (project) {
        const parsed = parseAsyncProject(text);
        adopt(parsed.doc, parsed.project.journal, parsed.project.name);
      } else adopt(readAsyncDocument(text));
      setFeedback({
        key: project ? "asyncStudio.restored" : "asyncStudio.loaded",
        error: false,
      });
    } catch (error) {
      if (token === generation.current) fail(error);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function build() {
    if (!doc || dirty) return;
    try {
      const next = addAsyncChannel(doc, {
        key: builderKey,
        address: builderAddress,
        messageName: builderName,
        action: builderAction,
        example: builderExample,
      });
      // Existing event inputs can be rechecked against the additive contract.
      const restored = parseAsyncProject(
        serializeAsyncProject(next, journal, projectName),
      );
      adopt(next, restored.project.journal, projectName);
      const op = next.catalog.operations.find(
        (o) => o.channelKey === builderKey,
      );
      if (op) selectOperation(next, op.key);
      setFeedback({ key: "asyncStudio.built", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function captureSeeds() {
    try {
      const root = readTransformSource(getSchemaText()).document;
      const choices = extractEndpoints(root as Record<string, unknown>)
        .flatMap((ep) => [
          ...ep.requestBodies.map((b) => ({
            label: `${ep.method} ${ep.path} · request ${b.contentType}`,
            example: b.schema.example,
          })),
          ...ep.responses.map((r) => ({
            label: `${ep.method} ${ep.path} · response ${r.status}`,
            example: r.schema?.example ?? "",
          })),
        ])
        .filter((v) => {
          try {
            parseEventPayload(v.example);
            return true;
          } catch {
            return false;
          }
        });
      if (choices.length > 1000) throw new AsyncError("limit");
      setSeeds(choices);
      setSeedIndex("0");
      setFeedback({
        key: choices.length ? "asyncStudio.seedsLoaded" : "asyncStudio.noSeeds",
        error: false,
      });
    } catch {
      setFeedback({ key: "asyncStudio.error.openapi", error: true });
    }
  }
  function useExample() {
    const example = message?.examples[Number(exampleIndex)];
    if (!example) return;
    setPayload(json(example.payload));
    setHeaders(json(example.headers));
    setCheck(null);
    setFeedback(null);
  }
  function input() {
    return {
      operationKey,
      messageKey,
      payload: parseEventPayload(payload),
      headers: parseEventHeaders(headers),
      parameters: parseEventParameters(parameters),
    };
  }
  function validate(record: boolean) {
    if (!doc || dirty || !message) return;
    try {
      const result = rehearseEvent(doc, record ? journal : [], input());
      const event = result.at(-1)!;
      setCheck(event.check);
      if (record) {
        setJournal(result);
        setSelectedSequence(event.sequence);
        setPage(0);
      }
      setFeedback({
        key: record ? "asyncStudio.recorded" : "asyncStudio.checked",
        error: false,
      });
    } catch (error) {
      fail(error);
    }
  }
  function replay(sequence: number) {
    if (!doc || dirty) return;
    try {
      const result = replayEvent(doc, journal, sequence);
      setJournal(result);
      setCheck(result.at(-1)!.check);
      setSelectedSequence(result.at(-1)!.sequence);
      setFeedback({ key: "asyncStudio.replayed", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function download(
    kind: "json" | "yaml" | "markdown" | "project" | "journal" | "report",
  ) {
    if (!doc || dirty || loading) return;
    try {
      const text =
        kind === "json" || kind === "yaml"
          ? exportAsyncDocument(doc, kind)
          : kind === "markdown"
            ? asyncCatalogMarkdown(doc)
            : kind === "project"
              ? serializeAsyncProject(doc, journal, projectName)
              : kind === "journal"
                ? json({
                    kind: "rsswag-event-journal",
                    version: 1,
                    events: journal,
                  }) + "\n"
                : json(eventJournalReport(doc, journal)) + "\n";
      if (new TextEncoder().encode(text).length > MAX_ASYNC_BYTES)
        throw new AsyncError("limit");
      const ext =
        kind === "yaml" ? "yaml" : kind === "markdown" ? "md" : "json";
      const ok = downloadTextFile(
        text,
        `asyncapi-${kind}.${ext}`,
        kind === "yaml"
          ? "application/yaml"
          : kind === "markdown"
            ? "text/markdown"
            : "application/json",
      );
      setFeedback({
        key: ok ? "asyncStudio.downloaded" : "asyncStudio.error.download",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  function renderCheck(result: EventCheck) {
    return (
      <div className="space-y-2 text-xs">
        <p className="font-bold">
          {t("asyncStudio.checkStatus", {
            status: t(`asyncStudio.status.${result.status}`),
          })}
        </p>
        {result.issues.length > 0 && (
          <ul className="space-y-1">
            {result.issues.map((issue, i) => (
              <li key={i} className="break-all">
                {issue.part} {issue.path || "/"} · {issue.keyword} ·{" "}
                {issue.severity}
              </li>
            ))}
          </ul>
        )}
        {result.findings.length > 0 && (
          <ul className="space-y-1">
            {result.findings.map((f, i) => (
              <li key={i} className="break-all">
                {t(`asyncStudio.finding.${f.code}`)} · {f.pointer || "/"}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t(title)}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("asyncStudio.description")}</p>
          <p className="text-xs text-slate-600">{t("asyncStudio.help")}</p>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-red-700" : "text-emerald-700"}
            >
              {t(feedback.key)}
            </p>
          )}
          {loading && <p role="status">{t("asyncStudio.loading")}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {([false, true] as const).map((project) => (
              <label className="block text-xs font-bold" key={String(project)}>
                {t(
                  project
                    ? "asyncStudio.importProject"
                    : "asyncStudio.importDocument",
                )}
                <input
                  className={inputClass}
                  type="file"
                  accept={
                    project
                      ? ".json,application/json"
                      : ".json,.yaml,.yml,application/json,application/yaml,text/yaml"
                  }
                  disabled={loading}
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (f) void read(f, project);
                  }}
                />
              </label>
            ))}
          </div>
          <fieldset disabled={loading} className="min-w-0 space-y-3">
            <legend className="font-bold">{t("asyncStudio.contract")}</legend>
            <label className="block text-xs font-bold">
              {t("asyncStudio.source")}
              <textarea
                className={`${inputClass} font-mono`}
                rows={9}
                maxLength={MAX_ASYNC_BYTES}
                spellCheck={false}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setFeedback(null);
                  setCheck(null);
                }}
              />
            </label>
            <p className="text-xs text-slate-600">
              {t("asyncStudio.sourceHelp")}
            </p>
            {dirty && (
              <p role="status" className="text-amber-800">
                {t("asyncStudio.dirty")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!draft.trim()}
                onClick={loadDraft}
              >
                {t("asyncStudio.load")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!doc}
                onClick={() => {
                  if (doc) {
                    setDraft(doc.text);
                    setFeedback(null);
                  }
                }}
              >
                {t("asyncStudio.discard")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  adopt(emptyAsyncDocument());
                  setFeedback({ key: "asyncStudio.created", error: false });
                }}
              >
                {t("asyncStudio.create")}
              </button>
            </div>
          </fieldset>
          {doc && (
            <>
              <p className="text-xs font-bold">
                {t("asyncStudio.summary", {
                  title: doc.catalog.title,
                  version: doc.catalog.version,
                  channels: String(doc.catalog.channels.length),
                  operations: String(doc.catalog.operations.length),
                  messages: String(
                    doc.catalog.channels.reduce(
                      (n, c) => n + c.messages.length,
                      0,
                    ),
                  ),
                })}
              </p>
              <fieldset
                disabled={loading || dirty}
                className="min-w-0 space-y-3"
              >
                <legend className="font-bold">
                  {t("asyncStudio.exports")}
                </legend>
                <label className="block text-xs font-bold">
                  {t("asyncStudio.projectName")}
                  <input
                    className={inputClass}
                    maxLength={120}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "json",
                      "yaml",
                      "markdown",
                      "project",
                      "journal",
                      "report",
                    ] as const
                  ).map((kind) => (
                    <button
                      type="button"
                      key={kind}
                      className={buttonClass}
                      onClick={() => download(kind)}
                    >
                      {t(`asyncStudio.export.${kind}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <details>
                <summary className="cursor-pointer text-xs font-bold">
                  {t("asyncStudio.builder")}
                </summary>
                <fieldset
                  disabled={
                    loading || dirty || !doc.catalog.version.startsWith("3.")
                  }
                  className="mt-3 min-w-0 space-y-3"
                >
                  <legend className="sr-only">
                    {t("asyncStudio.builder")}
                  </legend>
                  <p className="text-xs text-slate-600">
                    {t("asyncStudio.builderHelp")}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-bold">
                      {t("asyncStudio.channelKey")}
                      <input
                        className={inputClass}
                        maxLength={64}
                        value={builderKey}
                        onChange={(e) => setBuilderKey(e.target.value)}
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      {t("asyncStudio.address")}
                      <input
                        className={inputClass}
                        maxLength={2048}
                        value={builderAddress}
                        onChange={(e) => setBuilderAddress(e.target.value)}
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      {t("asyncStudio.messageName")}
                      <input
                        className={inputClass}
                        maxLength={120}
                        value={builderName}
                        onChange={(e) => setBuilderName(e.target.value)}
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      {t("asyncStudio.action")}
                      <select
                        className={inputClass}
                        value={builderAction}
                        onChange={(e) =>
                          setBuilderAction(
                            e.target.value as typeof builderAction,
                          )
                        }
                      >
                        <option value="send">{t("asyncStudio.send")}</option>
                        <option value="receive">
                          {t("asyncStudio.receive")}
                        </option>
                      </select>
                    </label>
                  </div>
                  <label className="block text-xs font-bold">
                    {t("asyncStudio.seed")}
                    <textarea
                      className={`${inputClass} font-mono`}
                      rows={5}
                      maxLength={MAX_EVENT_BYTES}
                      spellCheck={false}
                      value={builderExample}
                      onChange={(e) => setBuilderExample(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={captureSeeds}
                  >
                    {t("asyncStudio.captureSeeds")}
                  </button>
                  {seeds.length > 0 && (
                    <>
                      <label className="block text-xs font-bold">
                        {t("asyncStudio.seedChoice")}
                        <select
                          className={inputClass}
                          value={seedIndex}
                          onChange={(e) => setSeedIndex(e.target.value)}
                        >
                          {seeds.map((seed, i) => (
                            <option key={i} value={i}>
                              {seed.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => {
                          if (seeds[Number(seedIndex)])
                            setBuilderExample(seeds[Number(seedIndex)].example);
                        }}
                      >
                        {t("asyncStudio.useSeed")}
                      </button>
                    </>
                  )}
                  <button type="button" className={buttonClass} onClick={build}>
                    {t("asyncStudio.addChannel")}
                  </button>
                </fieldset>
                {!doc.catalog.version.startsWith("3.") && (
                  <p className="mt-2 text-xs">{t("asyncStudio.builderV3")}</p>
                )}
              </details>
              {doc.catalog.findings.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs font-bold">
                    {t("asyncStudio.findings", {
                      count: String(doc.catalog.findings.length),
                    })}
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {doc.catalog.findings.slice(0, 100).map((f, i) => (
                      <li className="break-all" key={i}>
                        {t(`asyncStudio.finding.${f.code}`)} · {f.pointer}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {doc.catalog.servers.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs font-bold">
                    {t("asyncStudio.servers")}
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {doc.catalog.servers.map((server) => (
                      <li className="break-all" key={server.key}>
                        {server.key} · {server.protocol} · {server.address}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <section className="space-y-3 rounded-xl border border-slate-200 p-3">
                <h3 className="font-bold">{t("asyncStudio.operations")}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold">
                    {t("asyncStudio.search")}
                    <input
                      className={inputClass}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setSearch("");
                      }}
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {t("asyncStudio.direction")}
                    <select
                      className={inputClass}
                      value={direction}
                      onChange={(e) =>
                        setDirection(e.target.value as typeof direction)
                      }
                    >
                      <option value="all">{t("asyncStudio.all")}</option>
                      <option value="send">{t("asyncStudio.send")}</option>
                      <option value="receive">
                        {t("asyncStudio.receive")}
                      </option>
                    </select>
                  </label>
                </div>
                {!operations.length && (
                  <p className="text-xs">{t("asyncStudio.noOperations")}</p>
                )}
                <div className="flex max-h-64 flex-wrap gap-2 overflow-auto">
                  {operations.map((op) => (
                    <button
                      type="button"
                      key={op.key}
                      className={buttonClass}
                      disabled={loading || dirty}
                      aria-pressed={operationKey === op.key}
                      onClick={() => selectOperation(doc, op.key)}
                    >
                      {op.name} · {t(`asyncStudio.${op.action}`)} ·{" "}
                      {op.channelKey}
                    </button>
                  ))}
                </div>
              </section>
              <fieldset
                disabled={loading || dirty || !message}
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <legend className="font-bold">
                  {t("asyncStudio.rehearsal")}
                </legend>
                <p className="text-xs text-slate-600">
                  {t("asyncStudio.rehearsalHelp")}
                </p>
                {channel && (
                  <p className="text-xs break-all">
                    {channel.key} ·{" "}
                    {channel.address ?? t("asyncStudio.dynamic")} ·{" "}
                    {channel.description}
                  </p>
                )}
                <label className="block text-xs font-bold">
                  {t("asyncStudio.message")}
                  <select
                    className={inputClass}
                    value={messageKey}
                    onChange={(e) => {
                      setMessageKey(e.target.value);
                      setExampleIndex("0");
                      setCheck(null);
                    }}
                  >
                    {(channel?.messages ?? [])
                      .filter((m) => operation?.messageKeys.includes(m.key))
                      .map((m) => (
                        <option value={m.key} key={m.key}>
                          {m.name} · {m.key}
                        </option>
                      ))}
                  </select>
                </label>
                {message && (
                  <details>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("asyncStudio.messageDetails")}
                    </summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs break-all whitespace-pre-wrap">
                      {json({
                        contentType: message.contentType,
                        correlation: message.correlation,
                        payload: message.payload,
                        headers: message.headers,
                      }).slice(0, 16000)}
                    </pre>
                  </details>
                )}
                {(message?.examples.length ?? 0) > 0 && (
                  <>
                    <label className="block text-xs font-bold">
                      {t("asyncStudio.example")}
                      <select
                        className={inputClass}
                        value={exampleIndex}
                        onChange={(e) => setExampleIndex(e.target.value)}
                      >
                        {message!.examples.map((e, i) => (
                          <option key={i} value={i}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={useExample}
                    >
                      {t("asyncStudio.useExample")}
                    </button>
                  </>
                )}
                <label className="block text-xs font-bold">
                  {t("asyncStudio.parameters")}
                  <textarea
                    className={`${inputClass} font-mono`}
                    rows={3}
                    maxLength={MAX_EVENT_BYTES}
                    spellCheck={false}
                    value={parameters}
                    onChange={(e) => {
                      setParameters(e.target.value);
                      setCheck(null);
                    }}
                  />
                </label>
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="block text-xs font-bold">
                    {t("asyncStudio.payload")}
                    <textarea
                      className={`${inputClass} font-mono`}
                      rows={7}
                      maxLength={MAX_EVENT_BYTES}
                      spellCheck={false}
                      value={payload}
                      onChange={(e) => {
                        setPayload(e.target.value);
                        setCheck(null);
                      }}
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {t("asyncStudio.headers")}
                    <textarea
                      className={`${inputClass} font-mono`}
                      rows={7}
                      maxLength={MAX_EVENT_BYTES}
                      spellCheck={false}
                      value={headers}
                      onChange={(e) => {
                        setHeaders(e.target.value);
                        setCheck(null);
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => validate(false)}
                  >
                    {t("asyncStudio.validate")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={journal.length >= 200}
                    onClick={() => validate(true)}
                  >
                    {t("asyncStudio.record")}
                  </button>
                </div>
                {check && renderCheck(check)}
              </fieldset>
              <section className="space-y-3 rounded-xl border border-slate-200 p-3">
                <h3 className="font-bold">
                  {t("asyncStudio.journal", { count: String(journal.length) })}
                </h3>
                <p className="text-xs text-slate-600">
                  {t("asyncStudio.journalHelp")}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold">
                    {t("asyncStudio.eventSearch")}
                    <input
                      className={inputClass}
                      value={eventSearch}
                      onChange={(e) => {
                        setEventSearch(e.target.value);
                        setPage(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEventSearch("");
                          setPage(0);
                        }
                      }}
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {t("asyncStudio.eventFilter")}
                    <select
                      className={inputClass}
                      value={eventFilter}
                      onChange={(e) => {
                        setEventFilter(e.target.value as typeof eventFilter);
                        setPage(0);
                      }}
                    >
                      <option value="all">{t("asyncStudio.all")}</option>
                      {(["valid", "invalid", "partial"] as const).map(
                        (status) => (
                          <option key={status} value={status}>
                            {t(`asyncStudio.status.${status}`)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                {!events.length && (
                  <p className="text-xs">{t("asyncStudio.noEvents")}</p>
                )}
                <ul className="space-y-2">
                  {events
                    .slice(currentPage * 20, (currentPage + 1) * 20)
                    .map((event) => (
                      <li
                        className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs break-all"
                        key={event.sequence}
                      >
                        <p>
                          {event.sequence} · {event.action} · {event.address} ·{" "}
                          {t(`asyncStudio.status.${event.check.status}`)}
                          {event.check.correlation !== null
                            ? ` · ${String(event.check.correlation)}`
                            : ""}
                          {event.replayOf
                            ? ` · ${t("asyncStudio.replayOf", { sequence: String(event.replayOf) })}`
                            : ""}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={buttonClass}
                            aria-label={t("asyncStudio.inspectEvent", {
                              sequence: String(event.sequence),
                            })}
                            onClick={() => setSelectedSequence(event.sequence)}
                          >
                            {t("asyncStudio.inspect")}
                          </button>
                          <button
                            type="button"
                            className={buttonClass}
                            disabled={loading || dirty || journal.length >= 200}
                            aria-label={t("asyncStudio.replayEvent", {
                              sequence: String(event.sequence),
                            })}
                            onClick={() => replay(event.sequence)}
                          >
                            {t("asyncStudio.replay")}
                          </button>
                          <button
                            type="button"
                            className={buttonClass}
                            disabled={loading || dirty}
                            aria-label={t("asyncStudio.editEvent", {
                              sequence: String(event.sequence),
                            })}
                            onClick={() => {
                              selectOperation(doc, event.operationKey);
                              setMessageKey(event.messageKey);
                              setParameters(json(event.parameters));
                              setPayload(json(event.payload));
                              setHeaders(json(event.headers));
                              setCheck(null);
                              setFeedback(null);
                            }}
                          >
                            {t("asyncStudio.edit")}
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
                {lastPage > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!currentPage}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      {t("asyncStudio.previous")}
                    </button>
                    <p className="text-xs">
                      {t("asyncStudio.page", {
                        page: String(currentPage + 1),
                        total: String(lastPage + 1),
                      })}
                    </p>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={currentPage === lastPage}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      {t("asyncStudio.next")}
                    </button>
                  </div>
                )}
                {selectedEvent && (
                  <details open>
                    <summary className="cursor-pointer text-xs font-bold">
                      {t("asyncStudio.selectedEvent", {
                        sequence: String(selectedEvent.sequence),
                      })}
                    </summary>
                    <pre
                      aria-label={t("asyncStudio.eventPreview")}
                      className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap"
                    >
                      {json({
                        payload: selectedEvent.payload,
                        headers: selectedEvent.headers,
                        parameters: selectedEvent.parameters,
                      }).slice(0, 16000)}
                    </pre>
                    {renderCheck(selectedEvent.check)}
                  </details>
                )}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={loading || !journal.length}
                  onClick={() => {
                    setJournal(journal.slice(0, -1));
                    setSelectedSequence(0);
                    setCheck(null);
                    setFeedback(null);
                  }}
                >
                  {t("asyncStudio.undo")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={loading || !journal.length}
                  onClick={() => {
                    setJournal([]);
                    setSelectedSequence(0);
                    setCheck(null);
                    setFeedback(null);
                  }}
                >
                  {t("asyncStudio.clear")}
                </button>
              </section>
            </>
          )}
        </div>
      )}
    </details>
  );
});
