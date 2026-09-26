import { parseTransformValue, type JsonValue } from "./api-transform";
import { getByteSize } from "./text-encoding";

export const MAX_SANDBOX_BYTES = 1024 * 1024;
export const MAX_SANDBOX_STATE_BYTES = 512 * 1024;
export const MAX_SANDBOX_BODY_BYTES = 64 * 1024;
export const MAX_SANDBOX_RESOURCES = 10;
export const MAX_SANDBOX_ROUTES = 100;
export const MAX_SANDBOX_HISTORY = 20;
export const SANDBOX_ACTIONS = [
  "list",
  "read",
  "create",
  "replace",
  "merge",
  "delete",
] as const;
export type SandboxAction = (typeof SANDBOX_ACTIONS)[number];
export type SandboxRecord = { [key: string]: JsonValue };
export type SandboxResource = {
  key: string;
  idField: string;
  idType: "number" | "string";
  seed: SandboxRecord[];
};
export type SandboxRoute = {
  key: string;
  method: string;
  path: string;
  resource: string;
  action: SandboxAction;
  idParameter: string;
  scope: Record<string, string>;
};
export type SandboxProject = {
  kind: "rsswag-stateful-sandbox";
  version: 1;
  name: string;
  resources: SandboxResource[];
  routes: SandboxRoute[];
};
export type SandboxState = {
  records: Record<string, SandboxRecord[]>;
  counters: Record<string, number>;
};
export type SandboxRequest = { method: string; path: string; body: string };
export type SandboxResponse = {
  status: number;
  headers: Record<string, string>;
  body: JsonValue | null;
};
export type SandboxResult = {
  state: SandboxState;
  response: SandboxResponse;
  route: string | null;
  changed: boolean;
};
export type SandboxLogEntry = {
  sequence: number;
  method: string;
  path: string;
  status: number;
  route: string | null;
  changed: boolean;
};
export type SandboxErrorCode =
  | "json"
  | "project"
  | "limit"
  | "resource"
  | "identity"
  | "route"
  | "ambiguous";
export class SandboxError extends Error {
  constructor(public code: SandboxErrorCode) {
    super(code);
  }
}
const record = (v: unknown): v is SandboxRecord =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v: SandboxRecord, key: string) =>
  Object.hasOwn(v, key) ? v[key] : undefined;
const validId = (id: unknown, type: SandboxResource["idType"]) =>
  type === "number"
    ? typeof id === "number" && Number.isSafeInteger(id)
    : typeof id === "string" &&
      id.length > 0 &&
      id.length <= 256 &&
      id !== "." &&
      id !== ".." &&
      !/[\u0000-\u001f\u007f]/.test(id);
const keyPattern = /^[a-z][a-z0-9-]{0,31}$/;
const field = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 100 &&
  !/[\u0000-\u001f\u007f]/.test(v);
const itemAction = (action: SandboxAction) =>
  ["read", "replace", "merge", "delete"].includes(action);
