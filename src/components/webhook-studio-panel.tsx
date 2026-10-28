"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  HOOK_PROVIDERS,
  MAX_HOOK_DELIVERIES,
  MAX_HOOK_KEYS,
  MAX_HOOK_PROFILES,
  MAX_HOOK_PROJECT,
  MAX_HOOK_BODY,
  HookError,
  emptyHookProject,
  hookBase64,
  newHookDelivery,
  normalizeHookProject,
  parseHookProject,
  serializeHookProject,
  type HookDelivery,
  type HookKey,
  type HookProfile,
  type HookProject,
  type HookProvider,
} from "@/lib/webhook-project";
import {
  generateHookSecret,
  signHookDelivery,
  verifyHookDelivery,
  type HookSecrets,
  type HookVerification,
} from "@/lib/webhook-crypto";
import {
  demoHookProject,
  hookRunReport,
  hookVerificationReport,
  importHookHar,
  runHookDeliveries,
  type HookRun,
} from "@/lib/webhook-studio";
import { generateWebhookVerifier } from "@/lib/webhook-export";
import type { TranslationKey } from "@/lib/translations";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const integer = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
function nextId(prefix: string, values: string[]) {
  let n = 1;
  while (values.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function drafts(
  p: HookProject,
  key: string,
  profile: string,
  delivery: string,
) {
  const k = p.keys.find((x) => x.id === key)!,
    r = p.profiles.find((x) => x.id === profile)!,
    d = p.deliveries.find((x) => x.id === delivery);
  return {
    name: p.name,
    clockSeconds: String(p.clockSeconds),
    key: { ...k },
    profile: {
      ...r,
      keyIds: [...r.keyIds],
      maxAgeSeconds: String(r.maxAgeSeconds),
      maxFutureSeconds: String(r.maxFutureSeconds),
      ttlSeconds: String(r.ttlSeconds),
      capacity: String(r.capacity),
    },
    delivery: d ? { ...d, atSeconds: String(d.atSeconds) } : null,
  };
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  readOnly = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
  type?: string;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? (
        <textarea
          className={`${inputClass} font-mono`}
          rows={6}
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          type={type}
          readOnly={readOnly}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )}
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  disabled = false,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      <select
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export const WebhookStudioPanel = memo(function WebhookStudioPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyHookProject);
  const [keyId, setKeyId] = useState("standard-key"),
    [profileId, setProfileId] = useState("standard"),
    [deliveryId, setDeliveryId] = useState("delivery-1");
  const [draft, setDraft] = useState(() =>
    drafts(emptyHookProject(), "standard-key", "standard", "delivery-1"),
  );
  const [secrets, setSecrets] = useState<HookSecrets>({}),
    [revision, setRevision] = useState(0),
    [showSecret, setShowSecret] = useState(false),
    [newProvider, setNewProvider] = useState<HookProvider>("standard");
  const [timestamp, setTimestamp] = useState("1700000000"),
    [signedId, setSignedId] = useState("msg_example"),
    [rotation, setRotation] = useState(false);
  const [inspection, setInspection] = useState<{
      result: HookVerification;
      draft: string;
      revision: number;
    } | null>(null),
    [run, setRun] = useState<HookRun | null>(null),
    [resultId, setResultId] = useState("");
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error: boolean;
      values?: Record<string, string>;
    } | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const pending =
      json(draft) !== json(drafts(project, keyId, profileId, deliveryId)),
    locked = busy || pending;
  const stale =
    !!inspection &&
    (inspection.draft !== json(draft) || inspection.revision !== revision);
  const selectedResult =
    run?.rows.find((r) => r.id === resultId) ?? run?.rows[0];
  const notify = (key: TranslationKey, values?: Record<string, string>) =>
    setFeedback({ key, values, error: false });
  const fail = (e: unknown) =>
    setFeedback({
      key: `hook.error.${e instanceof HookError ? e.code : "crypto"}`,
      error: true,
    });
  function perform(action: () => void) {
    try {
      action();
    } catch (e) {
      fail(e);
    }
  }
  async function work(action: (check: () => boolean) => Promise<() => void>) {
    if (busy) return;
    const ticket = ++generation.current;
    setBusy(true);
    setFeedback(null);
    try {
      const commit = await action(() => ticket !== generation.current);
      if (ticket === generation.current) commit();
    } catch (e) {
      if (ticket === generation.current) fail(e);
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  function current(): HookProject {
    return normalizeHookProject({
      ...project,
      name: draft.name,
      clockSeconds: integer(draft.clockSeconds),
      keys: project.keys.map((k) => (k.id === keyId ? draft.key : k)),
      profiles: project.profiles.map((p) =>
        p.id === profileId
          ? {
              ...draft.profile,
              maxAgeSeconds: integer(draft.profile.maxAgeSeconds),
              maxFutureSeconds: integer(draft.profile.maxFutureSeconds),
              ttlSeconds: integer(draft.profile.ttlSeconds),
              capacity: integer(draft.profile.capacity),
            }
          : p,
      ),
      deliveries: project.deliveries.map((d) =>
        d.id === deliveryId && draft.delivery
          ? { ...draft.delivery, atSeconds: integer(draft.delivery.atSeconds) }
          : d,
      ),
    });
  }
  function install(
    value: HookProject,
    key?: string,
    profile?: string,
    delivery?: string,
    nextSecrets?: HookSecrets,
  ) {
    const p = normalizeHookProject(value);
    delivery ??= p.deliveries[0]?.id ?? "";
    profile ??=
      p.deliveries.find((d) => d.id === delivery)?.profileId ??
      p.profiles[0].id;
    key ??=
      p.keys.find(
        (k) =>
          k.provider === p.profiles.find((r) => r.id === profile)?.provider,
      )?.id ?? p.keys[0].id;
    if (
      !p.keys.some((k) => k.id === key) ||
      !p.profiles.some((r) => r.id === profile)
    )
      throw new HookError("project");
    setProject(p);
    setKeyId(key);
    setProfileId(profile);
    setDeliveryId(delivery);
    setDraft(drafts(p, key, profile, delivery));
    setRun(null);
    setInspection(null);
    setSecrets(
      (previous) =>
        nextSecrets ??
        Object.fromEntries(
          p.keys
            .filter((k) => Object.hasOwn(previous, k.id))
            .map((k) => [k.id, previous[k.id]]),
        ),
    );
    setShowSecret(false);
    setRevision((v) => v + 1);
  }
  function changeSecret(value: string) {
    setSecrets((s) => ({ ...s, [keyId]: value }));
    setRevision((v) => v + 1);
    setRun(null);
  }
  function forgetAll() {
    generation.current++;
    setBusy(false);
    setSecrets({});
    setRevision((v) => v + 1);
    setRun(null);
    setInspection(null);
    setShowSecret(false);
    notify("hook.forgotten");
  }
  function select(k = keyId, p = profileId, d = deliveryId) {
    setKeyId(k);
    setProfileId(p);
    setDeliveryId(d);
    setDraft(drafts(project, k, p, d));
    setInspection(null);
    setShowSecret(false);
  }
  function download(source: string, name: string, mime = "application/json") {
    try {
      const ok = downloadTextFile(source, name, mime);
      setFeedback({
        key: ok ? "hook.downloaded" : "hook.downloadFailed",
        error: !ok,
      });
    } catch {
      setFeedback({ key: "hook.downloadFailed", error: true });
    }
  }
  function importFile(file: File | undefined, har: boolean) {
    if (!file || locked) return;
    if (file.size > (har ? 4 * 1024 * 1024 : MAX_HOOK_PROJECT)) {
      fail(new HookError("limit"));
      return;
    }
    void work(async (check) => {
      const source = await file.text();
      if (check()) throw new HookError("cancelled");
      if (har) {
        const result = importHookHar(project, source, profileId);
        return () => {
          install(
            result.project,
            keyId,
            profileId,
            result.project.deliveries[project.deliveries.length].id,
          );
          notify("hook.harLoaded", {
            count: String(result.imported),
            skipped: String(result.skipped),
          });
        };
      }
      const p = parseHookProject(source);
      return () => {
        install(p, undefined, undefined, undefined, {});
        notify("hook.loaded");
      };
    });
  }
  function importPayload(file: File | undefined) {
    if (!file || busy || !draft.delivery) return;
    if (file.size > MAX_HOOK_BODY) {
      fail(new HookError("limit"));
      return;
    }
    void work(async (check) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (check()) throw new HookError("cancelled");
      if (bytes.length > MAX_HOOK_BODY) throw new HookError("limit");
      const body = hookBase64(bytes);
      return () => {
        setDraft((d) => ({
          ...d,
          delivery: d.delivery
            ? { ...d.delivery, encoding: "base64", body }
            : null,
        }));
        notify("hook.payloadLoaded");
      };
    });
  }
  function sign() {
    void work(async (check) => {
      const p = current(),
        d = p.deliveries.find((x) => x.id === deliveryId);
      if (!d) throw new HookError("project");
      const profile = p.profiles.find((x) => x.id === d.profileId)!;
      const keys = p.keys.filter(
        (k) =>
          k.enabled &&
          k.provider === profile.provider &&
          profile.keyIds.includes(k.id) &&
          Object.hasOwn(secrets, k.id) &&
          secrets[k.id],
      );
      keys.sort((a, b) => Number(b.id === keyId) - Number(a.id === keyId));
      const values = (
        rotation && profile.provider !== "github" ? keys : keys.slice(0, 1)
      ).map((k) => secrets[k.id]);
      const headers = await signHookDelivery(
        profile.provider,
        d,
        values,
        integer(timestamp),
        signedId,
        check,
      );
      return () => {
        setDraft((previous) => ({
          ...previous,
          delivery: previous.delivery
            ? { ...previous.delivery, headers }
            : null,
        }));
        notify("hook.signed");
      };
    });
  }
  function inspect() {
    void work(async (check) => {
      const p = current(),
        d = p.deliveries.find((x) => x.id === deliveryId);
      if (!d) throw new HookError("project");
      const result = await verifyHookDelivery(
        p.profiles.find((x) => x.id === d.profileId)!,
        p.keys,
        secrets,
        d,
        p.clockSeconds + d.atSeconds,
        check,
      );
      return () => {
        setInspection({ result, draft: json(draft), revision });
        notify("hook.inspected");
      };
    });
  }
  function rehearse() {
    if (locked) return;
    void work(async (check) => {
      const result = await runHookDeliveries(project, secrets, check);
      return () => {
        setRun(result);
        setResultId(result.rows[0]?.id ?? "");
        notify("hook.completed", {
          passed: String(result.passed),
          total: String(result.total),
        });
      };
    });
  }
  function addDelivery(clone: boolean) {
    if (locked || project.deliveries.length >= MAX_HOOK_DELIVERIES) return;
    perform(() => {
      const id = nextId(
          "delivery",
          project.deliveries.map((d) => d.id),
        ),
        previous = project.deliveries.find((d) => d.id === deliveryId);
      const d =
        clone && previous
          ? {
              ...previous,
              id,
              name: id,
              atSeconds: Math.min(86400, previous.atSeconds + 1),
              expect: "duplicate" as const,
            }
          : newHookDelivery(id, profileId);
      install(
        { ...project, deliveries: [...project.deliveries, d] },
        keyId,
        d.profileId,
        id,
      );
      setFeedback(null);
    });
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("hook.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("hook.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("hook.scopeTitle")}
            </summary>
            {["scope", "bytesHelp", "replayHelp", "privacy", "limits"].map(
              (k) => (
                <p key={k}>{t(`hook.${k}` as TranslationKey)}</p>
              ),
            )}
          </details>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={
                feedback.error
                  ? "text-sm text-red-700"
                  : "text-sm text-purple-800"
              }
            >
              {t(feedback.key, feedback.values)}
            </p>
          )}
          {pending && (
            <p className="text-xs text-amber-800">{t("hook.pending")}</p>
          )}
          {busy && <p role="status">{t("hook.busy")}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                void work(async (check) => {
                  const result = await demoHookProject(check);
                  return () => {
                    install(
                      result.project,
                      "standard-key",
                      "standard",
                      "standard-valid",
                      result.secrets,
                    );
                    notify("hook.demoLoaded");
                  };
                })
              }
            >
              {t("hook.demo")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() => {
                  install(
                    emptyHookProject(),
                    undefined,
                    "standard",
                    undefined,
                    {},
                  );
                  notify("hook.loaded");
                })
              }
            >
              {t("hook.new")}
            </button>
            <label className={buttonClass}>
              {t("hook.import")}
              <input
                className="mt-1 block max-w-56 text-xs"
                type="file"
                accept=".json,application/json"
                disabled={locked}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  importFile(file, false);
                }}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() =>
                  download(
                    serializeHookProject(project),
                    "webhook-project.json",
                  ),
                )
              }
            >
              {t("hook.export")}
            </button>
            <button type="button" className={buttonClass} onClick={forgetAll}>
              {t("hook.forgetAll")}
            </button>
          </div>
          <fieldset disabled={busy} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label={t("hook.name")}
                value={draft.name}
                onChange={(name) => setDraft((d) => ({ ...d, name }))}
              />
              <Field
                label={t("hook.clock")}
                value={draft.clockSeconds}
                onChange={(clockSeconds) =>
                  setDraft((d) => ({ ...d, clockSeconds }))
                }
              />
            </div>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("hook.keys")}</h4>
              <p className="text-xs text-slate-600">{t("hook.secretHelp")}</p>
              <p className="text-xs">
                {t("hook.secretCount", {
                  count: String(Object.values(secrets).filter(Boolean).length),
                })}
              </p>
              <Select
                label={t("hook.key")}
                value={keyId}
                disabled={locked}
                onChange={(id) => select(id)}
              >
                {project.keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.provider}, {k.id})
                  </option>
                ))}
              </Select>
              <Field
                label={t("hook.keyName")}
                value={draft.key.name}
                onChange={(name) =>
                  setDraft((d) => ({ ...d, key: { ...d.key, name } }))
                }
              />
              <Check
                label={t("hook.keyEnabled")}
                checked={draft.key.enabled}
                onChange={(enabled) =>
                  setDraft((d) => ({ ...d, key: { ...d.key, enabled } }))
                }
              />
              <Field
                label={t("hook.secret")}
                value={secrets[keyId] ?? ""}
                type={showSecret ? "text" : "password"}
                onChange={changeSecret}
              />
              <Check
                label={t("hook.showSecret")}
                checked={showSecret}
                onChange={setShowSecret}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() =>
                    perform(() =>
                      changeSecret(generateHookSecret(draft.key.provider)),
                    )
                  }
                >
                  {t("hook.generateSecret")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    changeSecret("");
                    setShowSecret(false);
                  }}
                >
                  {t("hook.forgetSecret")}
                </button>
              </div>
              <Select
                label={t("hook.keyProvider")}
                value={newProvider}
                onChange={(p) => setNewProvider(p as HookProvider)}
              >
                {HOOK_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || project.keys.length >= MAX_HOOK_KEYS}
                  onClick={() =>
                    perform(() => {
                      const id = nextId(
                        `${newProvider}-key`,
                        project.keys.map((k) => k.id),
                      );
                      const key: HookKey = {
                        id,
                        name: id,
                        provider: newProvider,
                        enabled: true,
                      };
                      install(
                        { ...project, keys: [...project.keys, key] },
                        id,
                        profileId,
                        deliveryId,
                      );
                      setFeedback(null);
                    })
                  }
                >
                  {t("hook.addKey")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked ||
                    project.keys.length <= 1 ||
                    project.profiles.some((p) => p.keyIds.includes(keyId))
                  }
                  onClick={() =>
                    perform(() => {
                      install(
                        {
                          ...project,
                          keys: project.keys.filter((k) => k.id !== keyId),
                        },
                        undefined,
                        profileId,
                        deliveryId,
                      );
                      setFeedback(null);
                    })
                  }
                >
                  {t("hook.deleteKey")}
                </button>
              </div>
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("hook.profiles")}</h4>
              <Select
                label={t("hook.profile")}
                value={profileId}
                disabled={locked}
                onChange={(id) => select(keyId, id)}
              >
                {project.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </Select>
              <Field
                label={t("hook.profileName")}
                value={draft.profile.name}
                onChange={(name) =>
                  setDraft((d) => ({ ...d, profile: { ...d.profile, name } }))
                }
              />
              <Field
                label={t("hook.provider")}
                value={draft.profile.provider}
                readOnly
              />
              {draft.profile.provider === "github" && (
                <p className="text-xs text-amber-800">{t("hook.githubHelp")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {project.keys
                  .filter((k) => k.provider === draft.profile.provider)
                  .map((k) => (
                    <Check
                      key={k.id}
                      label={t("hook.allowKey", { id: k.id })}
                      checked={draft.profile.keyIds.includes(k.id)}
                      onChange={(allowed) =>
                        setDraft((d) => ({
                          ...d,
                          profile: {
                            ...d.profile,
                            keyIds: allowed
                              ? [...d.profile.keyIds, k.id]
                              : d.profile.keyIds.filter((id) => id !== k.id),
                          },
                        }))
                      }
                    />
                  ))}
              </div>
              <Check
                label={t("hook.requireTimestamp")}
                checked={draft.profile.requireTimestamp}
                onChange={(requireTimestamp) =>
                  setDraft((d) => ({
                    ...d,
                    profile: { ...d.profile, requireTimestamp },
                  }))
                }
              />
              <div className="grid gap-3 md:grid-cols-2">
                {(
                  [
                    "maxAgeSeconds",
                    "maxFutureSeconds",
                    "ttlSeconds",
                    "capacity",
                  ] as const
                ).map((k) => (
                  <Field
                    key={k}
                    label={t(
                      (
                        {
                          maxAgeSeconds: "hook.maxAge",
                          maxFutureSeconds: "hook.future",
                          ttlSeconds: "hook.ttl",
                          capacity: "hook.capacity",
                        } as const
                      )[k],
                    )}
                    value={draft.profile[k]}
                    onChange={(value) =>
                      setDraft((d) => ({
                        ...d,
                        profile: { ...d.profile, [k]: value },
                      }))
                    }
                  />
                ))}
              </div>
              <Select
                label={t("hook.replay")}
                value={draft.profile.replay}
                onChange={(replay) =>
                  setDraft((d) => ({
                    ...d,
                    profile: {
                      ...d.profile,
                      replay: replay as HookProfile["replay"],
                    },
                  }))
                }
              >
                {[
                  "off",
                  "body",
                  ...(draft.profile.provider === "standard"
                    ? ["signed-id"]
                    : []),
                ].map((v) => (
                  <option key={v} value={v}>
                    {t(`hook.replay.${v}` as TranslationKey)}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked || project.profiles.length >= MAX_HOOK_PROFILES
                  }
                  onClick={() =>
                    perform(() => {
                      const id = nextId(
                          "receiver",
                          project.profiles.map((p) => p.id),
                        ),
                        profile = project.profiles.find(
                          (p) => p.id === profileId,
                        )!;
                      install(
                        {
                          ...project,
                          profiles: [
                            ...project.profiles,
                            { ...profile, id, name: id },
                          ],
                        },
                        keyId,
                        id,
                        deliveryId,
                      );
                      setFeedback(null);
                    })
                  }
                >
                  {t("hook.addProfile")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked ||
                    project.profiles.length <= 1 ||
                    project.deliveries.some((d) => d.profileId === profileId)
                  }
                  onClick={() =>
                    perform(() => {
                      install(
                        {
                          ...project,
                          profiles: project.profiles.filter(
                            (p) => p.id !== profileId,
                          ),
                        },
                        keyId,
                        undefined,
                        deliveryId,
                      );
                      setFeedback(null);
                    })
                  }
                >
                  {t("hook.deleteProfile")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() =>
                    perform(() =>
                      download(
                        generateWebhookVerifier(
                          project.profiles.find((p) => p.id === profileId)!,
                          project.keys,
                        ),
                        "webhook-verifier.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("hook.exportVerifier")}
                </button>
              </div>
              <p className="text-xs text-slate-600">{t("hook.verifierHelp")}</p>
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("hook.deliveries")}</h4>
              <p className="text-xs text-slate-600">{t("hook.bytesHelp")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked || project.deliveries.length >= MAX_HOOK_DELIVERIES
                  }
                  onClick={() => addDelivery(false)}
                >
                  {t("hook.addDelivery")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked ||
                    !draft.delivery ||
                    project.deliveries.length >= MAX_HOOK_DELIVERIES
                  }
                  onClick={() => addDelivery(true)}
                >
                  {t("hook.cloneDelivery")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || !draft.delivery}
                  onClick={() =>
                    perform(() => {
                      install(
                        {
                          ...project,
                          deliveries: project.deliveries.filter(
                            (d) => d.id !== deliveryId,
                          ),
                        },
                        keyId,
                        profileId,
                      );
                      setFeedback(null);
                    })
                  }
                >
                  {t("hook.deleteDelivery")}
                </button>
              </div>
              {draft.delivery && (
                <>
                  <Select
                    label={t("hook.delivery")}
                    value={deliveryId}
                    disabled={locked}
                    onChange={(id) =>
                      select(
                        keyId,
                        project.deliveries.find((d) => d.id === id)!.profileId,
                        id,
                      )
                    }
                  >
                    {project.deliveries.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                  <Field
                    label={t("hook.deliveryName")}
                    value={draft.delivery.name}
                    onChange={(name) =>
                      setDraft((d) => ({
                        ...d,
                        delivery: d.delivery ? { ...d.delivery, name } : null,
                      }))
                    }
                  />
                  <Select
                    label={t("hook.deliveryProfile")}
                    value={draft.delivery.profileId}
                    onChange={(id) =>
                      setDraft((d) => ({
                        ...d,
                        delivery: d.delivery
                          ? { ...d.delivery, profileId: id }
                          : null,
                      }))
                    }
                  >
                    {project.profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <Field
                    label={t("hook.at")}
                    value={draft.delivery.atSeconds}
                    onChange={(atSeconds) =>
                      setDraft((d) => ({
                        ...d,
                        delivery: d.delivery
                          ? { ...d.delivery, atSeconds }
                          : null,
                      }))
                    }
                  />
                  <Select
                    label={t("hook.encoding")}
                    value={draft.delivery.encoding}
                    onChange={(encoding) =>
                      setDraft((d) => ({
                        ...d,
                        delivery: d.delivery
                          ? {
                              ...d.delivery,
                              encoding: encoding as HookDelivery["encoding"],
                            }
                          : null,
                      }))
                    }
                  >
                    {["utf8", "base64"].map((v) => (
                      <option key={v} value={v}>
                        {t(`hook.encoding.${v}` as TranslationKey)}
                      </option>
                    ))}
                  </Select>
                  <Field
                    label={t("hook.body")}
                    value={draft.delivery.body}
                    multiline
                    onChange={(body) =>
                      setDraft((d) => ({
                        ...d,
                        delivery: d.delivery ? { ...d.delivery, body } : null,
                      }))
                    }
                  />
                  <label className={buttonClass}>
                    {t("hook.importPayload")}
                    <input
                      type="file"
                      className="mt-1 block max-w-56 text-xs"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        importPayload(file);
                      }}
                    />
                  </label>
                  <Field
                    label={t("hook.headers")}
                    value={draft.delivery.headers}
                    multiline
                    onChange={(headers) =>
                      setDraft((d) => ({
                        ...d,
                        delivery: d.delivery
                          ? { ...d.delivery, headers }
                          : null,
                      }))
                    }
                  />
                  <Select
                    label={t("hook.expected")}
                    value={draft.delivery.expect}
                    onChange={(expect) =>
                      setDraft((d) => ({
                        ...d,
                        delivery: d.delivery
                          ? {
                              ...d.delivery,
                              expect: expect as HookDelivery["expect"],
                            }
                          : null,
                      }))
                    }
                  >
                    {["accepted", "rejected", "duplicate", "capacity"].map(
                      (v) => (
                        <option key={v} value={v}>
                          {t(`hook.outcome.${v}` as TranslationKey)}
                        </option>
                      ),
                    )}
                  </Select>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field
                      label={t("hook.timestamp")}
                      value={timestamp}
                      onChange={setTimestamp}
                    />
                    <Field
                      label={t("hook.signedId")}
                      value={signedId}
                      onChange={setSignedId}
                    />
                  </div>
                  <Check
                    label={t("hook.rotation")}
                    checked={rotation}
                    onChange={setRotation}
                  />
                  <p className="text-xs text-slate-600">{t("hook.signHelp")}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() =>
                        setTimestamp(
                          String(
                            integer(draft.clockSeconds) +
                              integer(draft.delivery!.atSeconds),
                          ),
                        )
                      }
                    >
                      {t("hook.useArrival")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={sign}
                    >
                      {t("hook.sign")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={inspect}
                    >
                      {t("hook.inspect")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={locked}
                      onClick={() =>
                        download(
                          json({
                            kind: "rsswag-webhook-fixture",
                            version: 1,
                            clockSeconds: project.clockSeconds,
                            delivery: project.deliveries.find(
                              (d) => d.id === deliveryId,
                            ),
                          }),
                          "webhook-fixture.json",
                        )
                      }
                    >
                      {t("hook.exportFixture")}
                    </button>
                  </div>
                </>
              )}
              <p className="text-xs text-slate-600">{t("hook.harHelp")}</p>
              <label className={buttonClass}>
                {t("hook.importHar")}
                <input
                  className="mt-1 block max-w-56 text-xs"
                  type="file"
                  accept=".har,.json,application/json"
                  disabled={locked}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    importFile(file, true);
                  }}
                />
              </label>
            </section>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            {busy && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  generation.current++;
                  setBusy(false);
                  fail(new HookError("cancelled"));
                }}
              >
                {t("hook.cancel")}
              </button>
            )}
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !pending}
              onClick={() =>
                perform(() => {
                  install(current(), keyId, profileId, deliveryId);
                  notify("hook.saved");
                })
              }
            >
              {t("hook.save")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !pending}
              onClick={() => {
                setDraft(drafts(project, keyId, profileId, deliveryId));
                setFeedback(null);
              }}
            >
              {t("hook.discard")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked || !project.deliveries.length}
              onClick={rehearse}
            >
              {t("hook.run")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked || !run}
              onClick={() =>
                run &&
                download(hookRunReport(run), "webhook-replay-report.json")
              }
            >
              {t("hook.report")}
            </button>
          </div>
          {inspection && (
            <section
              aria-label={t("hook.inspection")}
              className="space-y-2 rounded-xl border p-3"
            >
              <h4 className="font-bold">{t("hook.inspection")}</h4>
              {stale && (
                <p className="text-xs text-amber-800">
                  {t("hook.inspectionStale")}
                </p>
              )}
              <p className="text-sm font-semibold">
                {t("hook.decision", {
                  signature: t(`hook.signature.${inspection.result.signature}`),
                  freshness: t(`hook.freshness.${inspection.result.freshness}`),
                  outcome: t(
                    inspection.result.accepted
                      ? "hook.outcome.accepted"
                      : "hook.outcome.rejected",
                  ),
                  bytes: String(inspection.result.bytes),
                })}
              </p>
              <ul className="list-inside list-disc text-xs">
                {inspection.result.findings.map((f, n) => (
                  <li key={n}>{t(`hook.finding.${f}`)}</li>
                ))}
              </ul>
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() =>
                  download(
                    hookVerificationReport(inspection.result),
                    "webhook-signature-report.json",
                  )
                }
              >
                {t("hook.inspectReport")}
              </button>
            </section>
          )}
          {run && (
            <section
              aria-label={t("hook.results")}
              className="space-y-3 rounded-xl border p-3"
            >
              <h4 className="font-bold">{t("hook.results")}</h4>
              <p className="text-sm">
                {t(
                  "hook.runStats",
                  Object.fromEntries(
                    [
                      "passed",
                      "total",
                      "accepted",
                      "rejected",
                      "duplicates",
                      "capacity",
                    ].map((k) => [k, String(run[k as keyof HookRun])]),
                  ),
                )}
              </p>
              <ul className="space-y-1 text-xs">
                {run.rows.map((r) => (
                  <li
                    key={r.id}
                    className={r.passed ? "text-green-800" : "text-red-700"}
                  >
                    {t("hook.row", {
                      name: r.name,
                      outcome: t(`hook.outcome.${r.outcome}`),
                      passed: t(r.passed ? "hook.passed" : "hook.failed"),
                      offset: String(r.atSeconds),
                      count: String(r.cacheSize),
                    })}
                  </li>
                ))}
              </ul>
              {selectedResult && (
                <>
                  <Select
                    label={t("hook.result")}
                    value={selectedResult.id}
                    onChange={setResultId}
                  >
                    {run.rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                  <Field
                    label={t("hook.details")}
                    value={json({
                      ...selectedResult.verification,
                      replay: selectedResult.replay,
                      cacheSize: selectedResult.cacheSize,
                    })}
                    multiline
                    readOnly
                  />
                </>
              )}
            </section>
          )}
        </div>
      )}
    </details>
  );
});
