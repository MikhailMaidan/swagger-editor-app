"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import { WsSession, type WsConnectionState } from "@/lib/websocket-session";
import {
  appendWsMessage,
  conversationFromWsTranscript,
  createWsReplay,
  demoWsProject,
  emptyWsProject,
  MAX_WS_CONVERSATIONS,
  MAX_WS_PROJECT_BYTES,
  MAX_WS_STEPS,
  newWsStep,
  parseWsFixtures,
  parseWsProject,
  parseWsStep,
  parseWsTranscript,
  parseWsVariables,
  runWsConversation,
  serializeWsProject,
  serializeWsTranscript,
  validateWsConnection,
  validateWsConversation,
  WsError,
  wsError,
  wsRunReport,
  type WsConversation,
  type WsFormat,
  type WsMessage,
  type WsProject,
  type WsRun,
  type WsStep,
} from "@/lib/websocket-studio";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const json = (v: unknown) => JSON.stringify(v, null, 2);

export const WebSocketStudioPanel = memo(function WebSocketStudioPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState(emptyWsProject);
  const [conversationId, setConversationId] = useState("");
  const [stepId, setStepId] = useState("");
  const [draft, setDraft] = useState<WsStep>(() => newWsStep("send"));
  const [dirty, setDirty] = useState(false);
  const [checksText, setChecksText] = useState("[]"),
    [capturesText, setCapturesText] = useState("[]");
  const [variablesText, setVariablesText] = useState("{}"),
    [fixturesText, setFixturesText] = useState("[]");
  const [protocolsText, setProtocolsText] = useState("");
  const [connection, setConnection] = useState<WsConnectionState>({
    status: "closed",
    protocol: "",
  });
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [composerFormat, setComposerFormat] = useState<WsFormat>("json"),
    [composer, setComposer] = useState('{"type":"ping"}');
  const [journal, setJournal] = useState<{
    messages: WsMessage[];
    dropped: number;
  }>({ messages: [], dropped: 0 });
  const [messageSequence, setMessageSequence] = useState(0);
  const [search, setSearch] = useState(""),
    [direction, setDirection] = useState("all"),
    [formatFilter, setFormatFilter] = useState("all");
  const [run, setRun] = useState<WsRun | null>(null);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const session = useRef<WsSession | null>(null),
    abort = useRef<AbortController | null>(null);
  const generation = useRef(0),
    sessionGeneration = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      sessionGeneration.current++;
      abort.current?.abort();
      session.current?.dispose();
    },
    [],
  );
  const conversation =
    project.conversations.find((c) => c.id === conversationId) ??
    project.conversations[0];
  const savedStep = conversation.steps.find((s) => s.id === stepId);
  const settingsDirty =
    variablesText !== json(project.variables) ||
    fixturesText !== json(project.fixtures);
  const pending = dirty || settingsDirty;
  const locked = busy || loading || connection.status !== "closed";
  const selectedMessage =
    journal.messages.find((m) => m.sequence === messageSequence) ??
    journal.messages.at(-1);
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const messages = journal.messages.filter(
    (m) =>
      (direction === "all" || m.direction === direction) &&
      (formatFilter === "all" || m.format === formatFilter) &&
      terms.every((term) =>
        `${m.sequence} ${m.direction} ${m.format} ${m.data}`
          .toLowerCase()
          .includes(term),
      ),
  );
  function invalidate() {
    setRun(null);
    setFeedback(null);
  }
  function fail(error: unknown) {
    setFeedback({ key: `wsStudio.error.${wsError(error).code}`, error: true });
  }
  function syncStep(c: WsConversation, id = "", kind: WsStep["type"] = "send") {
    const step = c.steps.find((s) => s.id === id) ?? newWsStep(kind);
    setStepId(c.steps.some((s) => s.id === id) ? id : "");
    setDraft(step);
    setChecksText(step.type === "expect" ? json(step.checks) : "[]");
    setCapturesText(step.type === "expect" ? json(step.captures) : "[]");
    setDirty(false);
  }
  function accept(next: WsProject) {
    setProject(next);
    setConversationId(next.conversations[0].id);
    syncStep(next.conversations[0], next.conversations[0].steps[0]?.id);
    setVariablesText(json(next.variables));
    setFixturesText(json(next.fixtures));
    setProtocolsText(next.connection.protocols.join(", "));
    setJournal({ messages: [], dropped: 0 });
    setMessageSequence(0);
    setSearch("");
    invalidate();
  }
  function editProject(next: WsProject) {
    setProject(next);
    invalidate();
  }
  function editConversation(next: WsConversation) {
    editProject({
      ...project,
      conversations: project.conversations.map((c) =>
        c.id === conversation.id ? next : c,
      ),
    });
  }
  function editStep(patch: Record<string, unknown>) {
    setDraft({ ...draft, ...patch } as WsStep);
    setDirty(true);
    invalidate();
  }
  function saveStep() {
    try {
      if (getByteSize(checksText) + getByteSize(capturesText) > 128 * 1024)
        throw new WsError("limit");
      const value =
        draft.type === "expect"
          ? {
              ...draft,
              checks: JSON.parse(checksText),
              captures: JSON.parse(capturesText),
            }
          : draft;
      const step = parseWsStep(json(value));
      const next = validateWsConversation({
        ...conversation,
        steps: savedStep
          ? conversation.steps.map((s) => (s.id === stepId ? step : s))
          : [...conversation.steps, step],
      });
      parseWsProject(
        json({
          ...project,
          conversations: project.conversations.map((c) =>
            c.id === next.id ? next : c,
          ),
        }),
      );
      editConversation(next);
      syncStep(next, step.id);
      setFeedback({ key: "wsStudio.stepSaved", error: false });
    } catch (error) {
      fail(error instanceof WsError ? error : new WsError("step"));
    }
  }
  function saveSettings() {
    try {
      const variables = parseWsVariables(variablesText),
        fixtures = parseWsFixtures(fixturesText);
      const next = parseWsProject(json({ ...project, variables, fixtures }));
      editProject(next);
      setVariablesText(json(variables));
      setFixturesText(json(fixtures));
      setFeedback({ key: "wsStudio.settingsSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File, kind: "project" | "transcript") {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (
        file.size >
        (kind === "project" ? MAX_WS_PROJECT_BYTES : 2 * MAX_WS_PROJECT_BYTES)
      )
        throw new WsError("limit");
      const text = await file.text();
      if (token !== generation.current) return;
      if (kind === "project") accept(parseWsProject(text));
      else {
        setJournal({ messages: parseWsTranscript(text), dropped: 0 });
        setMessageSequence(0);
        invalidate();
      }
      setFeedback({
        key:
          kind === "project"
            ? "wsStudio.projectLoaded"
            : "wsStudio.transcriptLoaded",
        error: false,
      });
    } catch (error) {
      if (token === generation.current)
        fail(error instanceof WsError ? error : new WsError("project"));
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function log(message: WsMessage) {
    setJournal((previous) => {
      const next = appendWsMessage(previous.messages, message);
      return {
        messages: next.messages,
        dropped: previous.dropped + next.dropped,
      };
    });
  }
  function startSession(bufferIncoming: boolean) {
    const config = validateWsConnection(project.connection);
    const token = ++sessionGeneration.current;
    session.current?.dispose();
    const controller = new WsSession(
      config,
      {
        onState: (state) => {
          if (token === sessionGeneration.current) setConnection(state);
        },
        onMessage: (message) => {
          if (token === sessionGeneration.current) log(message);
        },
      },
      { bufferIncoming },
    );
    session.current = controller;
    setJournal({ messages: [], dropped: 0 });
    setMessageSequence(0);
    setConnection({ status: "closed", protocol: "" });
    invalidate();
    return controller;
  }
  async function connect() {
    if (locked || pending) return;
    const token = generation.current;
    try {
      await startSession(false).connect();
    } catch (error) {
      if (token === generation.current) fail(error);
    }
  }
  function disconnect() {
    try {
      session.current?.close();
    } catch (error) {
      fail(error);
    }
  }
  function send() {
    try {
      if (!session.current || busy) throw new WsError("closed");
      session.current.send({ format: composerFormat, data: composer });
      setFeedback({ key: "wsStudio.sent", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function execute(mode: WsRun["mode"]) {
    if (locked || pending) return;
    let active: WsConversation;
    let clean: WsProject;
    try {
      clean = parseWsProject(json(project));
      active = clean.conversations.find((c) => c.id === conversation.id)!;
      if (!active.steps.length) throw new WsError("step");
    } catch (error) {
      fail(error);
      return;
    }
    const token = generation.current;
    const cancellation = new AbortController();
    abort.current = cancellation;
    setBusy(true);
    setJournal({ messages: [], dropped: 0 });
    setMessageSequence(0);
    invalidate();
    let controller: WsSession | null = null;
    try {
      const transport =
        mode === "replay"
          ? createWsReplay(clean.fixtures, log)
          : (controller = startSession(true));
      if (controller) await controller.connect(cancellation.signal);
      const result = await runWsConversation(
        active,
        clean.variables,
        transport,
        mode,
        cancellation.signal,
      );
      if (token === generation.current) setRun(result);
    } catch (error) {
      if (token === generation.current) {
        const code = wsError(error).code;
        setRun({
          mode,
          conversationId: active.id,
          status: code === "cancelled" ? "cancelled" : "failed",
          durationMs: 0,
          error: code,
          steps: active.steps.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            status: "skipped",
            durationMs: 0,
            received: 0,
            skippedMessages: 0,
          })),
        });
        fail(error);
      }
    } finally {
      controller?.dispose("closed");
      if (token === generation.current) {
        setBusy(false);
        abort.current = null;
      }
    }
  }
  function recordConversation() {
    try {
      if (project.conversations.length >= MAX_WS_CONVERSATIONS)
        throw new WsError("limit");
      const c = conversationFromWsTranscript(journal.messages);
      const fixtures = journal.messages
        .filter((m) => m.direction === "receive")
        .map(({ format, data }) => ({ format, data }));
      const next = parseWsProject(
        json({
          ...project,
          conversations: [...project.conversations, c],
          fixtures,
        }),
      );
      editProject(next);
      setFixturesText(json(fixtures));
      setConversationId(c.id);
      syncStep(c, c.steps[0]?.id);
      setFeedback({ key: "wsStudio.recorded", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function download(kind: "project" | "transcript" | "report" | "ndjson") {
    try {
      const content =
        kind === "project"
          ? serializeWsProject(project)
          : kind === "transcript"
            ? serializeWsTranscript(journal.messages)
            : kind === "ndjson"
              ? parseWsTranscript(serializeWsTranscript(journal.messages))
                  .map((m) => JSON.stringify(m))
                  .join("\n")
              : json(wsRunReport(run!));
      const name =
        project.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) ||
        "websocket";
      const ok = downloadTextFile(
        content,
        `${name}-${kind}.${kind === "ndjson" ? "ndjson" : "json"}`,
        kind === "ndjson" ? "application/x-ndjson" : "application/json",
      );
      setFeedback({
        key: ok ? "wsStudio.downloaded" : "wsStudio.downloadFailed",
        error: !ok,
      });
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
    value: string | number,
    change: (value: string) => void,
    multiline = false,
    disabled = false,
  ) => (
    <label className="block text-xs font-semibold">
      {t(key)}
      {multiline ? (
        <textarea
          className={`${inputClass} font-mono`}
          rows={5}
          value={value}
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </label>
  );
  const formatOptions = (any = false) => (
    <>
      {any && <option value="any">{t("wsStudio.format.any")}</option>}
      {(["json", "text", "binary"] as const).map((format) => (
        <option key={format} value={format}>
          {t(`wsStudio.format.${format}`)}
        </option>
      ))}
    </>
  );

  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/80 p-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t("wsStudio.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-600">{t("wsStudio.description")}</p>
          <p className="text-xs text-slate-600">{t("wsStudio.help")}</p>
          {loading && (
            <p role="status" className="text-xs">
              {t("wsStudio.loading")}
            </p>
          )}
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className="break-words text-xs"
            >
              {t(feedback.key)}
            </p>
          )}
          <fieldset
            className="space-y-3 rounded-xl border p-3"
            disabled={locked || pending}
          >
            <legend className="text-sm font-bold">
              {t("wsStudio.project")}
            </legend>
            {field("wsStudio.projectName", project.name, (name) =>
              editProject({ ...project, name }),
            )}
            <div className="flex flex-wrap gap-2">
              {button("wsStudio.newProject", () => accept(emptyWsProject()))}
              {button("wsStudio.demo", () => {
                accept(demoWsProject());
                setFeedback({ key: "wsStudio.demoLoaded", error: false });
              })}
              {(["project", "transcript"] as const).map((kind) => (
                <label key={kind} className="block text-xs font-semibold">
                  {t(
                    kind === "project"
                      ? "wsStudio.importProject"
                      : "wsStudio.importTranscript",
                  )}
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="mt-1 block max-w-full text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void read(file, kind);
                    }}
                  />
                </label>
              ))}
              {button("wsStudio.exportProject", () => download("project"))}
            </div>
          </fieldset>
          <section
            className="space-y-3 rounded-xl border p-3"
            aria-label={t("wsStudio.connection")}
          >
            <h3 className="text-sm font-bold">{t("wsStudio.connection")}</h3>
            <p className="text-xs text-slate-600">
              {t("wsStudio.connectionHelp")}
            </p>
            <fieldset
              disabled={locked || pending}
              className="grid gap-3 md:grid-cols-3"
            >
              {field("wsStudio.url", project.connection.url, (url) =>
                editProject({
                  ...project,
                  connection: { ...project.connection, url },
                }),
              )}
              {field("wsStudio.protocols", protocolsText, (text) => {
                setProtocolsText(text);
                editProject({
                  ...project,
                  connection: {
                    ...project.connection,
                    protocols: text.trim()
                      ? text.split(",").map((p) => p.trim())
                      : [],
                  },
                });
              })}
              {field(
                "wsStudio.connectTimeout",
                project.connection.timeoutMs,
                (ms) =>
                  editProject({
                    ...project,
                    connection: {
                      ...project.connection,
                      timeoutMs: Number(ms),
                    },
                  }),
              )}
            </fieldset>
            <p role="status" className="break-words text-xs">
              {t("wsStudio.connectionStatus", {
                status: t(`wsStudio.state.${connection.status}`),
                protocol: connection.protocol || "—",
              })}
              {connection.closeCode !== undefined &&
                ` · ${connection.closeCode} · ${connection.closeReason || "—"} · ${connection.wasClean ? t("wsStudio.cleanClose") : t("wsStudio.uncleanClose")}`}
              {connection.error &&
                ` · ${t(`wsStudio.error.${connection.error}`)}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {button(
                "wsStudio.connect",
                () => void connect(),
                locked || pending,
              )}
              {button(
                "wsStudio.disconnect",
                disconnect,
                busy || !["connecting", "open"].includes(connection.status),
              )}
            </div>
            <fieldset disabled={busy || loading} className="space-y-3">
              <label className="block text-xs font-semibold">
                {t("wsStudio.composerFormat")}
                <select
                  className={inputClass}
                  value={composerFormat}
                  onChange={(e) =>
                    setComposerFormat(e.target.value as WsFormat)
                  }
                >
                  {formatOptions()}
                </select>
              </label>
              {field("wsStudio.composer", composer, setComposer, true)}
              {button("wsStudio.send", send, connection.status !== "open")}
            </fieldset>
          </section>
          <fieldset
            disabled={locked}
            className="space-y-3 rounded-xl border p-3"
          >
            <legend className="text-sm font-bold">
              {t("wsStudio.conversations")}
            </legend>
            <p className="text-xs text-slate-600">
              {t("wsStudio.conversationHelp")}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-semibold">
                {t("wsStudio.selectedConversation")}
                <select
                  disabled={pending}
                  className={inputClass}
                  value={conversation.id}
                  onChange={(e) => {
                    const c = project.conversations.find(
                      (c) => c.id === e.target.value,
                    )!;
                    setConversationId(c.id);
                    syncStep(c, c.steps[0]?.id);
                    invalidate();
                  }}
                >
                  {project.conversations.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {field(
                "wsStudio.conversationName",
                conversation.name,
                (name) => editConversation({ ...conversation, name }),
                false,
                pending,
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {button(
                "wsStudio.addConversation",
                () => {
                  const c = {
                    id: crypto.randomUUID(),
                    name: "Conversation",
                    steps: [],
                  };
                  editProject({
                    ...project,
                    conversations: [...project.conversations, c],
                  });
                  setConversationId(c.id);
                  syncStep(c);
                },
                pending || project.conversations.length >= MAX_WS_CONVERSATIONS,
              )}
              {button(
                "wsStudio.duplicateConversation",
                () => {
                  const c = {
                    ...conversation,
                    id: crypto.randomUUID(),
                    name: `${conversation.name} copy`.slice(0, 120),
                    steps: conversation.steps.map((s) => ({
                      ...s,
                      id: crypto.randomUUID(),
                    })),
                  };
                  editProject({
                    ...project,
                    conversations: [...project.conversations, c],
                  });
                  setConversationId(c.id);
                  syncStep(c, c.steps[0]?.id);
                },
                pending || project.conversations.length >= MAX_WS_CONVERSATIONS,
              )}
              {button(
                "wsStudio.removeConversation",
                () => {
                  const conversations = project.conversations.filter(
                    (c) => c.id !== conversation.id,
                  );
                  editProject({ ...project, conversations });
                  setConversationId(conversations[0].id);
                  syncStep(conversations[0], conversations[0].steps[0]?.id);
                },
                pending || project.conversations.length < 2,
              )}
            </div>
            <label className="block text-xs font-semibold">
              {t("wsStudio.selectedStep")}
              <select
                disabled={pending}
                className={inputClass}
                value={stepId}
                onChange={(e) => syncStep(conversation, e.target.value)}
              >
                <option value="">{t("wsStudio.newStep")}</option>
                {conversation.steps.map((s, i) => (
                  <option value={s.id} key={s.id}>
                    {i + 1}. {s.name} · {t(`wsStudio.type.${s.type}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {(["send", "expect", "pause"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={buttonClass}
                  disabled={
                    pending || conversation.steps.length >= MAX_WS_STEPS
                  }
                  onClick={() => {
                    syncStep(conversation, "", type);
                    setDirty(true);
                    invalidate();
                  }}
                >
                  {t(`wsStudio.add.${type}`)}
                </button>
              ))}
              {(["up", "down"] as const).map((move) => (
                <button
                  key={move}
                  type="button"
                  className={buttonClass}
                  disabled={
                    pending ||
                    !savedStep ||
                    (move === "up"
                      ? conversation.steps[0]?.id === stepId
                      : conversation.steps.at(-1)?.id === stepId)
                  }
                  onClick={() => {
                    const steps = [...conversation.steps],
                      index = steps.findIndex((s) => s.id === stepId),
                      target = index + (move === "up" ? -1 : 1);
                    [steps[index], steps[target]] = [
                      steps[target],
                      steps[index],
                    ];
                    editConversation({ ...conversation, steps });
                  }}
                >
                  {t(`wsStudio.move.${move}`)}
                </button>
              ))}
              {button(
                "wsStudio.removeStep",
                () => {
                  const next = {
                    ...conversation,
                    steps: conversation.steps.filter((s) => s.id !== stepId),
                  };
                  editConversation(next);
                  syncStep(next, next.steps[0]?.id);
                },
                pending || !savedStep,
              )}
            </div>
            <fieldset
              className="space-y-3 rounded-lg border p-3"
              disabled={settingsDirty}
            >
              <legend className="text-xs font-bold">
                {t(`wsStudio.type.${draft.type}`)}
              </legend>
              {field("wsStudio.stepName", draft.name, (name) =>
                editStep({ name }),
              )}
              {draft.type !== "pause" && (
                <label className="block text-xs font-semibold">
                  {t("wsStudio.stepFormat")}
                  <select
                    className={inputClass}
                    value={draft.format}
                    onChange={(e) => editStep({ format: e.target.value })}
                  >
                    {formatOptions(draft.type === "expect")}
                  </select>
                </label>
              )}
              {draft.type !== "pause" && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.template}
                    onChange={(e) => editStep({ template: e.target.checked })}
                  />
                  {t("wsStudio.template")}
                </label>
              )}
              {draft.type === "send" &&
                field(
                  "wsStudio.stepPayload",
                  draft.data,
                  (data) => editStep({ data }),
                  true,
                )}
              {draft.type === "pause" &&
                field("wsStudio.pauseMs", draft.durationMs, (ms) =>
                  editStep({ durationMs: Number(ms) }),
                )}
              {draft.type === "expect" && (
                <>
                  {field("wsStudio.receiveTimeout", draft.timeoutMs, (ms) =>
                    editStep({ timeoutMs: Number(ms) }),
                  )}
                  <label className="block text-xs font-semibold">
                    {t("wsStudio.matchMode")}
                    <select
                      className={inputClass}
                      value={draft.match}
                      onChange={(e) => editStep({ match: e.target.value })}
                    >
                      <option value="next">{t("wsStudio.match.next")}</option>
                      <option value="matching">
                        {t("wsStudio.match.matching")}
                      </option>
                    </select>
                  </label>
                  <label className="block text-xs font-semibold">
                    {t("wsStudio.textMode")}
                    <select
                      className={inputClass}
                      value={draft.textMode}
                      onChange={(e) => editStep({ textMode: e.target.value })}
                    >
                      {(["any", "equals", "contains"] as const).map((mode) => (
                        <option key={mode} value={mode}>
                          {t(`wsStudio.text.${mode}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.textMode !== "any" &&
                    field(
                      "wsStudio.expectedText",
                      draft.textValue,
                      (textValue) => editStep({ textValue }),
                      true,
                    )}
                  {field(
                    "wsStudio.checks",
                    checksText,
                    (text) => {
                      setChecksText(text);
                      setDirty(true);
                      invalidate();
                    },
                    true,
                  )}
                  <p className="break-words text-xs text-slate-600">
                    {t("wsStudio.checksHelp")}
                  </p>
                  {field(
                    "wsStudio.captures",
                    capturesText,
                    (text) => {
                      setCapturesText(text);
                      setDirty(true);
                      invalidate();
                    },
                    true,
                  )}
                  <p className="text-xs text-slate-600">
                    {t("wsStudio.capturesHelp")}
                  </p>
                </>
              )}
              {dirty && (
                <p role="status" className="text-xs">
                  {t("wsStudio.dirtyStep")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {button("wsStudio.saveStep", saveStep)}
                {button(
                  "wsStudio.discardStep",
                  () => {
                    syncStep(conversation, stepId, draft.type);
                    setFeedback({ key: "wsStudio.discarded", error: false });
                  },
                  !dirty,
                )}
              </div>
            </fieldset>
            <fieldset
              disabled={dirty}
              className="space-y-3 rounded-lg border p-3"
            >
              <legend className="text-xs font-bold">
                {t("wsStudio.replaySettings")}
              </legend>
              {field(
                "wsStudio.variables",
                variablesText,
                (text) => {
                  setVariablesText(text);
                  invalidate();
                },
                true,
              )}
              {field(
                "wsStudio.fixtures",
                fixturesText,
                (text) => {
                  setFixturesText(text);
                  invalidate();
                },
                true,
              )}
              <p className="text-xs text-slate-600">
                {t("wsStudio.fixturesHelp")}
              </p>
              {settingsDirty && (
                <p role="status" className="text-xs">
                  {t("wsStudio.dirtySettings")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {button("wsStudio.saveSettings", saveSettings, !settingsDirty)}
                {button(
                  "wsStudio.discardSettings",
                  () => {
                    setVariablesText(json(project.variables));
                    setFixturesText(json(project.fixtures));
                  },
                  !settingsDirty,
                )}
              </div>
            </fieldset>
          </fieldset>
          <section
            className="space-y-3 rounded-xl border p-3"
            aria-label={t("wsStudio.execution")}
          >
            <h3 className="text-sm font-bold">{t("wsStudio.execution")}</h3>
            <p className="text-xs text-slate-600">
              {t("wsStudio.executionHelp")}
            </p>
            <div className="flex flex-wrap gap-2">
              {button(
                "wsStudio.replay",
                () => void execute("replay"),
                locked || pending,
              )}
              {button(
                "wsStudio.runLive",
                () => void execute("live"),
                locked || pending,
              )}
              {button(
                "wsStudio.cancel",
                () => {
                  abort.current?.abort();
                },
                !busy,
              )}
              {button(
                "wsStudio.exportReport",
                () => download("report"),
                !run || busy || pending,
              )}
            </div>
            {busy && (
              <p role="status" className="text-xs">
                {t("wsStudio.running")}
              </p>
            )}
            {run && (
              <>
                <p role="status" className="text-xs">
                  {t("wsStudio.runSummary", {
                    mode: t(`wsStudio.mode.${run.mode}`),
                    status: t(`wsStudio.result.${run.status}`),
                    duration: String(run.durationMs),
                  })}
                </p>
                <ol className="space-y-1 text-xs">
                  {run.steps.map((s) => (
                    <li key={s.id} className="break-words">
                      {s.name} · {t(`wsStudio.result.${s.status}`)} ·{" "}
                      {s.durationMs} ms ·{" "}
                      {t("wsStudio.receivedCount", {
                        received: String(s.received),
                        skipped: String(s.skippedMessages),
                      })}
                      {s.error && ` · ${t(`wsStudio.error.${s.error}`)}`}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
          <section
            className="space-y-3 rounded-xl border p-3"
            aria-label={t("wsStudio.transcript")}
          >
            <h3 className="text-sm font-bold">{t("wsStudio.transcript")}</h3>
            <p className="text-xs text-slate-600">
              {t("wsStudio.transcriptHelp")}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block text-xs font-semibold">
                {t("wsStudio.search")}
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
              <label className="block text-xs font-semibold">
                {t("wsStudio.direction")}
                <select
                  className={inputClass}
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  {["all", "send", "receive"].map((d) => (
                    <option key={d} value={d}>
                      {t(`wsStudio.direction.${d}` as TranslationKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                {t("wsStudio.formatFilter")}
                <select
                  className={inputClass}
                  value={formatFilter}
                  onChange={(e) => setFormatFilter(e.target.value)}
                >
                  <option value="all">{t("wsStudio.format.any")}</option>
                  {formatOptions()}
                </select>
              </label>
            </div>
            <p className="text-xs">
              {t("wsStudio.messageCount", {
                count: String(messages.length),
                dropped: String(journal.dropped),
              })}
            </p>
            <ul className="max-h-64 space-y-1 overflow-auto">
              {messages.slice(-50).map((m) => (
                <li key={m.sequence}>
                  <button
                    type="button"
                    className={`${buttonClass} w-full break-words text-left`}
                    aria-label={t("wsStudio.selectMessage", {
                      sequence: String(m.sequence),
                    })}
                    aria-pressed={selectedMessage?.sequence === m.sequence}
                    onClick={() => setMessageSequence(m.sequence)}
                  >
                    #{m.sequence} · {t(`wsStudio.direction.${m.direction}`)} ·{" "}
                    {t(`wsStudio.format.${m.format}`)} · {m.bytes} B · {m.atMs}{" "}
                    ms · {m.data.slice(0, 100)}
                  </button>
                </li>
              ))}
            </ul>
            {selectedMessage && (
              <label className="block text-xs font-semibold">
                {t("wsStudio.messagePreview")}
                <textarea
                  readOnly
                  rows={8}
                  className={`${inputClass} font-mono`}
                  value={selectedMessage.data.slice(0, 16000)}
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {button(
                "wsStudio.composeSelected",
                () => {
                  if (selectedMessage) {
                    setComposerFormat(selectedMessage.format);
                    setComposer(selectedMessage.data);
                  }
                },
                busy || loading || !selectedMessage,
              )}
              {button(
                "wsStudio.recordConversation",
                recordConversation,
                locked || pending || !journal.messages.length,
              )}
              {button(
                "wsStudio.useFixtures",
                () => {
                  try {
                    const fixtures = journal.messages
                      .filter((m) => m.direction === "receive")
                      .map(({ format, data }) => ({ format, data }));
                    const next = parseWsProject(json({ ...project, fixtures }));
                    editProject(next);
                    setFixturesText(json(fixtures));
                    setFeedback({
                      key: "wsStudio.fixturesSaved",
                      error: false,
                    });
                  } catch (error) {
                    fail(error);
                  }
                },
                locked ||
                  pending ||
                  !journal.messages.some((m) => m.direction === "receive"),
              )}
              {button(
                "wsStudio.exportTranscript",
                () => download("transcript"),
                locked || !journal.messages.length,
              )}
              {button(
                "wsStudio.exportNdjson",
                () => download("ndjson"),
                locked || !journal.messages.length,
              )}
              {button(
                "wsStudio.clearTranscript",
                () => {
                  setJournal({ messages: [], dropped: 0 });
                  setMessageSequence(0);
                  invalidate();
                },
                locked || !journal.messages.length,
              )}
            </div>
          </section>
        </div>
      )}
    </details>
  );
});