const allowedMethods: Record<SandboxAction, string[]> = {
  list: ["GET", "HEAD"],
  read: ["GET", "HEAD"],
  create: ["POST"],
  replace: ["PUT"],
  merge: ["PATCH"],
  delete: ["DELETE"],
};
const boundedText = (value: unknown, max = MAX_SANDBOX_BYTES) => {
  const text = JSON.stringify(value);
  if (typeof text !== "string" || getByteSize(text) > max)
    throw new SandboxError("limit");
  return text;
};
export function parseSandboxJson(text: string): JsonValue {
  if (getByteSize(text) > MAX_SANDBOX_BYTES) throw new SandboxError("limit");
  try {
    return parseTransformValue(text);
  } catch (error) {
    throw new SandboxError(
      record(error) && error.code === "limit" ? "limit" : "json",
    );
  }
}
function routeSegments(path: string) {
  if (
    typeof path !== "string" ||
    path.length > 2048 ||
    !path.startsWith("/") ||
    /[?#\s\\%\u0000-\u001f\u007f]/.test(path) ||
    path.includes("//") ||
    (path !== "/" && path.endsWith("/"))
  )
    throw new SandboxError("route");
  const segments = path === "/" ? [] : path.slice(1).split("/");
  if (
    segments.some(
      (s) =>
        s === "." ||
        s === ".." ||
        (/[{}]/.test(s) && !/^\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(s)),
    )
  )
    throw new SandboxError("route");
  const params = segments
    .filter((s) => s.startsWith("{"))
    .map((s) => s.slice(1, -1));
  if (new Set(params).size !== params.length) throw new SandboxError("route");
  return {
    segments,
    params,
    specificity: segments.filter((s) => !s.startsWith("{")).length,
  };
}
function checkRecords(resource: SandboxResource, records: SandboxRecord[]) {
  if (!Array.isArray(records) || records.length > 500)
    throw new SandboxError("limit");
  const ids = new Set<string>();
  for (const row of records) {
    if (!record(row)) throw new SandboxError("resource");
    const id = own(row, resource.idField);
    if (!validId(id, resource.idType)) throw new SandboxError("identity");
    if (ids.has(String(id))) throw new SandboxError("identity");
    ids.add(String(id));
  }
}
export function validateSandboxProject(input: unknown): SandboxProject {
  // Round-tripping accepts JSON data only and makes the returned project independent.
  const value = parseSandboxJson(boundedText(input));
  if (
    !record(value) ||
    value.kind !== "rsswag-stateful-sandbox" ||
    value.version !== 1 ||
    !field(value.name) ||
    !Array.isArray(value.resources) ||
    !Array.isArray(value.routes)
  )
    throw new SandboxError("project");
  if (
    value.resources.length > MAX_SANDBOX_RESOURCES ||
    value.routes.length > MAX_SANDBOX_ROUTES
  )
    throw new SandboxError("limit");
  const resourceKeys = new Set<string>();
  const resources: SandboxResource[] = value.resources.map((v) => {
    if (
      !record(v) ||
      typeof v.key !== "string" ||
      !keyPattern.test(v.key) ||
      resourceKeys.has(v.key) ||
      !field(v.idField) ||
      typeof v.idType !== "string" ||
      !["number", "string"].includes(v.idType) ||
      !Array.isArray(v.seed)
    )
      throw new SandboxError("resource");
    resourceKeys.add(v.key);
    const resource = {
      key: v.key,
      idField: v.idField,
      idType: v.idType as "number" | "string",
      seed: v.seed as SandboxRecord[],
    };
    checkRecords(resource, resource.seed);
    return resource;
  });
  const routeKeys = new Set<string>();
  const routes: SandboxRoute[] = value.routes.map((v) => {
    if (
      !record(v) ||
      typeof v.key !== "string" ||
      !keyPattern.test(v.key) ||
      routeKeys.has(v.key) ||
      typeof v.path !== "string" ||
      typeof v.method !== "string" ||
      !SANDBOX_ACTIONS.includes(v.action as SandboxAction) ||
      typeof v.resource !== "string" ||
      !resourceKeys.has(v.resource) ||
      typeof v.idParameter !== "string" ||
      !record(v.scope)
    )
      throw new SandboxError("route");
    routeKeys.add(v.key);
    const action = v.action as SandboxAction;
    const { params } = routeSegments(v.path);
    const resource = resources.find((r) => r.key === v.resource)!;
    if (
      !allowedMethods[action].includes(v.method) ||
      (itemAction(action)
        ? !params.includes(v.idParameter)
        : v.idParameter !== "")
    )
      throw new SandboxError("route");
    const scopes = Object.entries(v.scope);
    if (
      scopes.some(
        ([param, target]) =>
          !params.includes(param) ||
          param === v.idParameter ||
          !field(target) ||
          target === resource.idField,
      ) ||
      new Set(scopes.map(([, target]) => target)).size !== scopes.length ||
      params.some(
        (param) =>
          param !== v.idParameter && !scopes.some(([key]) => key === param),
      )
    )
      throw new SandboxError("route");
    const route = {
      key: v.key,
      method: v.method,
      path: v.path,
      resource: v.resource,
      action,
      idParameter: v.idParameter,
      scope: v.scope as Record<string, string>,
    };
    return route;
  });
  for (let i = 0; i < routes.length; i++) {
    const a = routeSegments(routes[i].path);
    for (const other of routes.slice(i + 1)) {
      if (routes[i].method !== other.method) continue;
      const b = routeSegments(other.path);
      if (
        a.specificity === b.specificity &&
        a.segments.length === b.segments.length &&
        a.segments.every(
          (s, index) =>
            s === b.segments[index] ||
            s.startsWith("{") ||
            b.segments[index].startsWith("{"),
        )
      )
        throw new SandboxError("ambiguous");
    }
  }
  const project: SandboxProject = {
    kind: "rsswag-stateful-sandbox",
    version: 1,
    name: value.name,
    resources,
    routes,
  };
  checkState(project, {
    records: Object.fromEntries(resources.map((r) => [r.key, r.seed])),
    counters: {},
  });
  return project;
}
function checkState(project: SandboxProject, state: SandboxState) {
  if (
    Object.values(state.records).reduce((n, rows) => n + rows.length, 0) > 2000
  )
    throw new SandboxError("limit");
  parseSandboxJson(boundedText(state.records, MAX_SANDBOX_STATE_BYTES));
  for (const resource of project.resources)
    checkRecords(resource, state.records[resource.key]);
}
export function parseSandboxProject(text: string) {
  return validateSandboxProject(parseSandboxJson(text));
}
export function serializeSandboxProject(project: SandboxProject) {
  const text = JSON.stringify(validateSandboxProject(project), null, 2) + "\n";
  if (getByteSize(text) > MAX_SANDBOX_BYTES) throw new SandboxError("limit");
  return text;
}
export function createSandboxState(input: SandboxProject): SandboxState {
  const project = validateSandboxProject(input);
  return {
    records: Object.fromEntries(project.resources.map((r) => [r.key, r.seed])),
    counters: Object.fromEntries(
      project.resources.map((r) => [
        r.key,
        r.idType === "number"
          ? Math.max(0, ...r.seed.map((row) => row[r.idField] as number))
          : 0,
      ]),
    ),
  };
}
export function snapshotSandboxProject(
  project: SandboxProject,
  state: SandboxState,
) {
  return validateSandboxProject({
    ...project,
    resources: project.resources.map((r) => ({
      ...r,
      seed: state.records[r.key],
    })),
  });
}
export function serializeSandboxState(
  project: SandboxProject,
  state: SandboxState,
) {
  checkState(project, state);
  const text =
    JSON.stringify(
      {
        kind: "rsswag-sandbox-records",
        version: 1,
        name: project.name,
        records: state.records,
      },
      null,
      2,
    ) + "\n";
  if (getByteSize(text) > MAX_SANDBOX_BYTES) throw new SandboxError("limit");
  return text;
}
export function serializeSandboxLog(
  project: SandboxProject,
  entries: SandboxLogEntry[],
) {
  // Bodies and record values are deliberately excluded; paths can still contain private IDs/query values.
  return (
    JSON.stringify(
      {
        kind: "rsswag-sandbox-log",
        version: 1,
        name: project.name,
        retainedEntries: Math.min(entries.length, MAX_SANDBOX_HISTORY),
        entries: entries.slice(-MAX_SANDBOX_HISTORY).map((e) => ({
          sequence: e.sequence,
          method: e.method,
          path: e.path,
          status: e.status,
          route: e.route,
          changed: e.changed,
        })),
      },
      null,
      2,
    ) + "\n"
  );
}
export function createSandboxDemo(): SandboxProject {
  const actions: SandboxAction[] = [
    "list",
    "read",
    "create",
    "replace",
    "merge",
    "delete",
  ];
  return {
    kind: "rsswag-stateful-sandbox",
    version: 1,
    name: "Task workflow",
    resources: [
      {
        key: "tasks",
        idField: "id",
        idType: "number",
        seed: [{ id: 1, title: "Try the stateful sandbox", done: false }],
      },
    ],
    routes: actions.map((action) => ({
      key: `tasks-${action}`,
      method: allowedMethods[action][0],
      path: itemAction(action) ? "/tasks/{id}" : "/tasks",
      resource: "tasks",
      action,
      idParameter: itemAction(action) ? "id" : "",
      scope: {},
    })),
  };
}
export function suggestSandboxAction(
  method: string,
  path: string,
): SandboxAction {
  if (method === "POST") return "create";
  if (method === "PUT") return "replace";
  if (method === "PATCH") return "merge";
  if (method === "DELETE") return "delete";
  return /\{[^}]+\}$/.test(path) ? "read" : "list";
}

