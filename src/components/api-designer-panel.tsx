"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import {
  addDesignServer,
  applyDesignUpdate,
  commitDesign,
  createDesignSchema,
  demoDesignDocument,
  designModels,
  designOperationForm,
  designOperations,
  designParameterForm,
  designPayloadForm,
  designRecord,
  DesignError,
  DESIGN_METHODS,
  MAX_DESIGN_BYTES,
  MAX_DESIGN_PROJECT_BYTES,
  newDesignDocument,
  parseDesignProject,
  prepareDesignUpdate,
  readDesignDocument,
  redoDesign,
  saveDesignInfo,
  saveDesignModel,
  saveDesignOperation,
  saveDesignParameter,
  saveDesignPayload,
  saveDesignProperty,
  saveDesignSecurity,
  serializeDesignDocument,
  serializeDesignProject,
  undoDesign,
  type DesignDocument,
  type DesignHistory,
  type DesignParameterForm,
  type DesignPreview,
} from "@/lib/api-designer";
import { downloadTextFile } from "@/lib/schema-download";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const json = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const str = (v: unknown) => (typeof v === "string" ? v : "");
type Editor =
  | "info"
  | "server"
  | "operation"
  | "parameter"
  | "payload"
  | "model"
  | "property"
  | "security";
const editors: Editor[] = [
  "info",
  "server",
  "operation",
  "parameter",
  "payload",
  "model",
  "property",
  "security",
];

