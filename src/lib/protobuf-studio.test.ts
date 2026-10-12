import { describe, expect, it } from "vitest";
import {
  checkProtoPayload,
  compareProtoContracts,
  decodeProtoFrames,
  decodeProtoPayload,
  DEMO_PROTO_FILES,
  emptyProtoProject,
  encodeProtoPayload,
  frameProtoMessages,
  generateProtoDraft,
  generateProtoSample,
  MAX_PROTO_BINARY_BYTES,
  MAX_PROTO_CASES,
  MAX_PROTO_SOURCE_BYTES,
  normalizeProtoPath,
  parseProtoProject,
  protoRehearsalReport,
  readProtoBytes,
  readProtoContract,
  rehearseProtoExchange,
  saveProtoCase,
  serializeProtoProject,
  type ProtoFile,
} from "./protobuf-studio";

const single = (source: string) =>
  readProtoContract([{ path: "api.proto", source }], "api.proto");
const demo = () => readProtoContract(DEMO_PROTO_FILES, "shop/service.proto");
const expectCode = (fn: () => unknown, code: string) =>
  expect(fn).toThrowError(expect.objectContaining({ code }));

describe("Protobuf local contracts", () => {
  it("resolves relative imports and inventories nested enums, oneofs, maps, docs, and all RPC modes", () => {
    const c = demo();
    expect(c.imports).toEqual([
      {
        from: "shop/service.proto",
        path: "shop/models.proto",
        builtin: false,
        weak: false,
        missing: false,
      },
    ]);
    expect(c.methods.map((m) => [m.requestStream, m.responseStream])).toEqual([
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ]);
    expect(c.methods[0].key).toBe("/shop.Catalog/GetProduct");
    const product = c.types.find((t) => t.name === "shop.Product")!;
    expect(product.description).toContain("stored product");
    expect(product.fields.find((f) => f.name === "labels")).toMatchObject({
      mapKey: "string",
      number: 6,
    });
    expect(product.fields.find((f) => f.name === "sku")?.oneof).toBe(
      "reference",
    );
    expect(product.dependencies).toContain("shop.Product.State");
  });
  it("loads only reachable files and accepts cyclic file/message references", () => {
    const files: ProtoFile[] = [
      {
        path: "a.proto",
        source: 'syntax="proto3"; import "b.proto"; message A { B b=1; }',
      },
      {
        path: "b.proto",
        source: 'syntax="proto3"; import "a.proto"; message B { A a=1; }',
      },
      { path: "unused.proto", source: "invalid" },
    ];
    expect(
      readProtoContract(files, "a.proto").types.map((t) => t.name),
    ).toEqual(["A", "B"]);
  });
  it("resolves parent-relative and project-root imports without leaving the project", () => {
    const files = [
      { path: "types.proto", source: 'syntax="proto3"; message Input {}' },
      {
        path: "rpc/service.proto",
        source:
          'syntax="proto3"; import "../types.proto"; service S { rpc Go(Input) returns(Input); }',
      },
    ];
    expect(readProtoContract(files, files[1].path).methods[0].requestType).toBe(
      "Input",
    );
    files[1].source = files[1].source.replace("../types.proto", "types.proto");
    expect(readProtoContract(files, files[1].path).imports[0].path).toBe(
      "types.proto",
    );
  });
  it.each([
    "/a.proto",
    "../a.proto",
    "https://a.proto",
    "C:\\a.proto",
    "a.json",
    "a\u0000.proto",
  ])("rejects unsafe source path %s", (path) =>
    expectCode(() => normalizeProtoPath(path), "path"),
  );
  it("normalizes Windows separators, dots, and bounded parent imports", () => {
    expect(normalizeProtoPath("models\\item.proto")).toBe("models/item.proto");
    expect(normalizeProtoPath("../types.proto", "shop/api.proto")).toBe(
      "types.proto",
    );
    expect(normalizeProtoPath("./api.proto")).toBe("api.proto");
  });
  it("rejects duplicate paths, missing entry files, and missing strong imports", () => {
    expectCode(
      () =>
        readProtoContract(
          [...DEMO_PROTO_FILES, DEMO_PROTO_FILES[0]],
          "shop/service.proto",
        ),
      "path",
    );
    expectCode(
      () => readProtoContract(DEMO_PROTO_FILES, "missing.proto"),
      "import",
    );
    expectCode(
      () => single('syntax="proto3"; import "missing.proto"; message A{}'),
      "import",
    );
  });
  it("records missing weak imports but still rejects unresolved field types", () => {
    expect(
      single('syntax="proto3"; import weak "missing.proto"; message A{}')
        .imports[0].missing,
    ).toBe(true);
    expectCode(
      () =>
        single(
          'syntax="proto3"; import weak "missing.proto"; message A{ Missing x=1; }',
        ),
      "schema",
    );
  });
  it("loads bundled well-known types without fetching their imports", () => {
    const c = single(
      'syntax="proto3"; import "google/protobuf/timestamp.proto"; message A { google.protobuf.Timestamp created_at=1; }',
    );
    expect(c.imports[0].builtin).toBe(true);
    expect(
      encodeProtoPayload(
        c,
        "A",
        '{"created_at":{"seconds":"1700000000","nanos":0}}',
      ).json,
    ).toEqual({ created_at: { seconds: "1700000000" } });
  });
  it("rejects malformed schemas, duplicate tags, absent types, reserved tags, editions, and legacy groups", () => {
    for (const source of [
      "syntax = [",
      "message A { string x=1; int32 y=1; }",
      "message A { Missing x=1; }",
      "message A { reserved 1; optional string x=1; }",
      'edition="2023"; message A{}',
      "message A { optional group B=1 { optional int32 x=2; } }",
    ])
      expectCode(() => single(source), "schema");
  });
  it("limits source bytes, tokens, nesting, total files, and field counts before runtime use", () => {
    expectCode(() => single(" ".repeat(MAX_PROTO_SOURCE_BYTES + 1)), "limit");
    expectCode(
      () =>
        single(
          'syntax="proto3"; message A {' +
            Array.from(
              { length: 5001 },
              (_, i) => `int32 x${i}=${i + 1};`,
            ).join("") +
            "}",
        ),
      "limit",
    );
    expectCode(
      () => single("message A {".repeat(25) + "}".repeat(25)),
      "limit",
    );
    expectCode(
      () =>
        readProtoContract(
          Array.from({ length: 41 }, (_, i) => ({
            path: `${i}.proto`,
            source: "message A{}",
          })),
          "0.proto",
        ),
      "limit",
    );
  });
  it("rejects invalid/reserved field tags and invalid enum ranges before codec generation", () => {
    for (const declaration of [
      "int32 x=0;",
      "int32 x=19000;",
      "int32 x=19999;",
      "int32 x=536870912;",
    ])
      expectCode(
        () => single(`syntax="proto3"; message A{${declaration}}`),
        "schema",
      );
    expectCode(
      () => single('syntax="proto2"; enum E{TOO_BIG=2147483648;}'),
      "schema",
    );
    expectCode(() => single('syntax="proto2"; enum E{}'), "schema");
  });
});

