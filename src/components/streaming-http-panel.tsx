"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import { parseTransformValue } from "@/lib/api-transform";
import {
  appendStreamRecord,
  defaultStreamCase,
  demoStreamProject,
  emptyStreamProject,
  MAX_STREAM_CASES,
  MAX_STREAM_PROJECT_BYTES,
  normalizeStreamCase,
  parseStreamHeaders,
  parseStreamProject,
  parseStreamTranscript,
  replayStreamCaseAsync,
  runStreamCases,
  serializeStreamProject,
  serializeStreamTranscript,
  streamCaseFromTranscript,
  streamCasesReport,
  StreamError,
  streamError,
  validateStreamConnection,
  type StreamCase,
  type StreamCaseRun,
  type StreamConnection,
  type StreamFormat,
  type StreamParserError,
  type StreamProject,
  type StreamRecord,
  type StreamTranscript,
} from "@/lib/streaming-http";
import {
  StreamingSession,
  type StreamingRun,
  type StreamingState,
} from "@/lib/streaming-session";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const configNumbers = [
  "handshakeMs",
  "idleMs",
  "durationMs",
  "maxRecords",
  "reconnects",
  "retryMs",
] as const;
type ConfigNumber = (typeof configNumbers)[number];
type ConfigDraft = Omit<StreamConnection, ConfigNumber> &
  Record<ConfigNumber, string>;
type CaseDraft = Omit<
  StreamCase,
  "chunkBytes" | "minRecords" | "maxRecords" | "checks"
> & {
  chunkBytes: string;
  minRecords: string;
  maxRecords: string;
  checks: string;
};
const configDraft = (c: StreamConnection): ConfigDraft => ({
  ...c,
  ...(Object.fromEntries(configNumbers.map((k) => [k, String(c[k])])) as Record<
    ConfigNumber,
    string
  >),
});
const caseDraft = (c: StreamCase): CaseDraft => ({
  ...c,
  chunkBytes: String(c.chunkBytes),
  minRecords: String(c.minRecords),
  maxRecords: String(c.maxRecords),
  checks: json(c.checks),
});
const idleState = (): StreamingState => ({
  status: "idle",
  connections: 0,
  records: 0,
  bytes: 0,
  comments: 0,
  lastEventId: "",
  retryMs: 1000,
  httpStatus: null,
});