function SchemaEditor({
  document,
  label,
  value,
  onChange,
}: {
  document: DesignDocument;
  label: TranslationKey;
  value: string;
  onChange: (text: string) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState("string"),
    [nullable, setNullable] = useState(false),
    [model, setModel] = useState(""),
    [enumeration, setEnumeration] = useState(""),
    [format, setFormat] = useState("");
  const [error, setError] = useState(false);
  const title = t(label),
    models = designModels(document);
  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="text-xs font-bold">{title}</legend>
      <label className="block text-xs font-semibold">
        {title}
        <textarea
          rows={6}
          spellCheck={false}
          className={`${inputClass} font-mono`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs font-semibold">
          {t("designer.templateType")}
          <select
            aria-label={`${title}: ${t("designer.templateType")}`}
            className={inputClass}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {[
              "string",
              "integer",
              "number",
              "boolean",
              "object",
              "array",
              "reference",
            ].map((k) => (
              <option value={k} key={k}>
                {t(`designer.type.${k}` as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          {t("designer.templateModel")}
          <select
            aria-label={`${title}: ${t("designer.templateModel")}`}
            className={inputClass}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">{t("designer.noModel")}</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          {t("designer.templateEnum")}
          <input
            aria-label={`${title}: ${t("designer.templateEnum")}`}
            className={inputClass}
            value={enumeration}
            onChange={(e) => setEnumeration(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold">
          {t("designer.templateFormat")}
          <input
            aria-label={`${title}: ${t("designer.templateFormat")}`}
            className={inputClass}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          aria-label={`${title}: ${t("designer.nullable")}`}
          type="checkbox"
          checked={nullable}
          onChange={(e) => setNullable(e.target.checked)}
        />
        {t("designer.nullable")}
      </label>
      <button
        type="button"
        className={buttonClass}
        aria-label={`${t("designer.buildSchema")} ${title}`}
        onClick={() => {
          try {
            onChange(
              createDesignSchema(
                document,
                kind,
                nullable,
                model,
                enumeration,
                format,
              ),
            );
            setError(false);
          } catch {
            setError(true);
          }
        }}
      >
        {t("designer.buildSchema")}
      </button>
      {error && (
        <p role="alert" className="text-xs">
          {t("designer.error.schema")}
        </p>
      )}
      <p className="text-xs text-slate-600">{t("designer.schemaHelp")}</p>
    </fieldset>
  );
}

export const ApiDesignerPanel = memo(function ApiDesignerPanel({
  getSchemaText,
  onApply,
}: {
  getSchemaText: () => string;
  onApply: (text: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<DesignHistory>(() => ({
    document: newDesignDocument(),
    past: [],
    future: [],
  }));
  const [name, setName] = useState("API design");
  const [source, setSource] = useState(""),
    [loadedSource, setLoadedSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<Editor>("operation");
  const [operationKey, setOperationKey] = useState(""),
    [modelName, setModelName] = useState("");
  const [operationSearch, setOperationSearch] = useState("");
  const [parameterIndex, setParameterIndex] = useState(-1),
    [propertyKey, setPropertyKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [infoForm, setInfoForm] = useState({
    title: "New API",
    version: "1.0.0",
    description: "",
  });
  const [serverForm, setServerForm] = useState({
    url: "https://api.example.com",
    description: "",
  });
  const [operationForm, setOperationForm] = useState(designOperationForm);
  const [parameterForm, setParameterForm] = useState(designParameterForm);
  const [payloadForm, setPayloadForm] = useState(designPayloadForm);
  const [modelForm, setModelForm] = useState({
    name: "NewModel",
    schema: '{"type":"object","properties":{}}',
  });
  const [propertyForm, setPropertyForm] = useState({
    name: "newField",
    schema: '{"type":"string"}',
    required: false,
  });
  const [securityMode, setSecurityMode] = useState<
      "inherit" | "public" | "custom"
    >("inherit"),
    [securitySource, setSecuritySource] = useState("[]");
  const [preview, setPreview] = useState<DesignPreview | null>(null),
    [format, setFormat] = useState<"json" | "yaml">("json");
  const [undoEditor, setUndoEditor] = useState<{
    before: string;
    after: string;
  } | null>(null);
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
  const document = history.document;
  const operations = useMemo(() => designOperations(document), [document]),
    models = useMemo(() => designModels(document), [document]);
  const operation = operations.find((o) => o.key === operationKey),
    model = models.find((m) => m.name === modelName);
  const parameters = Array.isArray(operation?.operation.parameters)
    ? operation.operation.parameters
    : [];
  const parameter =
    parameterIndex >= 0 ? parameters[parameterIndex] : undefined;
  const properties =
    designRecord(model?.schema) && designRecord(model.schema.properties)
      ? Object.entries(model.schema.properties)
      : [];
  const sourceDirty = source !== loadedSource,
    pending = dirty || sourceDirty;
  const filteredOperations = operations.filter((o) =>
    `${o.method} ${o.path} ${str(o.operation.summary)} ${str(o.operation.operationId)}`
      .toLowerCase()
      .includes(operationSearch.toLowerCase().trim()),
  );
  const selectedContainer =
    payloadForm.kind === "request"
      ? operation?.operation.requestBody
      : designRecord(operation?.operation.responses)
        ? operation.operation.responses[payloadForm.status]
        : undefined;
  const selectedMedia =
    designRecord(selectedContainer) && designRecord(selectedContainer.content)
      ? selectedContainer.content[payloadForm.mediaType]
      : undefined;
  const parameterLocked =
    parameter !== undefined &&
    (!designRecord(parameter) || "$ref" in parameter || "content" in parameter);
  const payloadLocked =
    (designRecord(selectedContainer) && "$ref" in selectedContainer) ||
    (designRecord(selectedMedia) && "$ref" in selectedMedia);
  const propertyLocked =
    !designRecord(model?.schema) ||
    "$ref" in model.schema ||
    (model.schema.type !== undefined &&
      model.schema.type !== "object" &&
      !(
        Array.isArray(model.schema.type) && model.schema.type.includes("object")
      ));
  function invalidate() {
    setPreview(null);
    setFeedback(null);
  }
  function edit() {
    setDirty(true);
    invalidate();
  }
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof DesignError
          ? `designer.error.${error.code}`
          : "designer.error.file",
      error: true,
    });
  }
  function sync(
    doc: DesignDocument,
    opKey = operationKey,
    selectedModel = modelName,
    selectedParameter = -1,
    selectedProperty = "",
  ) {
    const info = designRecord(doc.info) ? doc.info : {},
      op = designOperations(doc).find((o) => o.key === opKey),
      m = designModels(doc).find((m) => m.name === selectedModel),
      params = Array.isArray(op?.operation.parameters)
        ? op.operation.parameters
        : [];
    setServerForm({ url: "https://api.example.com", description: "" });
    setInfoForm({
      title: str(info.title),
      version: str(info.version),
      description: str(info.description),
    });
    setOperationForm(designOperationForm(op));
    setParameterForm(
      designParameterForm(params[selectedParameter], selectedParameter),
    );
    setPayloadForm(designPayloadForm(op));
    setModelForm({
      name: m?.name ?? "NewModel",
      schema: m ? json(m.schema) : '{"type":"object","properties":{}}',
    });
    const prop =
      designRecord(m?.schema) && designRecord(m.schema.properties)
        ? m.schema.properties[selectedProperty]
        : undefined;
    setPropertyForm({
      name: selectedProperty || "newField",
      schema: prop === undefined ? '{"type":"string"}' : json(prop),
      required:
        designRecord(m?.schema) &&
        Array.isArray(m.schema.required) &&
        m.schema.required.includes(selectedProperty),
    });
    setSecurityMode(
      op?.operation.security === undefined
        ? "inherit"
        : Array.isArray(op.operation.security) && !op.operation.security.length
          ? "public"
          : "custom",
    );
    setSecuritySource(json(op?.operation.security ?? []));
    setParameterIndex(selectedParameter);
    setPropertyKey(selectedProperty);
    setDirty(false);
  }
  function accept(doc: DesignDocument, text = "", projectName = name) {
    const op = designOperations(doc)[0]?.key ?? "",
      m = designModels(doc)[0]?.name ?? "";
    setHistory({ document: doc, past: [], future: [] });
    setSource(text);
    setLoadedSource(text);
    setName(projectName);
    setOperationKey(op);
    setModelName(m);
    setOperationSearch("");
    setUndoEditor(null);
    sync(doc, op, m);
    invalidate();
  }
  function load(text = source) {
    try {
      accept(readDesignDocument(text), text);
      setFeedback({ key: "designer.loaded", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File, project = false) {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (file.size > (project ? MAX_DESIGN_PROJECT_BYTES : MAX_DESIGN_BYTES))
        throw new DesignError("limit");
      const text = await file.text();
      if (token !== generation.current) return;
      if (project) {
        const restored = parseDesignProject(text);
        accept(restored.document, "", restored.name);
        setFeedback({ key: "designer.restored", error: false });
      } else {
        accept(readDesignDocument(text), text);
        setFeedback({ key: "designer.loaded", error: false });
      }
    } catch (error) {
      if (token === generation.current) fail(error);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function save() {
    try {
      let next = document,
        opKey = operationKey,
        mName = modelName,
        paramIndex = parameterIndex,
        propKey = propertyKey;
      if (editor === "info")
        next = saveDesignInfo(
          document,
          infoForm.title,
          infoForm.version,
          infoForm.description,
        );
      else if (editor === "server")
        next = addDesignServer(
          document,
          serverForm.url,
          serverForm.description,
        );
      else if (editor === "operation") {
        next = saveDesignOperation(document, operationForm);
        opKey =
          designOperations(next).find(
            (o) =>
              o.path === operationForm.path &&
              o.method === operationForm.method,
          )?.key ?? "";
      } else if (editor === "parameter") {
        next = saveDesignParameter(document, operationKey, parameterForm);
        paramIndex =
          parameterIndex < 0
            ? Array.isArray(operation?.operation.parameters)
              ? operation.operation.parameters.length
              : 0
            : parameterIndex;
      } else if (editor === "payload")
        next = saveDesignPayload(document, operationKey, payloadForm);
      else if (editor === "model") {
        next = saveDesignModel(
          document,
          modelForm.name,
          modelForm.schema,
          Boolean(modelName),
        );
        mName = modelForm.name;
      } else if (editor === "property") {
        next = saveDesignProperty(
          document,
          modelName,
          propertyForm.name,
          propertyForm.schema,
          propertyForm.required,
          Boolean(propertyKey),
        );
        propKey = propertyForm.name;
      } else
        next = saveDesignSecurity(
          document,
          operationKey,
          securityMode,
          securitySource,
        );
      setHistory(commitDesign(history, next));
      setOperationKey(opKey);
      setModelName(mName);
      sync(next, opKey, mName, paramIndex, propKey);
      if (editor === "payload")
        setPayloadForm(
          designPayloadForm(
            designOperations(next).find((o) => o.key === opKey),
            payloadForm.kind,
            payloadForm.status,
            payloadForm.mediaType,
          ),
        );
      invalidate();
      setFeedback({ key: "designer.saved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function step(redo = false) {
    const next = redo ? redoDesign(history) : undoDesign(history);
    const ops = designOperations(next.document),
      availableModels = designModels(next.document);
    const nextOperation = ops.some((o) => o.key === operationKey)
      ? operationKey
      : (ops[0]?.key ?? "");
    const nextModel = availableModels.some((m) => m.name === modelName)
      ? modelName
      : (availableModels[0]?.name ?? "");
    setHistory(next);
    setOperationKey(nextOperation);
    setModelName(nextModel);
    sync(next.document, nextOperation, nextModel);
    invalidate();
    setFeedback({
      key: redo ? "designer.redone" : "designer.undone",
      error: false,
    });
  }
  function prepare() {
    try {
      setPreview(null);
      setPreview(prepareDesignUpdate(document, getSchemaText(), format));
      setFeedback({ key: "designer.prepared", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function apply() {
    if (!preview || pending) return;
    try {
      const after = applyDesignUpdate(preview, document, getSchemaText());
      onApply(after);
      setUndoEditor({ before: preview.before, after });
      setPreview(null);
      setFeedback({ key: "designer.applied", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function revertEditor() {
    if (!undoEditor) return;
    try {
      if (getSchemaText() !== undoEditor.after) throw new DesignError("stale");
      onApply(undoEditor.before);
      setUndoEditor(null);
      setPreview(null);
      setFeedback({ key: "designer.editorUndone", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function download(kind: "contract" | "project" | "review") {
    try {
      const content =
        kind === "project"
          ? serializeDesignProject(document, name)
          : kind === "contract"
            ? serializeDesignDocument(document, format)
            : JSON.stringify(
                {
                  kind: "rsswag-api-design-review",
                  version: 1,
                  ...preview?.review,
                },
                null,
                2,
              );
      const fileName =
        name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) || "api-design";
      const ok = downloadTextFile(
        content,
        `${fileName}-${kind}.${kind === "contract" ? format : "json"}`,
        kind === "contract" && format === "yaml"
          ? "application/yaml"
          : "application/json",
      );
      setFeedback({
        key: ok ? "designer.downloaded" : "designer.downloadFailed",
        error: !ok,
      });
    } catch (error) {
      fail(error);
    }
  }
  const schemaEditor = (
    label: TranslationKey,
    value: string,
    change: (text: string) => void,
  ) => (
    <SchemaEditor
      key={label}
      document={document}
      label={label}
      value={value}
      onChange={(text) => {
        change(text);
        edit();
      }}
    />
  );
  const field = (
    label: TranslationKey,
    value: string,
    change: (value: string) => void,
    multiline = false,
    disabled = false,
  ) => (
    <label className="block text-xs font-semibold">
      {t(label)}
      {multiline ? (
        <textarea
          disabled={disabled}
          rows={4}
          className={inputClass}
          value={value}
          onChange={(e) => {
            change(e.target.value);
            edit();
          }}
        />
      ) : (
        <input
          disabled={disabled}
          className={inputClass}
          value={value}
          onChange={(e) => {
            change(e.target.value);
            edit();
          }}
        />
      )}
    </label>
  );
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("designer.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-[color:var(--color-brand-navy)]">
          <p className="text-sm">{t("designer.description")}</p>
          <p className="text-xs text-slate-600">{t("designer.help")}</p>
          {loading && <p role="status">{t("designer.loading")}</p>}
          {feedback && (
            <p role={feedback.error ? "alert" : "status"} className="text-xs">
              {t(feedback.key)}
            </p>
          )}
          <fieldset
            disabled={loading}
            className="space-y-4 disabled:opacity-60"
          >
            <legend className="sr-only">{t("designer.title")}</legend>
            <fieldset disabled={dirty} className="space-y-3">
              <legend className="sr-only">{t("designer.imports")}</legend>
              <div className="grid gap-3 md:grid-cols-2">
                {([false, true] as const).map((project) => (
                  <label
                    key={String(project)}
                    className="text-xs font-semibold"
                  >
                    {t(
                      project
                        ? "designer.importProject"
                        : "designer.importContract",
                    )}
                    <input
                      type="file"
                      accept={project ? ".json" : ".json,.yaml,.yml"}
                      className={inputClass}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void read(f, project);
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    accept(newDesignDocument());
                    setFeedback({ key: "designer.created", error: false });
                  }}
                >
                  {t("designer.new")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    try {
                      accept(demoDesignDocument());
                      setFeedback({ key: "designer.demoLoaded", error: false });
                    } catch (error) {
                      fail(error);
                    }
                  }}
                >
                  {t("designer.demo")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => load(getSchemaText())}
                >
                  {t("designer.capture")}
                </button>
              </div>
              <label className="block text-xs font-semibold">
                {t("designer.source")}
                <textarea
                  rows={5}
                  spellCheck={false}
                  className={`${inputClass} font-mono`}
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    invalidate();
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => load()}
                >
                  {t("designer.load")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!sourceDirty}
                  onClick={() => {
                    setSource(loadedSource);
                    invalidate();
                  }}
                >
                  {t("designer.discardSource")}
                </button>
              </div>
            </fieldset>
            {sourceDirty && (
              <p role="status" className="text-xs">
                {t("designer.sourceDirty")}
              </p>
            )}
            <label className="block text-xs font-semibold">
              {t("designer.projectName")}
              <input
                maxLength={200}
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <p className="text-xs font-semibold">
              {t("designer.summary", {
                operations: String(operations.length),
                models: String(models.length),
                version: str(document.openapi),
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={pending || !history.past.length}
                onClick={() => step()}
              >
                {t("designer.undo")}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={pending || !history.future.length}
                onClick={() => step(true)}
              >
                {t("designer.redo")}
              </button>
            </div>
            <fieldset disabled={pending} className="grid gap-3 md:grid-cols-2">
              <legend className="sr-only">{t("designer.context")}</legend>
              <label className="text-xs font-semibold">
                {t("designer.operationSearch")}
                <input
                  className={inputClass}
                  value={operationSearch}
                  onChange={(e) => setOperationSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setOperationSearch("");
                  }}
                />
              </label>
              <label className="text-xs font-semibold">
                {t("designer.operation")}
                <select
                  className={inputClass}
                  value={operationKey}
                  onChange={(e) => {
                    setOperationKey(e.target.value);
                    sync(document, e.target.value);
                  }}
                >
                  <option value="">{t("designer.newOperation")}</option>
                  {(operation &&
                  !filteredOperations.some((o) => o.key === operation.key)
                    ? [operation, ...filteredOperations]
                    : filteredOperations
                  ).map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.method.toUpperCase()} {o.path}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                {t("designer.model")}
                <select
                  className={inputClass}
                  value={modelName}
                  onChange={(e) => {
                    setModelName(e.target.value);
                    sync(document, operationKey, e.target.value);
                  }}
                >
                  <option value="">{t("designer.newModel")}</option>
                  {models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                {t("designer.editor")}
                <select
                  className={inputClass}
                  value={editor}
                  onChange={(e) => {
                    setEditor(e.target.value as Editor);
                    sync(document);
                  }}
                >
                  {editors.map((e) => (
                    <option key={e} value={e}>
                      {t(`designer.editor.${e}`)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <fieldset
              disabled={sourceDirty}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="px-1 text-sm font-bold">
                {t(`designer.editor.${editor}`)}
              </legend>
              {editor === "info" && (
                <>
                  {field("designer.apiTitle", infoForm.title, (title) =>
                    setInfoForm({ ...infoForm, title }),
                  )}
                  {field("designer.apiVersion", infoForm.version, (version) =>
                    setInfoForm({ ...infoForm, version }),
                  )}
                  {field(
                    "designer.apiDescription",
                    infoForm.description,
                    (description) => setInfoForm({ ...infoForm, description }),
                    true,
                  )}
                </>
              )}
              {editor === "server" && (
                <>
                  {field("designer.serverUrl", serverForm.url, (url) =>
                    setServerForm({ ...serverForm, url }),
                  )}
                  {field(
                    "designer.serverDescription",
                    serverForm.description,
                    (description) =>
                      setServerForm({ ...serverForm, description }),
                  )}
                  <p className="text-xs text-slate-600">
                    {t("designer.serverHelp")}
                  </p>
                  <ul className="text-xs">
                    {Array.isArray(document.servers) &&
                      document.servers
                        .slice(0, 30)
                        .map((s, i) => (
                          <li key={i}>{designRecord(s) ? str(s.url) : "—"}</li>
                        ))}
                  </ul>
                </>
              )}
              {editor === "operation" && (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    {field(
                      "designer.path",
                      operationForm.path,
                      (path) => setOperationForm({ ...operationForm, path }),
                      false,
                      Boolean(operationForm.key),
                    )}
                    <label className="text-xs font-semibold">
                      {t("designer.method")}
                      <select
                        disabled={Boolean(operationForm.key)}
                        className={inputClass}
                        value={operationForm.method}
                        onChange={(e) => {
                          setOperationForm({
                            ...operationForm,
                            method: e.target.value,
                          });
                          edit();
                        }}
                      >
                        {DESIGN_METHODS.map((m) => (
                          <option value={m} key={m}>
                            {m.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {field(
                    "designer.operationSummary",
                    operationForm.summary,
                    (summary) =>
                      setOperationForm({ ...operationForm, summary }),
                  )}
                  {field(
                    "designer.operationId",
                    operationForm.operationId,
                    (operationId) =>
                      setOperationForm({ ...operationForm, operationId }),
                    false,
                    Boolean(operation?.operation.operationId),
                  )}
                  {field("designer.tags", operationForm.tags, (tags) =>
                    setOperationForm({ ...operationForm, tags }),
                  )}
                  {field(
                    "designer.operationDescription",
                    operationForm.description,
                    (description) =>
                      setOperationForm({ ...operationForm, description }),
                    true,
                  )}
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={operationForm.deprecated}
                      onChange={(e) => {
                        setOperationForm({
                          ...operationForm,
                          deprecated: e.target.checked,
                        });
                        edit();
                      }}
                    />
                    {t("designer.deprecated")}
                  </label>
                  <p className="text-xs text-slate-600">
                    {t("designer.operationHelp")}
                  </p>
                </>
              )}
              {editor === "parameter" && (
                <>
                  {!operation ? (
                    <p className="text-xs">{t("designer.selectOperation")}</p>
                  ) : (
                    <>
                      <label className="block text-xs font-semibold">
                        {t("designer.parameter")}
                        <select
                          disabled={dirty}
                          className={inputClass}
                          value={parameterIndex}
                          onChange={(e) => {
                            const index = Number(e.target.value);
                            setParameterIndex(index);
                            setParameterForm(
                              designParameterForm(parameters[index], index),
                            );
                          }}
                        >
                          <option value={-1}>
                            {t("designer.newParameter")}
                          </option>
                          {parameters.map((p, i) => (
                            <option key={i} value={i}>
                              {designRecord(p)
                                ? `${str(p.in)} ${str(p.name) || str(p.$ref)}`
                                : String(i)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-xs">
                        {t("designer.inherited", {
                          count: String(operation.inheritedParameters),
                        })}
                      </p>
                      {parameterLocked ? (
                        <p className="text-xs">{t("designer.referenceHelp")}</p>
                      ) : (
                        <>
                          {field(
                            "designer.parameterName",
                            parameterForm.name,
                            (name) =>
                              setParameterForm({ ...parameterForm, name }),
                            false,
                            parameterIndex >= 0,
                          )}
                          <label className="block text-xs font-semibold">
                            {t("designer.parameterLocation")}
                            <select
                              disabled={parameterIndex >= 0}
                              className={inputClass}
                              value={parameterForm.location}
                              onChange={(e) => {
                                setParameterForm({
                                  ...parameterForm,
                                  location: e.target
                                    .value as DesignParameterForm["location"],
                                });
                                edit();
                              }}
                            >
                              {["path", "query", "header", "cookie"].map(
                                (loc) => (
                                  <option key={loc}>{loc}</option>
                                ),
                              )}
                            </select>
                          </label>
                          {field(
                            "designer.parameterDescription",
                            parameterForm.description,
                            (description) =>
                              setParameterForm({
                                ...parameterForm,
                                description,
                              }),
                            true,
                          )}
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={
                                parameterForm.location === "path" ||
                                parameterForm.required
                              }
                              disabled={parameterForm.location === "path"}
                              onChange={(e) => {
                                setParameterForm({
                                  ...parameterForm,
                                  required: e.target.checked,
                                });
                                edit();
                              }}
                            />
                            {t("designer.required")}
                          </label>
                          {schemaEditor(
                            "designer.parameterSchema",
                            parameterForm.schema,
                            (schema) =>
                              setParameterForm({ ...parameterForm, schema }),
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              {editor === "payload" && (
                <>
                  {!operation ? (
                    <p className="text-xs">{t("designer.selectOperation")}</p>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-xs font-semibold">
                          {t("designer.payloadKind")}
                          <select
                            disabled={dirty}
                            className={inputClass}
                            value={payloadForm.kind}
                            onChange={(e) =>
                              setPayloadForm(
                                designPayloadForm(
                                  operation,
                                  e.target.value as "request" | "response",
                                  payloadForm.status,
                                  payloadForm.mediaType,
                                ),
                              )
                            }
                          >
                            <option value="request">
                              {t("designer.request")}
                            </option>
                            <option value="response">
                              {t("designer.response")}
                            </option>
                          </select>
                        </label>
                        {payloadForm.kind === "response" && (
                          <label className="text-xs font-semibold">
                            {t("designer.responseStatus")}
                            <input
                              disabled={dirty}
                              className={inputClass}
                              value={payloadForm.status}
                              onChange={(e) =>
                                setPayloadForm(
                                  designPayloadForm(
                                    operation,
                                    "response",
                                    e.target.value,
                                    payloadForm.mediaType,
                                  ),
                                )
                              }
                            />
                          </label>
                        )}
                        <label className="text-xs font-semibold">
                          {t("designer.mediaType")}
                          <input
                            disabled={dirty}
                            className={inputClass}
                            value={payloadForm.mediaType}
                            onChange={(e) =>
                              setPayloadForm(
                                designPayloadForm(
                                  operation,
                                  payloadForm.kind,
                                  payloadForm.status,
                                  e.target.value,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                      {payloadLocked ? (
                        <p className="text-xs">{t("designer.referenceHelp")}</p>
                      ) : (
                        <>
                          {field(
                            "designer.payloadDescription",
                            payloadForm.description,
                            (description) =>
                              setPayloadForm({ ...payloadForm, description }),
                            true,
                          )}
                          {payloadForm.kind === "request" && (
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={payloadForm.required}
                                onChange={(e) => {
                                  setPayloadForm({
                                    ...payloadForm,
                                    required: e.target.checked,
                                  });
                                  edit();
                                }}
                              />
                              {t("designer.required")}
                            </label>
                          )}
                          {schemaEditor(
                            "designer.payloadSchema",
                            payloadForm.schema,
                            (schema) =>
                              setPayloadForm({ ...payloadForm, schema }),
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              {editor === "model" && (
                <>
                  {field(
                    "designer.modelName",
                    modelForm.name,
                    (name) => setModelForm({ ...modelForm, name }),
                    false,
                    Boolean(modelName),
                  )}
                  {schemaEditor(
                    "designer.modelSchema",
                    modelForm.schema,
                    (schema) => setModelForm({ ...modelForm, schema }),
                  )}
                  <p className="text-xs text-slate-600">
                    {t("designer.modelHelp")}
                  </p>
                </>
              )}
              {editor === "property" && (
                <>
                  {!model ? (
                    <p className="text-xs">{t("designer.selectModel")}</p>
                  ) : propertyLocked ? (
                    <p className="text-xs">{t("designer.referenceHelp")}</p>
                  ) : (
                    <>
                      <label className="block text-xs font-semibold">
                        {t("designer.property")}
                        <select
                          disabled={dirty}
                          className={inputClass}
                          value={propertyKey}
                          onChange={(e) => {
                            const key = e.target.value;
                            const value = properties.find(
                              ([name]) => name === key,
                            )?.[1];
                            setPropertyKey(key);
                            setPropertyForm({
                              name: key || "newField",
                              schema:
                                value === undefined
                                  ? '{"type":"string"}'
                                  : json(value),
                              required:
                                designRecord(model.schema) &&
                                Array.isArray(model.schema.required) &&
                                model.schema.required.includes(key),
                            });
                          }}
                        >
                          <option value="">{t("designer.newProperty")}</option>
                          {properties.map(([name]) => (
                            <option key={name}>{name}</option>
                          ))}
                        </select>
                      </label>
                      {field(
                        "designer.propertyName",
                        propertyForm.name,
                        (name) => setPropertyForm({ ...propertyForm, name }),
                        false,
                        Boolean(propertyKey),
                      )}
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={propertyForm.required}
                          onChange={(e) => {
                            setPropertyForm({
                              ...propertyForm,
                              required: e.target.checked,
                            });
                            edit();
                          }}
                        />
                        {t("designer.required")}
                      </label>
                      {schemaEditor(
                        "designer.propertySchema",
                        propertyForm.schema,
                        (schema) =>
                          setPropertyForm({ ...propertyForm, schema }),
                      )}
                    </>
                  )}
                </>
              )}
              {editor === "security" && (
                <>
                  {!operation ? (
                    <p className="text-xs">{t("designer.selectOperation")}</p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-600">
                        {t("designer.securityHelp")}
                      </p>
                      <label className="block text-xs font-semibold">
                        {t("designer.securityMode")}
                        <select
                          className={inputClass}
                          value={securityMode}
                          onChange={(e) => {
                            setSecurityMode(
                              e.target.value as typeof securityMode,
                            );
                            edit();
                          }}
                        >
                          {(["inherit", "public", "custom"] as const).map(
                            (mode) => (
                              <option key={mode} value={mode}>
                                {t(`designer.security.${mode}`)}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      {securityMode === "custom" &&
                        field(
                          "designer.securityJson",
                          securitySource,
                          setSecuritySource,
                          true,
                        )}
                      <p className="break-words text-xs">
                        {t("designer.securitySchemes")}:{" "}
                        {designRecord(document.components) &&
                        designRecord(document.components.securitySchemes)
                          ? Object.keys(
                              document.components.securitySchemes,
                            ).join(", ")
                          : "—"}
                      </p>
                    </>
                  )}
                </>
              )}
              {dirty && (
                <p role="status" className="text-xs">
                  {t("designer.formDirty")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={
                    (editor === "parameter" &&
                      (!operation || parameterLocked)) ||
                    (editor === "payload" && (!operation || payloadLocked)) ||
                    (editor === "property" && (!model || propertyLocked)) ||
                    (editor === "security" && !operation)
                  }
                  onClick={save}
                >
                  {t("designer.saveForm")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!dirty}
                  onClick={() => {
                    sync(
                      document,
                      operationKey,
                      modelName,
                      parameterIndex,
                      propertyKey,
                    );
                    if (editor === "payload")
                      setPayloadForm(
                        designPayloadForm(
                          operation,
                          payloadForm.kind,
                          payloadForm.status,
                          payloadForm.mediaType,
                        ),
                      );
                    setFeedback({ key: "designer.discarded", error: false });
                  }}
                >
                  {t("designer.discardForm")}
                </button>
              </div>
            </fieldset>
            <section
              className="space-y-3 rounded-xl border p-3"
              aria-label={t("designer.publish")}
            >
              <h3 className="text-sm font-bold">{t("designer.publish")}</h3>
              <p className="text-xs text-slate-600">
                {t("designer.publishHelp")}
              </p>
              <label className="block text-xs font-semibold">
                {t("designer.exportFormat")}
                <select
                  className={inputClass}
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value as typeof format);
                    invalidate();
                  }}
                >
                  <option value="json">JSON</option>
                  <option value="yaml">YAML</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={pending}
                  onClick={() => download("contract")}
                >
                  {t("designer.downloadContract")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={pending}
                  onClick={() => download("project")}
                >
                  {t("designer.downloadProject")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={pending}
                  onClick={prepare}
                >
                  {t("designer.prepare")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={pending || !preview}
                  onClick={apply}
                >
                  {t("designer.apply")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!undoEditor}
                  onClick={revertEditor}
                >
                  {t("designer.undoEditor")}
                </button>
              </div>
              {preview && (
                <div className="space-y-2">
                  <p role="status" className="text-xs">
                    {t("designer.reviewSummary", {
                      changes: String(preview.review.changes.length),
                      operations: String(preview.review.operationCount),
                      models: String(preview.review.modelCount),
                      broken: String(preview.review.brokenReferences),
                      external: String(preview.review.externalReferences),
                    })}
                  </p>
                  {!preview.review.editorValid && (
                    <p className="text-xs">{t("designer.replaceInvalid")}</p>
                  )}
                  <ul className="max-h-48 space-y-1 overflow-auto break-all text-xs">
                    {preview.review.changes.map((c, i) => (
                      <li key={i}>
                        {c.path || "/"} · {t(`designer.change.${c.kind}`)}
                      </li>
                    ))}
                  </ul>
                  {preview.review.truncated && (
                    <p className="text-xs">{t("designer.truncated")}</p>
                  )}
                  <label className="block text-xs font-semibold">
                    {t("designer.preview")}
                    <textarea
                      readOnly
                      rows={10}
                      className={`${inputClass} font-mono`}
                      value={preview.after.slice(0, 16000)}
                    />
                  </label>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => download("review")}
                  >
                    {t("designer.downloadReview")}
                  </button>
                </div>
              )}
            </section>
          </fieldset>
        </div>
      )}
    </details>
  );
});
