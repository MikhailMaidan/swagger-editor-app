import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyMergeProject,
  MAX_MERGE_CONFLICTS,
  MAX_MERGE_CUSTOM_BYTES,
  MAX_MERGE_PROJECT_BYTES,
  MAX_MERGE_SOURCE_BYTES,
  mergeOpenApi,
  mergeReport,
  mergeReportMarkdown,
  parseMergeCustom,
  parseMergeProject,
  serializeMergedApi,
  serializeMergeProject,
  type MergePlan,
  type MergeResolution,
} from "./openapi-merge";
afterEach(() => vi.restoreAllMocks());
function api() {
  return {
    openapi: "3.1.0",
    info: { title: "Shop", version: "1" },
    paths: {
      "/items": {
        get: { summary: "List", responses: { "200": { description: "OK" } } },
      },
    },
  };
}
const clone = <T>(v: T): T => structuredClone(v);
function merge(
  base: unknown,
  ours: unknown,
  theirs: unknown,
  resolutions: MergeResolution[] = [],
  keyedArrays = true,
) {
  return mergeOpenApi(
    {
      base: JSON.stringify(base),
      ours: JSON.stringify(ours),
      theirs: JSON.stringify(theirs),
    },
    { resolutions, keyedArrays },
  );
}
const result = (plan: MergePlan) =>
  JSON.parse(serializeMergedApi(plan, "json"));
const param = (
  name: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  name,
  in: "query",
  schema: { type: "string" },
  ...extra,
});
const server = (
  url: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  url,
  ...extra,
});
function parameters(...values: ReturnType<typeof param>[]) {
  const root = api() as Record<string, unknown>;
  (root.paths as Record<string, unknown>)["/items"] = {
    get: {
      summary: "List",
      parameters: values,
      responses: { "200": { description: "OK" } },
    },
  };
  return root;
}
function parameterValues(root: Record<string, unknown>) {
  return (
    (root.paths as Record<string, unknown>)["/items"] as {
      get: { parameters: ReturnType<typeof param>[] };
    }
  ).get.parameters;
}

