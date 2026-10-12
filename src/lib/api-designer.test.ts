import { describe, expect, it } from "vitest";
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
  MAX_DESIGN_BYTES,
  MAX_DESIGN_HISTORY,
  newDesignDocument,
  parseDesignProject,
  parseDesignSchema,
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
} from "./api-designer";
import { DEFAULT_OPENAPI_SCHEMA } from "./openapi";
import { validateExampleValue } from "./example-validation";
const expectCode = (fn: () => unknown, code: string) =>
  expect(fn).toThrowError(expect.objectContaining({ code }));
const operationKey = (doc: DesignDocument) => designOperations(doc)[0].key;
const json = (value: unknown) => JSON.stringify(value);

describe("API design sources and metadata", () => {
  it("loads OpenAPI JSON/YAML 3.0–3.2 and creates a functional demo contract", () => {
    expect(
      designOperations(readDesignDocument(DEFAULT_OPENAPI_SCHEMA)),
    ).toHaveLength(2);
    for (const version of ["3.0.4", "3.1.0", "3.2.1"])
      expect(
        readDesignDocument(json({ ...newDesignDocument(), openapi: version }))
          .openapi,
      ).toBe(version);
    const demo = demoDesignDocument();
    expect(designOperations(demo)).toHaveLength(2);
    expect(designModels(demo).map((m) => m.name)).toEqual(["Task"]);
    expect(designOperations(demo)[0].operation.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ]);
  });
  it("rejects malformed, unsupported, oversized, or excessively complex imports without mutating source data", () => {
    expectCode(() => readDesignDocument("openapi: ["), "source");
    expectCode(
      () =>
        readDesignDocument(
          json({ swagger: "2.0", info: { title: "Old" }, paths: {} }),
        ),
      "version",
    );
    expectCode(
      () => readDesignDocument(" ".repeat(MAX_DESIGN_BYTES + 1)),
      "limit",
    );
    expectCode(
      () =>
        readDesignDocument(
          json({
            ...newDesignDocument(),
            components: {
              schemas: Object.fromEntries(
                Array.from({ length: 1001 }, (_, i) => [`M${i}`, {}]),
              ),
            },
          }),
        ),
      "limit",
    );
  });
  it("changes only selected API info fields and appends servers without disturbing defaults or metadata", () => {
    const before = {
      ...newDesignDocument(),
      info: {
        title: "Old",
        version: "1",
        contact: { email: "hello@example.com" },
        "x-info": 1,
      },
      servers: [
        {
          url: "https://old.example",
          variables: { region: { default: "eu" } },
          "x-server": true,
        },
      ],
      "x-root": { kept: true },
    };
    const changed = saveDesignInfo(before, "New", "2", "Docs"),
      next = addDesignServer(changed, "https://new.example/api", "New region");
    expect(next.info).toEqual({
      title: "New",
      version: "2",
      contact: { email: "hello@example.com" },
      "x-info": 1,
      description: "Docs",
    });
    expect(next.servers).toEqual([
      before.servers[0],
      { url: "https://new.example/api", description: "New region" },
    ]);
    expect(next["x-root"]).toEqual(before["x-root"]);
    expect(before.info.title).toBe("Old");
    expectCode(
      () => addDesignServer(next, "https://new.example/api", ""),
      "exists",
    );
    expect(addDesignServer(changed, "/v2", "").servers).toHaveLength(2);
  });
  it.each([
    "javascript:alert(1)",
    "https://user:pass@example.com",
    "https://example.com#hash",
    "https://example.com?token=a",
    "https://{region}.example.com",
    "not a url",
  ])("rejects invalid/nonconcrete server URL %s", (url) =>
    expectCode(() => addDesignServer(newDesignDocument(), url, ""), "source"),
  );
});

