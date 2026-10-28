"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_RPC_CONTRACT_BYTES,
  MAX_RPC_PROJECT_BYTES,
  RpcError,
  rpcJson,
  rpcObject,
  rpcUrl,
} from "@/lib/rpc-json";
import {
  readRpcContract,
  rpcSample,
  saveRpcMethod,
  type RpcContract,
  type RpcMethod,
} from "@/lib/rpc-contract";
import {
  appendRpcRequest,
  buildRpcRequest,
  inspectRpcExchange,
  type RpcInspection,
} from "@/lib/rpc-wire";
import {
  MAX_RPC_CASES,
  MAX_RPC_MOCKS,
  defaultRpcCase,
  demoRpcProject,
  emptyRpcProject,
  mockRpcResponse,
  normalizeRpcProject,
  parseRpcProject,
  rpcCasesReport,
  runRpcCases,
  serializeRpcProject,
  type RpcCase,
  type RpcCaseResult,
  type RpcMock,
  type RpcProject,
} from "@/lib/rpc-studio";
import { rpcCurl, generateRpcMockHandler } from "@/lib/rpc-export";
import { sendRpcRequest, type RpcExchange } from "@/lib/rpc-transport";
import { getByteSize } from "@/lib/text-encoding";
import type { TranslationKey } from "@/lib/translations";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const json = (value: unknown) => JSON.stringify(value, null, 2);
const integer = (v: string) => (/^-?\d+$/.test(v.trim()) ? Number(v) : NaN);
const caseDraft = (c: RpcCase) => ({
  ...c,
  httpStatus: String(c.httpStatus),
  errorCode: c.errorCode === null ? "" : String(c.errorCode),
});
function drafts(p: RpcProject, mockKey: string, caseId: string) {
  const fixture = p.mocks.find((m) => m.method === mockKey),
    test = p.cases.find((c) => c.id === caseId);
  return {
    name: p.name,
    contract: p.contract,
    endpoint: p.endpoint,
    timeoutMs: String(p.timeoutMs),
    request: p.request,
    response: p.response,
    responseStatus: String(p.responseStatus),
    fixture: fixture ? { ...fixture } : null,
    test: test ? caseDraft(test) : null,
  };
}
function nextId(prefix: string, values: string[]) {
  let n = 1;
  while (values.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function sampleParams(
  contract: RpcContract,
  method: RpcMethod,
  style: "named" | "positional",
) {
  const params = method.params.filter((p) => p.required);
  return json(
    style === "named"
      ? Object.fromEntries(
          params.map((p) => [p.name, rpcSample(contract.root, p.schema)]),
        )
      : params.map((p) => rpcSample(contract.root, p.schema)),
  );
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
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
          readOnly={readOnly}
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
type Snapshot = {
  exchange: RpcExchange;
  contract: string;
  endpoint: string;
  inspection: RpcInspection;
};
function Inspection({
  snapshot,
  onReport,
}: {
  snapshot: Snapshot;
  onReport: () => void;
}) {
  const { t } = useI18n(),
    [index, setIndex] = useState("0"),
    i = snapshot.inspection;
  const selected = i.rows[Number(index)] ?? i.rows[0];
  return (
    <section
      aria-label={t("rpc.inspection")}
      className="space-y-3 rounded-xl border p-3"
    >
      <h4 className="font-bold">{t("rpc.inspection")}</h4>
      <p className="text-xs">
        {t("rpc.exchangeStats", {
          status: String(snapshot.exchange.status),
          bytes: String(snapshot.exchange.bytes),
          duration: String(snapshot.exchange.durationMs),
          requests: String(i.requests),
          notifications: String(i.notifications),
        })}
      </p>
      <p className="text-sm font-semibold">
        {t("rpc.protocolState", {
          status: t(i.valid ? "rpc.valid" : "rpc.invalid"),
          contract: t(i.contractValid ? "rpc.complete" : "rpc.incomplete"),
        })}
      </p>
      {!!i.findings.length && (
        <ul className="list-inside list-disc text-xs">
          {i.findings.map((f, n) => (
            <li key={n} className={f.error ? "text-red-700" : "text-amber-800"}>
              {f.index >= 0 ? `${f.index}: ` : ""}
              {t(`rpc.finding.${f.code}`)}
            </li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              {["index", "method", "id", "outcome", "input", "output"].map(
                (k) => (
                  <th key={k} className="p-2">
                    {t(`rpc.column.${k}` as TranslationKey)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {i.rows.map((r) => (
              <tr key={r.index} className="border-t">
                <td className="p-2">{r.index}</td>
                <td className="p-2">{r.method}</td>
                <td className="p-2 font-mono">
                  {r.id === undefined ? "—" : JSON.stringify(r.id)}
                </td>
                <td className="p-2">
                  {t(`rpc.outcome.${r.outcome}`)}
                  {r.errorCode !== undefined ? ` (${r.errorCode})` : ""}
                </td>
                <td className="p-2">{t(`rpc.check.${r.input.status}`)}</td>
                <td className="p-2">{t(`rpc.check.${r.output.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Select
        label={t("rpc.row")}
        value={String(selected.index)}
        onChange={setIndex}
      >
        {i.rows.map((r) => (
          <option key={r.index} value={String(r.index)}>
            {r.index}: {r.method}
          </option>
        ))}
      </Select>
      <Field
        label={t("rpc.contractDetails")}
        value={json({ input: selected.input, output: selected.output })}
        multiline
        readOnly
      />
      {selected.outcome === "result" && (
        <Field
          label={t("rpc.resultValue")}
          value={json(selected.result)}
          multiline
          readOnly
        />
      )}
      <button type="button" className={buttonClass} onClick={onReport}>
        {t("rpc.inspectionReport")}
      </button>
    </section>
  );
}

export const RpcStudioPanel = memo(function RpcStudioPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyRpcProject);
  const [mockKey, setMockKey] = useState("math.add"),
    [caseId, setCaseId] = useState("");
  const [draft, setDraft] = useState(() =>
    drafts(emptyRpcProject(), "math.add", ""),
  );
  const [methodName, setMethodName] = useState("math.add"),
    [style, setStyle] = useState<"named" | "positional">("positional"),
    [params, setParams] = useState("[1,2]"),
    [idSource, setIdSource] = useState("1"),
    [notification, setNotification] = useState(false);
  const [headers, setHeaders] = useState("{}"),
    [recordResults, setRecordResults] = useState(false),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [results, setResults] = useState<RpcCaseResult[] | null>(null);
  const [busy, setBusy] = useState<"live" | "read" | null>(null),
    [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error: boolean;
      values?: Record<string, string>;
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
    () => (open ? readRpcContract(project.contract) : null),
    [open, project.contract],
  );
  const method =
    contract?.methods.find((m) => m.name === methodName) ??
    contract?.methods[0];
  const pending = json(draft) !== json(drafts(project, mockKey, caseId)),
    locked = !!busy || pending,
    contractDirty = draft.contract !== project.contract;
  const stale =
    !!snapshot &&
    (snapshot.exchange.request !== draft.request ||
      snapshot.exchange.body !== draft.response ||
      snapshot.exchange.status !== integer(draft.responseStatus) ||
      snapshot.contract !== draft.contract);
  const notify = (key: TranslationKey, values?: Record<string, string>) =>
    setFeedback({ key, values, error: false });
  const fail = (e: unknown) =>
    setFeedback({
      key: `rpc.error.${e instanceof RpcError ? e.code : "project"}`,
      error: true,
    });
  function perform(action: () => void) {
    try {
      action();
    } catch (e) {
      fail(e);
    }
  }
  function chooseMethod(c: RpcContract, m: RpcMethod) {
    const nextStyle =
      m.structure === "by-name"
        ? "named"
        : m.structure === "by-position"
          ? "positional"
          : style;
    setMethodName(m.name);
    setStyle(nextStyle);
    setParams(sampleParams(c, m, nextStyle));
    setNotification(!m.result);
  }
  function install(
    next: RpcProject,
    m = next.mocks[0]?.method ?? "",
    c = next.cases[0]?.id ?? "",
    keep = false,
    clearHeaders = false,
  ) {
    next = normalizeRpcProject(next);
    if (
      clearHeaders ||
      new URL(next.endpoint).origin !== new URL(project.endpoint).origin
    )
      setHeaders("{}");
    setProject(next);
    setMockKey(m);
    setCaseId(c);
    setDraft(drafts(next, m, c));
    setResults(null);
    if (!keep) setSnapshot(null);
    const parsed = readRpcContract(next.contract),
      selected =
        parsed.methods.find((v) => v.name === methodName) ?? parsed.methods[0];
    if (selected) chooseMethod(parsed, selected);
    else setMethodName("");
  }
  function save() {
    perform(() => {
      const next = normalizeRpcProject({
        ...project,
        name: draft.name,
        contract: draft.contract,
        endpoint: draft.endpoint,
        timeoutMs: integer(draft.timeoutMs),
        request: draft.request,
        response: draft.response,
        responseStatus: integer(draft.responseStatus),
        mocks: project.mocks.map((m) =>
          m.method === mockKey && draft.fixture ? draft.fixture : m,
        ),
        cases: project.cases.map((c) =>
          c.id === caseId && draft.test
            ? {
                ...draft.test,
                httpStatus: integer(draft.test.httpStatus),
                errorCode: draft.test.errorCode.trim()
                  ? integer(draft.test.errorCode)
                  : null,
              }
            : c,
        ),
      });
      const keep =
        !!snapshot &&
        snapshot.contract === next.contract &&
        snapshot.endpoint === next.endpoint &&
        snapshot.exchange.request === next.request &&
        snapshot.exchange.body === next.response &&
        snapshot.exchange.status === next.responseStatus;
      install(next, draft.fixture?.method ?? "", caseId, keep);
      notify("rpc.saved");
    });
  }
  function download(source: string, name: string, mime = "application/json") {
    try {
      const ok = downloadTextFile(source, name, mime);
      setFeedback({
        key: ok ? "rpc.downloaded" : "rpc.downloadFailed",
        error: !ok,
      });
    } catch {
      setFeedback({ key: "rpc.downloadFailed", error: true });
    }
  }
  async function importFile(file: File | undefined, projectFile: boolean) {
    if (!file || locked) return;
    if (
      file.size > (projectFile ? MAX_RPC_PROJECT_BYTES : MAX_RPC_CONTRACT_BYTES)
    ) {
      fail(new RpcError("limit"));
      return;
    }
    const ticket = ++generation.current;
    setBusy("read");
    setFeedback(null);
    try {
      const source = await file.text();
      if (ticket !== generation.current) return;
      if (projectFile) {
        install(parseRpcProject(source), undefined, undefined, false, true);
        notify("rpc.loaded");
      } else {
        readRpcContract(source);
        setDraft((d) => ({ ...d, contract: source }));
        notify("rpc.contractLoaded");
      }
    } catch (e) {
      if (ticket === generation.current) fail(e);
    } finally {
      if (ticket === generation.current) setBusy(null);
    }
  }
  function build(append: boolean) {
    if (!method || busy || contractDirty) return;
    perform(() => {
      const call = buildRpcRequest(method.name, params, idSource, notification);
      const source = append ? appendRpcRequest(draft.request, call) : call;
      setDraft((d) => ({ ...d, request: source }));
      if (!notification) {
        const id = rpcJson(idSource);
        if (typeof id === "number" && Number.isSafeInteger(id + 1))
          setIdSource(String(id + 1));
      }
      setFeedback(null);
    });
  }
  function remember(exchange: RpcExchange, source: string, endpoint: string) {
    const inspection = inspectRpcExchange(
      readRpcContract(source),
      exchange.request,
      exchange.body,
      exchange.status,
    );
    setSnapshot({ exchange, contract: source, endpoint, inspection });
  }
  function inspect() {
    perform(() => {
      const status = integer(draft.responseStatus);
      if (status < 200 || status > 599 || !Number.isSafeInteger(status))
        throw new RpcError("project");
      remember(
        {
          request: draft.request,
          body: draft.response,
          status,
          bytes: getByteSize(draft.response),
          contentType: "application/json",
          durationMs: 0,
          mode: "manual",
        },
        draft.contract,
        project.endpoint,
      );
      notify("rpc.inspected");
    });
  }
  function rehearse() {
    if (locked) return;
    perform(() => {
      const r = mockRpcResponse(project.request, project.mocks),
        exchange: RpcExchange = {
          request: project.request,
          body: r.body,
          status: r.status,
          bytes: getByteSize(r.body),
          contentType: "application/json",
          durationMs: 0,
          mode: "mock",
        };
      remember(exchange, project.contract, project.endpoint);
      setDraft((d) => ({
        ...d,
        response: r.body,
        responseStatus: String(r.status),
      }));
      notify("rpc.received");
    });
  }
  async function live() {
    if (locked) return;
    const ticket = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    setBusy("live");
    setFeedback(null);
    try {
      const exchange = await sendRpcRequest({
        url: project.endpoint,
        request: project.request,
        timeoutMs: project.timeoutMs,
        headers,
        signal: controller.signal,
      });
      if (ticket !== generation.current) return;
      remember(exchange, project.contract, project.endpoint);
      setDraft((d) => ({
        ...d,
        response: exchange.body,
        responseStatus: String(exchange.status),
      }));
      notify("rpc.received");
    } catch (e) {
      if (ticket === generation.current) fail(e);
    } finally {
      if (ticket === generation.current) {
        setBusy(null);
        abort.current = null;
      }
    }
  }
  function addMock() {
    if (locked || project.mocks.length >= MAX_RPC_MOCKS) return;
    perform(() => {
      const name =
        method && !project.mocks.some((m) => m.method === method.name)
          ? method.name
          : nextId(
              "mock.method",
              project.mocks.map((m) => m.method),
            );
      const value =
        method?.result && contract
          ? json(rpcSample(contract.root, method.result.schema))
          : "null";
      install(
        {
          ...project,
          mocks: [...project.mocks, { method: name, kind: "result", value }],
        },
        name,
        caseId,
      );
      setFeedback(null);
    });
  }
  function addCase(capture: boolean) {
    if (
      locked ||
      project.cases.length >= MAX_RPC_CASES ||
      (capture && (!snapshot || stale))
    )
      return;
    perform(() => {
      const id = nextId(
        "case",
        project.cases.map((c) => c.id),
      );
      let test = {
        ...defaultRpcCase(id),
        request: project.request,
        expectedResults: "{}",
        requireContract: false,
      };
      if (capture && snapshot) {
        const i = snapshot.inspection;
        test = {
          ...test,
          name: id,
          mode: "fixture",
          request: snapshot.exchange.request,
          response: snapshot.exchange.body,
          httpStatus: snapshot.exchange.status,
          expect: !i.valid
            ? "invalid"
            : i.notifications === i.requests
              ? "notification"
              : i.rows.some((r) => r.outcome === "error")
                ? "error"
                : "valid",
          requireContract: i.contractValid,
          expectedResults: recordResults
            ? json(
                Object.fromEntries(
                  i.rows
                    .filter((r) => r.outcome === "result")
                    .map((r) => [String(r.index), r.result]),
                ),
              )
            : "{}",
        };
      }
      install({ ...project, cases: [...project.cases, test] }, mockKey, id);
      notify(capture ? "rpc.captured" : "rpc.caseAdded");
    });
  }
  function run(only: boolean) {
    if (locked || !project.cases.length) return;
    perform(() => {
      const checked = runRpcCases(project, only ? caseId : undefined);
      setResults(checked);
      notify("rpc.completed", {
        passed: String(checked.filter((r) => r.passed).length),
        total: String(checked.length),
      });
    });
  }
  function inspectionReport() {
    if (!snapshot) return;
    const i = snapshot.inspection;
    download(
      rpcCasesReport([
        {
          id: "current",
          name: "Current exchange",
          passed: i.valid,
          protocolMatched: i.valid,
          contractMatched: i.contractValid,
          expectedMatched: true,
          assertions: [],
          inspection: i,
          httpStatus: snapshot.exchange.status,
        },
      ]),
      "rpc-inspection-report.json",
    );
  }
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4"
    >
      <summary className="cursor-pointer text-lg font-black">
        {t("rpc.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-slate-600">{t("rpc.help")}</p>
          <details className="space-y-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-bold">
              {t("rpc.scopeTitle")}
            </summary>
            <p>{t("rpc.scope")}</p>
            <p>{t("rpc.limits")}</p>
            <p>{t("rpc.privacy")}</p>
            <p>{t("rpc.mockHelp")}</p>
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
            <p className="text-xs text-amber-800">{t("rpc.pending")}</p>
          )}
          {busy && (
            <p role="status">
              {t(busy === "live" ? "rpc.running" : "rpc.reading")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() => {
                  install(demoRpcProject(), undefined, undefined, false, true);
                  notify("rpc.loaded");
                })
              }
            >
              {t("rpc.demo")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() =>
                perform(() => {
                  install(emptyRpcProject(), undefined, undefined, false, true);
                  notify("rpc.loaded");
                })
              }
            >
              {t("rpc.new")}
            </button>
            <label className={buttonClass}>
              {t("rpc.import")}
              <input
                className="mt-1 block max-w-56 text-xs"
                type="file"
                accept=".json,application/json"
                disabled={locked}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void importFile(file, true);
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
                    serializeRpcProject(project),
                    "json-rpc-project.json",
                  ),
                )
              }
            >
              {t("rpc.export")}
            </button>
          </div>
          <fieldset disabled={!!busy} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                label={t("rpc.projectName")}
                value={draft.name}
                onChange={(name) => setDraft((d) => ({ ...d, name }))}
              />
              <Field
                label={t("rpc.endpoint")}
                value={draft.endpoint}
                onChange={(endpoint) => setDraft((d) => ({ ...d, endpoint }))}
              />
              <Field
                label={t("rpc.timeout")}
                value={draft.timeoutMs}
                onChange={(timeoutMs) => setDraft((d) => ({ ...d, timeoutMs }))}
              />
            </div>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("rpc.contractSection")}</h4>
              <Field
                label={t("rpc.contract")}
                value={draft.contract}
                multiline
                onChange={(source) =>
                  setDraft((d) => ({ ...d, contract: source }))
                }
              />
              <div className="flex flex-wrap gap-2">
                <label className={buttonClass}>
                  {t("rpc.importContract")}
                  <input
                    type="file"
                    className="mt-1 block max-w-56 text-xs"
                    accept=".json,application/json"
                    disabled={locked}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      void importFile(file, false);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() => download(project.contract, "openrpc.json")}
                >
                  {t("rpc.exportContract")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!!busy || contractDirty}
                  onClick={() =>
                    perform(() => {
                      const source = saveRpcMethod(
                        project.contract,
                        null,
                        json({
                          name: nextId(
                            "method",
                            contract?.methods.map((m) => m.name) ?? [],
                          ),
                          params: [],
                          result: {
                            name: "result",
                            schema: { type: "string" },
                          },
                        }),
                      );
                      setDraft((d) => ({ ...d, contract: source }));
                    })
                  }
                >
                  {t("rpc.addMethod")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!!busy}
                  onClick={() =>
                    perform(() => {
                      const parsed = readRpcContract(draft.contract);
                      let url = "";
                      if (Array.isArray(parsed.root.servers))
                        for (const server of parsed.root.servers) {
                          try {
                            if (rpcObject(server)) {
                              url = rpcUrl(server.url);
                              break;
                            }
                          } catch {}
                        }
                      if (!url) {
                        notify("rpc.noServer");
                        return;
                      }
                      setDraft((d) => ({ ...d, endpoint: url }));
                    })
                  }
                >
                  {t("rpc.useServer")}
                </button>
              </div>
              {contract?.issues.map((issue, n) => (
                <p key={n} className="text-xs text-amber-800">
                  {t(`rpc.contractIssue.${issue.code}`, {
                    index: String(issue.index),
                  })}
                </p>
              ))}
              {method && contract ? (
                <>
                  <Select
                    label={t("rpc.method")}
                    value={method.name}
                    disabled={!!busy || contractDirty}
                    onChange={(name) => {
                      const selected = contract.methods.find(
                        (m) => m.name === name,
                      );
                      if (selected) chooseMethod(contract, selected);
                    }}
                  >
                    {contract.methods.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                        {m.deprecated ? " †" : ""}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs">
                    {method.summary}{" "}
                    {t("rpc.methodInfo", {
                      count: String(method.params.length),
                      structure: method.structure,
                      result: t(
                        method.result
                          ? "rpc.hasResult"
                          : "rpc.notificationOnly",
                      ),
                    })}
                  </p>
                  <Field
                    label={t("rpc.methodSource")}
                    value={json(method.source)}
                    multiline
                    readOnly
                  />
                </>
              ) : (
                <p className="text-xs">{t("rpc.noMethods")}</p>
              )}
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("rpc.builder")}</h4>
              <p className="text-xs text-slate-600">{t("rpc.builderHelp")}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label={t("rpc.style")}
                  value={style}
                  onChange={(v) => setStyle(v as typeof style)}
                >
                  <option value="named">{t("rpc.named")}</option>
                  <option value="positional">{t("rpc.positional")}</option>
                </Select>
                <Field
                  label={t("rpc.id")}
                  value={idSource}
                  onChange={setIdSource}
                />
              </div>
              <Check
                label={t("rpc.notification")}
                checked={notification}
                onChange={setNotification}
              />
              <Field
                label={t("rpc.params")}
                value={params}
                onChange={setParams}
                multiline
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!method || contractDirty}
                  onClick={() =>
                    method &&
                    contract &&
                    setParams(sampleParams(contract, method, style))
                  }
                >
                  {t("rpc.generateParams")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!method || contractDirty}
                  onClick={() => build(false)}
                >
                  {t("rpc.build")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!method || contractDirty}
                  onClick={() => build(true)}
                >
                  {t("rpc.append")}
                </button>
              </div>
              <Field
                label={t("rpc.request")}
                value={draft.request}
                onChange={(request) => setDraft((d) => ({ ...d, request }))}
                multiline
              />
              <Field
                label={t("rpc.response")}
                value={draft.response}
                onChange={(response) => setDraft((d) => ({ ...d, response }))}
                multiline
              />
              <Field
                label={t("rpc.status")}
                value={draft.responseStatus}
                onChange={(responseStatus) =>
                  setDraft((d) => ({ ...d, responseStatus }))
                }
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} onClick={inspect}>
                  {t("rpc.inspect")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={rehearse}
                >
                  {t("rpc.mock")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() => void live()}
                >
                  {t("rpc.live")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() => download(project.request, "rpc-request.json")}
                >
                  {t("rpc.downloadRequest")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() =>
                    download(project.response, "rpc-response.json")
                  }
                >
                  {t("rpc.downloadResponse")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() =>
                    perform(() =>
                      download(
                        rpcCurl(project.endpoint, project.request),
                        "rpc-request.sh",
                        "text/plain",
                      ),
                    )
                  }
                >
                  {t("rpc.downloadCurl")}
                </button>
              </div>
              <Field
                label={t("rpc.headers")}
                value={headers}
                onChange={setHeaders}
                multiline
              />
              <p className="text-xs text-slate-600">{t("rpc.liveHelp")}</p>
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("rpc.mockSection")}</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || project.mocks.length >= MAX_RPC_MOCKS}
                  onClick={addMock}
                >
                  {t("rpc.addMock")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || !draft.fixture}
                  onClick={() =>
                    perform(() => {
                      const next = {
                        ...project,
                        mocks: project.mocks.filter(
                          (m) => m.method !== mockKey,
                        ),
                      };
                      install(next, next.mocks[0]?.method ?? "", caseId);
                      setFeedback(null);
                    })
                  }
                >
                  {t("rpc.deleteMock")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked}
                  onClick={() =>
                    perform(() =>
                      download(
                        generateRpcMockHandler(project.mocks),
                        "json-rpc-mock.mjs",
                        "text/javascript",
                      ),
                    )
                  }
                >
                  {t("rpc.mockExport")}
                </button>
              </div>
              {draft.fixture ? (
                <>
                  <Select
                    label={t("rpc.mockSelect")}
                    value={mockKey}
                    disabled={locked}
                    onChange={(key) => {
                      setMockKey(key);
                      setDraft(drafts(project, key, caseId));
                    }}
                  >
                    {project.mocks.map((m) => (
                      <option key={m.method} value={m.method}>
                        {m.method}
                      </option>
                    ))}
                  </Select>
                  <Field
                    label={t("rpc.mockMethod")}
                    value={draft.fixture.method}
                    onChange={(method) =>
                      setDraft((d) => ({
                        ...d,
                        fixture: d.fixture ? { ...d.fixture, method } : null,
                      }))
                    }
                  />
                  <Select
                    label={t("rpc.mockKind")}
                    value={draft.fixture.kind}
                    onChange={(kind) =>
                      setDraft((d) => ({
                        ...d,
                        fixture: d.fixture
                          ? { ...d.fixture, kind: kind as RpcMock["kind"] }
                          : null,
                      }))
                    }
                  >
                    <option value="result">{t("rpc.outcome.result")}</option>
                    <option value="error">{t("rpc.outcome.error")}</option>
                  </Select>
                  <Field
                    label={t("rpc.mockValue")}
                    value={draft.fixture.value}
                    multiline
                    onChange={(value) =>
                      setDraft((d) => ({
                        ...d,
                        fixture: d.fixture ? { ...d.fixture, value } : null,
                      }))
                    }
                  />
                </>
              ) : (
                <p className="text-xs">{t("rpc.noMocks")}</p>
              )}
            </section>
            <section className="space-y-3 rounded-xl border p-3">
              <h4 className="font-bold">{t("rpc.caseSection")}</h4>
              <Check
                label={t("rpc.recordResults")}
                checked={recordResults}
                onChange={setRecordResults}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || project.cases.length >= MAX_RPC_CASES}
                  onClick={() => addCase(false)}
                >
                  {t("rpc.addCase")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    locked ||
                    !snapshot ||
                    stale ||
                    project.cases.length >= MAX_RPC_CASES
                  }
                  onClick={() => addCase(true)}
                >
                  {t("rpc.capture")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={locked || !draft.test}
                  onClick={() =>
                    perform(() => {
                      const next = {
                        ...project,
                        cases: project.cases.filter((c) => c.id !== caseId),
                      };
                      install(next, mockKey, next.cases[0]?.id ?? "");
                      setFeedback(null);
                    })
                  }
                >
                  {t("rpc.deleteCase")}
                </button>
              </div>
              {draft.test ? (
                <>
                  <Select
                    label={t("rpc.caseSelect")}
                    value={caseId}
                    disabled={locked}
                    onChange={(id) => {
                      setCaseId(id);
                      setDraft(drafts(project, mockKey, id));
                    }}
                  >
                    {project.cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  {(
                    [
                      "name",
                      "request",
                      "response",
                      "httpStatus",
                      "errorCode",
                      "expectedResults",
                    ] as const
                  ).map((k) => (
                    <Field
                      key={k}
                      label={t(
                        (
                          {
                            name: "rpc.caseName",
                            request: "rpc.caseRequest",
                            response: "rpc.caseResponse",
                            httpStatus: "rpc.caseStatus",
                            errorCode: "rpc.caseErrorCode",
                            expectedResults: "rpc.caseResults",
                          } as const
                        )[k],
                      )}
                      value={draft.test![k]}
                      multiline={[
                        "request",
                        "response",
                        "expectedResults",
                      ].includes(k)}
                      onChange={(value) =>
                        setDraft((d) => ({
                          ...d,
                          test: d.test ? { ...d.test, [k]: value } : null,
                        }))
                      }
                    />
                  ))}
                  <Select
                    label={t("rpc.caseMode")}
                    value={draft.test.mode}
                    onChange={(mode) =>
                      setDraft((d) => ({
                        ...d,
                        test: d.test
                          ? { ...d.test, mode: mode as RpcCase["mode"] }
                          : null,
                      }))
                    }
                  >
                    <option value="mock">{t("rpc.caseMode.mock")}</option>
                    <option value="fixture">{t("rpc.caseMode.fixture")}</option>
                  </Select>
                  <Select
                    label={t("rpc.caseExpect")}
                    value={draft.test.expect}
                    onChange={(expect) =>
                      setDraft((d) => ({
                        ...d,
                        test: d.test
                          ? { ...d.test, expect: expect as RpcCase["expect"] }
                          : null,
                      }))
                    }
                  >
                    {(
                      ["valid", "invalid", "error", "notification"] as const
                    ).map((v) => (
                      <option key={v} value={v}>
                        {t(`rpc.expect.${v}`)}
                      </option>
                    ))}
                  </Select>
                  <Check
                    label={t("rpc.caseContract")}
                    checked={draft.test.requireContract}
                    onChange={(requireContract) =>
                      setDraft((d) => ({
                        ...d,
                        test: d.test ? { ...d.test, requireContract } : null,
                      }))
                    }
                  />
                  <p className="text-xs text-slate-600">
                    {t("rpc.caseResultsHelp")}
                  </p>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={locked}
                    onClick={() => {
                      const c = project.cases.find((c) => c.id === caseId)!;
                      setDraft((d) => ({
                        ...d,
                        request: c.request,
                        response: c.response,
                        responseStatus: String(c.httpStatus),
                      }));
                      setFeedback(null);
                    }}
                  >
                    {t("rpc.loadCase")}
                  </button>
                </>
              ) : (
                <p className="text-xs">{t("rpc.noCases")}</p>
              )}
            </section>
          </fieldset>
          {busy === "live" && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => abort.current?.abort()}
            >
              {t("rpc.cancel")}
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!pending || !!busy}
              onClick={save}
            >
              {t("rpc.save")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!pending || !!busy}
              onClick={() => {
                setDraft(drafts(project, mockKey, caseId));
                setFeedback(null);
              }}
            >
              {t("rpc.discard")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked || !caseId}
              onClick={() => run(true)}
            >
              {t("rpc.runCase")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked || !project.cases.length}
              onClick={() => run(false)}
            >
              {t("rpc.runAll")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked || !results}
              onClick={() =>
                results &&
                download(rpcCasesReport(results), "rpc-regression-report.json")
              }
            >
              {t("rpc.report")}
            </button>
          </div>
          {snapshot && (
            <>
              {stale && (
                <p className="text-xs text-amber-800">
                  {t("rpc.inspectionStale")}
                </p>
              )}
              <Inspection snapshot={snapshot} onReport={inspectionReport} />
            </>
          )}
          {results && (
            <section
              aria-label={t("rpc.caseResultsTitle")}
              className="space-y-2 rounded-xl border p-3"
            >
              <h4 className="font-bold">{t("rpc.caseResultsTitle")}</h4>
              <ul className="space-y-1 text-xs">
                {results.map((r) => (
                  <li key={r.id}>
                    {r.name}:{" "}
                    <strong>{t(r.passed ? "rpc.passed" : "rpc.failed")}</strong>{" "}
                    ·{" "}
                    {r.inspection
                      ? `${r.inspection.requests} / ${r.inspection.responses}`
                      : r.issue}
                    <p className="text-slate-600">
                      {t("rpc.caseVerdict", {
                        protocol: t(
                          r.protocolMatched ? "rpc.passed" : "rpc.failed",
                        ),
                        contract: t(
                          r.contractMatched ? "rpc.passed" : "rpc.failed",
                        ),
                        values: t(
                          r.expectedMatched &&
                            r.assertions.every((a) => a.passed)
                            ? "rpc.passed"
                            : "rpc.failed",
                        ),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </details>
  );
});
