import { describe, expect, it } from "vitest";
import {
  createSandboxDemo,
  createSandboxState,
  executeSandboxRequest,
  MAX_SANDBOX_BODY_BYTES,
  MAX_SANDBOX_BYTES,
  parseSandboxProject,
  SandboxError,
  serializeSandboxLog,
  serializeSandboxProject,
  serializeSandboxState,
  snapshotSandboxProject,
  suggestSandboxAction,
  validateSandboxProject,
  type SandboxProject,
  type SandboxState,
} from "./api-sandbox";

function harness(project = createSandboxDemo()) {
  const valid = validateSandboxProject(project);
  let state = createSandboxState(valid);
  return {
    project: valid,
    state: () => state,
    send(method: string, path: string, body = "") {
      const result = executeSandboxRequest(valid, state, {
        method,
        path,
        body,
      });
      state = result.state;
      return result;
    },
  };
}
function scopedProject() {
  const project = createSandboxDemo();
  project.resources[0].seed = [
    { id: 1, team: 5, title: "First" },
    { id: 2, team: "other", title: "Second" },
    { id: 3, team: { toString: 1 }, title: "Not a scalar" },
  ];
  project.routes = project.routes.map((r) => ({
    ...r,
    path: `/teams/{teamId}${r.path}`,
    scope: { teamId: "team" },
  }));
  return project;
}
describe("stateful sandbox workflows", () => {
  it("rehearses CRUD without modifying previous snapshots or the project seeds", () => {
    const h = harness();
    const before = h.state();
    expect(
      h.send("POST", "/tasks", '{"title":"Created","nested":{"x":1}}').response,
    ).toMatchObject({ status: 201, body: { id: 2, title: "Created" } });
    expect(h.send("GET", "/tasks/2").response.body).toMatchObject({
      id: 2,
      title: "Created",
    });
    expect(
      h.send(
        "PATCH",
        "/tasks/2",
        '{"done":true,"nested":{"y":2},"nullable":null}',
      ).response.body,
    ).toEqual({
      id: 2,
      title: "Created",
      done: true,
      nested: { y: 2 },
      nullable: null,
    });
    expect(
      h.send("PUT", "/tasks/2", '{"title":"Replaced"}').response.body,
    ).toEqual({ id: 2, title: "Replaced" });
    expect(h.send("DELETE", "/tasks/2").response).toEqual({
      status: 204,
      headers: {},
      body: null,
    });
    expect(h.send("GET", "/tasks/2").response.status).toBe(404);
    expect(h.send("POST", "/tasks", "{}").response.body).toEqual({ id: 3 });
    expect(before.records.tasks).toEqual(h.project.resources[0].seed);
    expect(before.records.tasks).toHaveLength(1);
    expect(before.counters.tasks).toBe(1);
  });
  it("preserves state and ID counters for failed requests", () => {
    const h = harness();
    const before = h.state();
    for (const [method, path, body, status] of [
      ["POST", "/tasks", '{"id":1}', 409],
      ["POST", "/tasks", '{"id":"2"}', 400],
      ["POST", "/tasks", '{"id":{"toString":null}}', 400],
      ["POST", "/tasks", '{"id":[2]}', 400],
      ["POST", "/tasks", '{"id":null}', 400],
      ["POST", "/tasks", "[]", 400],
      ["POST", "/tasks", "{", 400],
      ["PATCH", "/tasks/1", '{"id":2}', 409],
      ["DELETE", "/tasks/99", "", 404],
    ] as const) {
      const result = h.send(method, path, body);
      expect(result.response.status).toBe(status);
      expect(result.changed).toBe(false);
      expect(result.state).toBe(before);
    }
    expect(h.send("POST", "/tasks", "{}").response.body).toEqual({ id: 2 });
  });
  it("handles explicit numeric IDs, zero, negative IDs, and exhaustion", () => {
    const h = harness();
    for (const id of [0, -1, 20])
      expect(
        h.send("POST", "/tasks", JSON.stringify({ id })).response.status,
      ).toBe(201);
    expect(h.send("GET", "/tasks/0").response.body).toEqual({ id: 0 });
    expect(h.send("POST", "/tasks", "{}").response.body).toEqual({ id: 21 });
    h.send("POST", "/tasks", JSON.stringify({ id: Number.MAX_SAFE_INTEGER }));
    const before = h.state();
    expect(h.send("POST", "/tasks", "{}").response.body).toEqual({
      error: "id_exhausted",
    });
    expect(h.state()).toBe(before);
  });
  it("generates collision-free string IDs and decodes item identifiers once", () => {
    const p = createSandboxDemo();
    p.resources[0].idType = "string";
    p.resources[0].seed = [{ id: "sandbox-1" }, { id: "a/b" }, { id: "100%" }];
    const h = harness(p);
    expect(h.send("POST", "/tasks", "{}").response.body).toEqual({
      id: "sandbox-2",
    });
    expect(h.send("GET", "/tasks/a%2Fb").response.body).toEqual({ id: "a/b" });
    expect(h.send("GET", "/tasks/100%25").response.body).toEqual({
      id: "100%",
    });
    expect(h.send("GET", "/tasks/a%252Fb").response.status).toBe(404);
  });
  it("filters scalar values, repeated alternatives, and paginates with totals", () => {
    const p = createSandboxDemo();
    p.resources[0].seed = [
      { id: 1, done: true },
      { id: 2, done: false },
      { id: 3, done: true },
      { id: 4, done: null },
    ];
    const h = harness(p);
    expect(
      h.send("GET", "/tasks?done=true&_offset=1&_limit=1").response,
    ).toMatchObject({
      status: 200,
      body: [{ id: 3, done: true }],
      headers: { "x-total-count": "2", "x-offset": "1", "x-limit": "1" },
    });
    expect(h.send("GET", "/tasks?id=1&id=2").response.body).toHaveLength(2);
    expect(h.send("GET", "/tasks?constructor=Object").response.body).toEqual(
      [],
    );
    expect(h.send("GET", "/tasks?done=null").response.body).toEqual([]);
    expect(h.send("GET", "/tasks?_limit=0").response.body).toEqual([]);
  });
  it.each([
    "_offset=-1",
    "_offset=1.2",
    "_limit=501",
    "_limit=",
    "_limit=1&_limit=2",
    "_offset=9007199254740992",
  ])("rejects invalid pagination %s", (query) => {
    const h = harness();
    const before = h.state();
    expect(h.send("GET", `/tasks?${query}`).response.status).toBe(400);
    expect(h.state()).toBe(before);
  });
  it("scopes nested routes and injects/preserves parent fields", () => {
    const h = harness(scopedProject());
    expect(h.send("GET", "/teams/5/tasks").response.body).toEqual([
      { id: 1, team: 5, title: "First" },
    ]);
    expect(h.send("GET", "/teams/other/tasks/1").response.status).toBe(404);
    expect(
      h.send("PATCH", "/teams/5/tasks/1", '{"title":"Changed"}').response.body,
    ).toEqual({ id: 1, team: 5, title: "Changed" });
    expect(h.send("PUT", "/teams/5/tasks/1", "{}").response.body).toEqual({
      id: 1,
      team: 5,
    });
    expect(h.send("POST", "/teams/5/tasks", "{}").response.body).toEqual({
      id: 4,
      team: "5",
    });
    const before = h.state();
    expect(
      h.send("POST", "/teams/5/tasks", '{"team":"other"}').response.status,
    ).toBe(409);
    expect(
      h.send("PATCH", "/teams/5/tasks/1", '{"team":null}').response.status,
    ).toBe(409);
    expect(h.state()).toBe(before);
  });
  it("uses static routes ahead of parameter routes and returns Allow for wrong methods", () => {
    const p = createSandboxDemo();
    p.routes.push({ ...p.routes[0], key: "special", path: "/tasks/special" });
    const h = harness(p);
    expect(h.send("GET", "/tasks/special").route).toBe("special");
    expect(h.send("OPTIONS", "/tasks").response).toMatchObject({
      status: 405,
      headers: { allow: "GET, HEAD, POST" },
    });
    expect(h.send("GET", "/unknown").response.status).toBe(404);
  });
  it("implements HEAD without response bodies or state changes, including errors", () => {
    const h = harness();
    const before = h.state();
    expect(h.send("HEAD", "/tasks").response).toMatchObject({
      status: 200,
      body: null,
      headers: { "x-total-count": "1" },
    });
    expect(h.send("HEAD", "/tasks/1").response.body).toBeNull();
    expect(h.send("HEAD", "/tasks/99").response).toMatchObject({
      status: 404,
      body: null,
    });
    expect(h.state()).toBe(before);
  });
  it.each([
    "https://example.com/tasks",
    "//example.com/tasks",
    "/tasks/%zz",
    "/tasks/..",
    "/tasks/%00",
    "/tasks/1#x",
    "/tasks/",
    "/tasks//1",
  ])("rejects malformed local path %s", (path) => {
    expect(harness().send("GET", path).response.status).toBe(400);
  });
  it("rejects oversized bodies and capacity overflow without consuming IDs", () => {
    const p = createSandboxDemo();
    p.resources[0].seed = Array.from({ length: 500 }, (_, id) => ({ id }));
    const h = harness(p);
    const before = h.state();
    expect(
      h.send("POST", "/tasks", "x".repeat(MAX_SANDBOX_BODY_BYTES + 1)).response
        .status,
    ).toBe(413);
    expect(h.send("POST", "/tasks", "{}").response.status).toBe(507);
    expect(h.state()).toBe(before);
  });
  it("treats prototype-looking keys as ordinary record data", () => {
    const p = createSandboxDemo();
    p.resources[0].idField = "__proto__";
    p.resources[0].seed = JSON.parse('[{"__proto__":1,"constructor":"seed"}]');
    const h = harness(p);
    const result = h.send(
      "POST",
      "/tasks",
      '{"__proto__":2,"constructor":"value","toString":false}',
    );
    expect(result.response.status).toBe(201);
    expect(JSON.stringify(result.response.body)).toBe(
      '{"__proto__":2,"constructor":"value","toString":false}',
    );
    expect(
      h.send("GET", "/tasks?constructor=value").response.body,
    ).toHaveLength(1);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});
describe("sandbox project validation and portability", () => {
  it("rejects coerced ID types and unaddressable string IDs in seeds and writes", () => {
    const p = createSandboxDemo();
    expect(() =>
      validateSandboxProject({
        ...p,
        resources: [{ ...p.resources[0], idType: ["number"] }],
      }),
    ).toThrow(new SandboxError("resource"));
    p.resources[0].idType = "string";
    p.resources[0].seed = [];
    for (const id of [
      "",
      ".",
      "..",
      "bad\u0000id",
      "bad\u007fid",
      "x".repeat(257),
    ]) {
      expect(() =>
        validateSandboxProject({
          ...p,
          resources: [{ ...p.resources[0], seed: [{ id }] }],
        }),
      ).toThrow(new SandboxError("identity"));
      const h = harness(p),
        before = h.state();
      expect(
        h.send("POST", "/tasks", JSON.stringify({ id })).response.status,
      ).toBe(400);
      expect(h.state()).toBe(before);
    }
  });
  it("enforces aggregate state bytes atomically and bounds exported log metadata", () => {
    const p = createSandboxDemo();
    p.resources[0].seed = Array.from({ length: 8 }, (_, id) => ({
      id,
      data: "x".repeat(63000),
    }));
    const h = harness(p),
      before = h.state();
    expect(
      h.send("POST", "/tasks", JSON.stringify({ data: "x".repeat(30000) }))
        .response.status,
    ).toBe(507);
    expect(h.state()).toBe(before);
    const log = JSON.parse(
      serializeSandboxLog(
        p,
        Array.from({ length: 25 }, (_, sequence) => ({
          sequence,
          method: "GET",
          path: "/tasks",
          status: 200,
          route: "tasks-list",
          changed: false,
        })),
      ),
    );
    expect(log.retainedEntries).toBe(20);
    expect(log.entries[0].sequence).toBe(5);
  });
  it("round-trips projects, snapshots current records as new seeds, and exports value-free logs", () => {
    const h = harness();
    h.send("POST", "/tasks", '{"secret":"private-value"}');
    expect(parseSandboxProject(serializeSandboxProject(h.project))).toEqual(
      h.project,
    );
    expect(h.project.resources[0].seed).toHaveLength(1);
    const snapshot = snapshotSandboxProject(h.project, h.state());
    expect(snapshot.resources[0].seed).toHaveLength(2);
    expect(createSandboxState(snapshot).records).toEqual(h.state().records);
    expect(
      JSON.parse(serializeSandboxState(h.project, h.state())).records.tasks,
    ).toHaveLength(2);
    const log = serializeSandboxLog(h.project, [
      {
        sequence: 1,
        method: "POST",
        path: "/tasks",
        status: 201,
        route: "tasks-create",
        changed: true,
        body: "private-value",
      } as never,
    ]);
    expect(log).not.toContain("private-value");
    expect(JSON.parse(log).entries).toHaveLength(1);
  });
  it.each([
    ["version", (p: SandboxProject) => ({ ...p, version: 2 }), "project"],
    [
      "duplicate resource",
      (p: SandboxProject) => ({
        ...p,
        resources: [...p.resources, p.resources[0]],
      }),
      "resource",
    ],
    [
      "missing IDs",
      (p: SandboxProject) => ({
        ...p,
        resources: [{ ...p.resources[0], seed: [{}] }],
      }),
      "identity",
    ],
    [
      "duplicate IDs",
      (p: SandboxProject) => ({
        ...p,
        resources: [{ ...p.resources[0], seed: [{ id: 1 }, { id: 1 }] }],
      }),
      "identity",
    ],
    [
      "bad ID type",
      (p: SandboxProject) => ({
        ...p,
        resources: [{ ...p.resources[0], seed: [{ id: 1.5 }] }],
      }),
      "identity",
    ],
    [
      "wrong method",
      (p: SandboxProject) => ({
        ...p,
        routes: [{ ...p.routes[0], method: "POST" }],
      }),
      "route",
    ],
    [
      "missing resource",
      (p: SandboxProject) => ({
        ...p,
        routes: [{ ...p.routes[0], resource: "missing" }],
      }),
      "route",
    ],
    [
      "duplicate key",
      (p: SandboxProject) => ({ ...p, routes: [...p.routes, p.routes[0]] }),
      "route",
    ],
    [
      "unmapped parameter",
      (p: SandboxProject) => ({
        ...p,
        routes: [{ ...p.routes[0], path: "/teams/{team}/tasks" }],
      }),
      "route",
    ],
    [
      "ID scope collision",
      (p: SandboxProject) => ({
        ...p,
        routes: [
          {
            ...p.routes[0],
            path: "/teams/{team}/tasks",
            scope: { team: "id" },
          },
        ],
      }),
      "route",
    ],
    [
      "ambiguous templates",
      (p: SandboxProject) => ({
        ...p,
        routes: [
          ...p.routes,
          {
            ...p.routes[1],
            key: "duplicate",
            path: "/tasks/{other}",
            idParameter: "other",
          },
        ],
      }),
      "ambiguous",
    ],
    [
      "overlapping static segments",
      (p: SandboxProject) => ({
        ...p,
        routes: [
          { ...p.routes[1], path: "/tasks/{id}/more" },
          { ...p.routes[1], key: "duplicate", path: "/tasks/more/{id}" },
        ],
      }),
      "ambiguous",
    ],
  ] as const)("rejects %s", (_, mutate, code) => {
    expect(() => validateSandboxProject(mutate(createSandboxDemo()))).toThrow(
      new SandboxError(code),
    );
  });
  it("bounds imports, aggregate records, and JSON structure", () => {
    expect(() =>
      parseSandboxProject(" ".repeat(MAX_SANDBOX_BYTES + 1)),
    ).toThrow(new SandboxError("limit"));
    expect(() => parseSandboxProject("[]")).toThrow(
      new SandboxError("project"),
    );
    expect(() => parseSandboxProject("{")).toThrow(new SandboxError("json"));
    const p = createSandboxDemo();
    p.resources = Array.from({ length: 5 }, (_, i) => ({
      key: `resource-${i}`,
      idField: "id",
      idType: "number",
      seed: Array.from({ length: 500 }, (_, id) => ({ id })),
    }));
    p.routes = [];
    expect(() => validateSandboxProject(p)).toThrow(new SandboxError("limit"));
  });
  it("allows independent resource identities and resets counters with seed state", () => {
    const p = createSandboxDemo();
    p.resources.push({ ...p.resources[0], key: "other" });
    const first: SandboxState = createSandboxState(p);
    first.records.tasks[0].title = "Changed externally";
    expect(p.resources[0].seed[0].title).toBe("Try the stateful sandbox");
    expect(first.records.other[0].title).toBe("Try the stateful sandbox");
    expect(createSandboxState(p).records.tasks[0].title).toBe(
      "Try the stateful sandbox",
    );
  });
  it("suggests actions for editor endpoint bindings", () => {
    expect(suggestSandboxAction("GET", "/tasks")).toBe("list");
    expect(suggestSandboxAction("HEAD", "/tasks/{id}")).toBe("read");
    expect(suggestSandboxAction("POST", "/tasks")).toBe("create");
    expect(suggestSandboxAction("PUT", "/tasks/{id}")).toBe("replace");
    expect(suggestSandboxAction("PATCH", "/tasks/{id}")).toBe("merge");
    expect(suggestSandboxAction("DELETE", "/tasks/{id}")).toBe("delete");
  });
});