describe("operation design", () => {
  it("adds required path parameters and default responses while preserving siblings and extensions", () => {
    const before = readDesignDocument(DEFAULT_OPENAPI_SCHEMA),
      next = saveDesignOperation(before, {
        ...designOperationForm(),
        path: "/teams/{teamId}/tasks/{id}",
        method: "post",
        summary: "Create",
        operationId: "createTask",
        tags: "Tasks, Tasks, Teams",
      });
    expect((next.paths as DesignDocument)["/users/{id}"]).toEqual(
      (before.paths as DesignDocument)["/users/{id}"],
    );
    const op = designOperations(next).find((o) =>
      o.path.startsWith("/teams"),
    )!.operation;
    expect(op.parameters).toEqual([
      {
        name: "teamId",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ]);
    expect(op.responses).toEqual({
      "200": { description: "Successful response" },
    });
    expect(op.tags).toEqual(["Tasks", "Teams"]);
  });
  it("uses inherited inline/reusable path parameters without duplicating them", () => {
    const before = {
      ...newDesignDocument(),
      paths: {
        "/tasks/{id}": { parameters: [{ $ref: "#/components/parameters/Id" }] },
      },
      components: {
        parameters: {
          Id: {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        },
      },
    };
    const next = saveDesignOperation(before, {
      ...designOperationForm(),
      path: "/tasks/{id}",
    });
    expect(designOperations(next)[0].operation).not.toHaveProperty(
      "parameters",
    );
    expect(designOperations(next)[0].inheritedParameters).toBe(1);
  });
  it("edits operation metadata without rewriting payloads, auth, examples, links, callbacks, servers, or sibling methods", () => {
    const doc = readDesignDocument(DEFAULT_OPENAPI_SCHEMA),
      paths = doc.paths as DesignDocument,
      item = paths["/users/{id}"] as DesignDocument,
      op = item.get as DesignDocument;
    op.security = [{ key: [] }];
    op.callbacks = { after: { $ref: "callbacks.yaml" } };
    op["x-operation"] = { untouched: true };
    op.servers = [{ url: "/override" }];
    const before = json(op),
      form = designOperationForm(designOperations(doc)[0]),
      next = saveDesignOperation(doc, {
        ...form,
        summary: "Updated",
        description: "Docs",
        tags: "Users",
        deprecated: true,
      });
    const changed = designOperations(next)[0].operation;
    for (const field of [
      "responses",
      "security",
      "callbacks",
      "x-operation",
      "servers",
    ])
      expect(changed[field]).toEqual(op[field]);
    expect(changed.summary).toBe("Updated");
    expect(changed.deprecated).toBe(true);
    expect((next.paths as DesignDocument)["/users/{id}"]).toHaveProperty(
      "post",
    );
    expect(json(op)).toBe(before);
  });
  it("preserves untouched metadata exactly, including comma-containing tags and explicit false flags", () => {
    const doc = demoDesignDocument(),
      op = designOperations(doc)[0];
    op.operation.tags = ["Users, admins", "Tasks", "Tasks"];
    op.operation.deprecated = false;
    op.operation.description = "";
    op.operation.operationId = " getTask ";
    designOperations(doc)[1].operation.operationId = "getTask";
    const form = designOperationForm(op);
    expect(saveDesignOperation(doc, form)).toEqual(doc);
    const next = saveDesignOperation(doc, { ...form, summary: "New summary" });
    expect(designOperations(next)[0].operation).toEqual({
      ...op.operation,
      summary: "New summary",
    });
    expect(
      designOperations(
        saveDesignOperation(next, {
          ...designOperationForm(designOperations(next)[0]),
          tags: "Updated, Other",
        }),
      )[0].operation.tags,
    ).toEqual(["Updated", "Other"]);
  });
  it("rejects existing slots, duplicate operation identifiers and attempts to move existing operations", () => {
    const doc = demoDesignDocument(),
      op = designOperations(doc)[0],
      form = designOperationForm(op);
    expectCode(() => saveDesignOperation(doc, { ...form, key: "" }), "exists");
    expectCode(
      () =>
        saveDesignOperation(doc, {
          ...designOperationForm(),
          path: "/other",
          operationId: "getTask",
        }),
      "exists",
    );
    expectCode(
      () => saveDesignOperation(doc, { ...form, path: "/moved" }),
      "operation",
    );
    expectCode(
      () => saveDesignOperation(doc, { ...form, method: "delete" }),
      "operation",
    );
  });
  it.each([
    "tasks",
    "/tasks?query=1",
    "/tasks#id",
    "/tasks/{",
    "/tasks/{}",
    "/tasks/{bad name}",
    "/tasks\\id",
  ])("rejects invalid path %s", (path) =>
    expectCode(
      () =>
        saveDesignOperation(newDesignDocument(), {
          ...designOperationForm(),
          path,
        }),
      "path",
    ),
  );
  it("rejects equivalent template routes and keeps referenced path items intact", () => {
    const doc = demoDesignDocument();
    expectCode(
      () =>
        saveDesignOperation(doc, {
          ...designOperationForm(),
          path: "/tasks/{taskId}",
          method: "post",
        }),
      "path",
    );
    const referenced = {
      ...newDesignDocument(),
      paths: { "/shared/{id}": { $ref: "paths.yaml#/shared" } },
    };
    expect(designOperations(referenced)).toEqual([]);
    expectCode(
      () =>
        saveDesignOperation(referenced, {
          ...designOperationForm(),
          path: "/shared/{id}",
        }),
      "reference",
    );
  });
  it("keeps established operation identifiers fixed so existing response links remain valid", () => {
    const doc = demoDesignDocument(),
      form = designOperationForm(designOperations(doc)[0]);
    expectCode(
      () => saveDesignOperation(doc, { ...form, operationId: "renamed" }),
      "operation",
    );
    expectCode(
      () => saveDesignOperation(doc, { ...form, operationId: "" }),
      "operation",
    );
  });
});

describe("models, properties and schema templates", () => {
  it("adds and updates individual properties while retaining compositions, XML, extensions and other required properties", () => {
    let doc = saveDesignModel(
      newDesignDocument(),
      "Task",
      '{"type":"object","properties":{"id":{"type":"string"}},"required":["id"],"allOf":[{}],"xml":{"name":"task"},"x-extra":true}',
    );
    doc = saveDesignProperty(
      doc,
      "Task",
      "name",
      '{"type":"string","minLength":1}',
      true,
    );
    const model = designModels(doc)[0].schema as DesignDocument;
    expect(model.required).toEqual(["id", "name"]);
    expect(model.xml).toEqual({ name: "task" });
    expect(model.allOf).toEqual([{}]);
    const changed = saveDesignProperty(
        doc,
        "Task",
        "name",
        '{"type":"string","maxLength":30}',
        false,
        true,
      ),
      schema = designModels(changed)[0].schema as DesignDocument;
    expect(schema.required).toEqual(["id"]);
    expect((schema.properties as DesignDocument).id).toEqual({
      type: "string",
    });
    expect(schema["x-extra"]).toBe(true);
  });
  it("protects component/property collisions and rejects property writes into primitive or referenced models", () => {
    const doc = demoDesignDocument();
    expectCode(() => saveDesignModel(doc, "Task", "{}"), "exists");
    expectCode(
      () => saveDesignProperty(doc, "Task", "id", "{}", false),
      "exists",
    );
    expectCode(() => saveDesignModel(doc, "missing", "{}", true), "model");
    const primitive = saveDesignModel(doc, "Id", '{"type":"string"}');
    expectCode(
      () => saveDesignProperty(primitive, "Id", "x", "{}", false),
      "model",
    );
    const referenced = saveDesignModel(
      doc,
      "Alias",
      '{"$ref":"#/components/schemas/Task"}',
    );
    expectCode(
      () => saveDesignProperty(referenced, "Alias", "x", "{}", false),
      "model",
    );
  });
  it("treats prototype-related names and escaped property names as ordinary own data", () => {
    let doc = saveDesignModel(
      newDesignDocument(),
      "__proto__",
      '{"type":"object"}',
    );
    doc = saveDesignProperty(
      doc,
      "__proto__",
      "constructor",
      '{"type":"integer"}',
      true,
    );
    doc = saveDesignProperty(
      doc,
      "__proto__",
      "a/b~c",
      '{"type":"string"}',
      false,
    );
    const schemas = (doc.components as DesignDocument)
      .schemas as DesignDocument;
    expect(Object.prototype.hasOwnProperty.call(schemas, "__proto__")).toBe(
      true,
    );
    expect((schemas.__proto__ as DesignDocument).required).toEqual([
      "constructor",
    ]);
    expect({}).not.toHaveProperty("required");
    expect(readDesignDocument(serializeDesignDocument(doc, "yaml"))).toEqual(
      doc,
    );
  });
  it("generates primitive/object/array/reference schemas and version-correct nullability", () => {
    const doc = demoDesignDocument(),
      old = { ...doc, openapi: "3.0.4" };
    expect(JSON.parse(createDesignSchema(doc, "integer", true))).toEqual({
      type: ["integer", "null"],
    });
    expect(JSON.parse(createDesignSchema(old, "integer", true))).toEqual({
      type: "integer",
      nullable: true,
    });
    expect(JSON.parse(createDesignSchema(doc, "array", false, "Task"))).toEqual(
      { type: "array", items: { $ref: "#/components/schemas/Task" } },
    );
    expect(
      JSON.parse(createDesignSchema(doc, "reference", false, "Task")),
    ).toEqual({ $ref: "#/components/schemas/Task" });
    const nullable = JSON.parse(
      createDesignSchema(old, "reference", true, "Task"),
    );
    expect(nullable.anyOf[1]).toEqual({
      type: "object",
      nullable: true,
      enum: [null],
    });
    expect(validateExampleValue(old, nullable, null).issues).toEqual([]);
    expect(
      JSON.parse(
        createDesignSchema(
          doc,
          "string",
          false,
          "",
          '["ready","done"]',
          "uuid",
        ),
      ),
    ).toEqual({ type: "string", enum: ["ready", "done"], format: "uuid" });
  });
  it("rejects invalid template references/enums, unsupported schema roots and 3.0 boolean schemas", () => {
    const doc = newDesignDocument();
    expectCode(
      () => createDesignSchema(doc, "reference", false, "Missing"),
      "model",
    );
    expectCode(
      () => createDesignSchema(doc, "array", false, "Missing"),
      "model",
    );
    expectCode(
      () => createDesignSchema(doc, "string", false, "", "{}"),
      "schema",
    );
    expectCode(() => parseDesignSchema(doc, "[]"), "schema");
    expectCode(() => parseDesignSchema(doc, "["), "schema");
    expect(parseDesignSchema(doc, "false")).toBe(false);
    expectCode(
      () => parseDesignSchema({ ...doc, openapi: "3.0.4" }, "false"),
      "schema",
    );
  });
});

describe("parameters, payloads and auth", () => {
  it("updates inline parameters with original serialization metadata/examples and requires path parameters", () => {
    const doc = demoDesignDocument(),
      op = designOperations(doc)[0],
      p = (op.operation.parameters as DesignDocument[])[0];
    p.style = "simple";
    p.example = "task-7";
    p["x-param"] = true;
    const next = saveDesignParameter(doc, op.key, {
      ...designParameterForm(p, 0),
      description: "Identifier",
      required: false,
      schema: '{"type":"string","minLength":1}',
    });
    expect(designOperations(next)[0].operation.parameters).toEqual([
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 1 },
        style: "simple",
        example: "task-7",
        "x-param": true,
        description: "Identifier",
      },
    ]);
    const query = saveDesignParameter(next, op.key, {
      ...designParameterForm(),
      name: "limit",
      schema: '{"type":"integer","minimum":1}',
    });
    expect(designOperations(query)[0].operation.parameters).toHaveLength(2);
    expectCode(
      () =>
        saveDesignParameter(query, op.key, {
          ...designParameterForm(),
          name: "limit",
        }),
      "exists",
    );
    expectCode(
      () =>
        saveDesignParameter(doc, op.key, {
          ...designParameterForm(),
          name: "missing",
          location: "path",
        }),
      "parameter",
    );
  });
  it("retains referenced/content parameters and rejects renaming existing ones", () => {
    const doc = demoDesignDocument(),
      op = designOperations(doc)[0];
    op.operation.parameters = [
      { $ref: "#/components/parameters/Shared" },
      {
        name: "q",
        in: "query",
        content: { "application/json": { schema: { type: "object" } } },
      },
    ];
    expectCode(
      () =>
        saveDesignParameter(doc, op.key, {
          ...designParameterForm(),
          index: 0,
        }),
      "reference",
    );
    expectCode(
      () =>
        saveDesignParameter(doc, op.key, {
          ...designParameterForm(),
          index: 1,
          name: "q",
        }),
      "reference",
    );
    const source = demoDesignDocument(),
      inline = designOperations(source)[0];
    expectCode(
      () =>
        saveDesignParameter(source, inline.key, {
          ...designParameterForm(
            (inline.operation.parameters as DesignDocument[])[0],
            0,
          ),
          name: "renamed",
        }),
      "reference",
    );
  });
  it("adds media types/responses and updates only selected schemas while keeping examples, headers, links, encoding and sibling responses", () => {
    const doc = demoDesignDocument(),
      key = operationKey(doc),
      response = (
        designOperations(doc)[0].operation.responses as DesignDocument
      )["200"] as DesignDocument,
      media = (response.content as DesignDocument)[
        "application/json"
      ] as DesignDocument;
    response.headers = { "X-Trace": { schema: { type: "string" } } };
    response.links = { next: { operationId: "createTask" } };
    media.example = { id: "7", title: "Keep" };
    media.encoding = { title: { contentType: "text/plain" } };
    media["x-media"] = true;
    const next = saveDesignPayload(doc, key, {
      ...designPayloadForm(designOperations(doc)[0]),
      description: "Updated",
      schema: '{"type":"object"}',
    });
    const after = (
      designOperations(next)[0].operation.responses as DesignDocument
    )["200"] as DesignDocument;
    expect(after.headers).toEqual(response.headers);
    expect(after.links).toEqual(response.links);
    expect((after.content as DesignDocument)["application/json"]).toEqual({
      ...media,
      schema: { type: "object" },
    });
    const extra = saveDesignPayload(next, key, {
      ...designPayloadForm(),
      status: "404",
      description: "Not found",
      mediaType: "application/problem+json",
    });
    expect(
      (designOperations(extra)[0].operation.responses as DesignDocument)["200"],
    ).toEqual(after);
  });
  it("protects referenced bodies, responses and media types, and rejects invalid statuses/media types", () => {
    const doc = demoDesignDocument(),
      key = operationKey(doc),
      op = designOperations(doc)[0].operation;
    op.requestBody = { $ref: "body.yaml" };
    (op.responses as DesignDocument)["404"] = {
      $ref: "#/components/responses/NotFound",
    };
    expectCode(
      () =>
        saveDesignPayload(doc, key, {
          ...designPayloadForm(),
          kind: "request",
        }),
      "reference",
    );
    expectCode(
      () =>
        saveDesignPayload(doc, key, { ...designPayloadForm(), status: "404" }),
      "reference",
    );
    expectCode(
      () =>
        saveDesignPayload(doc, key, { ...designPayloadForm(), status: "99" }),
      "payload",
    );
    expectCode(
      () =>
        saveDesignPayload(doc, key, {
          ...designPayloadForm(),
          mediaType: "bad",
        }),
      "payload",
    );
    expectCode(
      () =>
        saveDesignPayload(doc, key, {
          ...designPayloadForm(),
          description: "",
        }),
      "payload",
    );
  });
  it("detects duplicate inline additions against reusable parameters without replacing their references", () => {
    const doc = demoDesignDocument(),
      op = designOperations(doc)[0];
    doc.components = {
      ...(doc.components as DesignDocument),
      parameters: {
        Limit: { name: "limit", in: "query", schema: { type: "integer" } },
      },
    };
    op.operation.parameters = [{ $ref: "#/components/parameters/Limit" }];
    expectCode(
      () =>
        saveDesignParameter(doc, op.key, {
          ...designParameterForm(),
          name: "limit",
        }),
      "exists",
    );
    expect(op.operation.parameters).toEqual([
      { $ref: "#/components/parameters/Limit" },
    ]);
  });
  it("changes authentication explicitly while leaving inherited API requirements and unrelated metadata intact", () => {
    const doc = demoDesignDocument(),
      key = operationKey(doc);
    doc.components = {
      ...(doc.components as DesignDocument),
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer" },
        oauth: { type: "oauth2", flows: {} },
      },
    };
    doc.security = [{ bearer: [] }];
    const custom = saveDesignSecurity(
      doc,
      key,
      "custom",
      '[{"bearer":[],"oauth":["read:tasks"]},{}]',
    );
    expect(custom.security).toEqual(doc.security);
    expect(designOperations(custom)[0].operation.security).toEqual([
      { bearer: [], oauth: ["read:tasks"] },
      {},
    ]);
    const publicDoc = saveDesignSecurity(custom, key, "public");
    expect(designOperations(publicDoc)[0].operation.security).toEqual([]);
    expect(
      designOperations(saveDesignSecurity(publicDoc, key, "inherit"))[0]
        .operation,
    ).not.toHaveProperty("security");
    expectCode(
      () => saveDesignSecurity(doc, key, "custom", '[{"missing":[]}]'),
      "security",
    );
    expectCode(
      () => saveDesignSecurity(doc, key, "custom", '[{"bearer":[1]}]'),
      "security",
    );
  });
  it("enforces empty non-OAuth scopes in 3.0 while retaining OAuth scope lists", () => {
    const doc: DesignDocument = { ...demoDesignDocument(), openapi: "3.0.4" };
    doc.components = {
      ...(doc.components as DesignDocument),
      securitySchemes: {
        key: { type: "apiKey", name: "key", in: "header" },
        oauth: { type: "oauth2", flows: {} },
      },
    };
    expectCode(
      () =>
        saveDesignSecurity(
          doc,
          operationKey(doc),
          "custom",
          '[{"key":["read"]}]',
        ),
      "security",
    );
    expect(
      designOperations(
        saveDesignSecurity(
          doc,
          operationKey(doc),
          "custom",
          '[{"oauth":["read"]}]',
        ),
      )[0].operation.security,
    ).toEqual([{ oauth: ["read"] }]);
  });
});

