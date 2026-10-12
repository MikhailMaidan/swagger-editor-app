import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtobufStudioPanel } from "./protobuf-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import {
  DEMO_PROTO_FILES,
  emptyProtoProject,
  generateProtoDraft,
  MAX_PROTO_SOURCE_BYTES,
  parseProtoProject,
  readProtoContract,
  serializeProtoProject,
} from "@/lib/protobuf-studio";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const value = (label: string) =>
  (screen.getByLabelText(label) as HTMLTextAreaElement).value;
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
function file(text: string, name: string) {
  const f = new File([text], name, {
    type: name.endsWith(".json") ? "application/json" : "text/plain",
  });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
}
async function setup(demo = true) {
  const user = userEvent.setup(),
    get = vi.fn(() => DEFAULT_OPENAPI_SCHEMA),
    view = render(<ProtobufStudioPanel getSchemaText={get} />);
  await user.click(
    screen.getByText("Protocol Buffers and gRPC studio", {
      selector: "summary",
    }),
  );
  if (demo) await user.click(button("Load demo Protobuf contract"));
  return { user, get, ...view };
}

describe("ProtobufStudioPanel", () => {
  it("rehearses and exports binary exchanges, value-free reports, files, inventory, reflection, and portable projects locally", async () => {
    const { user, get } = await setup(),
      network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await user.click(button("Run offline RPC rehearsal"));
    expect(
      JSON.parse(value("RPC rehearsal results (first 16,000 characters)"))
        .method,
    ).toBe("/shop.Catalog/GetProduct");
    await user.click(button("Download RPC exchange and frames"));
    expect(JSON.parse(exported()).requests[0].json).toEqual({
      product_id: "1",
    });
    await user.click(button("Download value-free rehearsal report"));
    expect(exported()).toContain("byteLength");
    expect(exported()).not.toContain("base64");
    expect(exported()).not.toContain("example");
    await user.click(button("Download selected .proto"));
    expect(exported()).toBe(DEMO_PROTO_FILES[1].source);
    await user.click(button("Download Protobuf inventory"));
    expect(JSON.parse(exported()).methods).toHaveLength(4);
    await user.click(button("Download protobuf.js reflection JSON"));
    expect(
      JSON.parse(exported()).nested.shop.nested.Catalog.methods.GetProduct
        .requestType,
    ).toBe("GetProductRequest");
    await user.click(button("Download Protobuf project"));
    expect(parseProtoProject(exported()).project.files).toEqual(
      DEMO_PROTO_FILES,
    );
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
  it("validates, generates, encodes, decodes raw messages and inspects saved gRPC frames", async () => {
    const { user } = await setup();
    change("Protobuf JSON message", '{"product_id":"9007199254740993"}');
    await user.click(button("Validate JSON message"));
    expect(
      screen.getByText("JSON message matches the contract."),
    ).toBeInTheDocument();
    await user.click(button("Encode and round-trip message"));
    const encoded = JSON.parse(
      value("Codec results (first 16,000 characters)"),
    )[0];
    expect(encoded.json.product_id).toBe("9007199254740993");
    expect(value("Protobuf binary or gRPC frames")).toBe(encoded.base64);
    await user.click(button("Decode binary message"));
    expect(
      JSON.parse(value("Codec results (first 16,000 characters)"))[0].json,
    ).toEqual(encoded.json);
    await user.click(button("Download codec results"));
    expect(JSON.parse(exported())[0].base64).toBe(encoded.base64);
    change("Binary text format", "hex");
    change("Protobuf binary or gRPC frames", encoded.hex);
    await user.click(button("Decode binary message"));
    expect(
      JSON.parse(value("Codec results (first 16,000 characters)"))[0].json,
    ).toEqual(encoded.json);
    await user.click(button("Run offline RPC rehearsal"));
    const run = JSON.parse(
      value("RPC rehearsal results (first 16,000 characters)"),
    );
    change("Binary text format", "base64");
    change("Protobuf binary or gRPC frames", run.requestFrames);
    await user.click(button("Decode gRPC message frames"));
    expect(
      JSON.parse(value("Codec results (first 16,000 characters)"))[0].json,
    ).toEqual({ product_id: "1" });
    await user.click(button("Generate JSON message"));
    expect(JSON.parse(value("Protobuf JSON message"))).toEqual({
      product_id: "1",
    });
  });
  it("clears old results on edits and shows contract issues and malformed binary feedback", async () => {
    const { user } = await setup();
    await user.click(button("Run offline RPC rehearsal"));
    change("RPC request messages (JSON array)", '[{"product_id":null}]');
    expect(
      screen.queryByLabelText(
        "RPC rehearsal results (first 16,000 characters)",
      ),
    ).not.toBeInTheDocument();
    await user.click(button("Run offline RPC rehearsal"));
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid JSON message");
    change("Protobuf JSON message", '{"unknown":1}');
    await user.click(button("Validate JSON message"));
    expect(screen.getByLabelText("Protobuf payload issues")).toHaveTextContent(
      "Unknown field",
    );
    change("Protobuf binary or gRPC frames", "BAD");
    await user.click(button("Decode binary message"));
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid binary data");
    expect(
      screen.queryByLabelText("Codec results (first 16,000 characters)"),
    ).not.toBeInTheDocument();
  });
  it("generates streaming exchanges, retains the bound draft method, and enforces unary cardinality", async () => {
    const { user } = await setup();
    change("Selected gRPC method", "/shop.Catalog/ExchangeProducts");
    expect(value("RPC exchange name")).toBe("GetProduct");
    await user.click(button("Generate RPC exchange draft"));
    const request = JSON.parse(value("RPC request messages (JSON array)"))[0];
    change(
      "RPC request messages (JSON array)",
      JSON.stringify([request, request]),
    );
    change(
      "RPC response messages (JSON array)",
      JSON.stringify([request, request]),
    );
    await user.click(button("Run offline RPC rehearsal"));
    expect(
      JSON.parse(value("RPC rehearsal results (first 16,000 characters)"))
        .requests,
    ).toHaveLength(2);
    change("Selected gRPC method", "/shop.Catalog/GetProduct");
    await user.click(button("Generate RPC exchange draft"));
    change("RPC request messages (JSON array)", "[{},{}]");
    await user.click(button("Run offline RPC rehearsal"));
    expect(screen.getByRole("alert")).toHaveTextContent("exactly one message");
  });
  it("saves, explicitly loads, updates, removes, and restores reusable RPC exchanges", async () => {
    const { user } = await setup();
    change("RPC exchange name", "First");
    await user.click(button("Save as new RPC exchange"));
    expect(screen.getByText("1/50 saved exchanges.")).toBeInTheDocument();
    change("RPC exchange name", "Unsaved");
    await user.click(button("Load RPC exchange First"));
    expect(screen.getByLabelText("RPC exchange name")).toHaveValue("First");
    change("RPC exchange name", "Updated");
    await user.click(button("Update selected RPC exchange"));
    expect(button("Load RPC exchange Updated")).toBeInTheDocument();
    await user.click(button("Download Protobuf project"));
    const text = exported();
    await user.click(button("Remove RPC exchange Updated"));
    expect(screen.getByText("0/50 saved exchanges.")).toBeInTheDocument();
    expect(screen.getByLabelText("RPC exchange name")).toHaveValue("Updated");
    await user.upload(
      screen.getByLabelText("Restore Protobuf project (JSON)"),
      file(text, "project.json"),
    );
    expect(
      await screen.findByText(
        "Protobuf project restored; results must be generated again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1/50 saved exchanges.")).toBeInTheDocument();
    expect(button("Update selected RPC exchange")).toBeDisabled();
    await user.click(button("Run offline RPC rehearsal"));
    expect(
      screen.getByLabelText("RPC rehearsal results (first 16,000 characters)"),
    ).toBeInTheDocument();
  });
  it("pins an independent baseline and compares validated candidate field tags and RPC signatures", async () => {
    const { user } = await setup();
    await user.click(button("Pin current Protobuf baseline"));
    const source = value("Selected .proto source");
    change(
      "Selected .proto source",
      source.replace("returns (Product)", "returns (stream Product)"),
    );
    expect(button("Compare with Protobuf baseline")).toBeDisabled();
    await user.click(button("Load and validate Protobuf contract"));
    await user.click(button("Compare with Protobuf baseline"));
    expect(
      screen.getByText(/1 potentially breaking changes/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/RPC types or streaming signature changed/),
    ).toBeInTheDocument();
    await user.click(button("Download compatibility report"));
    expect(JSON.parse(exported()).changes[0]).toMatchObject({
      code: "methodChanged",
      severity: "error",
    });
    await user.click(button("Clear Protobuf baseline"));
    expect(button("Compare with Protobuf baseline")).toBeDisabled();
  });
  it("explores field/enum dependencies, filters and clears search without changing source", async () => {
    const { user } = await setup();
    const explorer = within(
      screen.getByRole("region", {
        name: "Explore Protobuf types and dependencies",
      }),
    );
    await user.click(explorer.getByRole("button", { name: "shop.Product" }));
    expect(screen.getByRole("table")).toHaveTextContent("map<string, string>");
    expect(screen.getByRole("table")).toHaveTextContent("reference");
    await user.click(
      within(screen.getByLabelText("Protobuf type dependencies")).getByRole(
        "button",
        { name: "shop.Product.State" },
      ),
    );
    expect(explorer.getByText("ACTIVE = 1")).toBeInTheDocument();
    change("Search Protobuf types and fields", "notfound");
    expect(screen.getByText("No matching Protobuf types.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Search Protobuf types and fields"));
    await user.keyboard("{Escape}");
    expect(
      screen.getByLabelText("Search Protobuf types and fields"),
    ).toHaveValue("");
    change("Filter Protobuf type kind", "enum");
    expect(
      explorer.queryByRole("button", { name: "shop.Product" }),
    ).not.toBeInTheDocument();
  });
  it("imports multiple local files atomically, loads the selected entry, and retains old work after invalid edits", async () => {
    const { user } = await setup(false);
    await user.upload(screen.getByLabelText("Import .proto files (multiple)"), [
      file('syntax="proto3"; message A {string id=1;}', "model.proto"),
      file(
        'syntax="proto3"; import "model.proto"; service S{rpc Go(A)returns(A);}',
        "service.proto",
      ),
    ]);
    expect(
      await screen.findByText(
        "Files imported. Select the entry file and load the contract.",
      ),
    ).toBeInTheDocument();
    change("Entry .proto file", "service.proto");
    await user.click(button("Load and validate Protobuf contract"));
    expect(
      screen.getByText(/1 types, 1 fields, 1 RPC methods/),
    ).toBeInTheDocument();
    await user.click(button("Generate RPC exchange draft"));
    await user.click(button("Save as new RPC exchange"));
    change("Selected .proto source", "syntax = [");
    expect(button("Run offline RPC rehearsal")).toBeDisabled();
    await user.click(button("Load and validate Protobuf contract"));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load");
    expect(screen.getByText("1/50 saved exchanges.")).toBeInTheDocument();
  });
  it("adds and removes auxiliary files and reads editor text only on explicit capture", async () => {
    const { user, get } = await setup();
    change("New .proto file path", "extra.proto");
    await user.click(button("Add .proto file"));
    expect(screen.getByLabelText("Selected .proto file")).toHaveValue(
      "extra.proto",
    );
    expect(button("Run offline RPC rehearsal")).toBeDisabled();
    await user.click(button("Remove selected .proto file"));
    expect(screen.getByLabelText("Selected .proto file")).toHaveValue(
      "shop/models.proto",
    );
    expect(button("Run offline RPC rehearsal")).toBeEnabled();
    await user.click(button("Read editor into selected .proto file"));
    expect(get).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Selected .proto source")).toHaveValue(
      DEFAULT_OPENAPI_SCHEMA,
    );
    expect(button("Run offline RPC rehearsal")).toBeDisabled();
  });
  it("imports folder paths relative to the selected root and ignores unrelated files", async () => {
    const { user } = await setup(false);
    const files = [
      file('syntax="proto3"; message A{}', "model.proto"),
      file(
        'syntax="proto3"; import "shop/model.proto"; service S{rpc Go(A)returns(A);}',
        "service.proto",
      ),
      file("readme", "README.md"),
    ];
    for (const f of files)
      Object.defineProperty(f, "webkitRelativePath", {
        value: `project/shop/${f.name}`,
      });
    await user.upload(
      screen.getByLabelText("Import .proto project folder"),
      files,
    );
    expect(
      await screen.findByText(
        "Files imported. Select the entry file and load the contract.",
      ),
    ).toBeInTheDocument();
    change("Entry .proto file", "shop/service.proto");
    await user.click(button("Load and validate Protobuf contract"));
    expect(
      screen.getByText(/1 types, 0 fields, 1 RPC methods, 2 project files/),
    ).toBeInTheDocument();
    await user.click(button("Download Protobuf project"));
    expect(
      parseProtoProject(exported()).project.files.map((f) => f.path),
    ).toEqual(["shop/model.proto", "shop/service.proto"]);
  });
  it("keeps in-memory source, drafts and results when the panel is closed and reopened", async () => {
    const { user } = await setup();
    await user.click(button("Run offline RPC rehearsal"));
    const output = value("RPC rehearsal results (first 16,000 characters)");
    await user.click(
      screen.getByText("Protocol Buffers and gRPC studio", {
        selector: "summary",
      }),
    );
    await user.click(
      screen.getByText("Protocol Buffers and gRPC studio", {
        selector: "summary",
      }),
    );
    expect(
      screen.getByLabelText("RPC rehearsal results (first 16,000 characters)"),
    ).toHaveValue(output);
  });
  it("reports blocked downloads and preserves work after invalid or oversized imports", async () => {
    const { user } = await setup();
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download Protobuf project"));
    expect(
      screen.getByText("Download was blocked. Try again."),
    ).toBeInTheDocument();
    const source = value("Selected .proto source");
    await user.upload(
      screen.getByLabelText("Restore Protobuf project (JSON)"),
      file("{}", "bad.json"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid Protobuf project",
    );
    expect(screen.getByLabelText("Selected .proto source")).toHaveValue(source);
    const oversized = file("large", "large.proto");
    Object.defineProperty(oversized, "size", {
      value: MAX_PROTO_SOURCE_BYTES + 1,
    });
    await user.upload(
      screen.getByLabelText("Import .proto files (multiple)"),
      oversized,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "limit was exceeded",
    );
    expect(screen.getByLabelText("Selected .proto source")).toHaveValue(source);
  });
  it("disables mutation controls during file reads and ignores late completion after unmount", async () => {
    const { user, unmount } = await setup();
    const slow = file("", "slow.proto");
    let resolve!: (text: string) => void;
    Object.defineProperty(slow, "text", {
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText("Import .proto files (multiple)"),
      slow,
    );
    expect(screen.getByText("Reading Protobuf files…")).toBeInTheDocument();
    expect(button("Load demo Protobuf contract")).toBeDisabled();
    expect(screen.getByLabelText("Selected .proto source")).toBeDisabled();
    unmount();
    await act(async () => resolve("message A{}"));
    expect(downloadTextFile).not.toHaveBeenCalled();
  });
  it("localizes file controls, codec, rehearsals, validation and exports into Russian", async () => {
    act(() => setAppLanguage("ru"));
    const user = userEvent.setup();
    render(<ProtobufStudioPanel getSchemaText={() => ""} />);
    await user.click(
      screen.getByText("Студия Protocol Buffers и gRPC", {
        selector: "summary",
      }),
    );
    await user.click(button("Загрузить демо-контракт Protobuf"));
    await user.click(button("Запустить локальную репетицию RPC"));
    expect(
      screen.getByText("Локальная репетиция RPC пройдена."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Результаты репетиции RPC (первые 16 000 символов)",
      ),
    ).toBeInTheDocument();
    await user.click(button("Скачать проект Protobuf"));
    expect(parseProtoProject(exported()).contract.methods).toHaveLength(4);
  });
  it("restores a valid project with a stale exchange and requires fresh validation", async () => {
    const { user } = await setup();
    const c = readProtoContract(DEMO_PROTO_FILES, "shop/service.proto"),
      project = {
        ...emptyProtoProject(),
        files: c.files,
        entry: c.entry,
        draft: {
          ...generateProtoDraft(c, c.methods[0].key),
          method: "/old/Method",
        },
      };
    await user.upload(
      screen.getByLabelText("Restore Protobuf project (JSON)"),
      file(serializeProtoProject(project), "project.json"),
    );
    await user.click(button("Run offline RPC rehearsal"));
    expect(screen.getByRole("alert")).toHaveTextContent("does not match");
    expect(
      screen.queryByLabelText(
        "RPC rehearsal results (first 16,000 characters)",
      ),
    ).not.toBeInTheDocument();
  });
});
