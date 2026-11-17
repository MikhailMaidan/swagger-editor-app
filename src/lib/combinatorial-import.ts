import type { EndpointParameter, EndpointSummary } from "./openapi";
import {
  CTError,
  CT_LIMITS,
  normalizeCTProject,
  normalizeCTRows,
  parseCTJson,
  ctRecord,
  type CTChoice,
  type CTProject,
  type CTRow,
  type CTScalar,
} from "./combinatorial-model";
import { getByteSize } from "./text-encoding";

function parameterValue(parameter: EndpointParameter, value: string): CTScalar {
  if (parameter.type === "boolean") {
    if (value !== "true" && value !== "false") throw new CTError("schema");
    return value === "true";
  }
  if (parameter.type === "integer" || parameter.type === "number") {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))
      throw new CTError("schema");
    const n = Number(value);
    if (
      !Number.isFinite(n) ||
      (parameter.type === "integer" && !Number.isSafeInteger(n))
    )
      throw new CTError("schema");
    return n;
  }
  return value;
}
export function projectFromCTEndpoint(endpoint: EndpointSummary): CTProject {
  if (!endpoint.parameters.length) throw new CTError("schema");
  if (endpoint.parameters.length > CT_LIMITS.variables)
    throw new CTError("limit");
  const variables = endpoint.parameters.map((parameter, index) => {
    let values: CTScalar[];
    if (
      parameter.enumValues?.length &&
      parameter.enumValues.length +
        Number(!parameter.required && parameter.location !== "path") >
        CT_LIMITS.choices
    )
      throw new CTError("limit");
    if (parameter.enumValues?.length)
      values = parameter.enumValues.map((v) => parameterValue(parameter, v));
    else if (parameter.type === "boolean") values = [false, true];
    else if (parameter.type === "integer" || parameter.type === "number") {
      const integer = parameter.type === "integer";
      const min =
        parameter.minimum === undefined
          ? integer
            ? Math.floor(Math.min(0, parameter.maximum ?? 0))
            : Math.min(0, parameter.maximum ?? 0)
          : integer
            ? Math.ceil(parameter.minimum)
            : parameter.minimum;
      const max =
        parameter.maximum === undefined
          ? Math.max(min + 1, 1)
          : integer
            ? Math.floor(parameter.maximum)
            : parameter.maximum;
      if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min > max ||
        (integer && (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)))
      )
        throw new CTError("schema");
      values = [min, max];
      if (parameter.example)
        values.push(parameterValue(parameter, parameter.example));
      values = values.filter(
        (v) => typeof v === "number" && v >= min && v <= max,
      );
    } else {
      const min = parameter.minLength ?? 0,
        max = parameter.maxLength ?? Math.max(min, 7);
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < 0 ||
        min > max ||
        max > 2048
      )
        throw new CTError("schema");
      values = [
        parameter.example || "example",
        "a".repeat(min),
        "a".repeat(max),
      ].filter(
        (v) =>
          Array.from(String(v)).length >= min &&
          Array.from(String(v)).length <= max,
      );
    }
    values = [
      ...new Map(
        values.map((value) => [JSON.stringify(value), value]),
      ).values(),
    ];
    const choices: CTChoice[] = values.map((value, i) => ({
      id: `value-${i + 1}`,
      label: JSON.stringify(value).slice(0, 150),
      kind: "value",
      value,
    }));
    if (!parameter.required && parameter.location !== "path")
      choices.unshift({ id: "absent", label: "Omitted", kind: "omit" });
    if (!choices.length) throw new CTError("schema");
    return {
      id: `param-${index + 1}`,
      name: parameter.name,
      location: parameter.location,
      choices,
    };
  });
  return normalizeCTProject({
    version: 1,
    name: `${endpoint.method} ${endpoint.path}`.slice(0, 160),
    strength: Math.min(2, variables.length),
    seed: 42,
    variables,
    constraints: [],
    rows: [],
  });
}

function csvCells(source: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value !== "")) result.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (source[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (c === ",") pushCell();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      pushRow();
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new CTError("rows");
      cell += c;
    }
    if (result.length > CT_LIMITS.rows + 1) throw new CTError("limit");
  }
  if (quoted) throw new CTError("rows");
  if (cell || row.length || closed) pushRow();
  return result;
}
export function importCTRows(
  source: string,
  format: "json" | "csv",
  project: CTProject,
): CTRow[] {
  if (source.length > CT_LIMITS.bytes || getByteSize(source) > CT_LIMITS.bytes)
    throw new CTError("limit");
  if (format === "json") {
    const raw = parseCTJson(source);
    return normalizeCTRows(
      Array.isArray(raw) ? raw : ctRecord(raw).rows,
      project.variables,
    );
  }
  const [headers, ...data] = csvCells(source.replace(/^\uFEFF/, ""));
  const expected = [
    "case_id",
    "pinned",
    ...project.variables.map((v) => `choice:${v.id}`),
  ];
  if (
    !headers ||
    headers.length !== expected.length ||
    new Set(headers).size !== headers.length ||
    expected.some((h) => !headers.includes(h))
  )
    throw new CTError("rows");
  return normalizeCTRows(
    data.map((cells) => {
      if (cells.length !== headers.length) throw new CTError("rows");
      const values = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
      if (values.pinned !== "true" && values.pinned !== "false")
        throw new CTError("rows");
      return {
        id: values.case_id,
        name: values.case_id,
        pinned: values.pinned === "true",
        choices: Object.fromEntries(
          project.variables.map((v) => [v.id, values[`choice:${v.id}`]]),
        ),
      };
    }),
    project.variables,
  );
}