describe("draft history, projects and editor updates", () => {
  it("supports bounded undo/redo, does not record no-ops and clears redo after a new edit", () => {
    const initial = newDesignDocument();
    let history = {
      document: initial,
      past: [] as DesignDocument[],
      future: [] as DesignDocument[],
    };
    expect(commitDesign(history, initial)).toBe(history);
    for (let i = 0; i < 25; i++)
      history = commitDesign(
        history,
        saveDesignInfo(history.document, `API ${i}`, "1", ""),
      );
    expect(history.past).toHaveLength(MAX_DESIGN_HISTORY);
    const previous = undoDesign(history);
    expect((previous.document.info as DesignDocument).title).toBe("API 23");
    expect(redoDesign(previous).document).toEqual(history.document);
    expect(
      commitDesign(
        previous,
        saveDesignInfo(previous.document, "New branch", "1", ""),
      ).future,
    ).toEqual([]);
  });
  it("round-trips portable projects and discards imported preview/undo metadata", () => {
    const doc = demoDesignDocument(),
      project = parseDesignProject(serializeDesignProject(doc, "Demo"));
    expect(project.document).toEqual(doc);
    const raw = {
      ...project,
      undoEditor: { before: "secret", after: "fake" },
      preview: { fresh: true },
    };
    expect(parseDesignProject(json(raw))).toEqual(project);
    expectCode(() => parseDesignProject("{}"), "project");
    expectCode(() => serializeDesignProject(doc, ""), "project");
  });
  it("exports JSON and YAML without losing unknown values and reviews references without fixture data", () => {
    const doc = demoDesignDocument();
    doc["x-example"] = { secret: "do-not-report" };
    ((doc.components as DesignDocument).schemas as DesignDocument).Missing = {
      $ref: "#/components/schemas/Absent",
    };
    ((doc.components as DesignDocument).schemas as DesignDocument).Remote = {
      $ref: "remote.yaml#/A",
    };
    expect(readDesignDocument(serializeDesignDocument(doc, "yaml"))).toEqual(
      doc,
    );
    expect(readDesignDocument(serializeDesignDocument(doc, "json"))).toEqual(
      doc,
    );
    const preview = prepareDesignUpdate(doc, DEFAULT_OPENAPI_SCHEMA, "json");
    expect(preview.review).toMatchObject({
      operationCount: 2,
      modelCount: 3,
      editorValid: true,
      brokenReferences: 1,
      externalReferences: 1,
    });
    expect(json(preview.review)).not.toContain("do-not-report");
  });
  it("requires exact current editor and draft matches to apply, including reviewed replacement of invalid editor text", () => {
    const doc = demoDesignDocument(),
      preview = prepareDesignUpdate(doc, DEFAULT_OPENAPI_SCHEMA, "yaml");
    expect(applyDesignUpdate(preview, doc, DEFAULT_OPENAPI_SCHEMA)).toBe(
      preview.after,
    );
    expectCode(
      () => applyDesignUpdate(preview, doc, DEFAULT_OPENAPI_SCHEMA + "\n"),
      "stale",
    );
    expectCode(
      () =>
        applyDesignUpdate(
          preview,
          saveDesignInfo(doc, "Changed", "1", ""),
          DEFAULT_OPENAPI_SCHEMA,
        ),
      "stale",
    );
    const invalid = prepareDesignUpdate(doc, "openapi: [", "json");
    expect(invalid.review.editorValid).toBe(false);
    expect(applyDesignUpdate(invalid, doc, "openapi: [")).toBe(invalid.after);
  });
});
