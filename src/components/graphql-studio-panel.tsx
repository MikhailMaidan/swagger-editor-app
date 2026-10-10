"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";
import { useI18n } from "./i18n-provider";
import {
  checkGraphqlRequest,
  createGraphqlHttpContract,
  DEMO_GRAPHQL_SCHEMA,
  emptyGraphqlProject,
  exportGraphqlIntrospection,
  generateGraphqlOperation,
  graphqlCheckReport,
  graphqlRequestPayload,
  GraphqlStudioError,
  MAX_GRAPHQL_CASES,
  MAX_GRAPHQL_PROJECT_BYTES,
  MAX_GRAPHQL_SOURCE_BYTES,
  parseGraphqlProject,
  readGraphqlContract,
  readGraphqlRequestPayload,
  rehearseGraphql,
  saveGraphqlCase,
  serializeGraphqlProject,
  type GraphqlContract,
  type GraphqlDraft,
  type GraphqlKind,
  type GraphqlRehearsal,
  type GraphqlRequestCheck,
  type GraphqlTypeKind,
} from "@/lib/graphql-studio";
import { downloadTextFile } from "@/lib/schema-download";
import { getByteSize } from "@/lib/text-encoding";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const typeKinds: GraphqlTypeKind[] = [
  "object",
  "input",
  "interface",
  "union",
  "enum",
  "scalar",
];
type FileKind = "schema" | "project" | "request";

