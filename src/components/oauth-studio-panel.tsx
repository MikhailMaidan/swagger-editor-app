"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import type { SecuritySchemeSummary } from "@/lib/openapi";
import type { TranslationKey } from "@/lib/translations";
import { oauthAcceptsToken } from "@/lib/oauth-request-auth";
import {
  MAX_OAUTH_PROFILES,
  MAX_OAUTH_PROJECT_BYTES,
  OAUTH_CHANNEL_PREFIX,
  oauthCallbackUri,
  OAuthError,
  applyOAuthMetadata,
  defaultOAuthProfile,
  emptyOAuthProject,
  normalizeOAuthProfile,
  oauthError,
  parseOAuthJson,
  parseOAuthProject,
  serializeOAuthProject,
  type OAuthProfile,
  type OAuthProject,
} from "@/lib/oauth-studio";
import {
  OAuthSession,
  discoverOAuthProfile,
  runOAuthOfflineDemo,
  type OAuthSnapshot,
} from "@/lib/oauth-session";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const json = (v: unknown) => JSON.stringify(v, null, 2);
type ProfileDraft = Omit<OAuthProfile, "timeoutMs"> & { timeoutMs: string };
const toDraft = (p: OAuthProfile): ProfileDraft => ({
  ...p,
  timeoutMs: String(p.timeoutMs),
});
const number = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);
const initialSnapshot = (): OAuthSnapshot => ({
  phase: "idle",
  busy: false,
  hasAccessToken: false,
  hasRefreshToken: false,
  tokenType: "",
  scope: "",
  expiresAt: null,
  polls: 0,
  nextPollAt: null,
  deviceExpiresAt: null,
  source: "live",
});
type Job =
  | "authorize"
  | "exchange"
  | "device"
  | "poll"
  | "refresh"
  | "revoke"
  | "demo"
  | "metadata"
  | "read"
  | "copy";
const noSchemes: SecuritySchemeSummary[] = [];