export const StreamingHttpPanel = memo(function StreamingHttpPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyStreamProject);
  const [connection, setConnection] = useState(() =>
    configDraft(emptyStreamProject().connection),
  );
  const [caseId, setCaseId] = useState("starter"),
    [draft, setDraft] = useState(() => caseDraft(defaultStreamCase()));
  const [headers, setHeaders] = useState("{}");
  const [state, setState] = useState(idleState),
    [sessionReport, setSessionReport] = useState<StreamingRun | null>(null),
    [live, setLive] = useState(false);
  const [journal, setJournal] = useState<{
      records: StreamRecord[];
      dropped: number;
    }>({ records: [], dropped: 0 }),
    [journalFormat, setJournalFormat] = useState<StreamFormat>("sse");
  const [selectedSequence, setSelectedSequence] = useState(0),
    [search, setSearch] = useState(""),
    [eventFilter, setEventFilter] = useState("");
  const [caseRun, setCaseRun] = useState<StreamCaseRun | null>(null),
    [progress, setProgress] = useState({ count: 0, total: 0 });
  const [busy, setBusy] = useState<"read" | "cases" | "replay" | "copy" | null>(
      null,
    ),
    [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error: boolean;
    } | null>(null);
  const generation = useRef(0),
    liveGeneration = useRef(0),
    abort = useRef<AbortController | null>(null),
    session = useRef<StreamingSession | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      liveGeneration.current++;
      abort.current?.abort();
      session.current?.dispose();
    },
    [],
  );
  const savedCase =
    project.cases.find((c) => c.id === caseId) ?? project.cases[0];
  const caseDirty = json(draft) !== json(caseDraft(savedCase)),
    connectionDirty =
      json(connection) !== json(configDraft(project.connection)),
    pending = caseDirty || connectionDirty;
  const selectedRecord =
    journal.records.find((r) => r.sequence === selectedSequence) ??
    journal.records.at(-1);
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const eventTypes = Array.from(new Set(journal.records.map((r) => r.event)));
  const activeEventFilter = eventTypes.includes(eventFilter) ? eventFilter : "";
  const records = journal.records.filter(
    (r) =>
      (!activeEventFilter || r.event === activeEventFilter) &&
      terms.every((term) =>
        `${r.sequence} ${r.event} ${r.id} ${r.data}`
          .toLowerCase()
          .includes(term),
      ),
  );
  function fail(error: unknown) {
    setFeedback({
      key: `streamStudio.error.${streamError(error).code}`,
      error: true,
    });
  }
  function syncCase(c: StreamCase) {
    setCaseId(c.id);
    setDraft(caseDraft(c));
  }
  function clearJournal() {
    setJournal({ records: [], dropped: 0 });
    setSelectedSequence(0);
    setSearch("");
    setEventFilter("");
  }
  function accept(p: StreamProject) {
    setProject(p);
    setConnection(configDraft(p.connection));
    syncCase(p.cases[0]);
    setHeaders("{}");
    clearJournal();
    setJournalFormat(p.connection.format);
    setState(idleState());
    setSessionReport(null);
    setCaseRun(null);
    setFeedback(null);
  }
  function editCase(patch: Partial<CaseDraft>) {
    setDraft({ ...draft, ...patch });
    setCaseRun(null);
    setFeedback(null);
  }
  function editConnection(patch: Partial<ConfigDraft>) {
    setConnection({ ...connection, ...patch });
    setSessionReport(null);
    setFeedback(null);
  }
  async function task<T>(
    kind: NonNullable<typeof busy>,
    work: (signal: AbortSignal, token: number) => Promise<T>,
    apply: (value: T) => void,
  ) {
    const token = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    setBusy(kind);
    setFeedback(null);
    try {
      const value = await work(controller.signal, token);
      if (generation.current === token) apply(value);
    } catch (error) {
      if (generation.current === token) fail(error);
    } finally {
      if (generation.current === token) {
        setBusy(null);
        abort.current = null;
      }
    }
  }
  function saveConnection() {
    try {
      const c = validateStreamConnection({
        ...connection,
        ...Object.fromEntries(
          configNumbers.map((k) => [k, Number(connection[k])]),
        ),
      });
      const next = parseStreamProject(json({ ...project, connection: c }));
      setProject(next);
      setConnection(configDraft(c));
      setSessionReport(null);
      setFeedback({ key: "streamStudio.connectionSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function saveCase() {
    try {
      let checks: unknown;
      try {
        checks = parseTransformValue(draft.checks);
      } catch {
        throw new StreamError("json");
      }
      const c = normalizeStreamCase({
        ...draft,
        chunkBytes: Number(draft.chunkBytes),
        minRecords: Number(draft.minRecords),
        maxRecords: Number(draft.maxRecords),
        checks,
      });
      const next = parseStreamProject(
        json({
          ...project,
          cases: project.cases.map((previous) =>
            previous.id === savedCase.id ? c : previous,
          ),
        }),
      );
      setProject(next);
      syncCase(c);
      setCaseRun(null);
      setFeedback({ key: "streamStudio.caseSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function addCase(duplicate = false) {
    try {
      const c = duplicate
        ? {
            ...savedCase,
            id: crypto.randomUUID(),
            name: `${savedCase.name.slice(0, 105)} (copy)`,
          }
        : defaultStreamCase(
            crypto.randomUUID(),
            `Replay case ${project.cases.length + 1}`,
          );
      const next = parseStreamProject(
        json({ ...project, cases: [...project.cases, c] }),
      );
      setProject(next);
      syncCase(c);
      setCaseRun(null);
      setFeedback(null);
    } catch (error) {
      fail(error);
    }
  }
  function connect() {
    try {
      parseStreamHeaders(headers);
      const token = ++liveGeneration.current;
      const next = new StreamingSession(project.connection, headers, {
        onState: (value) => {
          if (liveGeneration.current === token) setState(value);
        },
        onRecord: (value) => {
          if (liveGeneration.current === token)
            setJournal((j) => appendStreamRecord(j, value));
        },
      });
      session.current = next;
      clearJournal();
      setJournalFormat(project.connection.format);
      setSessionReport(null);
      setLive(true);
      setFeedback(null);
      void next
        .run()
        .then((value) => {
          if (liveGeneration.current === token) setSessionReport(value);
        })
        .catch((error) => {
          if (liveGeneration.current === token) fail(error);
        })
        .finally(() => {
          if (liveGeneration.current === token) {
            setLive(false);
            session.current = null;
          }
        });
    } catch (error) {
      fail(error);
    }
  }
  function replay() {
    setCaseRun(null);
    setProgress({ count: 0, total: 1 });
    void task(
      "replay",
      (signal) => replayStreamCaseAsync(savedCase, signal),
      (value) => {
        if (!value) return;
        setJournal(
          value.records.reduce(appendStreamRecord, {
            records: [] as StreamRecord[],
            dropped: 0,
          }),
        );
        setJournalFormat(savedCase.format);
        setSelectedSequence(0);
        setSearch("");
        setEventFilter("");
        setState(idleState());
        setSessionReport(null);
        setCaseRun({
          kind: "rsswag-streaming-case-report",
          version: 1,
          complete: true,
          total: 1,
          completed: 1,
          results: [value.result],
        });
      },
    );
  }
  function runCases(sweep: boolean) {
    setCaseRun(null);
    setProgress({ count: 0, total: project.cases.length * (sweep ? 6 : 1) });
    void task(
      "cases",
      (signal, token) =>
        runStreamCases(project, { sweep }, signal, (count, total) => {
          if (generation.current === token && !signal.aborted)
            setProgress({ count, total });
        }),
      setCaseRun,
    );
  }
  function fileRead(file: File, kind: "project" | "transcript") {
    void task(
      "read",
      async () => {
        if (file.size > MAX_STREAM_PROJECT_BYTES)
          throw new StreamError("limit");
        const source = await file.text();
        return kind === "project"
          ? parseStreamProject(source)
          : parseStreamTranscript(source);
      },
      (value) => {
        if (value.kind === "rsswag-streaming-project") {
          accept(value);
          setFeedback({ key: "streamStudio.projectLoaded", error: false });
        } else {
          setJournal({ records: value.records, dropped: value.dropped });
          setJournalFormat(value.format);
          setSelectedSequence(0);
          setSearch("");
          setEventFilter("");
          setSessionReport(null);
          setState(idleState());
          setFeedback({ key: "streamStudio.transcriptLoaded", error: false });
        }
      },
    );
  }
  const transcript = (): StreamTranscript => ({
    kind: "rsswag-streaming-transcript",
    version: 1,
    format: journalFormat,
    ...journal,
  });
  function download(
    kind: "project" | "transcript" | "records" | "cases" | "session",
  ) {
    try {
      const content =
        kind === "project"
          ? serializeStreamProject(project)
          : kind === "transcript"
            ? serializeStreamTranscript(transcript())
            : kind === "records"
              ? journal.records.map((r) => JSON.stringify(r)).join("\n") + "\n"
              : kind === "cases" && caseRun
                ? streamCasesReport(caseRun)
                : kind === "session" && sessionReport
                  ? json(sessionReport)
                  : "";
      if (!content) return;
      const name =
        project.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) ||
        "streaming-http";
      const ok = downloadTextFile(
        content,
        `${name}-${kind}.${kind === "records" ? "ndjson" : "json"}`,
        kind === "records" ? "application/x-ndjson" : "application/json",
      );
      setFeedback({
        key: ok ? "streamStudio.downloaded" : "streamStudio.downloadFailed",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  function captureCase() {
    try {
      const c = streamCaseFromTranscript(transcript()),
        next = parseStreamProject(
          json({ ...project, cases: [...project.cases, c] }),
        );
      setProject(next);
      syncCase(c);
      setCaseRun(null);
      setFeedback({ key: "streamStudio.caseCaptured", error: false });
    } catch (error) {
      fail(error);
    }
  }
  const button = (
    key: TranslationKey,
    action: () => void,
    disabled = false,
  ) => (
    <button
      type="button"
      className={buttonClass}
      disabled={disabled}
      onClick={action}
    >
      {t(key)}
    </button>
  );
  const field = (
    key: TranslationKey,
    value: string,
    change: (value: string) => void,
    multiline = false,
  ) => (
    <label className="block text-xs font-semibold">
      {t(key)}
      {multiline ? (
        <textarea
          rows={6}
          spellCheck={false}
          className={`${inputClass} font-mono`}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </label>
  );
  const checkbox = (
    key: TranslationKey,
    checked: boolean,
    change: (checked: boolean) => void,
  ) => (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => change(e.target.checked)}
      />
      {t(key)}
    </label>
  );
  const upload = (key: TranslationKey, kind: "project" | "transcript") => (
    <label className="text-xs font-semibold">
      {t(key)}
      <input
        type="file"
        accept=".json,application/json"
        className="mt-1 block max-w-full text-xs"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) fileRead(file, kind);
        }}
      />
    </label>
  );

  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/80 p-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t("streamStudio.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-600">
            {t("streamStudio.description")}
          </p>
          <p className="text-xs text-slate-600">{t("streamStudio.help")}</p>
          {feedback && (
            <p className="text-xs" role={feedback.error ? "alert" : "status"}>
              {t(feedback.key)}
            </p>
          )}
          {live && (
            <div className="flex flex-wrap gap-2">
              {button("streamStudio.disconnect", () => session.current?.stop())}
            </div>
          )}
          {busy && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <p role="status">
                {t("streamStudio.busy", {
                  count: String(progress.count),
                  total: String(progress.total),
                })}
              </p>
              {button("streamStudio.cancel", () => {
                abort.current?.abort();
                if (busy !== "cases") {
                  generation.current++;
                  setBusy(null);
                }
                setFeedback({ key: "streamStudio.cancelled", error: false });
              })}
            </div>
          )}
          <fieldset disabled={!!busy} className="space-y-4">
            <fieldset
              disabled={live || pending}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("streamStudio.project")}
              </legend>
              {field("streamStudio.projectName", project.name, (name) => {
                setProject({ ...project, name });
                setFeedback(null);
              })}
              <div className="flex flex-wrap items-center gap-2">
                {button("streamStudio.newProject", () =>
                  accept(emptyStreamProject()),
                )}
                {button("streamStudio.demo", () => {
                  accept(demoStreamProject());
                  setFeedback({ key: "streamStudio.demoLoaded", error: false });
                })}
                {upload("streamStudio.importProject", "project")}
                {upload("streamStudio.importTranscript", "transcript")}
                {button("streamStudio.downloadProject", () =>
                  download("project"),
                )}
              </div>
              <p className="text-xs text-slate-600">
                {t("streamStudio.exportHelp")}
              </p>
            </fieldset>
            <fieldset
              disabled={live || caseDirty}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("streamStudio.connection")}
              </legend>
              <p className="text-xs text-slate-600">
                {t("streamStudio.connectionHelp")}
              </p>
              {field("streamStudio.url", connection.url, (url) =>
                editConnection({ url }),
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold">
                  {t("streamStudio.format")}
                  <select
                    className={inputClass}
                    value={connection.format}
                    onChange={(e) =>
                      editConnection({ format: e.target.value as StreamFormat })
                    }
                  >
                    <option value="sse">SSE</option>
                    <option value="ndjson">NDJSON</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  {t("streamStudio.method")}
                  <select
                    className={inputClass}
                    value={connection.method}
                    onChange={(e) =>
                      editConnection({
                        method: e.target.value as StreamConnection["method"],
                      })
                    }
                  >
                    <option>GET</option>
                    <option>POST</option>
                  </select>
                </label>
              </div>
              {field(
                "streamStudio.body",
                connection.body,
                (body) => editConnection({ body }),
                true,
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {configNumbers.map((k) => (
                  <div key={k}>
                    {field(`streamStudio.config.${k}`, connection[k], (value) =>
                      editConnection({ [k]: value }),
                    )}
                  </div>
                ))}
              </div>
              {field(
                "streamStudio.lastEventId",
                connection.lastEventId,
                (lastEventId) => editConnection({ lastEventId }),
              )}
              {field("streamStudio.stopText", connection.stopText, (stopText) =>
                editConnection({ stopText }),
              )}
              <div className="flex flex-wrap gap-3">
                {checkbox(
                  "streamStudio.requireContentType",
                  connection.requireContentType,
                  (requireContentType) =>
                    editConnection({ requireContentType }),
                )}
                {checkbox(
                  "streamStudio.requireFinalNewline",
                  connection.requireFinalNewline,
                  (requireFinalNewline) =>
                    editConnection({ requireFinalNewline }),
                )}
                {checkbox(
                  "streamStudio.ignoreEmptyLines",
                  connection.ignoreEmptyLines,
                  (ignoreEmptyLines) => editConnection({ ignoreEmptyLines }),
                )}
              </div>
              {connectionDirty && (
                <p role="status" className="text-xs">
                  {t("streamStudio.dirty")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {button(
                  "streamStudio.saveConnection",
                  saveConnection,
                  !connectionDirty,
                )}
                {button(
                  "streamStudio.discardConnection",
                  () => {
                    setConnection(configDraft(project.connection));
                    setFeedback(null);
                  },
                  !connectionDirty,
                )}
                {button(
                  "streamStudio.useCursor",
                  () => editConnection({ lastEventId: state.lastEventId }),
                  connectionDirty || !state.lastEventId,
                )}
              </div>
              {field(
                "streamStudio.headers",
                headers,
                (value) => {
                  setHeaders(value);
                  setFeedback(null);
                },
                true,
              )}
              <p className="text-xs text-slate-600">
                {t("streamStudio.headersHelp")}
              </p>
              <div className="flex flex-wrap gap-2">
                {button("streamStudio.clearHeaders", () => {
                  setHeaders("{}");
                  setFeedback(null);
                })}
                {button(
                  "streamStudio.connect",
                  connect,
                  pending || !project.connection.url,
                )}
              </div>
            </fieldset>
            <section
              className="space-y-2 rounded-xl border p-3"
              aria-label={t("streamStudio.connection")}
            >
              <p role="status" className="text-xs">
                {t("streamStudio.sessionSummary", {
                  state: t(`streamStudio.state.${state.status}`),
                  connections: String(state.connections),
                  records: String(state.records),
                  bytes: String(state.bytes),
                  comments: String(state.comments),
                })}
              </p>
              <p className="break-all text-xs">
                {t("streamStudio.cursor", {
                  id: state.lastEventId || "—",
                  delay: String(state.retryMs),
                })}
              </p>
              {state.httpStatus !== null && (
                <p className="text-xs">
                  {t("streamStudio.httpStatus", {
                    status: String(state.httpStatus),
                  })}
                </p>
              )}
              {state.reason && (
                <p className="text-xs">
                  {t(`streamStudio.stop.${state.reason}`)}
                </p>
              )}
              {sessionReport && (
                <>
                  <p className="text-xs">
                    {t("streamStudio.sessionTime", {
                      elapsed: String(sessionReport.elapsedMs),
                      first:
                        sessionReport.firstRecordMs === null
                          ? "—"
                          : String(sessionReport.firstRecordMs),
                    })}
                  </p>
                  {button(
                    "streamStudio.downloadSessionReport",
                    () => download("session"),
                    pending,
                  )}
                </>
              )}
            </section>
            <fieldset
              disabled={live || connectionDirty}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("streamStudio.cases")}
              </legend>
              <p className="text-xs text-slate-600">
                {t("streamStudio.caseHelp")}
              </p>
              <label className="block text-xs font-semibold">
                {t("streamStudio.selectedCase")}
                <select
                  className={inputClass}
                  value={savedCase.id}
                  disabled={caseDirty}
                  onChange={(e) =>
                    syncCase(
                      project.cases.find((c) => c.id === e.target.value)!,
                    )
                  }
                >
                  {project.cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {button(
                  "streamStudio.addCase",
                  () => addCase(),
                  caseDirty || project.cases.length >= MAX_STREAM_CASES,
                )}
                {button(
                  "streamStudio.duplicateCase",
                  () => addCase(true),
                  caseDirty || project.cases.length >= MAX_STREAM_CASES,
                )}
                {button(
                  "streamStudio.removeCase",
                  () => {
                    const cases = project.cases.filter(
                      (c) => c.id !== savedCase.id,
                    );
                    setProject({ ...project, cases });
                    syncCase(cases[0]);
                    setCaseRun(null);
                    setFeedback(null);
                  },
                  caseDirty || project.cases.length === 1,
                )}
              </div>
              {field("streamStudio.caseName", draft.name, (name) =>
                editCase({ name }),
              )}
              <label className="block text-xs font-semibold">
                {t("streamStudio.caseFormat")}
                <select
                  className={inputClass}
                  value={draft.format}
                  onChange={(e) =>
                    editCase({ format: e.target.value as StreamFormat })
                  }
                >
                  <option value="sse">SSE</option>
                  <option value="ndjson">NDJSON</option>
                </select>
              </label>
              <label className="block text-xs font-semibold">
                {t("streamStudio.wireEncoding")}
                <select
                  className={inputClass}
                  value={draft.wireEncoding}
                  onChange={(e) =>
                    editCase({
                      wireEncoding: e.target
                        .value as StreamCase["wireEncoding"],
                    })
                  }
                >
                  <option value="utf8">UTF-8</option>
                  <option value="base64">Base64</option>
                </select>
              </label>
              {field(
                "streamStudio.wire",
                draft.wire,
                (wire) => editCase({ wire }),
                true,
              )}
              <div className="grid gap-3 md:grid-cols-3">
                {field(
                  "streamStudio.chunkBytes",
                  draft.chunkBytes,
                  (chunkBytes) => editCase({ chunkBytes }),
                )}
                {field(
                  "streamStudio.minRecords",
                  draft.minRecords,
                  (minRecords) => editCase({ minRecords }),
                )}
                {field(
                  "streamStudio.maxRecords",
                  draft.maxRecords,
                  (maxRecords) => editCase({ maxRecords }),
                )}
              </div>
              <label className="block text-xs font-semibold">
                {t("streamStudio.expectedError")}
                <select
                  className={inputClass}
                  value={draft.expectedError}
                  onChange={(e) =>
                    editCase({
                      expectedError: e.target.value as StreamParserError,
                    })
                  }
                >
                  {(["none", "json", "utf8", "framing", "limit"] as const).map(
                    (value) => (
                      <option key={value} value={value}>
                        {t(`streamStudio.parser.${value}`)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <div className="flex flex-wrap gap-3">
                {checkbox(
                  "streamStudio.requireFinalNewline",
                  draft.requireFinalNewline,
                  (requireFinalNewline) => editCase({ requireFinalNewline }),
                )}
                {checkbox(
                  "streamStudio.ignoreEmptyLines",
                  draft.ignoreEmptyLines,
                  (ignoreEmptyLines) => editCase({ ignoreEmptyLines }),
                )}
              </div>
              {field(
                "streamStudio.checks",
                draft.checks,
                (checks) => editCase({ checks }),
                true,
              )}
              <p className="text-xs text-slate-600">
                {t("streamStudio.checksHelp")}
              </p>
              {button("streamStudio.exampleCheck", () =>
                editCase({
                  checks: json([
                    {
                      name: "Record is an object",
                      select: "last",
                      index: 0,
                      event: "",
                      textMode: "any",
                      text: "",
                      json: [
                        {
                          name: "Object body",
                          target: "body",
                          path: "",
                          operator: "type",
                          expected: "object",
                        },
                      ],
                    },
                  ]),
                }),
              )}
              {caseDirty && (
                <p role="status" className="text-xs">
                  {t("streamStudio.dirty")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {button("streamStudio.saveCase", saveCase, !caseDirty)}
                {button(
                  "streamStudio.discardCase",
                  () => {
                    syncCase(savedCase);
                    setFeedback(null);
                  },
                  !caseDirty,
                )}
                {button("streamStudio.replay", replay, pending)}
                {button(
                  "streamStudio.runCases",
                  () => runCases(false),
                  pending,
                )}
                {button("streamStudio.sweep", () => runCases(true), pending)}
              </div>
            </fieldset>
            {caseRun && (
              <section
                aria-label={t("streamStudio.results")}
                className="space-y-3 rounded-xl border p-3"
              >
                <h3 className="text-sm font-bold">
                  {t("streamStudio.results")}
                </h3>
                <p role="status" className="text-xs">
                  {t("streamStudio.resultsSummary", {
                    completed: String(caseRun.completed),
                    total: String(caseRun.total),
                    passed: String(
                      caseRun.results.filter((r) => r.status === "passed")
                        .length,
                    ),
                    failed: String(
                      caseRun.results.filter((r) => r.status === "failed")
                        .length,
                    ),
                  })}
                </p>
                {!caseRun.complete && (
                  <p className="text-xs text-amber-900">
                    {t("streamStudio.partial")}
                  </p>
                )}
                {button(
                  "streamStudio.downloadCasesReport",
                  () => download("cases"),
                  pending,
                )}
                <ul className="space-y-2 text-xs">
                  {caseRun.results.map((r, i) => (
                    <li key={i}>
                      <p>
                        {t("streamStudio.caseResult", {
                          name: r.name,
                          chunk: String(r.chunkBytes),
                          status: t(
                            r.status === "passed"
                              ? "streamStudio.passed"
                              : "streamStudio.failed",
                          ),
                          count: String(r.count),
                          error: t(`streamStudio.parser.${r.error}`),
                        })}
                      </p>
                      <ul>
                        {r.checks.map((c, j) => (
                          <li key={j}>
                            {t("streamStudio.checkResult", {
                              name: c.name,
                              status: t(
                                c.passed
                                  ? "streamStudio.passed"
                                  : "streamStudio.failed",
                              ),
                              matched: String(c.matched),
                              selected: String(c.selected),
                            })}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section
              aria-label={t("streamStudio.transcript")}
              className="space-y-3 rounded-xl border p-3"
            >
              <h3 className="text-sm font-bold">
                {t("streamStudio.transcript")}
              </h3>
              <p className="text-xs">
                {t("streamStudio.history", {
                  count: String(journal.records.length),
                  dropped: String(journal.dropped),
                })}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold">
                  {t("streamStudio.search")}
                  <input
                    className={inputClass}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setSearch("");
                      }
                    }}
                  />
                </label>
                <label className="text-xs font-semibold">
                  {t("streamStudio.eventFilter")}
                  <select
                    className={inputClass}
                    value={eventTypes.includes(eventFilter) ? eventFilter : ""}
                    onChange={(e) => setEventFilter(e.target.value)}
                  >
                    <option value="">{t("streamStudio.allEvents")}</option>
                    {eventTypes.map((event) => (
                      <option key={event}>{event}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="max-h-64 space-y-1 overflow-auto">
                {records.map((r) => (
                  <button
                    type="button"
                    key={r.sequence}
                    className="block w-full rounded-lg border p-2 text-left text-xs hover:border-purple-400"
                    aria-label={t("streamStudio.selectRecord", {
                      sequence: String(r.sequence),
                    })}
                    aria-pressed={selectedRecord?.sequence === r.sequence}
                    onClick={() => setSelectedSequence(r.sequence)}
                  >
                    {t("streamStudio.recordSummary", {
                      sequence: String(r.sequence),
                      event: r.event,
                      id: r.id || "—",
                      bytes: String(r.bytes),
                      time: String(r.atMs),
                      connection: String(r.connection),
                    })}
                  </button>
                ))}
              </div>
              {selectedRecord && (
                <>
                  <label className="block text-xs font-semibold">
                    {t("streamStudio.preview")}
                    <textarea
                      className={`${inputClass} font-mono`}
                      readOnly
                      rows={7}
                      value={selectedRecord.data.slice(0, 16000)}
                    />
                  </label>
                  <p className="text-xs text-slate-600">
                    {t("streamStudio.previewHelp")}
                  </p>
                  {button("streamStudio.copyRecord", () => {
                    void task(
                      "copy",
                      () => writeTextToClipboard(selectedRecord.data),
                      (ok) =>
                        setFeedback({
                          key: ok
                            ? "streamStudio.copied"
                            : "streamStudio.copyFailed",
                          error: !ok,
                        }),
                    );
                  })}
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {button(
                  "streamStudio.clearRecords",
                  clearJournal,
                  !journal.records.length,
                )}
                {button(
                  "streamStudio.downloadTranscript",
                  () => download("transcript"),
                  !journal.records.length,
                )}
                {button(
                  "streamStudio.downloadRecords",
                  () => download("records"),
                  !journal.records.length,
                )}
                {button(
                  "streamStudio.captureCase",
                  captureCase,
                  live ||
                    pending ||
                    !journal.records.length ||
                    project.cases.length >= MAX_STREAM_CASES,
                )}
              </div>
              <p className="text-xs text-slate-600">
                {t("streamStudio.captureHelp")}
              </p>
            </section>
          </fieldset>
        </div>
      )}
    </details>
  );
});
