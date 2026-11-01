"use client";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { downloadTransferBytes } from "@/lib/transfer-download";
import { getByteSize } from "@/lib/text-encoding";
import {
  MAX_TRANSFER_BYTES,
  MAX_TRANSFER_PROJECT,
  TransferError,
  decodeTransferBytes,
  emptyTransferProject,
  encodeTransferBytes,
  newTransferResource,
  newTransferScenario,
  normalizeTransferCheckpoint,
  normalizeTransferProject,
  parseTransferProject,
  readTransferBytes,
  serializeTransferProject,
  transferDate,
  transferJson,
  transferType,
  type TransferCheckpoint,
  type TransferProject,
} from "@/lib/transfer-project";
import {
  inspectTransferPacket,
  prepareTransferResource,
  serveTransferBytes,
  transferPacket,
  type InspectedTransferPacket,
  type PreparedTransferResource,
  type TransferPacket,
} from "@/lib/transfer-engine";
import {
  runTransferScenario,
  runTransferSuite,
  transferRunReport,
  type TransferRun,
} from "@/lib/transfer-run";
import { demoTransferProject } from "@/lib/transfer-studio";
import { generateTransferToolkit } from "@/lib/transfer-export";
import type { TranslationKey } from "@/lib/translations";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const integer = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
const byteLength = (base64: string) =>
  (base64.length / 4) * 3 -
  (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs disabled:opacity-50";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:opacity-50";
type Format = "base64" | "hex" | "utf8";
type Selection = { resourceId: string; scenarioId: string };
function displayBytes(bytes: Uint8Array, format: Format) {
  if (format === "base64") return encodeTransferBytes(bytes);
  if (format === "hex")
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new TransferError("bytes");
  }
}
function makeDraft(
  p: TransferProject,
  s: Selection,
  requested: Format = "base64",
) {
  const r = p.resources.find((r) => r.id === s.resourceId)!,
    scenario = p.scenarios.find((c) => c.id === s.scenarioId);
  let format = requested,
    payload = r.base64;
  if (format !== "base64")
    try {
      payload = displayBytes(decodeTransferBytes(r.base64), format);
    } catch {
      format = "base64";
    }
  return {
    name: p.name,
    resourceName: r.name,
    contentType: r.contentType,
    lastModified: r.lastModified ?? "",
    dateStrong: r.dateStrong,
    ranges: r.ranges,
    format,
    payload,
    scenarioName: scenario?.name ?? "",
    initialId: scenario?.resourceId ?? r.id,
    replacementId: scenario?.replacementId ?? "",
    switchAt: String(scenario?.switchAt ?? 2),
    chunkSize: String(scenario?.chunkSize ?? 128),
    maxAttempts: String(scenario?.maxAttempts ?? 30),
    faults: json(scenario?.faults ?? []),
    expect: json(scenario?.expect ?? null),
  };
}
type Draft = ReturnType<typeof makeDraft>;
const nextId = (prefix: string, ids: string[]) => {
  let n = 1;
  while (ids.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};
function Field({
  label,
  value,
  onChange,
  multiline = false,
  readOnly = false,
  rows = 5,
  onEscape,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
  rows?: number;
  onEscape?: () => void;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? (
        <textarea
          className={`${inputClass} font-mono`}
          rows={rows}
          value={value}
          spellCheck={false}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onEscape?.();
          }}
        />
      ) : (
        <input
          className={inputClass}
          autoComplete="off"
          value={value}
          spellCheck={false}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onEscape?.();
          }}
        />
      )}
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
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
function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
function hexPreview(bytes: Uint8Array) {
  const rows: string[] = [];
  for (let i = 0; i < Math.min(bytes.length, 256); i += 16)
    rows.push(
      i.toString(16).padStart(8, "0") +
        "  " +
        Array.from(bytes.subarray(i, i + 16), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(" "),
    );
  return rows.join("\n");
}
export const TransferPanel = memo(function TransferPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyTransferProject),
    [selection, setSelection] = useState<Selection>({
      resourceId: "resource-1",
      scenarioId: "scenario-1",
    }),
    [draft, setDraft] = useState(() =>
      makeDraft(emptyTransferProject(), {
        resourceId: "resource-1",
        scenarioId: "scenario-1",
      }),
    );
  const [saved, setSaved] = useState(() =>
    makeDraft(emptyTransferProject(), {
      resourceId: "resource-1",
      scenarioId: "scenario-1",
    }),
  );
  const resource = project.resources.find(
      (r) => r.id === selection.resourceId,
    )!,
    scenario = project.scenarios.find((s) => s.id === selection.scenarioId),
    pending = (Object.keys(draft) as (keyof Draft)[]).some(
      (k) => draft[k] !== saved[k],
    );
  const [prepared, setPrepared] = useState<{
    source: typeof resource;
    value: PreparedTransferResource;
  } | null>(null);
  const [checkpoint, setCheckpoint] = useState<TransferCheckpoint | null>(null),
    [useCheckpoint, setUseCheckpoint] = useState(false),
    [runs, setRuns] = useState<TransferRun[] | null>(null),
    [resultId, setResultId] = useState(""),
    [details, setDetails] = useState(false),
    [search, setSearch] = useState("");
  const [method, setMethod] = useState<"GET" | "HEAD">("GET"),
    [range, setRange] = useState("bytes=0-31,-16"),
    [omitRange, setOmitRange] = useState(false),
    [ifRange, setIfRange] = useState(""),
    [omitIfRange, setOmitIfRange] = useState(true),
    [packet, setPacket] = useState<TransferPacket | null>(null),
    [inspection, setInspection] = useState<InspectedTransferPacket | null>(
      null,
    ),
    [partIndex, setPartIndex] = useState(0);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 }),
    [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error?: boolean;
      values?: Record<string, string>;
    } | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    let alive = true;
    prepareTransferResource(resource)
      .then((value) => {
        if (alive) setPrepared({ source: resource, value });
      })
      .catch(() => {
        if (alive) setFeedback({ key: "transfer.error.crypto", error: true });
      });
    return () => {
      alive = false;
    };
  }, [resource, open]);
  const current = prepared?.source === resource ? prepared.value : null,
    inspected = runs?.find((r) => r.scenarioId === resultId),
    part = inspection?.parts[partIndex],
    resourceUsed = project.scenarios.some(
      (s) => s.resourceId === resource.id || s.replacementId === resource.id,
    );
  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...draft, [key]: value });
  }
  function error(e: unknown) {
    setFeedback({
      key:
        e instanceof TransferError
          ? e.code === "cancelled"
            ? "transfer.cancelled"
            : `transfer.error.${e.code}`
          : "transfer.error.unknown",
      error: true,
    });
  }
  function attempt(action: () => void) {
    try {
      action();
    } catch (e) {
      error(e);
    }
  }
  function ready() {
    if (busy) return false;
    if (pending) {
      setFeedback({ key: "transfer.pending", error: true });
      return false;
    }
    return true;
  }
  function install(
    value: TransferProject,
    prefer: Partial<Selection> = {},
    fresh = false,
  ) {
    const p = normalizeTransferProject(value),
      old: Partial<Selection> = fresh ? {} : selection,
      s = {
        resourceId:
          p.resources.find(
            (r) => r.id === (prefer.resourceId ?? old.resourceId),
          )?.id ?? p.resources[0].id,
        scenarioId:
          p.scenarios.find(
            (s) => s.id === (prefer.scenarioId ?? old.scenarioId),
          )?.id ??
          p.scenarios[0]?.id ??
          "",
      };
    setProject(p);
    setSelection(s);
    const nextDraft = makeDraft(p, s, fresh ? "base64" : draft.format);
    setDraft(nextDraft);
    setSaved(nextDraft);
    setRuns(null);
    setResultId("");
    setPacket(null);
    setInspection(null);
    setSearch("");
    setFeedback(null);
    if (fresh) {
      setCheckpoint(null);
      setUseCheckpoint(false);
    }
  }
  function select(prefer: Partial<Selection>) {
    if (!ready()) return;
    const s = { ...selection, ...prefer };
    setSelection(s);
    const nextDraft = makeDraft(project, s, draft.format);
    setDraft(nextDraft);
    setSaved(nextDraft);
    setFeedback(null);
  }
  function save() {
    attempt(() => {
      const base64 = encodeTransferBytes(
        readTransferBytes(draft.payload, draft.format),
      );
      install({
        ...project,
        name: draft.name,
        resources: project.resources.map((r) =>
          r.id === resource.id
            ? {
                ...r,
                name: draft.resourceName,
                contentType: draft.contentType,
                lastModified: draft.lastModified || null,
                dateStrong: draft.dateStrong,
                ranges: draft.ranges,
                base64,
              }
            : r,
        ),
        scenarios: project.scenarios.map((s) =>
          s.id === selection.scenarioId
            ? {
                ...s,
                name: draft.scenarioName,
                resourceId: draft.initialId,
                replacementId: draft.replacementId || null,
                switchAt: integer(draft.switchAt),
                chunkSize: integer(draft.chunkSize),
                maxAttempts: integer(draft.maxAttempts),
                faults: transferJson(draft.faults) as typeof s.faults,
                expect: transferJson(draft.expect) as typeof s.expect,
              }
            : s,
        ),
      });
      setFeedback({ key: "transfer.saved" });
    });
  }
  function resourceAction(mode: "add" | "clone" | "delete") {
    if (!ready()) return;
    attempt(() => {
      if (mode === "delete") {
        if (resourceUsed || project.resources.length === 1) return;
        install({
          ...project,
          resources: project.resources.filter((r) => r.id !== resource.id),
        });
      } else {
        const id = nextId(
            "resource",
            project.resources.map((r) => r.id),
          ),
          r =
            mode === "add"
              ? newTransferResource(id)
              : { ...resource, id, name: id };
        install(
          { ...project, resources: [...project.resources, r] },
          { resourceId: id },
        );
      }
    });
  }
  function scenarioAction(mode: "add" | "clone" | "delete") {
    if (!ready()) return;
    attempt(() => {
      if (mode === "delete")
        install({
          ...project,
          scenarios: project.scenarios.filter(
            (s) => s.id !== selection.scenarioId,
          ),
        });
      else {
        const id = nextId(
            "scenario",
            project.scenarios.map((s) => s.id),
          ),
          s =
            mode === "add"
              ? newTransferScenario(resource.id, id)
              : { ...scenario!, id, name: id };
        install(
          { ...project, scenarios: [...project.scenarios, s] },
          { scenarioId: id },
        );
      }
    });
  }
  function changeFormat(format: Format) {
    attempt(() => {
      const payload = displayBytes(
        readTransferBytes(draft.payload, draft.format),
        format,
      );
      setDraft({ ...draft, format, payload });
      setSaved(makeDraft(project, selection, format));
    });
  }
  async function execute(kind: "selected" | "suite" | "probe") {
    if (!ready()) return;
    const token = ++generation.current;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      if (kind === "probe") {
        if (range.length > 4096 || ifRange.length > 4096)
          throw new TransferError("limit");
        const r = await prepareTransferResource(resource);
        if (generation.current !== token) return;
        const value = transferPacket(
            serveTransferBytes(r, {
              method,
              range: omitRange ? null : range,
              ifRange: omitIfRange ? null : ifRange,
            }),
            method,
          ),
          parsed = inspectTransferPacket(value);
        setPacket(value);
        setInspection(parsed);
        setPartIndex(0);
        setFeedback({ key: "transfer.packetLoaded" });
      } else {
        const cancelled = () => generation.current !== token;
        const rows =
          kind === "suite"
            ? await runTransferSuite(project, cancelled, (done, total) => {
                if (!cancelled()) setProgress({ done, total });
              })
            : [
                await runTransferScenario(project, selection.scenarioId, {
                  checkpoint: useCheckpoint
                    ? (checkpoint ?? undefined)
                    : undefined,
                  cancelled,
                  progress: (done, total) => {
                    if (!cancelled()) setProgress({ done, total });
                  },
                }),
              ];
        if (cancelled()) return;
        setRuns(rows);
        setResultId(rows[0]?.scenarioId ?? "");
        setSearch("");
        setFeedback({
          key: "transfer.completed",
          values: {
            passed: String(rows.filter((r) => r.passed).length),
            checked: String(rows.filter((r) => r.checked).length),
            total: String(rows.length),
          },
        });
      }
    } catch (e) {
      if (generation.current === token) error(e);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  async function importFile(
    file: File | undefined,
    kind: "project" | "binary" | "checkpoint" | "packet",
  ) {
    if (!file || !ready()) return;
    const token = ++generation.current;
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    setFeedback(null);
    try {
      if (
        file.size >
        (kind === "binary" ? MAX_TRANSFER_BYTES : MAX_TRANSFER_PROJECT)
      )
        throw new TransferError("limit");
      if (kind === "binary") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (generation.current !== token) return;
        const id = nextId(
            "resource",
            project.resources.map((r) => r.id),
          ),
          date = new Date(
            Math.floor(file.lastModified / 1000) * 1000,
          ).toUTCString();
        install(
          {
            ...project,
            resources: [
              ...project.resources,
              {
                ...newTransferResource(id),
                name: file.name,
                contentType: transferType(file.type)
                  ? file.type
                  : "application/octet-stream",
                lastModified: transferDate(date) ? date : null,
                base64: encodeTransferBytes(bytes),
              },
            ],
          },
          { resourceId: id },
        );
        setFeedback({ key: "transfer.loaded" });
      } else {
        const source = await file.text();
        if (generation.current !== token) return;
        if (kind === "project") {
          install(parseTransferProject(source), {}, true);
          setFeedback({ key: "transfer.loaded" });
        } else if (kind === "checkpoint") {
          const c = normalizeTransferCheckpoint(transferJson(source));
          setCheckpoint(c);
          setUseCheckpoint(true);
          setFeedback({
            key: "transfer.checkpointLoaded",
            values: {
              covered: String(
                c.segments.reduce((n, s) => n + byteLength(s.base64), 0),
              ),
              total: String(c.total),
            },
          });
        } else {
          const raw = transferJson(source),
            parsed = inspectTransferPacket(raw),
            value = {
              kind: "rsswag-range-response" as const,
              version: 1 as const,
              method: (raw as TransferPacket).method,
              status: parsed.status,
              headers: { ...parsed.headers },
              base64: encodeTransferBytes(parsed.body),
            };
          setPacket(value);
          setInspection(parsed);
          setPartIndex(0);
          setFeedback({ key: "transfer.packetLoaded" });
        }
      }
    } catch (e) {
      if (generation.current === token) error(e);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  function download(
    kind:
      | "project"
      | "report"
      | "toolkit"
      | "checkpoint"
      | "packet"
      | "wire"
      | "part"
      | "output",
  ) {
    if (!ready()) return;
    attempt(() => {
      let ok = false;
      if (kind === "wire" || kind === "part" || kind === "output") {
        const bytes =
          kind === "wire"
            ? inspection?.body
            : kind === "part"
              ? part?.bytes
              : inspected?.output;
        if (!bytes) throw new TransferError("bytes");
        ok = downloadTransferBytes(bytes, `transfer-${kind}.bin`);
      } else {
        const source =
          kind === "project"
            ? serializeTransferProject(project)
            : kind === "report"
              ? json(transferRunReport(runs ?? [], details))
              : kind === "toolkit"
                ? generateTransferToolkit(resource)
                : kind === "packet"
                  ? json(packet)
                  : json(inspected?.checkpoint);
        if (!source || source === "null") throw new TransferError("project");
        if (getByteSize(source) > 16 * 1024 * 1024)
          throw new TransferError("limit");
        ok = downloadTextFile(
          source,
          `transfer-${kind}.${kind === "toolkit" ? "mjs" : "json"}`,
          kind === "toolkit" ? "text/javascript" : "application/json",
        );
      }
      setFeedback({
        key: ok ? "transfer.downloaded" : "transfer.error.download",
        error: !ok,
      });
    });
  }
  const actions = (
    items: { key: TranslationKey; action: () => void; disabled?: boolean }[],
  ) => (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button
          type="button"
          className={buttonClass}
          key={i.key}
          disabled={busy || i.disabled}
          onClick={i.action}
        >
          {t(i.key)}
        </button>
      ))}
    </div>
  );
  const upload = (
    key: TranslationKey,
    kind: "project" | "binary" | "checkpoint" | "packet",
  ) => (
    <label className="block text-xs font-semibold">
      {t(key)}
      <input
        type="file"
        className={inputClass}
        aria-label={t(key)}
        accept={kind === "binary" ? undefined : ".json,application/json"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void importFile(file, kind);
        }}
      />
    </label>
  );
  const outcome = (r: TransferRun) =>
    t(
      r.outcome === "complete"
        ? "transfer.complete"
        : r.outcome === "exhausted"
          ? "transfer.exhausted"
          : "transfer.integrityFailed",
    );
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("transfer.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("transfer.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("transfer.guide")}
            </summary>
            {(
              [
                "transfer.protocol",
                "transfer.validators",
                "transfer.integrity",
                "transfer.profile",
                "transfer.limits",
                "transfer.privacy",
              ] as const
            ).map((k) => (
              <p key={k}>{t(k)}</p>
            ))}
          </details>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className="text-sm font-semibold"
            >
              {t(feedback.key, feedback.values)}
            </p>
          )}
          {busy && (
            <div className="flex items-center gap-3">
              <p role="status">
                {t("transfer.busy", {
                  done: String(progress.done),
                  total: String(progress.total),
                })}
              </p>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  generation.current++;
                  setBusy(false);
                  setFeedback({ key: "transfer.cancelled" });
                }}
              >
                {t("transfer.cancel")}
              </button>
            </div>
          )}
          {pending && (
            <p className="text-xs font-semibold text-amber-800">
              {t("transfer.pending")}
            </p>
          )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            {actions([
              {
                key: "transfer.new",
                action: () => {
                  if (ready())
                    attempt(() => {
                      install(emptyTransferProject(), {}, true);
                      setFeedback({ key: "transfer.loaded" });
                    });
                },
              },
              {
                key: "transfer.demo",
                action: () => {
                  if (ready())
                    attempt(() => {
                      install(demoTransferProject(), {}, true);
                      setFeedback({ key: "transfer.loaded" });
                    });
                },
              },
              { key: "transfer.export", action: () => download("project") },
            ])}
            {upload("transfer.import", "project")}
            <Field
              label={t("transfer.name")}
              value={draft.name}
              onChange={(v) => field("name", v)}
            />
            {actions([
              { key: "transfer.save", action: save, disabled: !pending },
              {
                key: "transfer.discard",
                action: () => {
                  setDraft(saved);
                  setFeedback(null);
                },
                disabled: !pending,
              },
            ])}
            <div className="grid gap-5 xl:grid-cols-2">
              <section
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
                aria-label={t("transfer.resources")}
              >
                <h3 className="font-bold">{t("transfer.resources")}</h3>
                <Select
                  label={t("transfer.resource")}
                  value={selection.resourceId}
                  onChange={(resourceId) => select({ resourceId })}
                >
                  {project.resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id})
                    </option>
                  ))}
                </Select>
                {actions([
                  {
                    key: "transfer.addResource",
                    action: () => resourceAction("add"),
                    disabled: project.resources.length >= 3,
                  },
                  {
                    key: "transfer.cloneResource",
                    action: () => resourceAction("clone"),
                    disabled: project.resources.length >= 3,
                  },
                  {
                    key: "transfer.deleteResource",
                    action: () => resourceAction("delete"),
                    disabled: resourceUsed || project.resources.length <= 1,
                  },
                ])}
                <p className="text-xs text-slate-600">
                  {t("transfer.resourceHelp")}
                </p>
                {upload("transfer.file", "binary")}
                <Field
                  label={t("transfer.resourceName")}
                  value={draft.resourceName}
                  onChange={(v) => field("resourceName", v)}
                />
                <Field
                  label={t("transfer.type")}
                  value={draft.contentType}
                  onChange={(v) => field("contentType", v)}
                />
                <Field
                  label={t("transfer.modified")}
                  value={draft.lastModified}
                  onChange={(v) => field("lastModified", v)}
                />
                <Check
                  label={t("transfer.dateStrong")}
                  checked={draft.dateStrong}
                  onChange={(v) => field("dateStrong", v)}
                />
                <Check
                  label={t("transfer.ranges")}
                  checked={draft.ranges}
                  onChange={(v) => field("ranges", v)}
                />
                <Select
                  label={t("transfer.format")}
                  value={draft.format}
                  onChange={(v) => changeFormat(v as Format)}
                >
                  <option value="base64">Base64</option>
                  <option value="hex">Hex</option>
                  <option value="utf8">UTF-8</option>
                </Select>
                <Field
                  label={t("transfer.payload")}
                  value={draft.payload}
                  onChange={(v) => field("payload", v)}
                  multiline
                  rows={7}
                />
                <p className="text-xs text-slate-600">
                  {t("transfer.bytesHelp")}
                </p>
                <p className="text-xs">
                  {t("transfer.byteCount", {
                    count: String(
                      current?.bytes.length ?? byteLength(resource.base64),
                    ),
                  })}
                </p>
                <Field
                  label={t("transfer.etag")}
                  value={current?.etag ?? t("transfer.waiting")}
                  readOnly
                />
                {actions([
                  {
                    key: "transfer.toolkit",
                    action: () => download("toolkit"),
                  },
                ])}
                <p className="text-xs text-slate-600">
                  {t("transfer.toolkitHelp")}
                </p>
              </section>
              <section
                className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
                aria-label={t("transfer.scenarios")}
              >
                <h3 className="font-bold">{t("transfer.scenarios")}</h3>
                {scenario && (
                  <Select
                    label={t("transfer.scenario")}
                    value={selection.scenarioId}
                    onChange={(scenarioId) => select({ scenarioId })}
                  >
                    {project.scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </Select>
                )}
                {actions([
                  {
                    key: "transfer.addScenario",
                    action: () => scenarioAction("add"),
                    disabled: project.scenarios.length >= 12,
                  },
                  {
                    key: "transfer.cloneScenario",
                    action: () => scenarioAction("clone"),
                    disabled: !scenario || project.scenarios.length >= 12,
                  },
                  {
                    key: "transfer.deleteScenario",
                    action: () => scenarioAction("delete"),
                    disabled: !scenario,
                  },
                ])}
                {scenario ? (
                  <>
                    <Field
                      label={t("transfer.scenarioName")}
                      value={draft.scenarioName}
                      onChange={(v) => field("scenarioName", v)}
                    />
                    <Select
                      label={t("transfer.initial")}
                      value={draft.initialId}
                      onChange={(v) => field("initialId", v)}
                    >
                      {project.resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.id})
                        </option>
                      ))}
                    </Select>
                    <Select
                      label={t("transfer.replacement")}
                      value={draft.replacementId}
                      onChange={(v) => field("replacementId", v)}
                    >
                      <option value="">{t("transfer.noReplacement")}</option>
                      {project.resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.id})
                        </option>
                      ))}
                    </Select>
                    {(
                      [
                        { key: "switchAt", label: "transfer.switchAt" },
                        { key: "chunkSize", label: "transfer.chunk" },
                        { key: "maxAttempts", label: "transfer.attempts" },
                      ] as const
                    ).map(({ key, label }) => (
                      <Field
                        key={key}
                        label={t(label)}
                        value={draft[key]}
                        onChange={(v) => field(key, v)}
                      />
                    ))}
                    <Field
                      label={t("transfer.faults")}
                      value={draft.faults}
                      onChange={(v) => field("faults", v)}
                      multiline
                    />
                    <p className="text-xs text-slate-600">
                      {t("transfer.faultHelp")}
                    </p>
                    <Field
                      label={t("transfer.expect")}
                      value={draft.expect}
                      onChange={(v) => field("expect", v)}
                      multiline
                    />
                    <p className="text-xs text-slate-600">
                      {t("transfer.expectHelp")}
                    </p>
                  </>
                ) : (
                  <p>{t("transfer.noScenarios")}</p>
                )}
              </section>
            </div>
            <section
              className="space-y-3 rounded-xl border border-slate-200 p-3"
              aria-label={t("transfer.checkpoint")}
            >
              <h3 className="font-bold">{t("transfer.checkpoint")}</h3>
              {upload("transfer.checkpointImport", "checkpoint")}
              <Check
                label={t("transfer.useCheckpoint")}
                checked={useCheckpoint}
                disabled={!checkpoint}
                onChange={setUseCheckpoint}
              />
              {checkpoint ? (
                <p className="text-xs">
                  {t("transfer.checkpointLoaded", {
                    covered: String(
                      checkpoint.segments.reduce(
                        (n, s) => n + byteLength(s.base64),
                        0,
                      ),
                    ),
                    total: String(checkpoint.total),
                  })}
                </p>
              ) : (
                <p className="text-xs">{t("transfer.checkpointNone")}</p>
              )}
              {actions([
                {
                  key: "transfer.clearCheckpoint",
                  action: () => {
                    if (ready()) {
                      setCheckpoint(null);
                      setUseCheckpoint(false);
                    }
                  },
                  disabled: !checkpoint,
                },
              ])}
              <p className="text-xs text-slate-600">
                {t("transfer.checkpointHelp")}
              </p>
            </section>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!scenario}
                onClick={() => void execute("selected")}
              >
                {t("transfer.run")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!project.scenarios.length}
                onClick={() => void execute("suite")}
              >
                {t("transfer.runAll")}
              </button>
            </div>
            {runs && (
              <section className="space-y-3">
                <h3 className="font-bold">{t("transfer.results")}</h3>
                <div className="overflow-auto">
                  <table
                    aria-label={t("transfer.results")}
                    className="w-full text-left text-xs"
                  >
                    <thead>
                      <tr>
                        {[
                          "transfer.scenario",
                          "transfer.outcome",
                          "transfer.decision",
                        ].map((k) => (
                          <th key={k} className="p-2">
                            {t(k as TranslationKey)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.scenarioId}>
                          <td className="p-2">
                            <button
                              type="button"
                              className="underline"
                              onClick={() => {
                                setResultId(r.scenarioId);
                                setSearch("");
                              }}
                            >
                              {r.scenarioName}
                            </button>
                          </td>
                          <td className="p-2">{outcome(r)}</td>
                          <td className="p-2">
                            {t(
                              !r.checked
                                ? "transfer.unchecked"
                                : r.passed
                                  ? "transfer.passed"
                                  : "transfer.failed",
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {inspected && (
                  <>
                    <Select
                      label={t("transfer.result")}
                      value={resultId}
                      onChange={(v) => {
                        setResultId(v);
                        setSearch("");
                      }}
                    >
                      {runs.map((r) => (
                        <option key={r.scenarioId} value={r.scenarioId}>
                          {r.scenarioName}
                        </option>
                      ))}
                    </Select>
                    <p className="text-sm">
                      {t("transfer.stats", {
                        covered: String(inspected.covered),
                        total: String(inspected.total),
                        attempts: String(inspected.attempts),
                        rejected: String(inspected.rejected),
                        restarts: String(inspected.restarts),
                        wire: String(inspected.wireBytes),
                      })}
                    </p>
                    <svg
                      viewBox="0 0 600 32"
                      role="img"
                      aria-label={t("transfer.coverage")}
                      className="h-10 w-full"
                    >
                      <rect
                        x="0"
                        y="4"
                        width="600"
                        height="24"
                        fill="#e2e8f0"
                      />
                      {inspected.intervals.map((r) => (
                        <rect
                          key={r.start}
                          x={(600 * r.start) / Math.max(1, inspected.total)}
                          y="4"
                          width={
                            (600 * (r.end - r.start + 1)) /
                            Math.max(1, inspected.total)
                          }
                          height="24"
                          fill={
                            inspected.outcome === "integrity-failed"
                              ? "#f59e0b"
                              : "#10b981"
                          }
                        />
                      ))}
                    </svg>
                    {actions([
                      {
                        key: "transfer.output",
                        action: () => download("output"),
                        disabled: inspected.output === null,
                      },
                      {
                        key: "transfer.checkpointExport",
                        action: () => download("checkpoint"),
                        disabled: !inspected.checkpoint,
                      },
                      {
                        key: "transfer.record",
                        action: () => {
                          if (ready())
                            attempt(() => {
                              install({
                                ...project,
                                scenarios: project.scenarios.map((s) =>
                                  s.id === inspected.scenarioId
                                    ? {
                                        ...s,
                                        expect: {
                                          outcome: inspected.outcome,
                                          maxRejected: inspected.rejected,
                                          maxRestarts: inspected.restarts,
                                        },
                                      }
                                    : s,
                                ),
                              });
                              setFeedback({ key: "transfer.recorded" });
                            });
                        },
                      },
                    ])}
                    {!inspected.checkpoint && (
                      <p className="text-xs text-slate-600">
                        {t("transfer.retention")}
                      </p>
                    )}
                    <Field
                      label={t("transfer.search")}
                      value={search}
                      onChange={setSearch}
                      onEscape={() => setSearch("")}
                    />
                    <div className="max-h-80 overflow-auto">
                      <table
                        aria-label={t("transfer.timeline")}
                        className="w-full text-left text-xs"
                      >
                        <thead>
                          <tr>
                            {[
                              "transfer.attempt",
                              "transfer.requested",
                              "transfer.status",
                              "transfer.fault",
                              "transfer.decision",
                            ].map((k) => (
                              <th key={k} className="p-2">
                                {t(k as TranslationKey)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {inspected.journal
                            .filter((a) =>
                              `${a.status ?? ""} ${a.fault ?? ""} ${a.reason}`
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                            )
                            .map((a) => (
                              <tr key={a.attempt}>
                                <td className="p-2">{a.attempt}</td>
                                <td className="p-2 font-mono">
                                  {a.requested.start}–{a.requested.end}
                                </td>
                                <td className="p-2">{a.status ?? "—"}</td>
                                <td className="p-2">{a.fault ?? "—"}</td>
                                <td className="p-2">
                                  {t(
                                    a.accepted
                                      ? "transfer.accepted"
                                      : "transfer.rejected",
                                  )}{" "}
                                  ({a.reason})
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <Check
                  label={t("transfer.details")}
                  checked={details}
                  onChange={setDetails}
                />
                {actions([
                  { key: "transfer.report", action: () => download("report") },
                ])}
              </section>
            )}
            <section
              className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3"
              aria-label={t("transfer.probe")}
            >
              <h3 className="font-bold">{t("transfer.probe")}</h3>
              <Select
                label={t("transfer.method")}
                value={method}
                onChange={(v) => setMethod(v as "GET" | "HEAD")}
              >
                <option>GET</option>
                <option>HEAD</option>
              </Select>
              <Check
                label={t("transfer.rangeMissing")}
                checked={omitRange}
                onChange={setOmitRange}
              />
              <Field
                label={t("transfer.range")}
                value={range}
                onChange={setRange}
              />
              <Check
                label={t("transfer.ifRangeMissing")}
                checked={omitIfRange}
                onChange={setOmitIfRange}
              />
              <Field
                label={t("transfer.ifRange")}
                value={ifRange}
                onChange={setIfRange}
              />
              {actions([
                {
                  key: "transfer.useTag",
                  action: () => {
                    if (current) {
                      setIfRange(current.etag);
                      setOmitIfRange(false);
                    }
                  },
                  disabled: !current,
                },
              ])}
              <button
                type="button"
                className={buttonClass}
                onClick={() => void execute("probe")}
              >
                {t("transfer.sendProbe")}
              </button>
              {upload("transfer.packetImport", "packet")}
              <p className="text-xs text-slate-600">
                {t("transfer.packetHelp")}
              </p>
              {inspection && (
                <>
                  <h4 className="font-bold">{t("transfer.response")}</h4>
                  <pre
                    className="max-h-80 overflow-auto rounded-lg bg-slate-50 p-3 text-xs"
                    aria-label={t("transfer.responseMeta")}
                  >
                    {json({
                      status: inspection.status,
                      total: inspection.total,
                      multipart: inspection.multipart,
                      bodyBytes: inspection.body.length,
                      headers: inspection.headers,
                      parts: inspection.parts.map(
                        ({ start, end, total, contentType, bytes }) => ({
                          start,
                          end,
                          total,
                          contentType,
                          bytes: bytes.length,
                        }),
                      ),
                    })}
                  </pre>
                  {actions([
                    {
                      key: "transfer.packetExport",
                      action: () => download("packet"),
                    },
                    { key: "transfer.wire", action: () => download("wire") },
                  ])}
                  {!!inspection.parts.length && (
                    <>
                      <Select
                        label={t("transfer.part")}
                        value={String(partIndex)}
                        onChange={(v) => setPartIndex(Number(v))}
                      >
                        {inspection.parts.map((p, i) => (
                          <option key={i} value={i}>
                            {p.start}–{p.end} / {p.total}
                          </option>
                        ))}
                      </Select>
                      {actions([
                        {
                          key: "transfer.partBytes",
                          action: () => download("part"),
                        },
                      ])}
                    </>
                  )}
                  <Field
                    label={t("transfer.preview")}
                    value={hexPreview(part?.bytes ?? inspection.body)}
                    multiline
                    readOnly
                    rows={8}
                  />
                </>
              )}
            </section>
          </fieldset>
        </div>
      )}
    </details>
  );
});