describe("Protobuf JSON and binary codec", () => {
  const source =
    'syntax="proto3"; message M { int32 i=1; uint32 u=2; int64 big=3; uint64 ubig=4; bytes data=5; bool ok=6; float f=7; repeated int32 nums=8; map<int32,string> labels=9; oneof choice { string a=10; string b=11; } enum E { ZERO=0; ONE=1; } E e=12; M child=13; }';
  it("round trips exact 64-bit bounds, bytes, packed numbers, enum names, map keys, and oneof values", () => {
    const c = single(source),
      value = {
        i: -2147483648,
        u: 4294967295,
        big: "-9223372036854775808",
        ubig: "18446744073709551615",
        data: "aGVsbG8=",
        ok: true,
        f: 1.5,
        nums: [1, 2, 3],
        labels: { "-1": "a" },
        a: "selected",
        e: "ONE",
        child: { big: "9007199254740993" },
      };
    const result = encodeProtoPayload(c, "M", JSON.stringify(value));
    expect(result.json).toEqual(value);
    expect(decodeProtoPayload(c, "M", result.hex, "hex").json).toEqual(value);
    expect(decodeProtoPayload(c, "M", result.base64, "base64").json).toEqual(
      value,
    );
    expect(result.byteLength).toBe(result.hex.length / 2);
  });
  it("retains numeric unknown enum values for forward-compatible messages", () => {
    const c = single(source);
    expect(encodeProtoPayload(c, "M", '{"e":123}').json).toEqual({ e: 123 });
  });
  it("rejects unknown numeric JSON values for proto2 closed enums and discards them on decode", () => {
    const c = single(
      'syntax="proto2"; message A { enum E {ZERO=0;ONE=1;} optional E e=1; }',
    );
    expect(checkProtoPayload(c, "A", '{"e":123}').valid).toBe(false);
    expect(encodeProtoPayload(c, "A", '{"e":1}').json).toEqual({ e: "ONE" });
    expect(decodeProtoPayload(c, "A", "087b", "hex").json).toEqual({});
  });
  it("retains boolean and exact signed/unsigned 64-bit map keys", () => {
    const c = single(
      'syntax="proto3"; message A { map<bool,string> flags=1; map<int64,string> signed=2; map<uint64,string> unsigned=3; }',
    );
    const v = {
      flags: { false: "no", true: "yes" },
      signed: { "-9223372036854775808": "min", "9007199254740993": "large" },
      unsigned: { "18446744073709551615": "max" },
    };
    expect(encodeProtoPayload(c, "A", JSON.stringify(v)).json).toEqual(v);
  });
  it.each([
    ['{"i":2147483648}', "scalar"],
    ['{"i":"1"}', "scalar"],
    ['{"u":-1}', "scalar"],
    ['{"big":"9223372036854775808"}', "scalar"],
    ['{"ubig":"-1"}', "scalar"],
    ['{"big":9007199254740992}', "scalar"],
    ['{"data":"aGVsbG8"}', "scalar"],
    ['{"data":"AB=="}', "scalar"],
    ['{"ok":1}', "scalar"],
    ['{"f":3.5e38}', "scalar"],
    ['{"nums":{}}', "array"],
    ['{"labels":{"1.2":"x"}}', "key"],
    ['{"a":"a","b":"b"}', "oneof"],
    ['{"e":"BAD"}', "enum"],
    ['{"unknown":1}', "unknown"],
    ['{"child":null}', "null"],
    ["[]", "object"],
    ['{"child":{"i":"bad"}}', "scalar"],
  ])("rejects invalid input %s without silent coercion", (text, code) => {
    const c = single(source);
    if (code === "parse")
      expectCode(() => checkProtoPayload(c, "M", text), "payload");
    else {
      const check = checkProtoPayload(c, "M", text);
      expect(check.valid).toBe(false);
      expect(check.issues.some((i) => i.code === code)).toBe(true);
      expectCode(() => encodeProtoPayload(c, "M", text), "payload");
    }
  });
  it("checks required proto2 fields and does not fabricate decoded defaults", () => {
    const c = single(
      'syntax="proto2"; message A { required string id=1; optional int32 count=2 [default=3]; }',
    );
    expect(checkProtoPayload(c, "A", "{}").issues).toEqual([
      { path: "/id", code: "required" },
    ]);
    expect(encodeProtoPayload(c, "A", '{"id":"a"}').json).toEqual({ id: "a" });
    expectCode(() => decodeProtoPayload(c, "A", "", "base64"), "binary");
  });
  it("preserves explicit proto3 optional and oneof default presence while implicit defaults normalize away", () => {
    const c = single(
      'syntax="proto3"; message A { int32 implicit=1; optional int32 explicit=2; oneof selection { int32 count=3; } }',
    );
    expect(
      encodeProtoPayload(c, "A", '{"implicit":0,"explicit":0,"count":0}').json,
    ).toEqual({ explicit: 0, count: 0 });
  });
  it("supports large finite floating-point values without treating them as unsafe integers", () => {
    const c = single(
      'syntax="proto3"; message A { double big=1; float approximate=2; }',
    );
    const result = encodeProtoPayload(
      c,
      "A",
      '{"big":1e100,"approximate":1e30}',
    );
    expect(result.json).toMatchObject({ big: 1e100 });
    expectCode(() => encodeProtoPayload(c, "A", '{"big":1e400}'), "payload");
  });
  it("rejects invalid UTF-8 and non-finite decoded numbers instead of silently substituting JSON values", () => {
    const c = single(
      'syntax="proto3"; message A { string text=1; double number=2; }',
    );
    expectCode(() => decodeProtoPayload(c, "A", "0a02c328", "hex"), "binary");
    expectCode(
      () => decodeProtoPayload(c, "A", "11000000000000f07f", "hex"),
      "binary",
    );
  });
  it("rejects dangerous map properties and escapes issue pointers", () => {
    const c = single(
      'syntax="proto3"; message A { map<string,string> data=1; }',
    );
    expect(
      checkProtoPayload(c, "A", '{"data":{"__proto__":"x","a/b~c":1}}').issues,
    ).toEqual([
      { path: "/data/__proto__", code: "key" },
      { path: "/data/a~1b~0c", code: "scalar" },
    ]);
    expect({}).not.toHaveProperty("polluted");
  });
  it("accepts whitespace in hex/base64, rejects malformed input, and bounds binary size", () => {
    expect(Array.from(readProtoBytes("0a 02\n68 69", "hex"))).toEqual([
      10, 2, 104, 105,
    ]);
    expect(Array.from(readProtoBytes("CgJo\naQ==", "base64"))).toEqual([
      10, 2, 104, 105,
    ]);
    for (const s of ["0", "zz", "0x10"])
      expectCode(() => readProtoBytes(s, "hex"), "binary");
    expectCode(() => readProtoBytes("AA=A", "base64"), "binary");
    expectCode(
      () => readProtoBytes("00".repeat(MAX_PROTO_BINARY_BYTES + 1), "hex"),
      "limit",
    );
  });
  it("rejects truncated varints, malformed lengths, field zero, invalid types and known-field wire mismatches", () => {
    const c = single('syntax="proto3"; message A { string x=1; int32 n=2; }');
    for (const hex of [
      "80",
      "0a0561",
      "00",
      "0f",
      "0801",
      "ffffffffffffffffff02",
    ])
      expectCode(() => decodeProtoPayload(c, "A", hex, "hex"), "binary");
  });
  it("discards unknown fields and preserves the last known singular/oneof value", () => {
    const c = single(
      'syntax="proto3"; message A { int32 n=1; oneof x { string a=2; string b=3; } }',
    );
    expect(
      decodeProtoPayload(c, "A", "080108021201611a0162980601", "hex").json,
    ).toEqual({ n: 2, b: "b" });
  });
  it("bounds recursive binary nesting and excessive primitive counts before decoding", () => {
    const c = single(
      'syntax="proto3"; message A { A child=1; repeated int32 nums=2; }',
    );
    let bytes = new Uint8Array();
    for (let i = 0; i < 30; i++) {
      const size = bytes.length;
      bytes = Uint8Array.from([
        10,
        size < 128 ? size : (size % 128) + 128,
        ...(size < 128 ? [] : [Math.floor(size / 128)]),
        ...bytes,
      ]);
    }
    expectCode(
      () =>
        decodeProtoPayload(
          c,
          "A",
          Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
          "hex",
        ),
      "limit",
    );
    expectCode(
      () => decodeProtoPayload(c, "A", "1001".repeat(5001), "hex"),
      "limit",
    );
  });
  it("generates bounded samples, selects a single oneof, and stops optional recursive edges", () => {
    const c = single(source),
      sample = generateProtoSample(c, "M", 2);
    expect(checkProtoPayload(c, "M", sample).valid).toBe(true);
    expect(JSON.parse(sample)).toHaveProperty("a");
    expect(JSON.parse(sample)).not.toHaveProperty("b");
    expect(JSON.parse(sample)).not.toHaveProperty("child");
    const required = single(
      'syntax="proto2"; message A { required A child=1; }',
    );
    expectCode(() => generateProtoSample(required, "A"), "generation");
    expectCode(() => generateProtoSample(c, "M", 7), "generation");
  });
});