describe("OpenAPI three-way object merge", () => {
  it("merges independent changes and additions while preserving unknown fields and source inputs", () => {
    const base = api(),
      ours = clone(base),
      theirs = clone(base);
    ours.info.title = "Our shop";
    theirs.info.version = "2";
    (ours as Record<string, unknown>)["x-ours"] = { keep: true };
    (theirs as Record<string, unknown>)["x-theirs"] = { keep: true };
    const originals = [base, ours, theirs].map((v) => JSON.stringify(v));
    const network = vi.spyOn(globalThis, "fetch");
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toEqual([]);
    expect(plan.resolvedCount).toBe(0);
    expect(result(plan)).toMatchObject({
      info: { title: "Our shop", version: "2" },
      "x-ours": { keep: true },
      "x-theirs": { keep: true },
    });
    expect([base, ours, theirs].map((v) => JSON.stringify(v))).toEqual(
      originals,
    );
    expect(network).not.toHaveBeenCalled();
  });
  it("retains one-sided deletions and equal changes without manufacturing conflicts", () => {
    const base = { ...api(), "x-delete": 1, "x-equal": 1 },
      ours = clone(base),
      theirs = clone(base);
    delete (ours as Record<string, unknown>)["x-delete"];
    ours["x-equal"] = 2;
    theirs["x-equal"] = 2;
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toEqual([]);
    expect(result(plan)).not.toHaveProperty("x-delete");
    expect(result(plan)["x-equal"]).toBe(2);
  });
  it("ignores object key ordering but preserves array ordering as data", () => {
    const base = api(),
      ours = { paths: base.paths, info: base.info, openapi: base.openapi },
      theirs = clone(base);
    theirs.info.version = "2";
    expect(merge(base, ours, theirs).conflicts).toEqual([]);
    const a = { ...api(), "x-array": [1, 2] },
      o = { ...a, "x-array": [2, 1] },
      t = { ...a, "x-array": [1, 3] };
    expect(merge(a, o, t).conflicts[0]).toMatchObject({
      kind: "array",
      location: "/x-array",
    });
  });
  it("does not export an unresolved value conflict or insert text conflict markers", () => {
    const base = api(),
      ours = clone(base),
      theirs = clone(base);
    ours.info.title = "Ours";
    theirs.info.title = "Theirs";
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts[0]).toMatchObject({
      kind: "value",
      location: "/info/title",
      base: { present: true, value: "Shop" },
      ours: { value: "Ours" },
      theirs: { value: "Theirs" },
    });
    expect(plan.document).toBeNull();
    expect(plan.candidateText).toBe("");
    expect(() => serializeMergedApi(plan, "json")).toThrow("result");
  });
  it.each(["base", "ours", "theirs"] as const)(
    "uses an explicit %s conflict resolution",
    (choice) => {
      const base = api(),
        ours = clone(base),
        theirs = clone(base);
      ours.info.title = "Ours";
      theirs.info.title = "Theirs";
      const plan = merge(base, ours, theirs, [{ id: "/info/title", choice }]);
      expect(plan.resolvedCount).toBe(1);
      expect(result(plan).info.title).toBe(
        choice === "base" ? "Shop" : choice === "ours" ? "Ours" : "Theirs",
      );
    },
  );
  it("keeps absent values distinct from null and allows choosing deletion", () => {
    const base = { ...api(), "x-value": null },
      ours = clone(base),
      theirs = { ...base, "x-value": false };
    delete (ours as Record<string, unknown>)["x-value"];
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts[0]).toMatchObject({
      kind: "delete-edit",
      base: { present: true, value: null },
      ours: { present: false },
    });
    expect(
      result(merge(base, ours, theirs, [{ id: "/x-value", choice: "ours" }])),
    ).not.toHaveProperty("x-value");
    expect(
      result(
        merge(base, ours, theirs, [
          { id: "/x-value", choice: "custom", custom: "null" },
        ]),
      )["x-value"],
    ).toBeNull();
  });
  it("conflicts at the parent when deletion meets a nested edit", () => {
    const base = { ...api(), "x-object": { a: 1, b: 2 } },
      ours = clone(base),
      theirs = { ...base, "x-object": { a: 3, b: 2 } };
    delete (ours as Record<string, unknown>)["x-object"];
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].id).toBe("/x-object");
    expect(
      result(
        merge(base, ours, theirs, [{ id: "/x-object", choice: "theirs" }]),
      )["x-object"],
    ).toEqual({ a: 3, b: 2 });
  });
  it("merges independent fields in an object added by both sides but conflicts on differing leaves", () => {
    const base = api(),
      ours = { ...base, "x-object": { a: 1, same: "ours" } },
      theirs = { ...base, "x-object": { b: 2, same: "theirs" } };
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts[0]).toMatchObject({
      kind: "add-add",
      id: "/x-object/same",
    });
    const resolved = merge(base, ours, theirs, [
      { id: "/x-object/same", choice: "custom", custom: '"agreed"' },
    ]);
    expect(result(resolved)["x-object"]).toEqual({
      a: 1,
      b: 2,
      same: "agreed",
    });
  });
  it("requires explicit review for incompatible value types", () => {
    const base = { ...api(), "x-value": 1 },
      ours = { ...base, "x-value": { a: 1 } },
      theirs = { ...base, "x-value": "text" };
    expect(merge(base, ours, theirs).conflicts[0].kind).toBe("type");
  });
  it("escapes location segments and treats prototype-looking property names as own data", () => {
    const base = JSON.parse(
      JSON.stringify({
        ...api(),
        "x-object": JSON.parse(
          '{"a/b~":1,"__proto__":{"keep":true},"constructor":"old"}',
        ),
      }),
    );
    const ours = clone(base),
      theirs = clone(base);
    ours["x-object"]["a/b~"] = 2;
    theirs["x-object"]["a/b~"] = 3;
    ours["x-object"].constructor = "new";
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts[0].id).toBe("/x-object/a~1b~0");
    const merged = result(
      merge(base, ours, theirs, [{ id: "/x-object/a~1b~0", choice: "theirs" }]),
    );
    expect(Object.hasOwn(merged["x-object"], "__proto__")).toBe(true);
    expect(merged["x-object"].constructor).toBe("new");
    expect({}).not.toHaveProperty("keep");
  });
});

