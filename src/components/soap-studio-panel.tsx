"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import { parseTransformValue } from "@/lib/api-transform";
import {
  inspectSoapEnvelope,
  SoapError,
  soapError,
  type SoapIssue,
} from "@/lib/soap-xml";
import {
  generateSoapExample,
  readSoapWsdl,
  type SoapContract,
  type SoapOperation,
} from "@/lib/soap-wsdl";
import {
  MAX_SOAP_CASES,
  MAX_SOAP_PROJECT_BYTES,
  demoSoapProject,
  normalizeSoapCase,
  normalizeSoapNamespaces,
  normalizeSoapRequest,
  parseSoapProject,
  runSoapCases,
  serializeSoapProject,
  soapCasesReport,
  soapRequestForOperation,
  validateSoapRequest,
  type SoapCase,
  type SoapProject,
  type SoapRequest,
} from "@/lib/soap-studio";
import {
  sendSoapRequest,
  soapCurl,
  type SoapExchange,
} from "@/lib/soap-transport";
import type { TranslationKey } from "@/lib/translations";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const json = (value: unknown) => JSON.stringify(value, null, 2);
type RequestDraft = Omit<SoapRequest, "timeoutMs"> & { timeoutMs: string };
type CaseDraft = Omit<SoapCase, "status" | "rules"> & {
  status: string;
  rules: string;
};
const requestDraft = (r: SoapRequest): RequestDraft => ({
  ...r,
  timeoutMs: String(r.timeoutMs),
});
const caseDraft = (c: SoapCase): CaseDraft => ({
  ...c,
  status: String(c.status),
  rules: json(c.rules),
});
const number = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);
function defaultRequest(
  contract: SoapContract,
  operation: SoapOperation,
): SoapRequest {
  try {
    return soapRequestForOperation(contract, operation);
  } catch {
    return {
      operationId: operation.id,
      url: operation.url,
      action: operation.action,
      xml: "",
      timeoutMs: 10000,
    };
  }
}