describe("gRPC frames and saved exchanges", () => {
  it("uses the gRPC compression byte and big-endian length, including empty messages", () => {
    expect(
      Array.from(
        frameProtoMessages([new Uint8Array([8, 1]), new Uint8Array()]),
      ),
    ).toEqual([0, 0, 0, 0, 2, 8, 1, 0, 0, 0, 0, 0]);
    const c = single('syntax="proto3"; message A { int32 n=1; }');
    expect(
      decodeProtoFrames(c, "A", "000000000208010000000000", "hex").map(
        (m) => m.json,
      ),
    ).toEqual([{ n: 1 }, {}]);
  });
  it.each([
    "",
    "0000",
    "0100000000",
    "8000000000",
    "000000000208",
    "000000000008",
  ])("rejects incomplete or compressed frames %s", (hex) =>
    expectCode(
      () => decodeProtoFrames(single("message A{}"), "A", hex, "hex"),
      "frame",
    ),
  );
  it("generates, rehearses and frames each RPC mode with exact cardinality checks", () => {
    const c = demo();
    for (const method of c.methods) {
      const draft = generateProtoDraft(c, method.key);
      const req = JSON.parse(draft.requests)[0],
        res = JSON.parse(draft.responses)[0];
      draft.requests = JSON.stringify(
        method.requestStream ? [req, req] : [req],
      );
      draft.responses = JSON.stringify(
        method.responseStream ? [res, res] : [res],
      );
      const run = rehearseProtoExchange(c, draft);
      expect(run.requests).toHaveLength(method.requestStream ? 2 : 1);
      expect(run.responses).toHaveLength(method.responseStream ? 2 : 1);
      expect(
        decodeProtoFrames(
          c,
          method.requestType,
          run.requestFrames,
          "base64",
        ).map((m) => m.json),
      ).toEqual(run.requests.map((m) => m.json));
      expect(
        decodeProtoFrames(
          c,
          method.responseType,
          run.responseFrames,
          "base64",
        ).map((m) => m.json),
      ).toEqual(run.responses.map((m) => m.json));
      if (!method.requestStream)
        expectCode(
          () =>
            rehearseProtoExchange(c, {
              ...draft,
              requests: JSON.stringify([req, req]),
            }),
          "case",
        );
      if (!method.responseStream)
        expectCode(
          () =>
            rehearseProtoExchange(c, {
              ...draft,
              responses: JSON.stringify([res, res]),
            }),
          "case",
        );
    }
  });
  it("rejects missing methods, invalid arrays, absent messages, invalid payloads and too many messages", () => {
    const c = demo(),
      draft = generateProtoDraft(c, c.methods[0].key);
    expectCode(
      () => rehearseProtoExchange(c, { ...draft, method: "/missing/Go" }),
      "case",
    );
    for (const requests of [
      "{}",
      "[]",
      JSON.stringify(Array.from({ length: 101 }, () => ({}))),
    ])
      expectCode(
        () => rehearseProtoExchange(c, { ...draft, requests }),
        "case",
      );
    expectCode(
      () =>
        rehearseProtoExchange(c, {
          ...draft,
          requests: '[{"product_id":"wrong"}]',
        }),
      "payload",
    );
  });
  it("exports aggregate reports without JSON values, encoded bytes, or payload text", () => {
    const c = demo(),
      draft = generateProtoDraft(c, c.methods[0].key);
    draft.requests = '[{"product_id":"9007199254740993"}]';
    const result = rehearseProtoExchange(c, draft),
      report = JSON.stringify(protoRehearsalReport(result));
    expect(report).not.toContain("9007199254740993");
    expect(report).not.toContain(result.requestFrames);
    expect(report).not.toContain("base64");
    expect(report).toContain("byteLength");
  });
  it("round-trips portable projects, preserves edited drafts and ignores claimed results", () => {
    const c = demo();
    let project = {
      ...emptyProtoProject(),
      files: c.files,
      entry: c.entry,
      draft: generateProtoDraft(c, c.methods[0].key),
    };
    project = saveProtoCase(project, c);
    expect(project.cases).toHaveLength(1);
    const id = project.cases[0].id;
    project = { ...project, draft: { ...project.draft, name: "Updated" } };
    project = saveProtoCase(project, c, id);
    expect(project.cases).toHaveLength(1);
    expect(project.cases[0].name).toBe("Updated");
    project.draft.requests = '[{"product_id":"needs-fix"}]';
    const text = serializeProtoProject(project),
      restored = parseProtoProject(text);
    expect(restored.project).toEqual(project);
    expect(restored.contract.methods).toEqual(c.methods);
    const tampered = JSON.parse(text);
    tampered.rehearsal = { passed: true };
    tampered.cases[0].response = "fake";
    expect(parseProtoProject(JSON.stringify(tampered)).project).toEqual(
      project,
    );
  });
  it("bounds saved cases and rejects invalid project shape, duplicates, missing files and invalid JSON drafts", () => {
    const c = demo(),
      project = {
        ...emptyProtoProject(),
        files: c.files,
        entry: c.entry,
        draft: generateProtoDraft(c, c.methods[0].key),
      };
    expectCode(() => saveProtoCase(project, c, "missing"), "case");
    expectCode(
      () =>
        saveProtoCase(
          {
            ...project,
            cases: Array.from({ length: MAX_PROTO_CASES }, (_, i) => ({
              ...project.draft,
              id: String(i),
            })),
          },
          c,
        ),
      "limit",
    );
    expectCode(() => parseProtoProject("{}"), "project");
    const saved = saveProtoCase(project, c),
      raw = JSON.parse(serializeProtoProject(saved));
    raw.cases.push(raw.cases[0]);
    expectCode(() => parseProtoProject(JSON.stringify(raw)), "project");
    expectCode(
      () =>
        serializeProtoProject({
          ...project,
          draft: { ...project.draft, requests: "[" },
        }),
      "payload",
    );
    expectCode(
      () => serializeProtoProject({ ...project, entry: "missing.proto" }),
      "import",
    );
  });
});