export const GraphqlStudioPanel = memo(function GraphqlStudioPanel({
  getSchemaText,
}: {
  getSchemaText: () => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState(emptyGraphqlProject);
  const [contract, setContract] = useState<GraphqlContract | null>(null);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    key: TranslationKey;
    error: boolean;
    details?: string;
  } | null>(null);
  const [check, setCheck] = useState<GraphqlRequestCheck | null>(null);
  const [rehearsal, setRehearsal] = useState<GraphqlRehearsal | null>(null);
  const [typeSearch, setTypeSearch] = useState("");
  const [typeKind, setTypeKind] = useState<"all" | GraphqlTypeKind>("all");
  const [typeName, setTypeName] = useState("");
  const [typePage, setTypePage] = useState(0);
  const [fieldPage, setFieldPage] = useState(0);
  const [operationSearch, setOperationSearch] = useState("");
  const [operationKind, setOperationKind] = useState<"all" | GraphqlKind>(
    "all",
  );
  const [operationKey, setOperationKey] = useState("");
  const [depth, setDepth] = useState(2);
  const [optional, setOptional] = useState(false);
  const [caseId, setCaseId] = useState("");
  const [bridgeFormat, setBridgeFormat] = useState<"json" | "yaml">("json");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const dirty = contract ? source !== contract.source : Boolean(source.trim());
  const active = Boolean(contract && !dirty);
  const draft = project.draft;
  const types = useMemo(() => {
    const terms = typeSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (contract?.types ?? []).filter(
      (type) =>
        (typeKind === "all" || type.kind === typeKind) &&
        terms.every((term) =>
          `${type.name} ${type.description} ${type.fields.map((f) => `${f.name} ${f.type}`).join(" ")} ${type.enumValues.map((v) => v.name).join(" ")}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [contract, typeSearch, typeKind]);
  const type =
    contract?.types.find((type) => type.name === typeName) ?? types[0];
  const typeLastPage = Math.max(0, Math.ceil(types.length / 20) - 1),
    typeCurrentPage = Math.min(typePage, typeLastPage);
  const fieldLastPage = Math.max(
      0,
      Math.ceil((type?.fields.length ?? 0) / 30) - 1,
    ),
    fieldCurrentPage = Math.min(fieldPage, fieldLastPage);
  const operations = useMemo(() => {
    const terms = operationSearch
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (contract?.operations ?? []).filter(
      (op) =>
        (operationKind === "all" || op.kind === operationKind) &&
        terms.every((term) =>
          `${op.owner} ${op.name} ${op.type} ${op.description}`
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [contract, operationSearch, operationKind]);
  const operation =
    operations.find((op) => op.key === operationKey) ?? operations[0];
  function invalidate() {
    setCheck(null);
    setRehearsal(null);
    setFeedback(null);
  }
  function fail(error: unknown) {
    setFeedback({
      key:
        error instanceof GraphqlStudioError
          ? `graphqlStudio.error.${error.code}`
          : "graphqlStudio.error.file",
      error: true,
      details: error instanceof GraphqlStudioError ? error.details : undefined,
    });
  }
  function editDraft(patch: Partial<GraphqlDraft>) {
    setProject({ ...project, draft: { ...draft, ...patch } });
    invalidate();
  }
  function acceptContract(parsed: GraphqlContract) {
    setContract(parsed);
    setSource(parsed.source);
    setProject((previous) => ({ ...previous, source: parsed.source }));
    setTypeSearch("");
    setTypeKind("all");
    setTypeName(parsed.operations[0]?.owner ?? "");
    setTypePage(0);
    setFieldPage(0);
    setOperationSearch("");
    setOperationKind("all");
    setOperationKey(parsed.operations[0]?.key ?? "");
    invalidate();
  }
  function load(text = source) {
    try {
      acceptContract(readGraphqlContract(text));
      setFeedback({ key: "graphqlStudio.loaded", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function demo() {
    try {
      const parsed = readGraphqlContract(DEMO_GRAPHQL_SCHEMA);
      acceptContract(parsed);
      setProject((previous) => ({
        ...previous,
        source: parsed.source,
        draft: generateGraphqlOperation(parsed, "query:item"),
      }));
      setFeedback({ key: "graphqlStudio.demoLoaded", error: false });
    } catch (error) {
      fail(error);
    }
  }
  async function read(file: File, kind: FileKind) {
    const token = ++generation.current;
    setLoading(true);
    setFeedback(null);
    try {
      if (
        file.size >
        (kind === "project"
          ? MAX_GRAPHQL_PROJECT_BYTES
          : MAX_GRAPHQL_SOURCE_BYTES)
      )
        throw new GraphqlStudioError("limit");
      const text = await file.text();
      if (token !== generation.current) return;
      if (kind === "schema") {
        acceptContract(readGraphqlContract(text));
        setFeedback({ key: "graphqlStudio.loaded", error: false });
      } else if (kind === "request") {
        const parsed = readGraphqlRequestPayload(text);
        editDraft({ ...parsed, fixtures: draft.fixtures });
        setFeedback({ key: "graphqlStudio.requestImported", error: false });
      } else {
        const restored = parseGraphqlProject(text);
        acceptContract(restored.contract);
        setProject(restored.project);
        setCaseId("");
        setFeedback({ key: "graphqlStudio.restored", error: false });
      }
    } catch (error) {
      if (token === generation.current) fail(error);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  function generate() {
    if (!contract || !operation || !active) return;
    try {
      editDraft(
        generateGraphqlOperation(contract, operation.key, depth, optional),
      );
      setFeedback({ key: "graphqlStudio.generated", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function validateRequest(run = false) {
    if (!contract || !active) return;
    setCheck(null);
    setRehearsal(null);
    setFeedback(null);
    try {
      if (run) {
        const result = rehearseGraphql(contract, draft);
        setCheck(result.check);
        setRehearsal(result);
        setFeedback({
          key: `graphqlStudio.rehearsal.${result.status}`,
          error: result.status !== "success",
        });
      } else {
        const result = checkGraphqlRequest(contract, draft);
        setCheck(result);
        setFeedback({
          key: result.ready ? "graphqlStudio.valid" : "graphqlStudio.invalid",
          error: !result.ready,
        });
      }
    } catch (error) {
      fail(error);
    }
  }
  function save(update = false) {
    if (!contract || !active) return;
    try {
      const next = saveGraphqlCase(
        project,
        contract,
        draft,
        update ? caseId : undefined,
      );
      setProject(next);
      setCaseId(update ? caseId : next.cases.at(-1)!.id);
      setFeedback({ key: "graphqlStudio.saved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function loadCase() {
    const saved = project.cases.find((c) => c.id === caseId);
    if (!saved) return;
    editDraft({
      name: saved.name,
      document: saved.document,
      operationName: saved.operationName,
      variables: saved.variables,
      fixtures: saved.fixtures,
    });
    setFeedback({ key: "graphqlStudio.caseLoaded", error: false });
  }
  function removeCase() {
    setProject({
      ...project,
      cases: project.cases.filter((c) => c.id !== caseId),
    });
    setCaseId("");
    setFeedback({ key: "graphqlStudio.caseRemoved", error: false });
  }
  function selectType(name: string) {
    setTypeSearch("");
    setTypeKind("all");
    setTypeName(name);
    setTypePage(0);
    setFieldPage(0);
  }
  function download(
    text: string,
    suffix: string,
    mime = "application/json",
    max = MAX_GRAPHQL_SOURCE_BYTES,
  ) {
    if (getByteSize(text) > max) throw new GraphqlStudioError("limit");
    const name =
      project.name
        .trim()
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .slice(0, 70) || "graphql-api";
    const success = downloadTextFile(text, `${name}-${suffix}`, mime);
    setFeedback({
      key: success
        ? "graphqlStudio.downloaded"
        : "graphqlStudio.error.download",
      error: !success,
    });
  }
  function exportFile(
    kind:
      | "sdl"
      | "introspection"
      | "inventory"
      | "request"
      | "response"
      | "report"
      | "project"
      | "bridge",
  ) {
    if (!contract || !active) return;
    try {
      if (kind === "sdl")
        download(contract.sdl, "schema.graphql", "text/plain;charset=utf-8");
      else if (kind === "introspection")
        download(exportGraphqlIntrospection(contract), "introspection.json");
      else if (kind === "inventory")
        download(
          JSON.stringify(
            {
              types: contract.types,
              operations: contract.operations,
              fieldCount: contract.fieldCount,
            },
            null,
            2,
          ),
          "schema-inventory.json",
        );
      else if (kind === "request")
        download(
          JSON.stringify(graphqlRequestPayload(contract, draft), null, 2),
          "request.json",
        );
      else if (kind === "response" && rehearsal?.response)
        download(
          JSON.stringify(rehearsal.response, null, 2),
          "rehearsal-response.json",
        );
      else if (kind === "report" && check)
        download(
          JSON.stringify(graphqlCheckReport(check, rehearsal), null, 2),
          "check-report.json",
        );
      else if (kind === "project")
        download(
          serializeGraphqlProject(project),
          "graphql-project.json",
          "application/json",
          MAX_GRAPHQL_PROJECT_BYTES,
        );
      else if (kind === "bridge") {
        const bridge = createGraphqlHttpContract(
          contract,
          draft,
          project.endpoint,
          project.name,
        );
        download(
          bridgeFormat === "json"
            ? JSON.stringify(bridge, null, 2)
            : YAML.stringify(bridge, { lineWidth: 0 }),
          `http-openapi.${bridgeFormat}`,
          bridgeFormat === "json" ? "application/json" : "application/yaml",
        );
      }
    } catch (error) {
      fail(error);
    }
  }
  const fileInput = (kind: FileKind) => (
    <label className="block text-xs font-semibold">
      {t(`graphqlStudio.import.${kind}`)}
      <input
        type="file"
        accept={kind === "schema" ? ".graphql,.gql,.sdl,.json" : ".json"}
        className={inputClass}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void read(file, kind);
        }}
      />
    </label>
  );
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/90 p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("graphqlStudio.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4 text-[color:var(--color-brand-navy)]">
          <p className="text-sm">{t("graphqlStudio.description")}</p>
          <p className="text-xs text-slate-600">{t("graphqlStudio.help")}</p>
          {loading && <p role="status">{t("graphqlStudio.loading")}</p>}
          {feedback && (
            <div
              role={feedback.error ? "alert" : "status"}
              className={
                feedback.error
                  ? "text-sm text-red-700"
                  : "text-sm text-emerald-700"
              }
            >
              <p>{t(feedback.key)}</p>
              {feedback.details && (
                <pre className="mt-1 whitespace-pre-wrap break-words text-xs">
                  {feedback.details}
                </pre>
              )}
            </div>
          )}
          <fieldset disabled={loading} className="min-w-0 space-y-4">
            <legend className="sr-only">{t("graphqlStudio.title")}</legend>
            <div className="grid gap-3 md:grid-cols-3">
              {fileInput("schema")}
              {fileInput("project")}
              {fileInput("request")}
            </div>
            <label className="block text-xs font-semibold">
              {t("graphqlStudio.projectName")}
              <input
                maxLength={120}
                className={inputClass}
                value={project.name}
                onChange={(event) =>
                  setProject({ ...project, name: event.target.value })
                }
              />
            </label>
            <label className="block text-xs font-semibold">
              {t("graphqlStudio.source")}
              <textarea
                rows={9}
                value={source}
                className={`${inputClass} font-mono`}
                onChange={(event) => {
                  setSource(event.target.value);
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
                {t("graphqlStudio.load")}
              </button>
              <button type="button" className={buttonClass} onClick={demo}>
                {t("graphqlStudio.demo")}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => load(getSchemaText())}
              >
                {t("graphqlStudio.capture")}
              </button>
            </div>
            {dirty && (
              <p className="text-xs text-amber-800">
                {t("graphqlStudio.dirty")}
              </p>
            )}
            {contract && (
              <>
                <p className="text-sm">
                  {t("graphqlStudio.schemaSummary", {
                    types: String(contract.types.length),
                    fields: String(contract.fieldCount),
                    operations: String(contract.operations.length),
                    format: contract.format,
                  })}
                </p>
                <fieldset disabled={!active} className="min-w-0 space-y-4">
                  <legend className="sr-only">
                    {t("graphqlStudio.workspace")}
                  </legend>
                  <details>
                    <summary className="cursor-pointer text-sm font-bold">
                      {t("graphqlStudio.explorer")}
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-xs font-semibold">
                          {t("graphqlStudio.typeSearch")}
                          <input
                            type="search"
                            className={inputClass}
                            value={typeSearch}
                            onChange={(event) => {
                              setTypeSearch(event.target.value);
                              setTypeName("");
                              setTypePage(0);
                              setFieldPage(0);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                setTypeSearch("");
                                setTypeName("");
                                setTypePage(0);
                              }
                            }}
                          />
                        </label>
                        <label className="text-xs font-semibold">
                          {t("graphqlStudio.typeFilter")}
                          <select
                            value={typeKind}
                            className={inputClass}
                            onChange={(event) => {
                              setTypeKind(
                                event.target.value as typeof typeKind,
                              );
                              setTypeName("");
                              setTypePage(0);
                              setFieldPage(0);
                            }}
                          >
                            <option value="all">
                              {t("graphqlStudio.allTypes")}
                            </option>
                            {typeKinds.map((kind) => (
                              <option key={kind} value={kind}>
                                {t(`graphqlStudio.type.${kind}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <ul
                            aria-label={t("graphqlStudio.types")}
                            className="space-y-1"
                          >
                            {types
                              .slice(
                                typeCurrentPage * 20,
                                typeCurrentPage * 20 + 20,
                              )
                              .map((item) => (
                                <li key={item.name}>
                                  <button
                                    type="button"
                                    className={`${buttonClass} w-full break-all text-left`}
                                    aria-pressed={item.name === type?.name}
                                    onClick={() => {
                                      setTypeName(item.name);
                                      setFieldPage(0);
                                    }}
                                  >
                                    {item.name}{" "}
                                    <span className="font-normal text-slate-500">
                                      {t(`graphqlStudio.type.${item.kind}`)}
                                    </span>
                                  </button>
                                </li>
                              ))}
                          </ul>
                          {types.length === 0 && (
                            <p className="text-xs">
                              {t("graphqlStudio.noTypes")}
                            </p>
                          )}
                          {types.length > 20 && (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={typeCurrentPage === 0}
                                onClick={() => setTypePage(typeCurrentPage - 1)}
                              >
                                {t("graphqlStudio.previousTypes")}
                              </button>
                              <span className="text-xs">
                                {t("graphqlStudio.page", {
                                  page: String(typeCurrentPage + 1),
                                  total: String(typeLastPage + 1),
                                })}
                              </span>
                              <button
                                type="button"
                                className={buttonClass}
                                disabled={typeCurrentPage === typeLastPage}
                                onClick={() => setTypePage(typeCurrentPage + 1)}
                              >
                                {t("graphqlStudio.nextTypes")}
                              </button>
                            </div>
                          )}
                        </div>
                        {type && (
                          <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="break-all font-mono text-sm font-bold">
                              {type.name}
                            </p>
                            <p className="whitespace-pre-wrap text-xs">
                              {type.description.slice(0, 3000)}
                            </p>
                            {type.oneOf && (
                              <p className="text-xs">
                                {t("graphqlStudio.oneOf")}
                              </p>
                            )}
                            <div
                              aria-label={t("graphqlStudio.dependencies")}
                              className="flex flex-wrap gap-1"
                            >
                              {type.dependencies.map((name) => (
                                <button
                                  type="button"
                                  className={buttonClass}
                                  key={name}
                                  onClick={() => selectType(name)}
                                >
                                  {name}
                                </button>
                              ))}
                            </div>
                            {type.members.length > 0 && (
                              <p className="break-all text-xs">
                                {t("graphqlStudio.members", {
                                  names: type.members.join(", "),
                                })}
                              </p>
                            )}
                            {type.possibleTypes.length > 0 && (
                              <div
                                aria-label={t("graphqlStudio.implementations")}
                                className="flex flex-wrap items-center gap-1"
                              >
                                <span className="text-xs">
                                  {t("graphqlStudio.implementations")}:
                                </span>
                                {type.possibleTypes.map((name) => (
                                  <button
                                    type="button"
                                    key={name}
                                    className={buttonClass}
                                    onClick={() => selectType(name)}
                                  >
                                    {name}
                                  </button>
                                ))}
                              </div>
                            )}
                            {type.enumValues.length > 0 && (
                              <ul
                                aria-label={t("graphqlStudio.enumValues")}
                                className="space-y-1 text-xs"
                              >
                                {type.enumValues.slice(0, 100).map((value) => (
                                  <li key={value.name}>
                                    <span className="font-mono">
                                      {value.name}
                                    </span>
                                    {value.deprecated &&
                                      ` — ${t("graphqlStudio.deprecated")}`}
                                    <p>{value.description.slice(0, 500)}</p>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <ul
                              aria-label={t("graphqlStudio.fields")}
                              className="space-y-2"
                            >
                              {type.fields
                                .slice(
                                  fieldCurrentPage * 30,
                                  fieldCurrentPage * 30 + 30,
                                )
                                .map((field) => (
                                  <li
                                    key={field.name}
                                    className="rounded border border-slate-200 bg-white p-2 text-xs"
                                  >
                                    <p className="break-all font-mono">
                                      {field.name}: {field.type}
                                    </p>
                                    {field.deprecated && (
                                      <p className="text-amber-800">
                                        {t("graphqlStudio.deprecated")} —{" "}
                                        {field.deprecationReason.slice(0, 500)}
                                      </p>
                                    )}
                                    <p className="whitespace-pre-wrap">
                                      {field.description.slice(0, 1500)}
                                    </p>
                                    {field.defaultValue !== undefined && (
                                      <p className="break-all">
                                        {t("graphqlStudio.default", {
                                          value: field.defaultValue.slice(
                                            0,
                                            500,
                                          ),
                                        })}
                                      </p>
                                    )}
                                    {field.arguments.map((arg) => (
                                      <p
                                        key={arg.name}
                                        className="mt-1 break-all font-mono"
                                      >
                                        {arg.name}: {arg.type}
                                        {arg.required
                                          ? ` (${t("graphqlStudio.required")})`
                                          : ""}
                                        {arg.defaultValue === undefined
                                          ? ""
                                          : ` = ${arg.defaultValue.slice(0, 300)}`}
                                      </p>
                                    ))}
                                  </li>
                                ))}
                            </ul>
                            {type.fields.length > 30 && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className={buttonClass}
                                  disabled={fieldCurrentPage === 0}
                                  onClick={() =>
                                    setFieldPage(fieldCurrentPage - 1)
                                  }
                                >
                                  {t("graphqlStudio.previousFields")}
                                </button>
                                <span className="text-xs">
                                  {t("graphqlStudio.page", {
                                    page: String(fieldCurrentPage + 1),
                                    total: String(fieldLastPage + 1),
                                  })}
                                </span>
                                <button
                                  type="button"
                                  className={buttonClass}
                                  disabled={fieldCurrentPage === fieldLastPage}
                                  onClick={() =>
                                    setFieldPage(fieldCurrentPage + 1)
                                  }
                                >
                                  {t("graphqlStudio.nextFields")}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => exportFile("sdl")}
                        >
                          {t("graphqlStudio.exportSdl")}
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => exportFile("introspection")}
                        >
                          {t("graphqlStudio.exportIntrospection")}
                        </button>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => exportFile("inventory")}
                        >
                          {t("graphqlStudio.exportInventory")}
                        </button>
                      </div>
                    </div>
                  </details>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-xs font-semibold">
                      {t("graphqlStudio.operationSearch")}
                      <input
                        type="search"
                        className={inputClass}
                        value={operationSearch}
                        onChange={(event) => {
                          setOperationSearch(event.target.value);
                          setOperationKey("");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setOperationSearch("");
                            setOperationKey("");
                          }
                        }}
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      {t("graphqlStudio.operationFilter")}
                      <select
                        value={operationKind}
                        className={inputClass}
                        onChange={(event) => {
                          setOperationKind(
                            event.target.value as typeof operationKind,
                          );
                          setOperationKey("");
                        }}
                      >
                        <option value="all">
                          {t("graphqlStudio.allOperations")}
                        </option>
                        {(["query", "mutation", "subscription"] as const).map(
                          (kind) => (
                            <option key={kind} value={kind}>
                              {t(`graphqlStudio.operation.${kind}`)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="text-xs font-semibold">
                      {t("graphqlStudio.rootOperation")}
                      <select
                        value={operation?.key ?? ""}
                        className={inputClass}
                        onChange={(event) =>
                          setOperationKey(event.target.value)
                        }
                      >
                        {operations.map((op) => (
                          <option key={op.key} value={op.key}>
                            {op.kind} {op.owner}.{op.name}: {op.type}
                            {op.deprecated
                              ? ` (${t("graphqlStudio.deprecated")})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {operation && (
                    <p className="whitespace-pre-wrap text-xs">
                      {operation.description.slice(0, 1500)}
                    </p>
                  )}
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs font-semibold">
                      {t("graphqlStudio.depth")}
                      <select
                        value={depth}
                        className={inputClass}
                        onChange={(event) =>
                          setDepth(Number(event.target.value))
                        }
                      >
                        {[1, 2, 3, 4].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      <input
                        type="checkbox"
                        checked={optional}
                        onChange={(event) => setOptional(event.target.checked)}
                      />{" "}
                      {t("graphqlStudio.optionalArguments")}
                    </label>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!operation}
                      onClick={generate}
                    >
                      {t("graphqlStudio.generate")}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">
                    {t("graphqlStudio.generatorHelp")}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold">
                      {t("graphqlStudio.draftName")}
                      <input
                        className={inputClass}
                        maxLength={120}
                        value={draft.name}
                        onChange={(event) =>
                          editDraft({ name: event.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      {t("graphqlStudio.operationName")}
                      <input
                        className={inputClass}
                        maxLength={256}
                        value={draft.operationName}
                        onChange={(event) =>
                          editDraft({ operationName: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-semibold">
                    {t("graphqlStudio.document")}
                    <textarea
                      rows={8}
                      className={`${inputClass} font-mono`}
                      value={draft.document}
                      onChange={(event) =>
                        editDraft({ document: event.target.value })
                      }
                    />
                  </label>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <label className="text-xs font-semibold">
                      {t("graphqlStudio.variables")}
                      <textarea
                        rows={7}
                        className={`${inputClass} font-mono`}
                        value={draft.variables}
                        onChange={(event) =>
                          editDraft({ variables: event.target.value })
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      {t("graphqlStudio.fixtures")}
                      <textarea
                        rows={7}
                        className={`${inputClass} font-mono`}
                        value={draft.fixtures}
                        onChange={(event) =>
                          editDraft({ fixtures: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => validateRequest()}
                    >
                      {t("graphqlStudio.validate")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => validateRequest(true)}
                    >
                      {t("graphqlStudio.rehearse")}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">
                    {t("graphqlStudio.rehearsalHelp")}
                  </p>
                  {check && (
                    <div className="space-y-2">
                      <p className="text-xs">
                        {t("graphqlStudio.checkSummary", {
                          issues: String(check.issues.length),
                          warnings: String(check.warnings.length),
                          ignored: String(check.ignoredVariableCount),
                        })}
                      </p>
                      {check.operations.length > 1 && (
                        <p className="text-xs">
                          {t("graphqlStudio.availableOperations", {
                            names: check.operations
                              .map(
                                (op) => op.name || t("graphqlStudio.anonymous"),
                              )
                              .join(", "),
                          })}
                        </p>
                      )}
                      <ul
                        className="space-y-1 text-xs"
                        aria-label={t("graphqlStudio.issues")}
                      >
                        {check.issues.map((issue, index) => (
                          <li
                            key={index}
                            className="whitespace-pre-wrap break-words rounded border border-red-200 p-2"
                          >
                            {t(`graphqlStudio.phase.${issue.phase}`)}:{" "}
                            {issue.message}
                            {issue.locations.length > 0 &&
                              ` (${issue.locations
                                .slice(0, 8)
                                .map((l) => `${l.line}:${l.column}`)
                                .join(", ")})`}
                          </li>
                        ))}
                      </ul>
                      {check.warnings.length > 0 && (
                        <ul className="space-y-1 text-xs text-amber-800">
                          {check.warnings.map((warning) => (
                            <li key={`${warning.code}:${warning.name}`}>
                              {t(`graphqlStudio.warning.${warning.code}`, {
                                name: warning.name,
                              })}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {rehearsal?.response && (
                    <label className="block text-xs font-semibold">
                      {t("graphqlStudio.response")}
                      <textarea
                        readOnly
                        rows={10}
                        className={`${inputClass} font-mono`}
                        value={JSON.stringify(
                          rehearsal.response,
                          null,
                          2,
                        ).slice(0, 16000)}
                      />
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!check?.ready}
                      onClick={() => exportFile("request")}
                    >
                      {t("graphqlStudio.exportRequest")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!rehearsal?.response}
                      onClick={() => exportFile("response")}
                    >
                      {t("graphqlStudio.exportResponse")}
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!check}
                      onClick={() => exportFile("report")}
                    >
                      {t("graphqlStudio.exportReport")}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">
                    {t("graphqlStudio.reportHelp")}
                  </p>
                  <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-bold">
                      {t("graphqlStudio.library")}
                    </p>
                    <label className="block text-xs font-semibold">
                      {t("graphqlStudio.savedOperation")}
                      <select
                        className={inputClass}
                        value={caseId}
                        onChange={(event) => setCaseId(event.target.value)}
                      >
                        <option value="">
                          {t("graphqlStudio.chooseCase")}
                        </option>
                        {project.cases.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.id})
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={project.cases.length >= MAX_GRAPHQL_CASES}
                        onClick={() => save()}
                      >
                        {t("graphqlStudio.saveNew")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={!caseId}
                        onClick={() => save(true)}
                      >
                        {t("graphqlStudio.updateCase")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={!caseId}
                        onClick={loadCase}
                      >
                        {t("graphqlStudio.loadCase")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={!caseId}
                        onClick={removeCase}
                      >
                        {t("graphqlStudio.removeCase")}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">
                      {t("graphqlStudio.libraryHelp", {
                        count: String(project.cases.length),
                      })}
                    </p>
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-bold">
                      {t("graphqlStudio.httpContract")}
                    </p>
                    <label className="block text-xs font-semibold">
                      {t("graphqlStudio.endpoint")}
                      <input
                        type="url"
                        className={inputClass}
                        value={project.endpoint}
                        onChange={(event) =>
                          setProject({
                            ...project,
                            endpoint: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="block text-xs font-semibold">
                      {t("graphqlStudio.bridgeFormat")}
                      <select
                        value={bridgeFormat}
                        className={inputClass}
                        onChange={(event) =>
                          setBridgeFormat(
                            event.target.value as typeof bridgeFormat,
                          )
                        }
                      >
                        <option value="json">JSON</option>
                        <option value="yaml">YAML</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={
                        !check?.ready ||
                        check.operation?.operation === "subscription"
                      }
                      onClick={() => exportFile("bridge")}
                    >
                      {t("graphqlStudio.exportBridge")}
                    </button>
                    <p className="text-xs text-slate-600">
                      {t("graphqlStudio.bridgeHelp")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => exportFile("project")}
                  >
                    {t("graphqlStudio.exportProject")}
                  </button>
                  <p className="text-xs text-slate-600">
                    {t("graphqlStudio.exportHelp")}
                  </p>
                </fieldset>
              </>
            )}
          </fieldset>
        </div>
      )}
    </details>
  );
});
