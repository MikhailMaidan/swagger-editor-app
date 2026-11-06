"use client";
import { useState, type ReactNode } from "react";
import { useI18n } from "./i18n-provider";
import {
  parseDqJson,
  type DQProject,
  type DQQuery,
  type DQStep,
  type DQRef,
} from "@/lib/data-query-model";
export const dqPretty = (v: unknown) => JSON.stringify(v, null, 2);
const controlClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
export function DQAction({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-violet-600 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
export function DQField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const props = {
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    className: controlClass,
    spellCheck: false,
    autoComplete: "off",
  };
  return (
    <label className="block min-w-0 text-xs font-semibold">
      {label}
      {multiline ? <textarea {...props} rows={7} /> : <input {...props} />}
    </label>
  );
}
export function DQSelect({
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
        className={controlClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
export const dqRefText = (r: DQRef) => `${r.kind}:${r.id}`;
export function dqReadRef(v: string): DQRef {
  const split = v.indexOf(":");
  return { kind: v.slice(0, split) as DQRef["kind"], id: v.slice(split + 1) };
}
export function DQSourceOptions({ project }: { project: DQProject }) {
  return (
    <>
      {project.datasets.map((d) => (
        <option key={`d-${d.id}`} value={`dataset:${d.id}`}>
          {d.name} ({d.id})
        </option>
      ))}
      {project.queries.map((q) => (
        <option key={`q-${q.id}`} value={`query:${q.id}`}>
          {q.name} ({q.id})
        </option>
      ))}
    </>
  );
}
export function DQStepBuilder({
  project,
  query,
  append,
}: {
  project: DQProject;
  query: DQQuery;
  append: (make: () => unknown) => void;
}) {
  const { t } = useI18n();
  const [op, setOp] = useState<DQStep["op"]>("filter"),
    [path, setPath] = useState(`/${query.as}/id`),
    [alias, setAlias] = useState("related"),
    [rightPath, setRightPath] = useState("/id"),
    [source, setSource] = useState(
      dqRefText(
        project.datasets[0]
          ? { kind: "dataset", id: project.datasets[0].id }
          : query.from,
      ),
    ),
    [mode, setMode] = useState("left"),
    [nulls, setNulls] = useState("never"),
    [condition, setCondition] = useState("eq"),
    [literal, setLiteral] = useState('"value"'),
    [columns, setColumns] = useState(
      dqPretty([
        { name: "id", value: { op: "get", pointer: `/${query.as}/id` } },
      ]),
    ),
    [by, setBy] = useState("[]"),
    [measures, setMeasures] = useState(
      '[{"name":"count","op":"count","value":null}]',
    ),
    [direction, setDirection] = useState("asc"),
    [sortNulls, setSortNulls] = useState("last"),
    [offset, setOffset] = useState("0"),
    [limit, setLimit] = useState("25");
  const pointer = { op: "get", pointer: path };
  const make = (): unknown => {
    switch (op) {
      case "join":
        return {
          op,
          source: dqReadRef(source),
          as: alias,
          mode,
          nulls,
          keys: [{ left: path, right: rightPath }],
        };
      case "filter":
        return {
          op,
          condition:
            condition === "isMissing" || condition === "isNull"
              ? { op: condition, value: pointer }
              : {
                  op: condition,
                  left: pointer,
                  right: { op: "literal", value: parseDqJson(literal) },
                },
        };
      case "select":
      case "derive":
        return { op, columns: parseDqJson(columns) };
      case "group":
        return { op, by: parseDqJson(by), measures: parseDqJson(measures) };
      case "sort":
        return { op, keys: [{ value: pointer, direction, nulls: sortNulls }] };
      case "distinct":
        return { op, keys: path ? [pointer] : [] };
      case "slice":
        return {
          op,
          offset: /^\d+$/.test(offset) ? Number(offset) : NaN,
          limit: /^\d+$/.test(limit) ? Number(limit) : NaN,
        };
      case "unnest":
        return { op, pointer: path, as: alias, mode };
    }
  };
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 p-3">
      <p className="text-xs text-slate-600">{t("dataQuery.builderHelp")}</p>
      <DQSelect
        label={t("dataQuery.step")}
        value={op}
        onChange={(v) => {
          setOp(v as DQStep["op"]);
          setMode("left");
        }}
      >
        {[
          "filter",
          "join",
          "derive",
          "select",
          "group",
          "sort",
          "distinct",
          "slice",
          "unnest",
        ].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </DQSelect>
      {["filter", "join", "sort", "distinct", "unnest"].includes(op) && (
        <DQField label={t("dataQuery.path")} value={path} onChange={setPath} />
      )}
      {op === "join" && (
        <>
          <DQSelect
            label={t("dataQuery.joinSource")}
            value={source}
            onChange={setSource}
          >
            <DQSourceOptions project={project} />
          </DQSelect>
          <DQField
            label={t("dataQuery.rightPath")}
            value={rightPath}
            onChange={setRightPath}
          />
          <DQSelect
            label={t("dataQuery.nulls")}
            value={nulls}
            onChange={setNulls}
          >
            <option value="never">{t("dataQuery.never")}</option>
            <option value="equal">{t("dataQuery.equal")}</option>
          </DQSelect>
        </>
      )}
      {(op === "join" || op === "unnest") && (
        <>
          <DQField
            label={t("dataQuery.alias")}
            value={alias}
            onChange={setAlias}
          />
          <DQSelect
            label={t("dataQuery.joinMode")}
            value={mode}
            onChange={setMode}
          >
            {(op === "join"
              ? ["inner", "left", "semi", "anti"]
              : ["inner", "left"]
            ).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </DQSelect>
        </>
      )}
      {op === "filter" && (
        <>
          <DQSelect
            label={t("dataQuery.condition")}
            value={condition}
            onChange={setCondition}
          >
            {[
              "eq",
              "ne",
              "lt",
              "lte",
              "gt",
              "gte",
              "contains",
              "startsWith",
              "in",
              "isMissing",
              "isNull",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </DQSelect>
          {!["isMissing", "isNull"].includes(condition) && (
            <DQField
              label={t("dataQuery.literal")}
              value={literal}
              onChange={setLiteral}
            />
          )}
        </>
      )}
      {(op === "select" || op === "derive") && (
        <DQField
          label={t("dataQuery.columns")}
          value={columns}
          onChange={setColumns}
          multiline
        />
      )}
      {op === "group" && (
        <>
          <DQField
            label={t("dataQuery.by")}
            value={by}
            onChange={setBy}
            multiline
          />
          <DQField
            label={t("dataQuery.measures")}
            value={measures}
            onChange={setMeasures}
            multiline
          />
        </>
      )}
      {op === "sort" && (
        <>
          <DQSelect
            label={t("dataQuery.direction")}
            value={direction}
            onChange={setDirection}
          >
            <option value="asc">asc</option>
            <option value="desc">desc</option>
          </DQSelect>
          <DQSelect
            label={t("dataQuery.nulls")}
            value={sortNulls}
            onChange={setSortNulls}
          >
            <option value="first">{t("dataQuery.first")}</option>
            <option value="last">{t("dataQuery.last")}</option>
          </DQSelect>
        </>
      )}
      {op === "slice" && (
        <>
          <DQField
            label={t("dataQuery.offset")}
            value={offset}
            onChange={setOffset}
          />
          <DQField
            label={t("dataQuery.limit")}
            value={limit}
            onChange={setLimit}
          />
        </>
      )}
      <DQAction
        onClick={() => append(make)}
        disabled={query.steps.length >= 12}
      >
        {t("dataQuery.addStep")}
      </DQAction>
    </div>
  );
}