export const SoapStudioPanel = memo(function SoapStudioPanel() {
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
    [project, setProject] = useState<SoapProject | null>(null);
  const [source, setSource] = useState(""),
    [name, setName] = useState(""),
    [namespaceSource, setNamespaceSource] = useState("{}");
  const [request, setRequest] = useState<RequestDraft | null>(null),
    [draft, setDraft] = useState<CaseDraft | null>(null),
    [caseId, setCaseId] = useState("");
  const [optional, setOptional] = useState(false),
    [headers, setHeaders] = useState("{}"),
    [inspectedXml, setInspectedXml] = useState("");
  const [exchange, setExchange] = useState<
      (SoapExchange & { operationId: string }) | null
    >(null),
    [report, setReport] = useState<ReturnType<typeof soapCasesReport> | null>(
      null,
    );
  const [busy, setBusy] = useState<"read" | "live" | "replay" | "copy" | null>(
      null,
    ),
    [feedback, setFeedback] = useState<{
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
  const contract = useMemo(
    () => (project ? readSoapWsdl(project.wsdl) : null),
    [project],
  );
  const operation = contract?.operations.find(
    (o) => o.id === request?.operationId,
  );
  const selectedCase = project?.cases.find((c) => c.id === caseId);
  const sourceDirty = !!project && source !== project.wsdl;
  const settingsDirty =
    !!project &&
    (name !== project.name || namespaceSource !== json(project.namespaces));
  const requestDirty =
    !!request &&
    json(request) !==
      json(project?.request ? requestDraft(project.request) : null);
  const caseDirty =
    !!draft &&
    json(draft) !== json(selectedCase ? caseDraft(selectedCase) : null);
  const pending = sourceDirty || settingsDirty || requestDirty || caseDirty;
  const inspection = useMemo(() => {
    if (!inspectedXml) return null;
    try {
      return { value: inspectSoapEnvelope(inspectedXml), error: null };
    } catch (e) {
      return { value: null, error: soapError(e).code };
    }
  }, [inspectedXml]);
  function fail(e: unknown) {
    setFeedback({ key: `soap.error.${soapError(e).code}`, error: true });
  }
  function notify(key: TranslationKey) {
    setFeedback({ key, error: false });
  }
  function chooseCase(c?: SoapCase) {
    setCaseId(c?.id ?? "");
    setDraft(c ? caseDraft(c) : null);
    if (c) setInspectedXml(c.response);
  }
  function clearResults() {
    setReport(null);
    setExchange(null);
  }
  function accept(p: SoapProject) {
    setProject(p);
    setSource(p.wsdl);
    setName(p.name);
    setNamespaceSource(json(p.namespaces));
    setRequest(p.request ? requestDraft(p.request) : null);
    chooseCase(p.cases[0]);
    setInspectedXml(p.cases[0]?.response ?? "");
    setHeaders("{}");
    setOptional(false);
    clearResults();
    setFeedback(null);
  }
  function newProject() {
    setProject(null);
    setSource("");
    setName("");
    setNamespaceSource("{}");
    setRequest(null);
    chooseCase();
    setInspectedXml("");
    setHeaders("{}");
    clearResults();
    setFeedback(null);
  }
  const checked = (p: SoapProject) => parseSoapProject(serializeSoapProject(p));
  function create() {
    try {
      const c = readSoapWsdl(source),
        op = c.operations[0];
      accept(
        checked({
          kind: "rsswag-soap-project",
          version: 1,
          name: c.name.slice(0, 120),
          wsdl: source,
          namespaces: c.namespace ? { c: c.namespace } : {},
          request: defaultRequest(c, op),
          cases: [],
        }),
      );
      notify("soap.saved");
    } catch (e) {
      fail(e);
    }
  }
  function discard() {
    if (!project) return;
    setSource(project.wsdl);
    setName(project.name);
    setNamespaceSource(json(project.namespaces));
    setRequest(project.request ? requestDraft(project.request) : null);
    chooseCase(selectedCase);
    setFeedback(null);
  }
  function saveSettings() {
    if (!project) return;
    try {
      const p = checked({
        ...project,
        name,
        namespaces: normalizeSoapNamespaces(
          parseTransformValue(namespaceSource),
        ),
      });
      setProject(p);
      setName(p.name);
      setNamespaceSource(json(p.namespaces));
      clearResults();
      notify("soap.saved");
    } catch (e) {
      fail(e);
    }
  }
  function saveRequest() {
    if (!project || !contract || !request) return;
    try {
      const saved = normalizeSoapRequest(
          { ...request, timeoutMs: number(request.timeoutMs) },
          contract,
        ),
        p = checked({ ...project, request: saved });
      setProject(p);
      setRequest(requestDraft(saved));
      clearResults();
      notify("soap.saved");
    } catch (e) {
      fail(e);
    }
  }
  function selectOperation(id: string) {
    if (!contract || !project) return;
    const op = contract.operations.find((o) => o.id === id)!;
    const saved = defaultRequest(contract, op);
    setRequest(requestDraft(saved));
    clearResults();
    setFeedback(null);
  }
  function generate() {
    if (!contract || !operation || !request) return;
    try {
      setRequest({
        ...request,
        xml: generateSoapExample(contract, operation, "input", optional),
      });
      clearResults();
      setFeedback(null);
    } catch (e) {
      fail(e);
    }
  }
  function addCase(
    response?: string,
    status = 200,
    operationId = operation?.id,
  ) {
    if (!project || !contract || !operationId) return;
    try {
      const op = contract.operations.find((o) => o.id === operationId)!;
      let xml = response ?? "";
      if (response === undefined) {
        try {
          xml = generateSoapExample(contract, op, "output");
        } catch {}
      }
      let expected: SoapCase["expected"] = "success";
      if (response !== undefined) {
        try {
          expected = inspectSoapEnvelope(xml, op.version).fault
            ? "fault"
            : "success";
        } catch {
          expected = "invalid";
        }
      }
      const next = normalizeSoapCase(
        {
          id: crypto.randomUUID(),
          name: `Response ${project.cases.length + 1}`,
          operationId,
          response: xml,
          status,
          expected,
          rules: [],
        },
        contract,
        project.namespaces,
      );
      const p = checked({ ...project, cases: [...project.cases, next] });
      setProject(p);
      chooseCase(next);
      setReport(null);
      notify(response === undefined ? "soap.saved" : "soap.captured");
    } catch (e) {
      fail(e);
    }
  }
  function saveCase() {
    if (!project || !contract || !draft) return;
    try {
      const next = normalizeSoapCase(
          {
            ...draft,
            status: number(draft.status),
            rules: parseTransformValue(draft.rules),
          },
          contract,
          project.namespaces,
        ),
        p = checked({
          ...project,
          cases: project.cases.map((c) => (c.id === next.id ? next : c)),
        });
      setProject(p);
      chooseCase(next);
      setReport(null);
      notify("soap.saved");
    } catch (e) {
      fail(e);
    }
  }
  function deleteCase() {
    if (!project) return;
    const p = {
      ...project,
      cases: project.cases.filter((c) => c.id !== caseId),
    };
    setProject(p);
    chooseCase(p.cases[0]);
    setReport(null);
  }
  async function readFile(file: File, kind: "project" | "wsdl") {
    const task = ++generation.current;
    setBusy("read");
    setFeedback(null);
    try {
      if (file.size > (kind === "wsdl" ? 512 * 1024 : MAX_SOAP_PROJECT_BYTES))
        throw new SoapError("limit");
      const text = await file.text();
      if (task !== generation.current) return;
      if (kind === "project") {
        accept(parseSoapProject(text));
        notify("soap.imported");
      } else {
        readSoapWsdl(text);
        setSource(text);
      }
    } catch (e) {
      if (task === generation.current) fail(e);
    } finally {
      if (task === generation.current) setBusy(null);
    }
  }
  async function replay(all: boolean) {
    if (!project || (!all && !selectedCase)) return;
    const task = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    const p = all ? project : { ...project, cases: [selectedCase!] };
    setBusy("replay");
    setFeedback(null);
    setReport(soapCasesReport([], p.cases.length));
    if (!all) setInspectedXml(selectedCase!.response);
    const results: ReturnType<typeof soapCasesReport>["results"] = [];
    try {
      const completed = await runSoapCases(p, {
        signal: controller.signal,
        onResult(result) {
          if (task === generation.current) {
            results.push(result);
            setReport(soapCasesReport(results, p.cases.length));
          }
        },
      });
      if (task === generation.current) setReport(completed);
    } catch (e) {
      if (task === generation.current) fail(e);
    } finally {
      if (task === generation.current) {
        setBusy(null);
        abort.current = null;
      }
    }
  }
  async function send() {
    if (!project?.request || !operation) return;
    const task = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    setBusy("live");
    setFeedback(null);
    setExchange(null);
    try {
      validateSoapRequest(project.request, operation);
      const result = await sendSoapRequest({
        ...project.request,
        version: operation.version,
        headers,
        signal: controller.signal,
      });
      if (task === generation.current) {
        setExchange({ ...result, operationId: operation.id });
        setInspectedXml(result.body);
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
  function download(
    content: () => string,
    suffix: string,
    mime = "application/json",
  ) {
    try {
      const stem =
        (project?.name ?? "soap")
          .replace(/[^\p{L}\p{N}_-]+/gu, "-")
          .slice(0, 80) || "soap";
      const ok = downloadTextFile(content(), `${stem}-soap-${suffix}`, mime);
      setFeedback({
        key: ok ? "soap.downloaded" : "soap.downloadError",
        error: !ok,
      });
    } catch (e) {
      fail(e);
    }
  }
  async function copy() {
    const task = ++generation.current;
    setBusy("copy");
    setFeedback(null);
    try {
      const ok = await writeTextToClipboard(inspectedXml);
      if (task === generation.current)
        setFeedback({ key: ok ? "soap.copied" : "soap.copyError", error: !ok });
    } catch {
      if (task === generation.current)
        setFeedback({ key: "soap.copyError", error: true });
    } finally {
      if (task === generation.current) setBusy(null);
    }
  }
  function field(
    key: TranslationKey,
    value: string,
    change: (value: string) => void,
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
            value={value}
            onChange={(e) => change(e.target.value)}
          />
        )}
      </label>
    );
  }
  function preview(key: TranslationKey, value: string) {
    return (
      <label className="block text-xs font-semibold">
        {t(key)}
        <textarea
          className={`${inputClass} font-mono`}
          rows={7}
          value={value.slice(0, 16000)}
          readOnly
        />
      </label>
    );
  }
  const issue = (code: SoapIssue) => t(`soap.error.${code}`);
  return (
    <details
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white p-4"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-bold text-[color:var(--color-brand-purple)]">
        {t("soap.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm">{t("soap.help")}</p>
          <p className="text-xs text-slate-600">{t("soap.scope")}</p>
          <p className="text-xs text-slate-600">{t("soap.privacy")}</p>
          <p className="text-xs text-slate-600">{t("soap.limits")}</p>
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
              {t("soap.pending")}
            </p>
          )}
          <fieldset
            disabled={!!busy || pending}
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              className={buttonClass}
              onClick={() => accept(demoSoapProject())}
            >
              {t("soap.demo")}
            </button>
            <button type="button" className={buttonClass} onClick={newProject}>
              {t("soap.new")}
            </button>
            {(["project", "wsdl"] as const).map((kind) => (
              <label key={kind} className={`${buttonClass} cursor-pointer`}>
                {t(kind === "project" ? "soap.import" : "soap.importWsdl")}
                <input
                  className="sr-only"
                  type="file"
                  accept={
                    kind === "project"
                      ? ".json,application/json"
                      : ".wsdl,.xml,application/xml,text/xml"
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void readFile(file, kind);
                  }}
                />
              </label>
            ))}
            {project && (
              <button
                type="button"
                className={buttonClass}
                onClick={() =>
                  download(() => serializeSoapProject(project), "project.json")
                }
              >
                {t("soap.export")}
              </button>
            )}
          </fieldset>
          <fieldset disabled={!!busy} className="space-y-3">
            {field("soap.wsdl", source, setSource, 9)}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={
                  !source.trim() || settingsDirty || requestDirty || caseDirty
                }
                onClick={create}
              >
                {t("soap.create")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!pending}
                onClick={discard}
              >
                {t("soap.discard")}
              </button>
            </div>
          </fieldset>
          {project && contract && (
            <>
              <fieldset disabled={!!busy || sourceDirty} className="space-y-3">
                {field("soap.projectName", name, setName)}
                {field(
                  "soap.namespaces",
                  namespaceSource,
                  setNamespaceSource,
                  3,
                )}
                <button
                  type="button"
                  className={buttonClass}
                  onClick={saveSettings}
                >
                  {t("soap.saveSettings")}
                </button>
                <p className="text-xs">
                  {message("soap.elements", {
                    count: contract.elements.length,
                  })}
                </p>
                {contract.diagnostics.map((d) => (
                  <p key={d.code} className="text-xs text-amber-800">
                    {message(
                      d.code === "external"
                        ? "soap.external"
                        : "soap.unsupported",
                      { count: d.count },
                    )}
                  </p>
                ))}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={pending}
                  onClick={() =>
                    download(
                      () =>
                        json({
                          kind: "rsswag-soap-inventory",
                          version: 1,
                          name: contract.name,
                          namespace: contract.namespace,
                          operations: contract.operations,
                          elements: contract.elements,
                          diagnostics: contract.diagnostics,
                        }),
                      "inventory.json",
                    )
                  }
                >
                  {t("soap.inventory")}
                </button>
              </fieldset>
              <fieldset
                disabled={!!busy || sourceDirty}
                className="space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <label className="block text-xs font-semibold">
                  {t("soap.operation")}
                  <select
                    className={inputClass}
                    value={request?.operationId ?? ""}
                    disabled={pending}
                    onChange={(e) => selectOperation(e.target.value)}
                  >
                    {!request && <option value="">—</option>}
                    {contract.operations.map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.name} · SOAP {o.version} · {o.port || o.binding}
                      </option>
                    ))}
                  </select>
                </label>
                {operation && request && (
                  <>
                    <p className="text-xs">
                      {message("soap.operationDetails", {
                        service: operation.service || "—",
                        port: operation.port || operation.binding,
                        version: operation.version,
                        action: operation.action || "—",
                      })}
                    </p>
                    {operation.issues.length > 0 && (
                      <p className="text-xs text-amber-800">
                        {t("soap.selectedUnsupported", {
                          reason: operation.issues.map(issue).join(" "),
                        })}
                      </p>
                    )}
                    <div className="grid gap-3 md:grid-cols-2">
                      {field("soap.url", request.url, (value) =>
                        setRequest({ ...request, url: value }),
                      )}
                      {field("soap.action", request.action, (value) =>
                        setRequest({ ...request, action: value }),
                      )}
                      {field("soap.timeout", request.timeoutMs, (value) =>
                        setRequest({ ...request, timeoutMs: value }),
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={optional}
                        onChange={(e) => setOptional(e.target.checked)}
                      />
                      {t("soap.optional")}
                    </label>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={operation.issues.length > 0}
                      onClick={generate}
                    >
                      {t("soap.generate")}
                    </button>
                    {field(
                      "soap.request",
                      request.xml,
                      (value) => setRequest({ ...request, xml: value }),
                      10,
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={saveRequest}
                      >
                        {t("soap.saveRequest")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => {
                          try {
                            validateSoapRequest(
                              {
                                ...request,
                                timeoutMs: number(request.timeoutMs),
                              },
                              operation,
                            );
                            notify("soap.valid");
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        {t("soap.validate")}
                      </button>
                    </div>
                    <fieldset
                      disabled={pending}
                      className="flex flex-wrap gap-2"
                    >
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() =>
                          download(
                            () => request.xml,
                            "request.xml",
                            "application/xml",
                          )
                        }
                      >
                        {t("soap.downloadRequest")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() =>
                          download(
                            () =>
                              soapCurl(
                                request.url,
                                operation.version,
                                request.action,
                                request.xml,
                              ),
                            "request.sh",
                            "text/plain;charset=utf-8",
                          )
                        }
                      >
                        {t("soap.downloadCurl")}
                      </button>
                    </fieldset>
                  </>
                )}
              </fieldset>
              <fieldset disabled={!!busy || pending} className="space-y-3">
                {field(
                  "soap.headers",
                  headers,
                  (value) => {
                    setHeaders(value);
                    setExchange(null);
                  },
                  3,
                )}
                <p className="text-xs text-slate-600">{t("soap.liveHelp")}</p>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    !request || !operation || operation.issues.length > 0
                  }
                  onClick={() => void send()}
                >
                  {t("soap.send")}
                </button>
              </fieldset>
              {exchange && (
                <div className="space-y-2">
                  <p className="text-xs">
                    {message("soap.exchange", {
                      status: exchange.status,
                      bytes: exchange.bytes,
                      ms: exchange.durationMs,
                    })}
                  </p>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={
                      !!busy ||
                      pending ||
                      project.cases.length >= MAX_SOAP_CASES
                    }
                    onClick={() =>
                      addCase(
                        exchange.body,
                        exchange.status,
                        exchange.operationId,
                      )
                    }
                  >
                    {t("soap.capture")}
                  </button>
                </div>
              )}
              <fieldset
                disabled={!!busy || sourceDirty || settingsDirty}
                className="space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <legend className="px-1 text-sm font-bold">
                  {t("soap.cases")}
                </legend>
                <p className="text-xs text-slate-600">{t("soap.caseHelp")}</p>
                {project.cases.length ? (
                  <label className="block text-xs font-semibold">
                    {t("soap.case")}
                    <select
                      className={inputClass}
                      value={caseId}
                      disabled={pending}
                      onChange={(e) =>
                        chooseCase(
                          project.cases.find((c) => c.id === e.target.value),
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
                ) : (
                  <p className="text-xs">{t("soap.noCases")}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={
                      pending ||
                      !operation ||
                      project.cases.length >= MAX_SOAP_CASES
                    }
                    onClick={() => addCase()}
                  >
                    {t("soap.addCase")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={pending || !draft}
                    onClick={deleteCase}
                  >
                    {t("soap.deleteCase")}
                  </button>
                </div>
                {draft && (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      {field("soap.caseName", draft.name, (value) =>
                        setDraft({ ...draft, name: value }),
                      )}
                      {field("soap.caseStatus", draft.status, (value) =>
                        setDraft({ ...draft, status: value }),
                      )}
                      <label className="text-xs font-semibold">
                        {t("soap.caseOperation")}
                        <select
                          className={inputClass}
                          value={draft.operationId}
                          onChange={(e) =>
                            setDraft({ ...draft, operationId: e.target.value })
                          }
                        >
                          {contract.operations.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} · SOAP {o.version} ·{" "}
                              {o.port || o.binding}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-semibold">
                        {t("soap.caseExpected")}
                        <select
                          className={inputClass}
                          value={draft.expected}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              expected: e.target.value as SoapCase["expected"],
                            })
                          }
                        >
                          {(["success", "fault", "invalid"] as const).map(
                            (outcome) => (
                              <option key={outcome} value={outcome}>
                                {t(`soap.outcome.${outcome}`)}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>
                    {field(
                      "soap.caseResponse",
                      draft.response,
                      (value) => setDraft({ ...draft, response: value }),
                      9,
                    )}
                    {field(
                      "soap.rules",
                      draft.rules,
                      (value) => setDraft({ ...draft, rules: value }),
                      5,
                    )}
                    <p className="text-xs text-slate-600">
                      {t("soap.rulesHelp")}
                    </p>
                    <p className="break-all font-mono text-xs text-slate-600">
                      {t("soap.ruleExample")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={saveCase}
                      >
                        {t("soap.saveCase")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => setInspectedXml(draft.response)}
                      >
                        {t("soap.inspectCase")}
                      </button>
                    </div>
                  </>
                )}
                <fieldset disabled={pending} className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!selectedCase}
                    onClick={() => void replay(false)}
                  >
                    {t("soap.replay")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!project.cases.length}
                    onClick={() => void replay(true)}
                  >
                    {t("soap.runAll")}
                  </button>
                </fieldset>
              </fieldset>
            </>
          )}
          {busy && (
            <div className="flex flex-wrap items-center gap-2">
              <p role="status" className="text-xs">
                {t("soap.busy")}
              </p>
              {(busy === "live" || busy === "replay") && (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => abort.current?.abort()}
                >
                  {t("soap.cancel")}
                </button>
              )}
            </div>
          )}
          {report && (
            <section className="space-y-3" aria-label={t("soap.results")}>
              <p role="status" className="text-sm">
                {message("soap.progress", {
                  count: report.completed,
                  total: report.total,
                  passed: report.passed,
                  failed: report.failed,
                })}
              </p>
              <ul className="space-y-1 text-xs">
                {report.results.map((r) => (
                  <li key={r.id}>
                    {message("soap.result", {
                      name: r.name,
                      result: t(r.passed ? "soap.passed" : "soap.failed"),
                      outcome: t(`soap.outcome.${r.outcome}`),
                      status: r.status,
                      checks: r.rules.length,
                    })}
                    {r.issue && ` · ${issue(r.issue)}`}
                    <p className="mt-1 text-slate-600">
                      {message("soap.resultChecks", {
                        outcome: t(
                          r.outcomeMatched ? "soap.passed" : "soap.failed",
                        ),
                        wrapper:
                          r.outcome === "invalid"
                            ? "—"
                            : t(
                                r.contractMatched
                                  ? "soap.passed"
                                  : "soap.failed",
                              ),
                        http: t(r.httpMatched ? "soap.passed" : "soap.failed"),
                        passed: r.rules.filter((rule) => rule.passed).length,
                        total: r.rules.length,
                      })}
                    </p>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={buttonClass}
                disabled={!!busy || pending}
                onClick={() => download(() => json(report), "report.json")}
              >
                {t("soap.report")}
              </button>
            </section>
          )}
          {inspectedXml && (
            <section className="space-y-3" aria-label={t("soap.inspector")}>
              {preview("soap.inspectedXml", inspectedXml)}
              {inspection?.error && (
                <p role="status" className="text-xs text-amber-800">
                  {issue(inspection.error)}
                </p>
              )}
              {inspection?.value && (
                <>
                  <p className="text-xs">
                    {t("soap.inspectedVersion", {
                      version: inspection.value.version,
                    })}
                  </p>
                  {preview("soap.tree", json(inspection.value.tree))}
                  {inspection.value.fault &&
                    preview("soap.fault", json(inspection.value.fault))}
                </>
              )}
              <fieldset
                disabled={!!busy || pending}
                className="flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() =>
                    download(
                      () => inspectedXml,
                      "response.xml",
                      "application/xml",
                    )
                  }
                >
                  {t("soap.downloadResponse")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => void copy()}
                >
                  {t("soap.copyResponse")}
                </button>
              </fieldset>
            </section>
          )}
        </div>
      )}
    </details>
  );
});