export const OAuthStudioPanel = memo(function OAuthStudioPanel({
  schemes = noSchemes,
  onApplyToken,
  onForgetToken,
}: {
  schemes?: SecuritySchemeSummary[];
  onApplyToken?: (name: string, token: string) => boolean;
  onForgetToken?: (name: string, token: string) => void;
}) {
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
    [project, setProject] = useState(emptyOAuthProject),
    [name, setName] = useState("OAuth clients"),
    [selectedId, setSelectedId] = useState("starter"),
    [draft, setDraft] = useState(() => toDraft(defaultOAuthProfile()));
  const [metadata, setMetadata] = useState("{}"),
    [callback, setCallback] = useState(""),
    [authorizationUrl, setAuthorizationUrl] = useState("");
  const [state, setState] = useState(initialSnapshot),
    [tokens, setTokens] =
      useState<ReturnType<OAuthSession["tokenValues"]>>(null),
    [device, setDevice] =
      useState<ReturnType<OAuthSession["deviceView"]>>(null),
    [report, setReport] = useState<ReturnType<OAuthSession["report"]> | null>(
      null,
    );
  const [job, setJob] = useState<Job | null>(null),
    [reveal, setReveal] = useState(false),
    [targetName, setTargetName] = useState(""),
    [now, setNow] = useState(0);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const session = useRef<OAuthSession | null>(null),
    sessionEpoch = useRef(0),
    generation = useRef(0),
    abort = useRef<AbortController | null>(null),
    channel = useRef<BroadcastChannel | null>(null),
    popup = useRef<Window | null>(null),
    monitor = useRef<ReturnType<typeof setInterval> | null>(null),
    applied = useRef<{ name: string; token: string }[]>([]);
  function closeDelivery() {
    channel.current?.close();
    channel.current = null;
    if (monitor.current !== null) clearInterval(monitor.current);
    monitor.current = null;
    try {
      popup.current?.close();
    } catch {}
    popup.current = null;
  }
  useEffect(
    () => () => {
      generation.current++;
      sessionEpoch.current++;
      abort.current?.abort();
      session.current?.dispose();
      closeDelivery();
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (session.current) setState(session.current.snapshot());
    }, 1000);
    return () => clearInterval(timer);
  }, [open]);
  const selected =
      project.profiles.find((p) => p.id === selectedId) ?? project.profiles[0],
    pending = name !== project.name || json(draft) !== json(toDraft(selected));
  const activeFlow = [
      "preparing",
      "awaiting-authorization",
      "exchanging",
      "device-starting",
      "device-awaiting",
      "polling",
    ].includes(state.phase),
    locked = !!job || activeFlow;
  const targets = schemes.filter(oauthAcceptsToken),
    target = targets.some((s) => s.name === targetName)
      ? targetName
      : (targets[0]?.name ?? "");
  const redirectUri =
    typeof window === "undefined"
      ? ""
      : oauthCallbackUri(window.location.origin, selected.issuer);
  function fail(e: unknown) {
    setFeedback({ key: `oauth.error.${oauthError(e).code}`, error: true });
  }
  function notify(key: TranslationKey) {
    setFeedback({ key, error: false });
  }
  function sync(s: OAuthSession) {
    setState(s.snapshot());
    setTokens(s.tokenValues());
    setDevice(s.deviceView());
    setReport(s.report());
    setNow(Date.now());
  }
  function observer(epoch: number) {
    return (snapshot: OAuthSnapshot) => {
      if (epoch !== sessionEpoch.current) return;
      setState(snapshot);
      const s = session.current;
      setTokens(s?.tokenValues() ?? null);
      setDevice(s?.deviceView() ?? null);
      setReport(s?.report() ?? null);
      setNow(Date.now());
    };
  }
  function forgetApplied() {
    for (const value of applied.current)
      onForgetToken?.(value.name, value.token);
    applied.current = [];
  }
  function resetSession() {
    generation.current++;
    sessionEpoch.current++;
    abort.current?.abort();
    abort.current = null;
    session.current?.dispose();
    session.current = null;
    closeDelivery();
    forgetApplied();
    setState(initialSnapshot());
    setTokens(null);
    setDevice(null);
    setReport(null);
    setAuthorizationUrl("");
    setCallback("");
    setReveal(false);
    setJob(null);
  }
  function startSession() {
    resetSession();
    const s = new OAuthSession(selected, observer(sessionEpoch.current));
    session.current = s;
    return s;
  }
  function accept(p: OAuthProject) {
    resetSession();
    setProject(p);
    setName(p.name);
    setSelectedId(p.profiles[0].id);
    setDraft(toDraft(p.profiles[0]));
    setMetadata("{}");
    setFeedback(null);
  }
  const checked = (p: OAuthProject) =>
    parseOAuthProject(serializeOAuthProject(p));
  function save() {
    try {
      const saved = normalizeOAuthProfile({
          ...draft,
          timeoutMs: number(draft.timeoutMs),
        }),
        p = checked({
          ...project,
          name,
          profiles: project.profiles.map((x) =>
            x.id === selected.id ? saved : x,
          ),
        });
      resetSession();
      setProject(p);
      setName(p.name);
      setDraft(toDraft(saved));
      notify("oauth.saved");
    } catch (e) {
      fail(e);
    }
  }
  function discard() {
    setName(project.name);
    setDraft(toDraft(selected));
    setFeedback(null);
  }
  function selectProfile(id: string) {
    resetSession();
    setSelectedId(id);
    setDraft(toDraft(project.profiles.find((p) => p.id === id)!));
    setFeedback(null);
  }
  function addProfile() {
    try {
      const p = normalizeOAuthProfile({
          ...defaultOAuthProfile(crypto.randomUUID()),
          name: `OAuth client ${project.profiles.length + 1}`,
        }),
        next = checked({ ...project, profiles: [...project.profiles, p] });
      resetSession();
      setProject(next);
      setSelectedId(p.id);
      setDraft(toDraft(p));
    } catch (e) {
      fail(e);
    }
  }
  function deleteProfile() {
    const next = {
      ...project,
      profiles: project.profiles.filter((p) => p.id !== selected.id),
    };
    accept(next);
  }
  function applyMetadata() {
    try {
      const p = normalizeOAuthProfile({
        ...draft,
        timeoutMs: number(draft.timeoutMs),
      });
      setDraft(toDraft(applyOAuthMetadata(p, parseOAuthJson(metadata))));
      notify("oauth.metadataReady");
    } catch (e) {
      fail(e);
    }
  }
  async function discover() {
    const task = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    setJob("metadata");
    setFeedback(null);
    try {
      const p = await discoverOAuthProfile(selected, controller.signal);
      if (task === generation.current) {
        setDraft(toDraft(p));
        notify("oauth.metadataReady");
      }
    } catch (e) {
      if (task === generation.current) fail(e);
    } finally {
      if (task === generation.current) {
        abort.current = null;
        setJob(null);
      }
    }
  }
  async function importFile(file: File) {
    const task = ++generation.current;
    setJob("read");
    setFeedback(null);
    try {
      if (file.size > MAX_OAUTH_PROJECT_BYTES) throw new OAuthError("limit");
      const source = await file.text();
      if (task === generation.current) {
        accept(parseOAuthProject(source));
        notify("oauth.imported");
      }
    } catch (e) {
      if (task === generation.current) fail(e);
    } finally {
      if (task === generation.current) setJob(null);
    }
  }
  async function runDemo() {
    resetSession();
    const task = ++generation.current,
      epoch = sessionEpoch.current;
    setJob("demo");
    setFeedback(null);
    try {
      const s = await runOAuthOfflineDemo(observer(epoch));
      if (task !== generation.current) {
        s.dispose();
        return;
      }
      session.current = s;
      sync(s);
    } catch (e) {
      if (task === generation.current) fail(e);
    } finally {
      if (task === generation.current) setJob(null);
    }
  }
  async function completeCallback(url: string, expected?: OAuthSession) {
    const s = session.current;
    if (!s || (expected && expected !== s) || s.snapshot().busy) return;
    const task = ++generation.current;
    setCallback("");
    setJob("exchange");
    setFeedback(null);
    try {
      await s.acceptCallback(url);
      if (task === generation.current) {
        channel.current?.postMessage({ kind: "rsswag-oauth-accepted" });
        closeDelivery();
        setAuthorizationUrl("");
        sync(s);
      }
    } catch (e) {
      if (task === generation.current) {
        fail(e);
        sync(s);
        if (s.snapshot().phase !== "awaiting-authorization") {
          closeDelivery();
          setAuthorizationUrl("");
        }
      }
    } finally {
      if (task === generation.current) setJob(null);
    }
  }
  async function authorize(withPopup: boolean) {
    let opened: Window | null = null;
    if (withPopup) {
      try {
        opened = window.open(
          "about:blank",
          "_blank",
          "popup,width=560,height=760",
        );
        if (opened) opened.opener = null;
      } catch {
        try {
          opened?.close();
        } catch {}
        opened = null;
      }
    }
    const s = startSession();
    popup.current = opened;
    const task = ++generation.current;
    setJob("authorize");
    setFeedback(null);
    try {
      const auth = await s.prepare(redirectUri);
      if (task !== generation.current) return;
      setAuthorizationUrl(auth.url);
      if (typeof BroadcastChannel !== "undefined") {
        try {
          const bc = new BroadcastChannel(OAUTH_CHANNEL_PREFIX + auth.state);
          channel.current = bc;
          bc.onmessage = (event) => {
            if (
              event.data?.kind === "rsswag-oauth-callback" &&
              typeof event.data.url === "string" &&
              event.data.url.length <= 65536 &&
              session.current === s
            )
              void completeCallback(event.data.url, s);
          };
        } catch {}
      }
      if (opened) {
        opened.location.href = auth.url;
        monitor.current = setInterval(() => {
          if (
            opened?.closed &&
            session.current === s &&
            s.snapshot().phase === "awaiting-authorization"
          ) {
            s.cancel();
            closeDelivery();
            setAuthorizationUrl("");
            fail(new OAuthError("cancelled"));
          }
        }, 500);
      } else if (withPopup)
        setFeedback({ key: "oauth.popupBlocked", error: true });
      sync(s);
    } catch (e) {
      if (task === generation.current) {
        fail(e);
        closeDelivery();
      }
    } finally {
      if (task === generation.current) setJob(null);
    }
  }
  async function sessionTask(
    kind: "device" | "poll" | "refresh" | "revoke",
    which: "access" | "refresh" = "access",
  ) {
    const s = kind === "device" ? startSession() : session.current;
    if (!s) return;
    const task = ++generation.current;
    setJob(kind);
    setFeedback(null);
    try {
      if (kind === "device") await s.startDevice();
      else if (kind === "poll") await s.pollDevice();
      else if (kind === "refresh") await s.refresh();
      else {
        await s.revoke(which);
        forgetApplied();
      }
      if (task === generation.current) sync(s);
    } catch (e) {
      if (task === generation.current) {
        fail(e);
        sync(s);
      }
    } finally {
      if (task === generation.current) setJob(null);
    }
  }
  function cancel() {
    session.current?.cancel();
    abort.current?.abort();
    closeDelivery();
    setAuthorizationUrl("");
    setCallback("");
    if (["read", "copy", "demo"].includes(job ?? "")) {
      generation.current++;
      setJob(null);
    }
    fail(new OAuthError("cancelled"));
  }
  function applyToken() {
    try {
      const token = session.current?.accessToken();
      if (!token || !target || !onApplyToken?.(target, token))
        throw new OAuthError("unavailable");
      applied.current = [
        ...applied.current.filter((v) => v.name !== target),
        { name: target, token },
      ];
      notify("oauth.applied");
    } catch (e) {
      fail(e);
    }
  }
  async function copy(value: () => string) {
    const task = ++generation.current;
    setJob("copy");
    setFeedback(null);
    try {
      const ok = await writeTextToClipboard(value());
      if (task === generation.current)
        setFeedback({
          key: ok ? "oauth.copied" : "oauth.copyError",
          error: !ok,
        });
    } catch {
      if (task === generation.current)
        setFeedback({ key: "oauth.copyError", error: true });
    } finally {
      if (task === generation.current) setJob(null);
    }
  }
  function download(content: () => string, suffix: string) {
    try {
      const stem =
        project.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) || "oauth";
      const ok = downloadTextFile(
        content(),
        `${stem}-oauth-${suffix}.json`,
        "application/json",
      );
      setFeedback({
        key: ok ? "oauth.downloaded" : "oauth.downloadError",
        error: !ok,
      });
    } catch (e) {
      fail(e);
    }
  }
  function field(
    key: TranslationKey,
    value: string,
    change: (v: string) => void,
    rows = 0,
  ) {
    return (
      <label className="block text-xs font-semibold">
        {t(key)}
        {rows ? (
          <textarea
            className={`${inputClass} font-mono`}
            rows={rows}
            value={value}
            onChange={(e) => change(e.target.value)}
          />
        ) : (
          <input
            className={inputClass}
            autoComplete="off"
            value={value}
            onChange={(e) => change(e.target.value)}
          />
        )}
      </label>
    );
  }
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4"
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
        setNow(Date.now());
        if (e.currentTarget.open && session.current) sync(session.current);
      }}
    >
      <summary className="cursor-pointer font-bold text-[color:var(--color-brand-purple)]">
        {t("oauth.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm">{t("oauth.help")}</p>
          <p className="text-xs text-slate-600">{t("oauth.privacy")}</p>
          <p className="text-xs text-slate-600">{t("oauth.network")}</p>
          <p className="text-xs text-slate-600">{t("oauth.limits")}</p>
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
              {t("oauth.pending")}
            </p>
          )}
          <fieldset
            disabled={locked || pending}
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              className={buttonClass}
              onClick={() => void runDemo()}
            >
              {t("oauth.demo")}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => accept(emptyOAuthProject())}
            >
              {t("oauth.new")}
            </button>
            <label className={`${buttonClass} cursor-pointer`}>
              {t("oauth.import")}
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
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
                download(() => serializeOAuthProject(project), "profiles")
              }
            >
              {t("oauth.export")}
            </button>
          </fieldset>
          <p className="text-xs text-slate-600">{t("oauth.demoHelp")}</p>
          <fieldset disabled={locked} className="space-y-3">
            {field("oauth.projectName", name, setName)}
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1 text-xs font-semibold">
                {t("oauth.profile")}
                <select
                  className={inputClass}
                  disabled={pending}
                  value={selectedId}
                  onChange={(e) => selectProfile(e.target.value)}
                >
                  {project.profiles.map((p) => (
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
                  pending || project.profiles.length >= MAX_OAUTH_PROFILES
                }
                onClick={addProfile}
              >
                {t("oauth.add")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={pending || project.profiles.length <= 1}
                onClick={deleteProfile}
              >
                {t("oauth.delete")}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  "name",
                  "issuer",
                  "metadataUrl",
                  "authorizationEndpoint",
                  "tokenEndpoint",
                  "deviceEndpoint",
                  "revocationEndpoint",
                  "clientId",
                  "scope",
                  "resource",
                  "audience",
                  "timeoutMs",
                ] as const
              ).map((k) => (
                <div key={k}>
                  {field(`oauth.${k}`, draft[k], (value) =>
                    setDraft({ ...draft, [k]: value }),
                  )}
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.requireIssuer}
                onChange={(e) =>
                  setDraft({ ...draft, requireIssuer: e.target.checked })
                }
              />
              {t("oauth.requireIssuer")}
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={save}>
                {t("oauth.save")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!pending}
                onClick={discard}
              >
                {t("oauth.discard")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={pending || !selected.issuer}
                onClick={() => void discover()}
              >
                {t("oauth.discover")}
              </button>
            </div>
            {field("oauth.metadata", metadata, setMetadata, 4)}
            <p className="text-xs text-slate-600">{t("oauth.metadataHelp")}</p>
            <button
              type="button"
              className={buttonClass}
              onClick={applyMetadata}
            >
              {t("oauth.applyMetadata")}
            </button>
          </fieldset>
          <fieldset
            disabled={locked || pending}
            className="space-y-3 rounded-xl border border-slate-200 p-3"
          >
            <label className="block text-xs font-semibold">
              {t("oauth.redirect")}
              <input
                className={`${inputClass} font-mono`}
                readOnly
                value={redirectUri}
              />
            </label>
            <p className="text-xs text-slate-600">{t("oauth.redirectHelp")}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!selected.clientId || !selected.authorizationEndpoint}
                onClick={() => void authorize(true)}
              >
                {t("oauth.authorize")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!selected.clientId || !selected.authorizationEndpoint}
                onClick={() => void authorize(false)}
              >
                {t("oauth.prepare")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!selected.clientId || !selected.deviceEndpoint}
                onClick={() => void sessionTask("device")}
              >
                {t("oauth.deviceStart")}
              </button>
            </div>
          </fieldset>
          {authorizationUrl && (
            <fieldset disabled={!!job || pending} className="space-y-3">
              <label className="block text-xs font-semibold">
                {t("oauth.authorizationUrl")}
                <input
                  className={`${inputClass} font-mono`}
                  readOnly
                  value={authorizationUrl}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <a
                  className={buttonClass}
                  href={authorizationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("oauth.openAuthorization")}
                </a>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => void copy(() => authorizationUrl)}
                >
                  {t("oauth.copyAuthorization")}
                </button>
              </div>
              {field("oauth.callback", callback, setCallback, 3)}
              <button
                type="button"
                className={buttonClass}
                disabled={!callback.trim()}
                onClick={() => void completeCallback(callback)}
              >
                {t("oauth.exchange")}
              </button>
            </fieldset>
          )}
          {device && (
            <section className="space-y-2">
              <label className="block text-xs font-semibold">
                {t("oauth.deviceCode")}
                <input
                  className={`${inputClass} font-mono`}
                  value={device.userCode}
                  readOnly
                />
              </label>
              <a
                className={buttonClass}
                href={device.verificationUri}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("oauth.deviceLink")}
              </a>
              <p className="text-xs text-slate-600">{t("oauth.deviceHelp")}</p>
              <p className="text-xs">
                {message("oauth.polls", {
                  count: state.polls,
                  seconds: Math.max(
                    0,
                    Math.ceil(((state.nextPollAt ?? now) - now) / 1000),
                  ),
                })}
              </p>
              <button
                type="button"
                className={buttonClass}
                disabled={!!job || pending || device.expiresAt <= now}
                onClick={() => void sessionTask("poll")}
              >
                {t("oauth.devicePoll")}
              </button>
            </section>
          )}
          {(job || activeFlow) && (
            <div className="flex flex-wrap items-center gap-2">
              {job && (
                <p role="status" className="text-xs">
                  {t("oauth.busy")}
                </p>
              )}
              <button type="button" className={buttonClass} onClick={cancel}>
                {t("oauth.cancel")}
              </button>
            </div>
          )}
          <section className="space-y-3" aria-label={t("oauth.session")}>
            <p role="status" className="text-sm font-bold">
              {t("oauth.state", { phase: t(`oauth.phase.${state.phase}`) })}
            </p>
            <p className="text-xs">
              {t(
                state.source === "demo"
                  ? "oauth.demoSource"
                  : "oauth.liveSource",
              )}
            </p>
            {state.remote && (
              <p className="text-xs">{t(`oauth.remote.${state.remote}`)}</p>
            )}
            {tokens ? (
              <>
                <p className="text-xs">
                  {t("oauth.tokenType", { type: state.tokenType })}
                </p>
                <p className="text-xs">
                  {t("oauth.grantedScopes", { scope: state.scope || "—" })}
                </p>
                <p className="text-xs">
                  {state.expiresAt === null
                    ? t("oauth.unknownExpiry")
                    : message("oauth.expires", {
                        seconds: Math.max(
                          0,
                          Math.ceil((state.expiresAt - now) / 1000),
                        ),
                      })}
                </p>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={reveal}
                    onChange={(e) => setReveal(e.target.checked)}
                  />
                  {t("oauth.reveal")}
                </label>
                {(["accessToken", "refreshToken"] as const).map((k) => (
                  <label key={k} className="block text-xs font-semibold">
                    {t(`oauth.${k}`)}
                    <input
                      className={`${inputClass} font-mono`}
                      type={reveal ? "text" : "password"}
                      autoComplete="off"
                      readOnly
                      value={tokens[k]}
                    />
                  </label>
                ))}
              </>
            ) : (
              <p className="text-xs">{t("oauth.noToken")}</p>
            )}
            <fieldset
              disabled={!!job || pending || activeFlow}
              className="flex flex-wrap gap-2"
            >
              <button
                type="button"
                className={buttonClass}
                disabled={!state.hasAccessToken || state.source !== "live"}
                onClick={() => void copy(() => session.current!.accessToken())}
              >
                {t("oauth.copyToken")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!state.hasRefreshToken}
                onClick={() => void sessionTask("refresh")}
              >
                {t("oauth.refresh")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!tokens?.accessToken || !selected.revocationEndpoint}
                onClick={() => void sessionTask("revoke", "access")}
              >
                {t("oauth.revokeAccess")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={
                  !state.hasRefreshToken || !selected.revocationEndpoint
                }
                onClick={() => void sessionTask("revoke", "refresh")}
              >
                {t("oauth.revokeRefresh")}
              </button>
            </fieldset>
            <fieldset
              disabled={!!job || pending || activeFlow}
              className="space-y-2"
            >
              {targets.length ? (
                <label className="block text-xs font-semibold">
                  {t("oauth.target")}
                  <select
                    className={inputClass}
                    value={target}
                    onChange={(e) => setTargetName(e.target.value)}
                  >
                    {targets.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs">{t("oauth.noTargets")}</p>
              )}
              <p className="text-xs text-slate-600">{t("oauth.applyHelp")}</p>
              <button
                type="button"
                className={buttonClass}
                disabled={
                  !target ||
                  !onApplyToken ||
                  !state.hasAccessToken ||
                  state.source !== "live"
                }
                onClick={applyToken}
              >
                {t("oauth.applyToken")}
              </button>
            </fieldset>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                resetSession();
                notify("oauth.forgotten");
              }}
            >
              {t("oauth.forget")}
            </button>
          </section>
          {report && (
            <section className="space-y-3" aria-label={t("oauth.journal")}>
              <ol className="max-h-64 space-y-1 overflow-auto text-xs">
                {report.entries.map((e) => (
                  <li key={e.sequence}>
                    {message("oauth.event", {
                      sequence: e.sequence,
                      ms: e.atMs,
                      phase: t(`oauth.phase.${e.phase}`),
                    })}
                    {e.status ? ` · HTTP ${e.status}` : ""}
                    {e.issue ? ` · ${t(`oauth.error.${e.issue}`)}` : ""}
                    {e.remote ? ` · ${t(`oauth.remote.${e.remote}`)}` : ""}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className={buttonClass}
                disabled={!!job || pending}
                onClick={() => download(() => json(report), "session-report")}
              >
                {t("oauth.report")}
              </button>
            </section>
          )}
        </div>
      )}
    </details>
  );
});