/** Pure local simulation: callers retain the old state for undo; failures never mutate it. */
export function executeSandboxRequest(
  project: SandboxProject,
  state: SandboxState,
  request: SandboxRequest,
): SandboxResult {
  let route: SandboxRoute | undefined = undefined;
  const method = request.method.toUpperCase();
  const respond = (
    status: number,
    body: JsonValue | null,
    headers: Record<string, string> = {},
    next = state,
  ): SandboxResult => ({
    state: next,
    route: route?.key ?? null,
    changed: next !== state,
    response: {
      status,
      headers: {
        ...(status === 204 ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: method === "HEAD" ? null : body,
    },
  });
  const error = (status: number, code: string) =>
    respond(status, { error: code });
  if (
    !/^[A-Z]+$/.test(method) ||
    request.path.length > 4096 ||
    !request.path.startsWith("/") ||
    request.path.startsWith("//") ||
    /[#\s\\\u0000-\u001f]/.test(request.path)
  )
    return error(400, "invalid_local_path");
  if (getByteSize(request.body) > MAX_SANDBOX_BODY_BYTES)
    return error(413, "body_limit");
  const separator = request.path.indexOf("?");
  const pathname =
    separator < 0 ? request.path : request.path.slice(0, separator);
  let segments: string[];
  try {
    segments =
      pathname === "/"
        ? []
        : pathname.slice(1).split("/").map(decodeURIComponent);
    if (
      segments.some(
        (s) => !s || s === "." || s === ".." || /[\u0000-\u001f\u007f]/.test(s),
      )
    )
      return error(400, "invalid_local_path");
  } catch {
    return error(400, "invalid_local_path");
  }
  const matches = project.routes
    .map((r) => ({ route: r, ...routeSegments(r.path) }))
    .filter(
      (r) =>
        r.segments.length === segments.length &&
        r.segments.every((s, i) => s.startsWith("{") || s === segments[i]),
    );
  // Explicit HEAD bindings take priority over the GET fallback.
  const methodMatches = matches.filter((r) => r.route.method === method);
  const candidates = methodMatches.length
    ? methodMatches
    : method === "HEAD"
      ? matches.filter((r) => r.route.method === "GET")
      : [];
  const match = candidates.sort((a, b) => b.specificity - a.specificity)[0];
  if (!match) {
    if (!matches.length) return error(404, "route_not_found");
    const allow = new Set(matches.map((m) => m.route.method));
    if (allow.has("GET")) allow.add("HEAD");
    return respond(
      405,
      { error: "method_not_allowed" },
      { allow: [...allow].sort().join(", ") },
    );
  }
  route = match.route;
  const params = Object.fromEntries(
    match.segments.flatMap((s, i) =>
      s.startsWith("{") ? [[s.slice(1, -1), segments[i]]] : [],
    ),
  );
  const resource = project.resources.find((r) => r.key === route!.resource)!;
  const rows = state.records[resource.key];
  const scope = Object.entries(route.scope).map(([param, target]) => [
    target,
    params[param],
  ]);
  const inScope = (row: SandboxRecord) =>
    scope.every(([target, value]) => {
      const stored = own(row, target);
      return (
        stored !== undefined &&
        stored !== null &&
        typeof stored !== "object" &&
        String(stored) === value
      );
    });
  const index = rows.findIndex(
    (row) =>
      String(own(row, resource.idField)) === params[route!.idParameter] &&
      inScope(row),
  );
  if (route.action === "list") {
    const query = new URLSearchParams(
      separator < 0 ? "" : request.path.slice(separator + 1),
    );
    const integer = (name: string, fallback: number) => {
      const values = query.getAll(name);
      if (!values.length) return fallback;
      return values.length === 1 &&
        /^(0|[1-9]\d*)$/.test(values[0]) &&
        Number.isSafeInteger(Number(values[0]))
        ? Number(values[0])
        : NaN;
    };
    const offset = integer("_offset", 0),
      limit = integer("_limit", 100);
    if (!Number.isFinite(offset) || !Number.isFinite(limit) || limit > 500)
      return error(400, "invalid_pagination");
    const filters = [...new Set(query.keys())].filter(
      (k) => k !== "_offset" && k !== "_limit",
    );
    const filtered = rows.filter(
      (row) =>
        inScope(row) &&
        filters.every((key) => {
          const value = own(row, key);
          return (
            value !== undefined &&
            value !== null &&
            typeof value !== "object" &&
            query.getAll(key).includes(String(value))
          );
        }),
    );
    return respond(200, filtered.slice(offset, offset + limit), {
      "x-total-count": String(filtered.length),
      "x-offset": String(offset),
      "x-limit": String(limit),
    });
  }
  if (itemAction(route.action) && index < 0)
    return error(404, "record_not_found");
  if (route.action === "read") return respond(200, rows[index]);
  if (route.action === "delete") {
    const next = {
      ...state,
      records: {
        ...state.records,
        [resource.key]: rows.filter((_, i) => i !== index),
      },
    };
    return respond(204, null, {}, next);
  }
  let body: SandboxRecord;
  try {
    const parsed = parseSandboxJson(request.body);
    if (!record(parsed)) return error(400, "object_body_required");
    body = parsed;
  } catch {
    return error(400, "invalid_json_body");
  }
  if (
    scope.some(
      ([target, value]) =>
        own(body, target) !== undefined &&
        (typeof own(body, target) === "object" ||
          String(own(body, target)) !== value),
    )
  )
    return error(409, "scope_conflict");
  let counter = state.counters[resource.key];
  let id = own(body, resource.idField);
  if (id !== undefined && !validId(id, resource.idType))
    return error(400, "invalid_id");
  if (route.action === "create") {
    if (id === undefined) {
      do {
        counter++;
        if (!Number.isSafeInteger(counter)) return error(409, "id_exhausted");
        id = resource.idType === "number" ? counter : `sandbox-${counter}`;
      } while (
        rows.some((row) => String(own(row, resource.idField)) === String(id))
      );
    }
    if (rows.some((row) => String(own(row, resource.idField)) === String(id)))
      return error(409, "duplicate_id");
  } else {
    const previousId = own(rows[index], resource.idField)!;
    if (id !== undefined && id !== previousId)
      return error(409, "identity_conflict");
    id = previousId;
  }
  if (id === undefined || !validId(id, resource.idType))
    return error(400, "invalid_id");
  if (typeof id === "number") counter = Math.max(counter, id);
  // Own-property construction also preserves fields such as __proto__ as data.
  const result: SandboxRecord = {
    ...(route.action === "merge" ? rows[index] : {}),
    ...body,
    [resource.idField]: id,
    ...Object.fromEntries(
      scope.map(([target, value]) => [
        target,
        own(body, target) ??
          (index >= 0 ? own(rows[index], target) : undefined) ??
          value,
      ]),
    ),
  };
  const next: SandboxState = {
    records: {
      ...state.records,
      [resource.key]:
        route.action === "create"
          ? [...rows, result]
          : rows.map((row, i) => (i === index ? result : row)),
    },
    counters: { ...state.counters, [resource.key]: counter },
  };
  try {
    checkState(project, next);
  } catch (e) {
    return error(
      e instanceof SandboxError && e.code === "limit" ? 507 : 400,
      "state_limit_or_invalid_record",
    );
  }
  return respond(route.action === "create" ? 201 : 200, result, {}, next);
}