describe("OpenAPI keyed collection merge", () => {
  it("requires an ordering decision when deletion conflicts with editing the default server", () => {
    const base = {
        ...api(),
        servers: [
          server("https://default.test"),
          server("https://backup.test"),
        ],
      },
      ours = { ...base, servers: [server("https://backup.test")] },
      theirs = {
        ...base,
        servers: [
          server("https://default.test", { description: "Updated default" }),
          server("https://backup.test"),
        ],
      };
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts.map((c) => c.kind)).toEqual([
      "delete-edit",
      "array-order",
    ]);
    const resolved = merge(
      base,
      ours,
      theirs,
      plan.conflicts.map((c) => ({ id: c.id, choice: "theirs" })),
    );
    expect(result(resolved).servers[0]).toMatchObject({
      url: "https://default.test",
      description: "Updated default",
    });
  });
  it("merges edits to distinct parameters and concurrent additions by in/name", () => {
    const base = parameters(param("a"), param("b")),
      ours = clone(base),
      theirs = clone(base);
    parameterValues(ours)[0].description = "Our a";
    parameterValues(theirs)[1].required = true;
    parameterValues(ours).push(param("c"));
    parameterValues(theirs).push(param("d"));
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toEqual([]);
    expect(plan.keyedArrayCount).toBe(1);
    expect(parameterValues(result(plan)).map((v) => v.name)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(parameterValues(result(plan))[0].description).toBe("Our a");
    expect(parameterValues(result(plan))[1].required).toBe(true);
  });
  it("separates parameters with the same name in different locations", () => {
    const base = parameters(param("id"), param("id", { in: "header" })),
      ours = clone(base),
      theirs = clone(base);
    parameterValues(ours)[0].description = "query";
    parameterValues(theirs)[1].description = "header";
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toEqual([]);
    expect(parameterValues(result(plan)).map((v) => v.description)).toEqual([
      "query",
      "header",
    ]);
  });
  it("detects edit-versus-deletion conflicts on matching items", () => {
    const base = parameters(param("a"), param("b")),
      ours = parameters(param("b")),
      theirs = parameters(param("a", { required: true }), param("b"));
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].kind).toBe("delete-edit");
    expect(plan.conflicts[0].id).toContain("@item:");
    const resolved = merge(base, ours, theirs, [
      { id: plan.conflicts[0].id, choice: "theirs" },
    ]);
    expect(
      parameterValues(result(resolved)).find((v) => v.name === "a")?.required,
    ).toBe(true);
  });
  it("preserves a one-sided reorder while merging the other side's item edit", () => {
    const base = parameters(param("a"), param("b"), param("c")),
      ours = parameters(param("b"), param("a"), param("c")),
      theirs = clone(base);
    parameterValues(theirs)[2].description = "changed";
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toEqual([]);
    expect(parameterValues(result(plan)).map((v) => v.name)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(parameterValues(result(plan))[2].description).toBe("changed");
    const reversed = merge(base, theirs, ours);
    expect(parameterValues(result(reversed)).map((v) => v.name)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
  it("resolves conflicting orders independently of item contents", () => {
    const base = parameters(param("a"), param("b"), param("c")),
      ours = parameters(
        param("b"),
        param("a", { description: "Our a" }),
        param("c"),
      ),
      theirs = parameters(
        param("a"),
        param("c", { description: "Their c" }),
        param("b"),
      );
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts.map((c) => c.kind)).toEqual(["array-order"]);
    const id = plan.conflicts[0].id;
    const resolved = merge(base, ours, theirs, [{ id, choice: "theirs" }]);
    expect(parameterValues(result(resolved)).map((v) => v.name)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(parameterValues(result(resolved)).map((v) => v.description)).toEqual(
      ["Our a", "Their c", undefined],
    );
    expect(() =>
      merge(base, ours, theirs, [{ id, choice: "custom", custom: "[]" }]),
    ).toThrow("resolution");
  });
  it("keeps a one-sided newly inserted default server at the front", () => {
    const base = { ...api(), servers: [server("https://base.test")] },
      ours = clone(base),
      theirs = {
        ...base,
        servers: [server("https://new.test"), ...base.servers],
      };
    ours.servers[0].description = "Updated docs";
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toEqual([]);
    expect(result(plan).servers[0].url).toBe("https://new.test");
    expect(result(plan).servers[1].description).toBe("Updated docs");
  });
  it("requires a decision when branches select different default servers", () => {
    const base = { ...api(), servers: [server("https://base.test")] },
      ours = {
        ...base,
        servers: [server("https://ours.test"), ...base.servers],
      },
      theirs = {
        ...base,
        servers: [server("https://theirs.test"), ...base.servers],
      };
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts[0].kind).toBe("array-order");
    const resolved = merge(base, ours, theirs, [
      { id: plan.conflicts[0].id, choice: "theirs" },
    ]);
    expect(result(resolved).servers.map((s: { url: string }) => s.url)).toEqual(
      ["https://theirs.test", "https://base.test", "https://ours.test"],
    );
  });
  it("merges root tag metadata but does not apply tag heuristics inside examples or schemas", () => {
    const base = {
        ...api(),
        tags: [
          { name: "a", description: "A" },
          { name: "b", description: "B" },
        ],
        "x-example": {
          tags: [
            { name: "a", value: 1 },
            { name: "b", value: 2 },
          ],
        },
      },
      ours = clone(base),
      theirs = clone(base);
    ours.tags[0].description = "Our A";
    theirs.tags[1].description = "Their B";
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toEqual([]);
    expect(
      result(plan).tags.map((t: { description: string }) => t.description),
    ).toEqual(["Our A", "Their B"]);
    ours["x-example"].tags[0].value = 10;
    theirs["x-example"].tags[1].value = 20;
    expect(merge(base, ours, theirs).conflicts[0]).toMatchObject({
      kind: "array",
      id: "/x-example/tags",
    });
  });
  it("falls back to an atomic conflict for references, duplicates and opted-out arrays", () => {
    const base = parameters(param("a")),
      ours = parameters(param("a", { description: "ours" })),
      theirs = parameters(param("a", { required: true }));
    expect(merge(base, ours, theirs, [], false).conflicts[0].kind).toBe(
      "array",
    );
    const ref = { $ref: "#/components/parameters/A" };
    const rbase = parameters(ref as ReturnType<typeof param>),
      ro = parameters(ref as ReturnType<typeof param>, param("b")),
      rt = parameters(ref as ReturnType<typeof param>, param("c"));
    expect(merge(rbase, ro, rt).conflicts[0].kind).toBe("array");
    const duplicate = parameters(param("a"), param("a"));
    expect(merge(duplicate, ours, theirs).conflicts[0].kind).toBe("array");
  });
});

describe("Merge validation, projects and reports", () => {
  it("exports compact JSON at the exact output boundary without adding an extra byte", () => {
    const small = { ...api(), "x-padding": "" };
    const sized = {
      ...small,
      "x-padding": "a".repeat(
        MAX_MERGE_SOURCE_BYTES - JSON.stringify(small).length,
      ),
    };
    const plan = merge(sized, sized, sized);
    const exported = serializeMergedApi(plan, "json");
    expect(new TextEncoder().encode(exported).length).toBe(
      MAX_MERGE_SOURCE_BYTES,
    );
    expect(JSON.parse(exported)["x-padding"].length).toBe(
      sized["x-padding"].length,
    );
  });
  it("retains the conflict plan but blocks combined output beyond the source limit", () => {
    const base = api(),
      ours = { ...base, "x-ours": "a".repeat(1100000) },
      theirs = { ...base, "x-theirs": "b".repeat(1100000) };
    const plan = merge(base, ours, theirs);
    expect(plan.issue).toBe("limit");
    expect(plan.document).toBeNull();
    expect(() => serializeMergedApi(plan, "json")).toThrow("result");
  });
  it("supports keyed parameters and servers in reusable path items and webhooks", () => {
    const base = {
        ...api(),
        webhooks: {
          notice: { post: { parameters: [param("a"), param("b")] } },
        },
        components: {
          pathItems: { Shared: { servers: [server("/a"), server("/b")] } },
        },
      },
      ours = clone(base),
      theirs = clone(base);
    ours.webhooks.notice.post.parameters[0].description = "Our parameter";
    theirs.webhooks.notice.post.parameters[1].required = true;
    ours.components.pathItems.Shared.servers[0].description = "Our server";
    theirs.components.pathItems.Shared.servers[1].description = "Their server";
    const plan = merge(base, ours, theirs);
    expect(plan.conflicts).toEqual([]);
    expect(plan.keyedArrayCount).toBe(2);
    expect(result(plan).webhooks.notice.post.parameters[0].description).toBe(
      "Our parameter",
    );
    expect(
      result(plan).components.pathItems.Shared.servers[1].description,
    ).toBe("Their server");
  });
  it("accepts YAML alongside JSON and Swagger 2 without changing version families", () => {
    const original = {
        swagger: "2.0",
        info: { title: "Legacy", version: "1" },
        paths: {
          "/items": { get: { responses: { "200": { description: "OK" } } } },
        },
      },
      ours = clone(original),
      theirs = clone(original);
    ours.info.title = "Our Legacy";
    theirs.info.version = "2";
    const plan = mergeOpenApi({
      base: YAML.stringify(original),
      ours: JSON.stringify(ours),
      theirs: YAML.stringify(theirs),
    });
    expect(result(plan)).toMatchObject({
      swagger: "2.0",
      info: { title: "Our Legacy", version: "2" },
    });
    expect(YAML.parse(serializeMergedApi(plan, "yaml"))).toEqual(result(plan));
  });
  it("rejects invalid inputs with the affected side", () => {
    const text = JSON.stringify(api());
    expect(() =>
      mergeOpenApi({ base: text, ours: "openapi: [", theirs: text }),
    ).toThrow("source");
    try {
      mergeOpenApi({ base: text, ours: "openapi: [", theirs: text });
    } catch (error) {
      expect(error).toMatchObject({ side: "ours" });
    }
  });
  it("blocks resolved output that no longer parses as an API", () => {
    const base = api(),
      ours = clone(base),
      theirs = clone(base);
    ours.info.title = "Ours";
    theirs.info.title = "Theirs";
    const plan = merge(base, ours, theirs, [
      { id: "/info/title", choice: "custom", custom: "null" },
    ]);
    expect(plan.issue).toBe("result");
    expect(plan.document).toBeNull();
    expect(plan.candidateText).toContain('"title": null');
    expect(() => serializeMergedApi(plan, "json")).toThrow("result");
  });
  it("rejects stale, duplicate and malformed resolutions and unsafe custom JSON", () => {
    const base = api(),
      ours = clone(base),
      theirs = clone(base);
    ours.info.title = "Ours";
    theirs.info.title = "Theirs";
    const r: MergeResolution = { id: "/info/title", choice: "ours" };
    expect(() => merge(base, ours, theirs, [r, r])).toThrow("resolution");
    expect(() =>
      merge(base, ours, theirs, [{ id: "/missing", choice: "ours" }]),
    ).toThrow("resolution");
    expect(() =>
      merge(base, ours, theirs, [
        { id: "/info/title", choice: ["custom"] } as unknown as MergeResolution,
      ]),
    ).toThrow("resolution");
    for (const text of [
      "invalid",
      "9007199254740993",
      JSON.stringify("a".repeat(MAX_MERGE_CUSTOM_BYTES)),
    ])
      expect(() => parseMergeCustom(text)).toThrow("custom");
  });
  it("round-trips unresolved and resolved projects and recomputes rather than trusting saved results", () => {
    const base = api(),
      ours = clone(base),
      theirs = clone(base);
    ours.info.title = "Ours";
    theirs.info.title = "Theirs";
    const project = {
      ...emptyMergeProject(),
      inputs: {
        base: JSON.stringify(base),
        ours: JSON.stringify(ours),
        theirs: JSON.stringify(theirs),
      },
    };
    const initial = parseMergeProject(serializeMergeProject(project));
    expect(initial.plan.document).toBeNull();
    project.resolutions = [{ id: "/info/title", choice: "theirs" }];
    const raw = JSON.parse(serializeMergeProject(project));
    raw.ready = false;
    raw.document = { forged: true };
    const restored = parseMergeProject(JSON.stringify(raw));
    expect(result(restored.plan).info.title).toBe("Theirs");
    expect(restored.project).toEqual(project);
  });
  it("rejects invalid projects and project/source/conflict size limits", () => {
    expect(() => parseMergeProject("{} ")).toThrow("project");
    expect(() =>
      parseMergeProject(" ".repeat(MAX_MERGE_PROJECT_BYTES + 1)),
    ).toThrow("limit");
    const text = JSON.stringify(api());
    expect(() =>
      mergeOpenApi({
        base: " ".repeat(MAX_MERGE_SOURCE_BYTES + 1),
        ours: text,
        theirs: text,
      }),
    ).toThrow("limit");
    const base = {
        ...api(),
        "x-fields": Object.fromEntries(
          Array.from({ length: MAX_MERGE_CONFLICTS + 1 }, (_, i) => [
            `p${i}`,
            0,
          ]),
        ),
      },
      ours = clone(base),
      theirs = clone(base);
    for (const key of Object.keys(base["x-fields"])) {
      ours["x-fields"][key] = 1;
      theirs["x-fields"][key] = 2;
    }
    expect(() => merge(base, ours, theirs)).toThrow("limit");
  });
  it("reports operation removals and dangling/external references without fetching", () => {
    const base = {
        ...api(),
        components: { schemas: { Item: { type: "object" } } },
      },
      ours = clone(base) as Record<string, unknown>,
      theirs = clone(base) as Record<string, unknown>;
    ours.paths = {};
    theirs.components = {
      schemas: {
        ...base.components.schemas,
        MissingRef: { $ref: "#/components/schemas/Missing" },
        ExternalRef: { $ref: "https://example.test/schema.json" },
      },
    };
    const network = vi.spyOn(globalThis, "fetch"),
      plan = merge(base, ours, theirs);
    expect(plan.review).toMatchObject({
      removed: 1,
      breaking: 1,
      brokenReferences: 1,
      externalReferences: 1,
    });
    expect(network).not.toHaveBeenCalled();
  });
  it("exports decision reports without full source or custom value bodies", () => {
    const base = { ...api(), "x-secret": "initial-secret" },
      ours = { ...base, "x-secret": "our-private-secret" },
      theirs = { ...base, "x-secret": "their-private-secret" };
    const plan = merge(base, ours, theirs, [
      { id: "/x-secret", choice: "custom", custom: '"final-private-secret"' },
    ]);
    const report = JSON.stringify(mergeReport(plan, "Review")),
      markdown = mergeReportMarkdown(plan, "Review <tag> |");
    expect(report + markdown).not.toMatch(
      /initial-secret|our-private-secret|their-private-secret|final-private-secret/,
    );
    expect(report).toContain('"resolution":"custom"');
    expect(markdown).not.toContain("<tag>");
  });
  it("reports truncated document changes without truncating the merged document", () => {
    const base = {
        ...api(),
        "x-new": Object.fromEntries(
          Array.from({ length: 220 }, (_, i) => [`p${i}`, 0]),
        ),
      },
      ours = {
        ...base,
        "x-new": Object.fromEntries(
          Array.from({ length: 220 }, (_, i) => [`p${i}`, i + 1]),
        ),
      },
      theirs = { ...base, "x-theirs": true };
    const plan = merge(base, ours, theirs);
    expect(result(plan)["x-new"]).toHaveProperty("p219");
    expect(plan.changes).toHaveLength(200);
    expect(plan.changesTruncated).toBe(true);
    expect(result(plan)["x-theirs"]).toBe(true);
  });
});
