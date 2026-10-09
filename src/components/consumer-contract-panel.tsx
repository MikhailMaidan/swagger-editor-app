"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  captureConsumerContract,
  checkConsumerCompatibility,
  consumerFieldInventory,
  consumerReportMarkdown,
  ConsumerError,
  emptyConsumerProject,
  listConsumerOperations,
  MAX_CONSUMER_BYTES,
  MAX_CONSUMERS,
  MAX_CONTRACTS,
  parseConsumerFields,
  parseConsumerProject,
  parseConsumerRequest,
  readConsumerSource,
  serializeConsumerProject,
  serializeConsumerReport,
  validateConsumerProject,
  type ApiConsumer,
  type ConsumerContract,
  type ConsumerProject,
  type ConsumerReport,
  type ConsumerSource,
  type ConsumerStatus,
} from "@/lib/consumer-contracts";
import { downloadTextFile } from "@/lib/schema-download";
import { truncateJsonPreview } from "@/lib/response-data-explorer";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const stringify = (v: unknown) => JSON.stringify(v, null, 2);
const ownText = (
  drafts: Record<string, string>,
  key: string,
  fallback: string,
) => (Object.hasOwn(drafts, key) ? drafts[key] : fallback);
function uniqueKey(prefix: string, keys: string[]) {
  let n = 1;
  while (keys.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

export const ConsumerContractPanel = memo(function ConsumerContractPanel({
  getSchemaText,
}: {
  getSchemaText: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState(emptyConsumerProject);
  const [consumerKey, setConsumerKey] = useState("");
  const [contractKey, setContractKey] = useState("");
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [requestDrafts, setRequestDrafts] = useState<Record<string, string>>(
    {},
  );
  const [reference, setReference] = useState<ConsumerSource | null>(null);
  const [operationIndex, setOperationIndex] = useState("0");
  const [variantIndex, setVariantIndex] = useState("0");
  const [captureStatus, setCaptureStatus] = useState("200");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [candidate, setCandidate] = useState("");
  const [report, setReport] = useState<ConsumerReport | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConsumerStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const consumer = project.consumers.find((c) => c.key === consumerKey);
  const contract = consumer?.contracts.find((c) => c.key === contractKey);
  const allContracts = project.consumers.flatMap((c) => c.contracts);
  const dirty = allContracts.some(
    (c) =>
      ownText(fieldDrafts, c.key, stringify(c.fields)) !==
        stringify(c.fields) ||
      ownText(requestDrafts, c.key, c.request ? stringify(c.request) : "") !==
        (c.request ? stringify(c.request) : ""),
  );
  const operations = useMemo(
    () => (reference ? listConsumerOperations(reference) : []),
    [reference],
  );
  const operation = operations[Number(operationIndex)];
  const variant = operation?.responses[Number(variantIndex)];
  const inventory = useMemo(
    () =>
      reference && operation && variant
        ? consumerFieldInventory(
            reference,
            operation,
            captureStatus,
            variant.mediaType,
          )
        : [],
    [reference, operation, variant, captureStatus],
  );
  const rows = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (
      report?.consumers
        .flatMap((c) => c.contracts.map((result) => ({ consumer: c, result })))
        .filter(
          ({ consumer: c, result }) =>
            (filter === "all" || result.status === filter) &&
            terms.every((term) =>
              `${c.name} ${result.name} ${result.method} ${result.path}`
                .toLowerCase()
                .includes(term),
            ),
        ) ?? []
    );
  }, [report, filter, search]);
  const lastPage = Math.max(0, Math.ceil(rows.length / 25) - 1),
    currentPage = Math.min(page, lastPage);
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof ConsumerError
          ? `consumer.error.${error.code}`
          : "consumer.error.read",
      error: true,
    });
  }
  function invalidate() {
    setReport(null);
    setFeedback(null);
    setPage(0);
  }
  function update(next: ConsumerProject) {
    setProject(next);
    invalidate();
  }
  function editConsumer(patch: Partial<ApiConsumer>) {
    update({
      ...project,
      consumers: project.consumers.map((c) =>
        c.key === consumerKey ? { ...c, ...patch } : c,
      ),
    });
  }
  function editContract(patch: Partial<ConsumerContract>) {
    if (consumer)
      editConsumer({
        contracts: consumer.contracts.map((c) =>
          c.key === contractKey ? { ...c, ...patch } : c,
        ),
      });
  }
  function addConsumer() {
    const key = uniqueKey(
      "consumer",
      project.consumers.map((c) => c.key),
    );
    update({
      ...project,
      consumers: [
        ...project.consumers,
        {
          key,
          name: `${t("consumer.defaultName")} ${project.consumers.length + 1}`,
          enabled: true,
          contracts: [],
        },
      ],
    });
    setConsumerKey(key);
    setContractKey("");
  }
  function removeConsumer() {
    const removed = new Set(consumer?.contracts.map((c) => c.key) ?? []);
    setFieldDrafts(
      Object.fromEntries(
        Object.entries(fieldDrafts).filter(([key]) => !removed.has(key)),
      ),
    );
    setRequestDrafts(
      Object.fromEntries(
        Object.entries(requestDrafts).filter(([key]) => !removed.has(key)),
      ),
    );
    const next = project.consumers.filter((c) => c.key !== consumerKey);
    update({ ...project, consumers: next });
    setConsumerKey(next[0]?.key ?? "");
    setContractKey(next[0]?.contracts[0]?.key ?? "");
  }
  function removeContract() {
    if (!consumer) return;
    const next = consumer.contracts.filter((c) => c.key !== contractKey);
    setFieldDrafts(
      Object.fromEntries(
        Object.entries(fieldDrafts).filter(([key]) => key !== contractKey),
      ),
    );
    setRequestDrafts(
      Object.fromEntries(
        Object.entries(requestDrafts).filter(([key]) => key !== contractKey),
      ),
    );
    editConsumer({ contracts: next });
    setContractKey(next[0]?.key ?? "");
  }
  function readReference() {
    setFeedback(null);
    try {
      const next = readConsumerSource(getSchemaText());
      const choices = listConsumerOperations(next);
      setReference(next);
      setOperationIndex("0");
      setVariantIndex("0");
      setCaptureStatus(choices[0]?.responses[0]?.status ?? "200");
      setSelectedFields([]);
      setFeedback({ key: "consumer.referenceLoaded", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function capture() {
    if (!reference || !operation || !variant || !consumer) return;
    setFeedback(null);
    try {
      const key = uniqueKey(
        "dependency",
        allContracts.map((c) => c.key),
      );
      const dependency = captureConsumerContract(
        reference,
        operation,
        captureStatus,
        variant.mediaType,
        inventory.filter((f) => selectedFields.includes(f.pointer)),
        key,
      );
      const next = validateConsumerProject({
        ...project,
        consumers: project.consumers.map((c) =>
          c.key === consumerKey
            ? { ...c, contracts: [...c.contracts, dependency] }
            : c,
        ),
      });
      update(next);
      setContractKey(key);
      setFeedback({ key: "consumer.captured", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function save() {
    if (!consumer || !contract) return;
    setFeedback(null);
    try {
      const fields = parseConsumerFields(
        ownText(fieldDrafts, contract.key, stringify(contract.fields)),
      );
      const requestText = ownText(
        requestDrafts,
        contract.key,
        contract.request ? stringify(contract.request) : "",
      );
      const { request: oldRequest, ...base } = contract;
      void oldRequest;
      const nextContract = {
        ...base,
        fields,
        ...(requestText.trim()
          ? { request: parseConsumerRequest(requestText) }
          : {}),
      };
      const next = validateConsumerProject({
        ...project,
        consumers: project.consumers.map((c) =>
          c.key === consumerKey
            ? {
                ...c,
                contracts: c.contracts.map((d) =>
                  d.key === contractKey ? nextContract : d,
                ),
              }
            : c,
        ),
      });
      update(next);
      setFieldDrafts(
        Object.fromEntries(
          Object.entries(fieldDrafts).filter(([key]) => key !== contractKey),
        ),
      );
      setRequestDrafts(
        Object.fromEntries(
          Object.entries(requestDrafts).filter(([key]) => key !== contractKey),
        ),
      );
      setFeedback({ key: "consumer.saved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function check(text: string) {
    if (dirty) return;
    setFeedback(null);
    try {
      const next = checkConsumerCompatibility(
        project,
        readConsumerSource(text),
      );
      setReport(next);
      setPage(0);
      setFeedback({ key: "consumer.checked", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File, kind: "project" | "candidate") {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (file.size > MAX_CONSUMER_BYTES) throw new ConsumerError("limit");
      const text = await file.text();
      if (token !== generation.current) return;
      if (kind === "project") {
        const next = parseConsumerProject(text);
        update(next);
        setFieldDrafts({});
        setRequestDrafts({});
        setConsumerKey(next.consumers[0]?.key ?? "");
        setContractKey(next.consumers[0]?.contracts[0]?.key ?? "");
        setReference(null);
        setSelectedFields([]);
        setCandidate("");
        setSearch("");
        setFilter("all");
        setFeedback({ key: "consumer.imported", error: false });
      } else {
        const next = checkConsumerCompatibility(
          project,
          readConsumerSource(text),
        );
        setCandidate(text);
        setReport(next);
        setPage(0);
        setFeedback({ key: "consumer.checked", error: false });
      }
    } catch (error) {
      if (token === generation.current) fail(error);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function download(kind: "project" | "report" | "markdown") {
    if (loading || dirty) return;
    setFeedback(null);
    try {
      const text =
        kind === "project"
          ? serializeConsumerProject(project)
          : report
            ? kind === "report"
              ? serializeConsumerReport(report)
              : consumerReportMarkdown(report)
            : "";
      if (!text) return;
      const ok = downloadTextFile(
        text,
        `consumer-${kind}.${kind === "markdown" ? "md" : "json"}`,
        kind === "markdown" ? "text/markdown" : "application/json",
      );
      setFeedback({
        key: ok ? "consumer.downloaded" : "consumer.error.download",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t("consumer.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-sm text-[color:var(--color-brand-navy)]">
          <p>{t("consumer.description")}</p>
          <p className="text-xs text-slate-600">{t("consumer.help")}</p>
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "text-red-700" : "text-emerald-700"}
            >
              {t(feedback.key)}
            </p>
          )}
          {loading && <p role="status">{t("consumer.loading")}</p>}
          <label className="block text-xs font-bold">
            {t("consumer.import")}
            <input
              className={inputClass}
              type="file"
              accept=".json,application/json"
              disabled={loading}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) void read(file, "project");
              }}
            />
          </label>
          <fieldset disabled={loading} className="min-w-0 space-y-4">
            <legend className="mb-2 font-bold">{t("consumer.profiles")}</legend>
            <label className="block text-xs font-bold">
              {t("consumer.projectName")}
              <input
                className={inputClass}
                maxLength={120}
                value={project.name}
                onChange={(e) => update({ ...project, name: e.target.value })}
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-bold">
                {t("consumer.selectConsumer")}
                <select
                  className={inputClass}
                  value={consumerKey}
                  onChange={(e) => {
                    setConsumerKey(e.target.value);
                    setContractKey(
                      project.consumers.find((c) => c.key === e.target.value)
                        ?.contracts[0]?.key ?? "",
                    );
                  }}
                >
                  {!project.consumers.length && <option value="">—</option>}
                  {project.consumers.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={project.consumers.length >= MAX_CONSUMERS}
                  onClick={addConsumer}
                >
                  {t("consumer.addConsumer")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!consumer}
                  onClick={removeConsumer}
                >
                  {t("consumer.removeConsumer")}
                </button>
              </div>
            </div>
            {consumer && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="grow text-xs font-bold">
                  {t("consumer.consumerName")}
                  <input
                    className={inputClass}
                    maxLength={120}
                    value={consumer.name}
                    onChange={(e) => editConsumer({ name: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={consumer.enabled}
                    onChange={(e) =>
                      editConsumer({ enabled: e.target.checked })
                    }
                  />
                  {t("consumer.enableConsumer")}
                </label>
              </div>
            )}
            <section className="space-y-3 rounded-xl border border-slate-200 p-3">
              <h3 className="font-bold">{t("consumer.captureHeading")}</h3>
              <button
                type="button"
                className={buttonClass}
                onClick={readReference}
              >
                {t("consumer.readReference")}
              </button>
              {reference && (
                <>
                  <p className="text-xs">
                    {t("consumer.referenceTitle", {
                      title: reference.title,
                      version: reference.version,
                    })}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-xs font-bold">
                      {t("consumer.operation")}
                      <select
                        className={inputClass}
                        value={operationIndex}
                        onChange={(e) => {
                          setOperationIndex(e.target.value);
                          setVariantIndex("0");
                          setCaptureStatus(
                            operations[Number(e.target.value)]?.responses[0]
                              ?.status ?? "200",
                          );
                          setSelectedFields([]);
                        }}
                      >
                        {!operations.length && <option value="0">—</option>}
                        {operations.map((o, i) => (
                          <option key={i} value={i}>
                            {o.method} {o.path}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-bold">
                      {t("consumer.variant")}
                      <select
                        className={inputClass}
                        value={variantIndex}
                        onChange={(e) => {
                          setVariantIndex(e.target.value);
                          setCaptureStatus(
                            operation?.responses[Number(e.target.value)]
                              ?.status ?? "200",
                          );
                          setSelectedFields([]);
                        }}
                      >
                        {!operation?.responses.length && (
                          <option value="0">—</option>
                        )}
                        {operation?.responses.map((r, i) => (
                          <option key={i} value={i}>
                            {r.status} · {r.mediaType || t("consumer.noBody")}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-xs font-bold">
                    {t("consumer.captureStatus")}
                    <input
                      className={inputClass}
                      value={captureStatus}
                      maxLength={3}
                      onChange={(e) => {
                        setCaptureStatus(e.target.value);
                        setSelectedFields([]);
                      }}
                    />
                  </label>
                  <p className="text-xs text-slate-600">
                    {t("consumer.fieldsHelp")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() =>
                        setSelectedFields(inventory.map((f) => f.pointer))
                      }
                    >
                      {t("consumer.selectAll")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => setSelectedFields([])}
                    >
                      {t("consumer.clearFields")}
                    </button>
                  </div>
                  <div
                    className="max-h-64 space-y-2 overflow-auto"
                    role="group"
                    aria-label={t("consumer.fieldChoices")}
                  >
                    {!inventory.length && <p>{t("consumer.noFields")}</p>}
                    {inventory.map((f) => (
                      <label
                        key={f.pointer}
                        className="flex items-start gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          aria-label={t("consumer.selectField", {
                            pointer: f.pointer || t("consumer.root"),
                          })}
                          checked={selectedFields.includes(f.pointer)}
                          onChange={(e) =>
                            setSelectedFields(
                              e.target.checked
                                ? [...selectedFields, f.pointer]
                                : selectedFields.filter((p) => p !== f.pointer),
                            )
                          }
                        />
                        <span className="break-all">
                          <code>{f.pointer || t("consumer.root")}</code> ·{" "}
                          {f.types.join(" | ") || t("consumer.anyType")} ·{" "}
                          {t(
                            f.required
                              ? "consumer.required"
                              : "consumer.optional",
                          )}
                          {f.review ? ` · ${t("consumer.status.review")}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={
                      !consumer ||
                      !variant ||
                      allContracts.length >= MAX_CONTRACTS ||
                      dirty
                    }
                    onClick={capture}
                  >
                    {t("consumer.capture")}
                  </button>
                </>
              )}
            </section>
            {consumer && (
              <section className="space-y-3 rounded-xl border border-slate-200 p-3">
                <h3 className="font-bold">{t("consumer.dependencies")}</h3>
                <label className="block text-xs font-bold">
                  {t("consumer.selectContract")}
                  <select
                    className={inputClass}
                    value={contractKey}
                    onChange={(e) => setContractKey(e.target.value)}
                  >
                    {!consumer.contracts.length && <option value="">—</option>}
                    {consumer.contracts.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                {contract && (
                  <>
                    <label className="block text-xs font-bold">
                      {t("consumer.contractName")}
                      <input
                        className={inputClass}
                        maxLength={120}
                        value={contract.name}
                        onChange={(e) => editContract({ name: e.target.value })}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="block text-xs font-bold">
                        {t("consumer.method")}
                        <select
                          className={inputClass}
                          value={contract.method}
                          onChange={(e) =>
                            editContract({ method: e.target.value })
                          }
                        >
                          {[
                            "GET",
                            "POST",
                            "PUT",
                            "PATCH",
                            "DELETE",
                            "HEAD",
                            "OPTIONS",
                            "TRACE",
                          ].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-bold">
                        {t("consumer.path")}
                        <input
                          className={inputClass}
                          maxLength={2048}
                          value={contract.path}
                          onChange={(e) =>
                            editContract({ path: e.target.value })
                          }
                        />
                      </label>
                      <label className="block text-xs font-bold">
                        {t("consumer.status")}
                        <input
                          className={inputClass}
                          maxLength={3}
                          value={contract.status}
                          onChange={(e) =>
                            editContract({ status: e.target.value })
                          }
                        />
                      </label>
                      <label className="block text-xs font-bold">
                        {t("consumer.media")}
                        <input
                          className={inputClass}
                          maxLength={256}
                          value={contract.mediaType}
                          onChange={(e) =>
                            editContract({ mediaType: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={contract.enabled}
                          onChange={(e) =>
                            editContract({ enabled: e.target.checked })
                          }
                        />
                        {t("consumer.enableContract")}
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={contract.requirePublic}
                          onChange={(e) =>
                            editContract({ requirePublic: e.target.checked })
                          }
                        />
                        {t("consumer.requirePublic")}
                      </label>
                    </div>
                    <label className="block text-xs font-bold">
                      {t("consumer.fieldJson")}
                      <textarea
                        className={`${inputClass} font-mono`}
                        rows={7}
                        maxLength={MAX_CONSUMER_BYTES}
                        spellCheck={false}
                        value={ownText(
                          fieldDrafts,
                          contract.key,
                          stringify(contract.fields),
                        )}
                        onChange={(e) => {
                          setFieldDrafts({
                            ...fieldDrafts,
                            [contract.key]: e.target.value,
                          });
                          invalidate();
                        }}
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      {t("consumer.requestJson")}
                      <textarea
                        className={`${inputClass} font-mono`}
                        rows={5}
                        maxLength={65536}
                        spellCheck={false}
                        value={ownText(
                          requestDrafts,
                          contract.key,
                          contract.request ? stringify(contract.request) : "",
                        )}
                        placeholder={
                          '{"parameters":[{"name":"id","location":"path","value":1}]}'
                        }
                        onChange={(e) => {
                          setRequestDrafts({
                            ...requestDrafts,
                            [contract.key]: e.target.value,
                          });
                          invalidate();
                        }}
                      />
                    </label>
                    <p className="text-xs text-slate-600">
                      {t("consumer.requestHelp")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={save}
                      >
                        {t("consumer.save")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => {
                          setFieldDrafts(
                            Object.fromEntries(
                              Object.entries(fieldDrafts).filter(
                                ([k]) => k !== contractKey,
                              ),
                            ),
                          );
                          setRequestDrafts(
                            Object.fromEntries(
                              Object.entries(requestDrafts).filter(
                                ([k]) => k !== contractKey,
                              ),
                            ),
                          );
                          setFeedback(null);
                        }}
                      >
                        {t("consumer.discard")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={removeContract}
                      >
                        {t("consumer.removeContract")}
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
            {dirty && (
              <p role="status" className="text-amber-800">
                {t("consumer.dirty")}
              </p>
            )}
            <button
              type="button"
              className={buttonClass}
              disabled={dirty}
              onClick={() => download("project")}
            >
              {t("consumer.exportProject")}
            </button>
          </fieldset>
          <fieldset
            disabled={loading || dirty || !allContracts.length}
            className="min-w-0 space-y-3"
          >
            <legend className="mb-2 font-bold">
              {t("consumer.checkHeading")}
            </legend>
            <button
              type="button"
              className={buttonClass}
              onClick={() => check(getSchemaText())}
            >
              {t("consumer.checkEditor")}
            </button>
            <label className="block text-xs font-bold">
              {t("consumer.candidate")}
              <textarea
                className={`${inputClass} font-mono`}
                rows={5}
                maxLength={MAX_CONSUMER_BYTES}
                spellCheck={false}
                value={candidate}
                onChange={(e) => {
                  setCandidate(e.target.value);
                  invalidate();
                }}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={!candidate.trim()}
              onClick={() => check(candidate)}
            >
              {t("consumer.checkPasted")}
            </button>
            <label className="block text-xs font-bold">
              {t("consumer.candidateFile")}
              <input
                className={inputClass}
                type="file"
                accept=".json,.yaml,.yml,application/json,application/yaml"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void read(file, "candidate");
                }}
              />
            </label>
          </fieldset>
          {report && (
            <section className="space-y-3" aria-label={t("consumer.report")}>
              <h3 className="font-bold">
                {t("consumer.report")} · {report.providerTitle}{" "}
                {report.providerVersion}
              </h3>
              <p>
                {t("consumer.summary", {
                  compatible: String(report.counts.compatible),
                  breaking: String(report.counts.breaking),
                  review: String(report.counts.review),
                  untracked: String(report.counts.untracked),
                })}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {report.consumers.map((c) => (
                  <p
                    key={c.key}
                    className="rounded-lg border border-slate-200 p-2 text-xs"
                  >
                    <strong>{c.name}</strong> ·{" "}
                    {t(`consumer.status.${c.status}`)}
                  </p>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold">
                  {t("consumer.search")}
                  <input
                    className={inputClass}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSearch("");
                        setPage(0);
                      }
                    }}
                  />
                </label>
                <label className="block text-xs font-bold">
                  {t("consumer.filter")}
                  <select
                    className={inputClass}
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value as typeof filter);
                      setPage(0);
                    }}
                  >
                    <option value="all">{t("consumer.all")}</option>
                    {(
                      ["compatible", "breaking", "review", "untracked"] as const
                    ).map((s) => (
                      <option key={s} value={s}>
                        {t(`consumer.status.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!rows.length && <p>{t("consumer.noMatches")}</p>}
              {rows
                .slice(currentPage * 25, (currentPage + 1) * 25)
                .map(({ consumer: c, result }) => (
                  <article
                    key={result.key}
                    className="space-y-2 rounded-xl border border-slate-200 p-3"
                  >
                    <h4 className="text-xs font-bold">
                      {c.name} · {result.name} ·{" "}
                      {t(`consumer.status.${result.status}`)}
                    </h4>
                    <p className="text-xs break-all">
                      {result.method} {result.path} ·{" "}
                      {t("consumer.fieldCount", {
                        count: String(result.fieldCount),
                      })}
                    </p>
                    {result.findings.length > 0 && (
                      <ul className="space-y-1 text-xs">
                        {result.findings.map((f, i) => (
                          <li
                            key={i}
                            className={
                              f.severity === "breaking"
                                ? "text-red-700"
                                : "text-amber-800"
                            }
                          >
                            {t(`consumer.finding.${f.code}`)}
                            {f.pointer ? (
                              <>
                                {" "}
                                · <code className="break-all">{f.pointer}</code>
                              </>
                            ) : null}
                            {f.detail ? ` · ${f.detail}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {result.hiddenFindings > 0 && (
                      <p className="text-xs">
                        {t("consumer.hidden", {
                          count: String(result.hiddenFindings),
                        })}
                      </p>
                    )}
                  </article>
                ))}
              {lastPage > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    {t("consumer.previous")}
                  </button>
                  <p className="text-xs">
                    {t("consumer.page", {
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
                    {t("consumer.next")}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={loading || dirty}
                  onClick={() => download("report")}
                >
                  {t("consumer.exportReport")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={loading || dirty}
                  onClick={() => download("markdown")}
                >
                  {t("consumer.exportMarkdown")}
                </button>
              </div>
              <details>
                <summary className="cursor-pointer text-xs font-bold">
                  {t("consumer.preview")}
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs whitespace-pre-wrap break-all text-slate-100">
                  {truncateJsonPreview(stringify(report), 12000)}
                </pre>
              </details>
            </section>
          )}
        </div>
      )}
    </details>
  );
});