describe("Protobuf evolution review", () => {
  it("accepts identical contracts and reports additive fields/types/methods", () => {
    const before = single(
      'syntax="proto3"; message A{ string name=1; } service S{rpc Go(A)returns(A);}',
    );
    expect(compareProtoContracts(before, before).changes).toEqual([]);
    const after = single(
      'syntax="proto3"; message A{ string name=1; int32 count=2; } message B{} service S{rpc Go(A)returns(A);rpc More(A)returns(B);}',
    );
    expect(compareProtoContracts(before, after)).toMatchObject({
      errors: 0,
      warnings: 0,
      additions: 3,
    });
  });
  it("detects tag moves, declared type changes, map/cardinality/oneof changes, removals, and RPC signatures", () => {
    const before = single(
      'syntax="proto3"; message A{ string name=1; map<string,int32> values=2; repeated int32 n=3; oneof choice{string a=4;string b=5;} } service S{rpc Go(A)returns(A);}',
    );
    const after = single(
      'syntax="proto3"; message A{ string name=6; map<int32,int32> values=2; int32 n=3; string a=4; reserved 5; } service S{rpc Go(stream A)returns(A);}',
    );
    const result = compareProtoContracts(before, after);
    expect(result.changes.map((c) => c.code)).toEqual(
      expect.arrayContaining([
        "tagChanged",
        "fieldChanged",
        "fieldRemoved",
        "fieldReserved",
        "fieldAdded",
        "methodChanged",
      ]),
    );
    expect(result.errors).toBeGreaterThan(0);
  });
  it("flags required-field additions/removals and field/enum JSON renames", () => {
    const before = single(
      'syntax="proto2"; message A{ required string id=1; optional string name=2; } enum E{OLD=0;GONE=1;}',
    );
    const after = single(
      'syntax="proto2"; message A{ optional string title=2; required string key=3; } enum E{NEW=0;}',
    );
    const result = compareProtoContracts(before, after);
    expect(result.changes.map((c) => c.code)).toEqual(
      expect.arrayContaining([
        "fieldRemoved",
        "fieldRenamed",
        "requiredAdded",
        "enumRenamed",
        "enumRemoved",
      ]),
    );
    expect(result.errors).toBe(2);
  });
  it("detects removed message types and RPCs even with matching field shapes elsewhere", () => {
    const before = single("message A{} service S{rpc Go(A)returns(A);}");
    const after = single("message B{}");
    expect(
      compareProtoContracts(before, after).changes.map((c) => c.code),
    ).toEqual(["typeRemoved", "added", "methodRemoved"]);
  });
  it("reports a loss of explicit field presence", () => {
    const before = single(
      'syntax="proto3"; message A{ optional int32 count=1; }',
    );
    const after = single('syntax="proto3"; message A{ int32 count=1; }');
    expect(
      compareProtoContracts(before, after).changes.some(
        (c) => c.code === "fieldChanged",
      ),
    ).toBe(true);
  });
});
