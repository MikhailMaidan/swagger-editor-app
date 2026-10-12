"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  checkProtoPayload,
  compareProtoContracts,
  decodeProtoFrames,
  decodeProtoPayload,
  DEMO_PROTO_FILES,
  emptyProtoProject,
  encodeProtoPayload,
  generateProtoDraft,
  generateProtoSample,
  MAX_PROTO_CASES,
  MAX_PROTO_FILES,
  MAX_PROTO_PROJECT_BYTES,
  MAX_PROTO_SOURCE_BYTES,
  normalizeProtoPath,
  parseProtoProject,
  protoRehearsalReport,
  ProtoStudioError,
  readProtoContract,
  rehearseProtoExchange,
  saveProtoCase,
  serializeProtoProject,
  type ProtoCheck,
  type ProtoComparison,
  type ProtoContract,
  type ProtoDraft,
  type ProtoEncoded,
  type ProtoProject,
  type ProtoRehearsal,
} from "@/lib/protobuf-studio";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";

export const ProtobufStudioPanel = memo(function ProtobufStudioPanel({
  getSchemaText,
}: {
  getSchemaText: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState(emptyProtoProject);
  const [contract, setContract] = useState<ProtoContract | null>(null);
  const [filePath, setFilePath] = useState("service.proto");
  const [newPath, setNewPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
    details?: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "message" | "enum">("all");
  const [typeName, setTypeName] = useState("");
  const [page, setPage] = useState(0);
  const [fieldPage, setFieldPage] = useState(0);
  const [methodKey, setMethodKey] = useState("");
  const [methodSearch, setMethodSearch] = useState("");
  const [codecType, setCodecType] = useState("");
  const [payload, setPayload] = useState("{}");
  const [binary, setBinary] = useState("");
  const [format, setFormat] = useState<"base64" | "hex">("base64");
  const [depth, setDepth] = useState(3);
  const [check, setCheck] = useState<ProtoCheck | null>(null);
  const [encoded, setEncoded] = useState<ProtoEncoded[]>([]);
  const [rehearsal, setRehearsal] = useState<ProtoRehearsal | null>(null);
  const [caseId, setCaseId] = useState("");
  const [baseline, setBaseline] = useState<ProtoContract | null>(null);
  const [comparison, setComparison] = useState<ProtoComparison | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const file =
    project.files.find((f) => f.path === filePath) ?? project.files[0];
  const dirty = Boolean(
    contract &&
    (contract.entry !== project.entry ||
      JSON.stringify(contract.files) !== JSON.stringify(project.files)),
  );
  const active = Boolean(contract && !dirty);
  const types = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (contract?.types ?? []).filter(
      (type) =>
        (kind === "all" || type.kind === kind) &&
        terms.every((term) =>
          `${type.name} ${type.description} ${type.fields.map((f) => `${f.name} ${f.type}`).join(" ")} ${type.values.map((v) => v.name).join(" ")}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [contract, search, kind]);
  const type = types.find((t) => t.name === typeName) ?? types[0];
  const messages = contract?.types.filter((t) => t.kind === "message") ?? [];
  const selectedCodec =
    messages.find((t) => t.name === codecType)?.name ?? messages[0]?.name ?? "";
  const methods = (contract?.methods ?? []).filter((m) =>
    `${m.key} ${m.requestType} ${m.responseType}`
      .toLowerCase()
      .includes(methodSearch.toLowerCase().trim()),
  );
  const method = methods.find((m) => m.key === methodKey) ?? methods[0];
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(types.length / 20) - 1),
  );
  const currentFieldPage = Math.min(
    fieldPage,
    Math.max(0, Math.ceil((type?.fields.length ?? 0) / 30) - 1),
  );
  const draft = project.draft;
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof ProtoStudioError
          ? `protoStudio.error.${error.code}`
          : "protoStudio.error.file",
      error: true,
      details: error instanceof ProtoStudioError ? error.details : undefined,
    });
  }
  function invalidate() {
    setFeedback(null);
    setCheck(null);
    setEncoded([]);
    setRehearsal(null);
    setComparison(null);
  }
  function editProject(patch: Partial<ProtoProject>) {
    setProject((previous) => ({ ...previous, ...patch }));
    invalidate();
  }
  function editDraft(patch: Partial<ProtoDraft>) {
    editProject({ draft: { ...draft, ...patch } });
  }
  function accept(parsed: ProtoContract) {
    setContract(parsed);
    setProject((previous) => ({
      ...previous,
      files: parsed.files,
      entry: parsed.entry,
    }));
    setFilePath(parsed.entry);
    setSearch("");
    setKind("all");
    setPage(0);
    setFieldPage(0);
    setTypeName(parsed.types[0]?.name ?? "");
    setCodecType(
      parsed.methods[0]?.requestType ??
        parsed.types.find((t) => t.kind === "message")?.name ??
        "",
    );
    setMethodKey(parsed.methods[0]?.key ?? "");
    setMethodSearch("");
    invalidate();
  }
  function load() {
    try {
      accept(readProtoContract(project.files, project.entry));
      setFeedback({ key: "protoStudio.loaded", error: false });
    } catch (e) {
      fail(e);
    }
  }
  function demo() {
    try {
      const parsed = readProtoContract(DEMO_PROTO_FILES, "shop/service.proto");
      accept(parsed);
      setProject((previous) => ({
        ...previous,
        draft: generateProtoDraft(parsed, parsed.methods[0].key),
      }));
      setCaseId("");
      setFeedback({ key: "protoStudio.demoLoaded", error: false });
    } catch (e) {
      fail(e);
    }
  }
  function addFile() {
    try {
      const path = normalizeProtoPath(newPath);
      if (project.files.length >= MAX_PROTO_FILES)
        throw new ProtoStudioError("limit");
      if (project.files.some((f) => f.path === path))
        throw new ProtoStudioError("path", path);
      editProject({
        files: [...project.files, { path, source: 'syntax = "proto3";\n' }],
      });
      setFilePath(path);
      setNewPath("");
    } catch (e) {
      fail(e);
    }
  }
  async function read(files: File[], restore = false, folder = false) {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (
        !files.length ||
        files.length > MAX_PROTO_FILES ||
        (restore && files.length !== 1) ||
        files.some(
          (f) =>
            f.size >
            (restore ? MAX_PROTO_PROJECT_BYTES : MAX_PROTO_SOURCE_BYTES),
        ) ||
        files.reduce((n, f) => n + f.size, 0) > MAX_PROTO_PROJECT_BYTES
      )
        throw new ProtoStudioError("limit");
      const loaded = await Promise.all(
        files.map(async (f) => ({
          path:
            folder && f.webkitRelativePath
              ? f.webkitRelativePath.split("/").slice(1).join("/")
              : f.webkitRelativePath || f.name,
          source: await f.text(),
        })),
      );
      if (token !== generation.current) return;
      if (restore) {
        const restored = parseProtoProject(loaded[0].source);
        accept(restored.contract);
        setProject(restored.project);
        setBaseline(null);
        setCaseId("");
        setFeedback({ key: "protoStudio.restored", error: false });
      } else {
        const normalized = loaded.map((f) => ({
          ...f,
          path: normalizeProtoPath(f.path),
        }));
        if (
          new Set(normalized.map((f) => f.path)).size !== normalized.length ||
          normalized.some((f) => getByteSize(f.source) > MAX_PROTO_SOURCE_BYTES)
        )
          throw new ProtoStudioError("limit");
        const previous =
          project.files.length === 1 && !project.files[0].source.trim()
            ? []
            : project.files;
        const merged = [
          ...previous.filter((f) => !normalized.some((n) => n.path === f.path)),
          ...normalized,
        ];
        if (
          merged.length > MAX_PROTO_FILES ||
          merged.reduce((n, f) => n + getByteSize(f.source), 0) > 1024 * 1024
        )
          throw new ProtoStudioError("limit");
        editProject({
          files: merged,
          entry: merged.some((f) => f.path === project.entry)
            ? project.entry
            : normalized[0].path,
        });
        setFilePath(normalized[0].path);
        setFeedback({ key: "protoStudio.imported", error: false });
      }
    } catch (e) {
      if (token === generation.current) fail(e);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function codec(action: "sample" | "check" | "encode" | "decode" | "frames") {
    if (!contract || !active || !selectedCodec) return;
    setCheck(null);
    setEncoded([]);
    setFeedback(null);
    try {
      if (action === "sample") {
        setPayload(generateProtoSample(contract, selectedCodec, depth));
        setFeedback({ key: "protoStudio.generated", error: false });
      } else if (action === "check") {
        const result = checkProtoPayload(contract, selectedCodec, payload);
        setCheck(result);
        setFeedback({
          key: result.valid ? "protoStudio.valid" : "protoStudio.invalid",
          error: !result.valid,
        });
      } else if (action === "encode") {
        const result = encodeProtoPayload(contract, selectedCodec, payload);
        setEncoded([result]);
        setBinary(result[format]);
        setFeedback({ key: "protoStudio.encoded", error: false });
      } else {
        setEncoded(
          action === "frames"
            ? decodeProtoFrames(contract, selectedCodec, binary, format)
            : [decodeProtoPayload(contract, selectedCodec, binary, format)],
        );
        setFeedback({ key: "protoStudio.decoded", error: false });
      }
    } catch (e) {
      fail(e);
    }
  }
  function generateExchange() {
    if (!contract || !method || !active) return;
    try {
      editDraft(generateProtoDraft(contract, method.key));
      setCaseId("");
      setFeedback({ key: "protoStudio.exchangeGenerated", error: false });
    } catch (e) {
      fail(e);
    }
  }
  function run() {
    if (!contract || !active) return;
    setRehearsal(null);
    setFeedback(null);
    try {
      setRehearsal(rehearseProtoExchange(contract, draft));
      setFeedback({ key: "protoStudio.rehearsed", error: false });
    } catch (e) {
      fail(e);
    }
  }
  function save(update = false) {
    if (!contract || !active) return;
    try {
      setProject(saveProtoCase(project, contract, update ? caseId : ""));
      if (!update) setCaseId("");
      setFeedback({ key: "protoStudio.saved", error: false });
    } catch (e) {
      fail(e);
    }
  }
  function download(
    text: string,
    suffix: string,
    mime = "application/json",
    max = MAX_PROTO_PROJECT_BYTES,
  ) {
    if (getByteSize(text) > max) throw new ProtoStudioError("limit");
    const name =
      project.name
        .trim()
        .replace(/[^\p{L}\p{N}_-]+/gu, "-")
        .slice(0, 80) || "protobuf";
    const started = downloadTextFile(text, `${name}-${suffix}`, mime);
    setFeedback({
      key: started ? "protoStudio.downloaded" : "protoStudio.downloadFailed",
      error: !started,
    });
  }
  function exportItem(
    kind:
      | "file"
      | "inventory"
      | "descriptor"
      | "project"
      | "codec"
      | "exchange"
      | "report"
      | "comparison",
  ) {
    if (!contract || !active) return;
    try {
      if (kind === "file")
        download(
          file.source,
          file.path.split("/").pop()!,
          "text/plain;charset=utf-8",
        );
      if (kind === "inventory")
        download(
          JSON.stringify(
            {
              entry: contract.entry,
              imports: contract.imports,
              types: contract.types,
              methods: contract.methods,
            },
            null,
            2,
          ),
          "inventory.json",
        );
      if (kind === "descriptor")
        download(
          JSON.stringify(contract.root.toJSON({ keepComments: true }), null, 2),
          "reflection.json",
        );
      if (kind === "project")
        download(serializeProtoProject(project), "project.json");
      if (kind === "codec")
        download(JSON.stringify(encoded, null, 2), "codec.json");
      if (kind === "exchange" && rehearsal)
        download(JSON.stringify(rehearsal, null, 2), "exchange.json");
      if (kind === "report" && rehearsal)
        download(
          JSON.stringify(protoRehearsalReport(rehearsal), null, 2),
          "rehearsal-report.json",
        );
      if (kind === "comparison" && comparison)
        download(JSON.stringify(comparison, null, 2), "compatibility.json");
    } catch (e) {
      fail(e);
    }
  }
  const streamLabel = (request: boolean, response: boolean) =>
    t(
      request
        ? response
          ? "protoStudio.stream.bidi"
          : "protoStudio.stream.client"
        : response
          ? "protoStudio.stream.server"
          : "protoStudio.stream.unary",
    );
  const pager = (
    current: number,
    total: number,
    update: (page: number) => void,
    label: string,
  ) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={buttonClass}
        aria-label={`${t("protoStudio.previous")} ${label}`}
        disabled={loading || current === 0}
        onClick={() => update(current - 1)}
      >
        {t("protoStudio.previous")}
      </button>
      <span className="text-xs">
        {t("protoStudio.page", {
          page: String(current + 1),
          total: String(Math.max(1, Math.ceil(total))),
        })}
      </span>
      <button
        type="button"
        className={buttonClass}
        aria-label={`${t("protoStudio.next")} ${label}`}
        disabled={loading || current + 1 >= total}
        onClick={() => update(current + 1)}
      >
        {t("protoStudio.next")}
      </button>
    </div>
  );
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("protoStudio.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-[color:var(--color-brand-navy)]">
          <p className="text-sm">{t("protoStudio.description")}</p>
          <p className="text-xs text-slate-600">{t("protoStudio.help")}</p>
          {loading && <p role="status">{t("protoStudio.loading")}</p>}
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className="break-words text-xs"
            >
              {t(feedback.key)}
              {feedback.details && (
                <span className="ml-2">{feedback.details}</span>
              )}
            </p>
          )}
          <fieldset
            disabled={loading}
            className="space-y-3 disabled:opacity-60"
          >
            <legend className="sr-only">{t("protoStudio.title")}</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold">
                {t("protoStudio.import.files")}
                <input
                  type="file"
                  multiple
                  accept=".proto"
                  className={inputClass}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    void read(files);
                  }}
                />
              </label>
              <label className="text-xs font-semibold">
                {t("protoStudio.import.project")}
                <input
                  type="file"
                  accept=".json"
                  className={inputClass}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    void read(files, true);
                  }}
                />
              </label>
            </div>
            <label className="block text-xs font-semibold">
              {t("protoStudio.import.folder")}
              <input
                type="file"
                multiple
                {...{ webkitdirectory: "", directory: "" }}
                className={inputClass}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).filter((f) =>
                    (f.webkitRelativePath || f.name).endsWith(".proto"),
                  );
                  e.target.value = "";
                  void read(files, false, true);
                }}
              />
            </label>
            <p className="text-xs text-slate-600">
              {t("protoStudio.importHelp")}
            </p>
            <label className="block text-xs font-semibold">
              {t("protoStudio.projectName")}
              <input
                className={inputClass}
                maxLength={200}
                value={project.name}
                onChange={(e) =>
                  setProject({ ...project, name: e.target.value })
                }
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={demo}>
                {t("protoStudio.demo")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  editProject({
                    files: project.files.map((f) =>
                      f.path === file.path
                        ? { ...f, source: getSchemaText() }
                        : f,
                    ),
                  });
                }}
              >
                {t("protoStudio.capture")}
              </button>
              <button type="button" className={buttonClass} onClick={load}>
                {t("protoStudio.load")}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold">
                {t("protoStudio.file")}
                <select
                  className={inputClass}
                  value={file.path}
                  onChange={(e) => setFilePath(e.target.value)}
                >
                  {project.files.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                {t("protoStudio.entry")}
                <select
                  className={inputClass}
                  value={project.entry}
                  onChange={(e) => editProject({ entry: e.target.value })}
                >
                  {project.files.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold">
              {t("protoStudio.source")}
              <textarea
                spellCheck={false}
                rows={10}
                className={`${inputClass} font-mono`}
                value={file.source}
                onChange={(e) =>
                  editProject({
                    files: project.files.map((f) =>
                      f.path === file.path
                        ? { ...f, source: e.target.value }
                        : f,
                    ),
                  })
                }
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1 text-xs font-semibold">
                {t("protoStudio.newPath")}
                <input
                  className={inputClass}
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                />
              </label>
              <button type="button" className={buttonClass} onClick={addFile}>
                {t("protoStudio.addFile")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={project.files.length <= 1}
                onClick={() => {
                  const files = project.files.filter(
                    (f) => f.path !== file.path,
                  );
                  editProject({
                    files,
                    entry:
                      project.entry === file.path
                        ? files[0].path
                        : project.entry,
                  });
                  setFilePath(files[0].path);
                }}
              >
                {t("protoStudio.removeFile")}
              </button>
            </div>
            {dirty && (
              <p role="status" className="text-xs">
                {t("protoStudio.dirty")}
              </p>
            )}
            {contract && (
              <>
                <p className="text-xs font-semibold">
                  {t("protoStudio.summary", {
                    types: String(contract.types.length),
                    fields: String(contract.fieldCount),
                    methods: String(contract.methods.length),
                    files: String(project.files.length),
                  })}
                </p>
                <fieldset
                  disabled={!active}
                  className="space-y-4 disabled:opacity-60"
                >
                  <legend className="sr-only">{t("protoStudio.tools")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {(
                      ["file", "inventory", "descriptor", "project"] as const
                    ).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={buttonClass}
                        onClick={() => exportItem(k)}
                      >
                        {t(`protoStudio.export.${k}`)}
                      </button>
                    ))}
                  </div>
                  <details className="rounded-xl border p-3">
                    <summary className="cursor-pointer text-sm font-bold">
                      {t("protoStudio.imports")}
                    </summary>
                    <ul className="mt-2 space-y-1 break-words text-xs">
                      {contract.imports.slice(0, 100).map((i, n) => (
                        <li key={n}>
                          {i.from} → {i.path}{" "}
                          {i.builtin
                            ? t("protoStudio.builtin")
                            : i.missing
                              ? t("protoStudio.weakMissing")
                              : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <section
                    className="space-y-3 rounded-xl border p-3"
                    aria-label={t("protoStudio.explorer")}
                  >
                    <h3 className="text-sm font-bold">
                      {t("protoStudio.explorer")}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-xs font-semibold">
                        {t("protoStudio.search")}
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
                      <label className="text-xs font-semibold">
                        {t("protoStudio.kind")}
                        <select
                          className={inputClass}
                          value={kind}
                          onChange={(e) => {
                            setKind(e.target.value as typeof kind);
                            setPage(0);
                          }}
                        >
                          {(["all", "message", "enum"] as const).map((k) => (
                            <option key={k} value={k}>
                              {t(`protoStudio.kind.${k}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {types
                        .slice(currentPage * 20, currentPage * 20 + 20)
                        .map((item) => (
                          <button
                            type="button"
                            className={buttonClass}
                            aria-pressed={item.name === type?.name}
                            key={item.name}
                            onClick={() => {
                              setTypeName(item.name);
                              setFieldPage(0);
                            }}
                          >
                            {item.name}
                          </button>
                        ))}
                    </div>
                    {!types.length && (
                      <p className="text-xs">{t("protoStudio.noTypes")}</p>
                    )}
                    {pager(
                      currentPage,
                      Math.ceil(types.length / 20),
                      setPage,
                      t("protoStudio.types"),
                    )}
                    {type && (
                      <div className="space-y-2 break-words">
                        <h4 className="text-sm font-bold">
                          {type.name} ({t(`protoStudio.kind.${type.kind}`)})
                        </h4>
                        <p className="text-xs">{type.description}</p>
                        {type.dependencies.length > 0 && (
                          <div
                            className="flex flex-wrap gap-2"
                            aria-label={t("protoStudio.dependencies")}
                          >
                            {type.dependencies.slice(0, 100).map((name) => (
                              <button
                                type="button"
                                key={name}
                                className={buttonClass}
                                onClick={() => {
                                  setSearch("");
                                  setKind("all");
                                  setTypeName(name);
                                  setFieldPage(0);
                                }}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        )}
                        {type.kind === "message" ? (
                          <>
                            <div className="overflow-auto">
                              <table className="w-full text-left text-xs">
                                <caption className="sr-only">
                                  {t("protoStudio.fields")}
                                </caption>
                                <thead>
                                  <tr>
                                    <th className="p-2">
                                      {t("protoStudio.number")}
                                    </th>
                                    <th className="p-2">
                                      {t("protoStudio.fieldName")}
                                    </th>
                                    <th className="p-2">
                                      {t("protoStudio.fieldType")}
                                    </th>
                                    <th className="p-2">
                                      {t("protoStudio.rules")}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {type.fields
                                    .slice(
                                      currentFieldPage * 30,
                                      currentFieldPage * 30 + 30,
                                    )
                                    .map((f) => (
                                      <tr key={f.number} className="border-t">
                                        <td className="p-2">{f.number}</td>
                                        <td className="p-2">
                                          {f.name}
                                          <span className="block text-slate-500">
                                            {f.description}
                                          </span>
                                        </td>
                                        <td className="p-2">
                                          {f.mapKey
                                            ? `map<${f.mapKey}, ${f.type}>`
                                            : f.type}
                                        </td>
                                        <td className="p-2">
                                          {f.required
                                            ? t("protoStudio.required")
                                            : f.repeated
                                              ? t("protoStudio.repeated")
                                              : f.hasPresence
                                                ? t("protoStudio.explicit")
                                                : t("protoStudio.implicit")}
                                          {f.oneof && ` oneof: ${f.oneof}`}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                            {pager(
                              currentFieldPage,
                              Math.ceil(type.fields.length / 30),
                              setFieldPage,
                              t("protoStudio.fields"),
                            )}
                          </>
                        ) : (
                          <ul className="text-xs">
                            {type.values.slice(0, 100).map((v) => (
                              <li key={v.name}>
                                {v.name} = {v.number}
                              </li>
                            ))}
                          </ul>
                        )}
                        {type.reserved.length > 0 && (
                          <p className="text-xs">
                            {t("protoStudio.reserved")}:{" "}
                            {JSON.stringify(type.reserved).slice(0, 4000)}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                  <section
                    className="space-y-3 rounded-xl border p-3"
                    aria-label={t("protoStudio.codec")}
                  >
                    <h3 className="text-sm font-bold">
                      {t("protoStudio.codec")}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {t("protoStudio.codecHelp")}
                    </p>
                    <p className="text-xs text-slate-600">
                      {t("protoStudio.codecNote")}
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-xs font-semibold">
                        {t("protoStudio.codecType")}
                        <select
                          className={inputClass}
                          value={selectedCodec}
                          onChange={(e) => {
                            setCodecType(e.target.value);
                            setCheck(null);
                            setEncoded([]);
                            setFeedback(null);
                          }}
                        >
                          {messages.map((m) => (
                            <option key={m.name} value={m.name}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-semibold">
                        {t("protoStudio.depth")}
                        <select
                          className={inputClass}
                          value={depth}
                          onChange={(e) => setDepth(Number(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block text-xs font-semibold">
                      {t("protoStudio.payload")}
                      <textarea
                        spellCheck={false}
                        rows={8}
                        className={`${inputClass} font-mono`}
                        value={payload}
                        onChange={(e) => {
                          setPayload(e.target.value);
                          setCheck(null);
                          setEncoded([]);
                          setFeedback(null);
                        }}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(["sample", "check", "encode"] as const).map(
                        (action) => (
                          <button
                            type="button"
                            key={action}
                            className={buttonClass}
                            disabled={!selectedCodec}
                            onClick={() => codec(action)}
                          >
                            {t(`protoStudio.action.${action}`)}
                          </button>
                        ),
                      )}
                    </div>
                    {check && !check.valid && (
                      <ul
                        className="space-y-1 text-xs"
                        aria-label={t("protoStudio.issues")}
                      >
                        {check.issues.map((i, n) => (
                          <li key={n}>
                            {i.path || "/"}: {t(`protoStudio.issue.${i.code}`)}
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="block text-xs font-semibold">
                      {t("protoStudio.format")}
                      <select
                        className={inputClass}
                        value={format}
                        onChange={(e) => {
                          setFormat(e.target.value as typeof format);
                          setEncoded([]);
                          setFeedback(null);
                        }}
                      >
                        <option value="base64">Base64</option>
                        <option value="hex">Hex</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold">
                      {t("protoStudio.binary")}
                      <textarea
                        spellCheck={false}
                        rows={4}
                        className={`${inputClass} font-mono`}
                        value={binary}
                        onChange={(e) => {
                          setBinary(e.target.value);
                          setEncoded([]);
                          setFeedback(null);
                        }}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(["decode", "frames"] as const).map((action) => (
                        <button
                          type="button"
                          key={action}
                          className={buttonClass}
                          disabled={!selectedCodec}
                          onClick={() => codec(action)}
                        >
                          {t(`protoStudio.action.${action}`)}
                        </button>
                      ))}
                    </div>
                    {encoded.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs">
                          {t("protoStudio.codecSummary", {
                            messages: String(encoded.length),
                            bytes: String(
                              encoded.reduce((n, m) => n + m.byteLength, 0),
                            ),
                          })}
                        </p>
                        <label className="block text-xs font-semibold">
                          {t("protoStudio.codecOutput")}
                          <textarea
                            readOnly
                            rows={8}
                            className={`${inputClass} font-mono`}
                            value={JSON.stringify(encoded, null, 2).slice(
                              0,
                              16000,
                            )}
                          />
                        </label>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => exportItem("codec")}
                        >
                          {t("protoStudio.export.codec")}
                        </button>
                      </div>
                    )}
                  </section>
                  <section
                    className="space-y-3 rounded-xl border p-3"
                    aria-label={t("protoStudio.rpc")}
                  >
                    <h3 className="text-sm font-bold">
                      {t("protoStudio.rpc")}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {t("protoStudio.rpcHelp")}
                    </p>
                    <label className="block text-xs font-semibold">
                      {t("protoStudio.methodSearch")}
                      <input
                        className={inputClass}
                        value={methodSearch}
                        onChange={(e) => setMethodSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setMethodSearch("");
                        }}
                      />
                    </label>
                    <label className="block text-xs font-semibold">
                      {t("protoStudio.method")}
                      <select
                        className={inputClass}
                        value={method?.key ?? ""}
                        onChange={(e) => setMethodKey(e.target.value)}
                      >
                        {!methods.length && (
                          <option value="">{t("protoStudio.noMethods")}</option>
                        )}
                        {methods.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.key} —{" "}
                            {streamLabel(m.requestStream, m.responseStream)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {method && (
                      <p className="break-words text-xs">
                        {method.requestType} → {method.responseType} ·{" "}
                        {streamLabel(
                          method.requestStream,
                          method.responseStream,
                        )}
                        <span className="block">{method.description}</span>
                      </p>
                    )}
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!method}
                      onClick={generateExchange}
                    >
                      {t("protoStudio.generateExchange")}
                    </button>
                    <label className="block text-xs font-semibold">
                      {t("protoStudio.caseName")}
                      <input
                        className={inputClass}
                        value={draft.name}
                        maxLength={200}
                        onChange={(e) => editDraft({ name: e.target.value })}
                      />
                    </label>
                    <p className="break-words text-xs">
                      {t("protoStudio.draftMethod")}: {draft.method || "—"}
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-xs font-semibold">
                        {t("protoStudio.requests")}
                        <textarea
                          spellCheck={false}
                          rows={9}
                          className={`${inputClass} font-mono`}
                          value={draft.requests}
                          onChange={(e) =>
                            editDraft({ requests: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        {t("protoStudio.responses")}
                        <textarea
                          spellCheck={false}
                          rows={9}
                          className={`${inputClass} font-mono`}
                          value={draft.responses}
                          onChange={(e) =>
                            editDraft({ responses: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={!draft.method}
                        onClick={run}
                      >
                        {t("protoStudio.run")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={
                          !draft.method ||
                          project.cases.length >= MAX_PROTO_CASES
                        }
                        onClick={() => save()}
                      >
                        {t("protoStudio.save")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={!caseId}
                        onClick={() => save(true)}
                      >
                        {t("protoStudio.update")}
                      </button>
                    </div>
                    {rehearsal && (
                      <div className="space-y-2">
                        <p role="status" className="text-xs">
                          {t("protoStudio.rehearsalSummary", {
                            requests: String(rehearsal.requests.length),
                            responses: String(rehearsal.responses.length),
                            bytes: String(rehearsal.byteLength),
                          })}
                        </p>
                        <label className="block text-xs font-semibold">
                          {t("protoStudio.rehearsalOutput")}
                          <textarea
                            readOnly
                            rows={10}
                            className={`${inputClass} font-mono`}
                            value={JSON.stringify(rehearsal, null, 2).slice(
                              0,
                              16000,
                            )}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={buttonClass}
                            onClick={() => exportItem("exchange")}
                          >
                            {t("protoStudio.export.exchange")}
                          </button>
                          <button
                            type="button"
                            className={buttonClass}
                            onClick={() => exportItem("report")}
                          >
                            {t("protoStudio.export.report")}
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                  <section
                    className="space-y-2 rounded-xl border p-3"
                    aria-label={t("protoStudio.library")}
                  >
                    <h3 className="text-sm font-bold">
                      {t("protoStudio.library")}
                    </h3>
                    <p className="text-xs">
                      {t("protoStudio.caseCount", {
                        count: String(project.cases.length),
                        max: String(MAX_PROTO_CASES),
                      })}
                    </p>
                    {project.cases.map((c) => (
                      <div
                        className="flex flex-wrap items-center gap-2"
                        key={c.id}
                      >
                        <span className="min-w-0 flex-1 break-words text-xs">
                          {c.name} · {c.method}
                        </span>
                        <button
                          type="button"
                          className={buttonClass}
                          aria-label={`${t("protoStudio.loadCase")} ${c.name}`}
                          onClick={() => {
                            editDraft({
                              name: c.name,
                              method: c.method,
                              requests: c.requests,
                              responses: c.responses,
                            });
                            setCaseId(c.id);
                          }}
                        >
                          {t("protoStudio.loadCase")}
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          aria-label={`${t("protoStudio.removeCase")} ${c.name}`}
                          onClick={() => {
                            setProject({
                              ...project,
                              cases: project.cases.filter(
                                (item) => item.id !== c.id,
                              ),
                            });
                            if (caseId === c.id) setCaseId("");
                          }}
                        >
                          {t("protoStudio.removeCase")}
                        </button>
                      </div>
                    ))}
                  </section>
                  <section
                    className="space-y-3 rounded-xl border p-3"
                    aria-label={t("protoStudio.compatibility")}
                  >
                    <h3 className="text-sm font-bold">
                      {t("protoStudio.compatibility")}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {t("protoStudio.compatibilityHelp")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => {
                          setBaseline(contract);
                          setComparison(null);
                          setFeedback({
                            key: "protoStudio.pinned",
                            error: false,
                          });
                        }}
                      >
                        {t("protoStudio.pin")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={!baseline}
                        onClick={() => {
                          if (!baseline) return;
                          try {
                            setComparison(
                              compareProtoContracts(baseline, contract),
                            );
                            setFeedback(null);
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        {t("protoStudio.compare")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={!baseline}
                        onClick={() => {
                          setBaseline(null);
                          setComparison(null);
                        }}
                      >
                        {t("protoStudio.clearBaseline")}
                      </button>
                    </div>
                    {baseline && (
                      <p className="text-xs">
                        {t("protoStudio.baseline", {
                          entry: baseline.entry,
                          fields: String(baseline.fieldCount),
                        })}
                      </p>
                    )}
                    {comparison && (
                      <>
                        <p role="status" className="text-xs">
                          {t("protoStudio.comparisonSummary", {
                            errors: String(comparison.errors),
                            warnings: String(comparison.warnings),
                            additions: String(comparison.additions),
                          })}
                        </p>
                        <ul className="space-y-1 break-words text-xs">
                          {comparison.changes.slice(0, 100).map((c, n) => (
                            <li key={n}>
                              {t(`protoStudio.severity.${c.severity}`)} ·{" "}
                              {c.location}: {t(`protoStudio.change.${c.code}`)}
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-slate-600">
                          {t("protoStudio.first100")}
                        </p>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => exportItem("comparison")}
                        >
                          {t("protoStudio.export.comparison")}
                        </button>
                      </>
                    )}
                  </section>
                </fieldset>
              </>
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
