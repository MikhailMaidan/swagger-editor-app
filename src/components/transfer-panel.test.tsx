import { webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TransferPanel } from "./transfer-panel";
import { setAppLanguage } from "./i18n-provider";
import { transferTranslations } from "@/lib/transfer-translations";
import { downloadTextFile } from "@/lib/schema-download";
import { downloadTransferBytes } from "@/lib/transfer-download";
import {
  MAX_TRANSFER_PROJECT,
  decodeTransferBytes,
  emptyTransferProject,
  encodeTransferBytes,
} from "@/lib/transfer-project";
import {
  prepareTransferResource,
  serveTransferBytes,
  transferPacket,
} from "@/lib/transfer-engine";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/transfer-download", () => ({ downloadTransferBytes: vi.fn() }));
const en = transferTranslations.en;
type Key = keyof typeof en;
const field = (k: Key) => screen.getByLabelText(en[k]),
  button = (k: Key) => screen.getByRole("button", { name: en[k] }),
  click = (k: Key) => fireEvent.click(button(k)),
  change = (k: Key, value: string) =>
    fireEvent.change(field(k), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0],
  project = () => {
    click("transfer.export");
    return JSON.parse(exported()) as ReturnType<typeof emptyTransferProject>;
  };
async function setup(demo = false) {
  const view = render(<TransferPanel />);
  fireEvent.click(
    screen.getByText(en["transfer.title"], { selector: "summary" }),
  );
  await screen.findByLabelText(en["transfer.name"]);
  if (demo) click("transfer.demo");
  return view;
}
async function job(k: Key = "transfer.runAll") {
  click(k);
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["transfer.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 7000 },
  );
}
function file(
  key: Key,
  source: string | Uint8Array,
  read?: () => Promise<string | ArrayBuffer>,
  size?: number,
) {
  const binary = source instanceof Uint8Array,
    f = new File(
      [binary ? new Uint8Array(source).buffer : source],
      binary ? "payload.bin" : "transfer.json",
      { type: binary ? "application/octet-stream" : "application/json" },
    );
  Object.defineProperty(f, binary ? "arrayBuffer" : "text", {
    value:
      read ?? (async () => (binary ? new Uint8Array(source).buffer : source)),
  });
  if (size !== undefined) Object.defineProperty(f, "size", { value: size });
  fireEvent.change(field(key), { target: { files: [f] } });
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  vi.mocked(downloadTransferBytes).mockReset().mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("resumable byte-range studio", () => {
  it("rehearses eight demo expectations offline and exports reports without captured bytes", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job();
    expect(screen.getByRole("status")).toHaveTextContent("8/8");
    expect(
      within(
        screen.getByRole("table", { name: en["transfer.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(9);
    expect(
      screen.getByRole("img", { name: en["transfer.coverage"] }),
    ).toBeInTheDocument();
    expect(button("transfer.output")).toBeDisabled();
    expect(screen.getByText(en["transfer.retention"])).toBeInTheDocument();
    click("transfer.report");
    expect(JSON.parse(exported()).runs[0].journal).toBeUndefined();
    fireEvent.click(field("transfer.details"));
    click("transfer.report");
    expect(JSON.parse(exported()).runs[0].journal).toHaveLength(8);
    expect(exported()).not.toMatch(
      /"base64"|sha256-|"resourceId"|"output"|Content-Range/,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("downloads only verified bytes and blocks corrupt/incomplete outputs", async () => {
    await setup(true);
    await job("transfer.run");
    click("transfer.output");
    expect(vi.mocked(downloadTransferBytes).mock.calls.at(-1)![0]).toEqual(
      Uint8Array.from({ length: 1024 }, (_, i) => i % 256),
    );
    change("transfer.scenario", "corruption");
    await job("transfer.run");
    expect(
      screen.getByRole("table", { name: en["transfer.results"] }),
    ).toHaveTextContent(en["transfer.integrityFailed"]);
    expect(button("transfer.output")).toBeDisabled();
    expect(button("transfer.checkpointExport")).toBeEnabled();
    change("transfer.scenario", "budget");
    await job("transfer.run");
    expect(button("transfer.output")).toBeDisabled();
    click("transfer.checkpointExport");
    expect(JSON.parse(exported()).segments).toHaveLength(1);
  });
  it("exports/imports a partial checkpoint and resumes only missing bytes", async () => {
    await setup(true);
    change("transfer.scenario", "budget");
    await job("transfer.run");
    click("transfer.checkpointExport");
    const checkpoint = exported();
    file("transfer.checkpointImport", checkpoint);
    await screen.findAllByText(/384\/1024 bytes retained/);
    expect(field("transfer.useCheckpoint")).toBeChecked();
    change("transfer.scenario", "normal");
    await job("transfer.run");
    expect(screen.getByText(/5 GET attempts/)).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: en["transfer.timeline"] }),
    ).toHaveTextContent("384–511");
    click("transfer.output");
    expect(vi.mocked(downloadTransferBytes).mock.calls.at(-1)![0]).toHaveLength(
      1024,
    );
    click("transfer.clearCheckpoint");
    expect(field("transfer.useCheckpoint")).toBeDisabled();
  });
  it("probes multipart ranges and downloads exact wire/part bytes", async () => {
    await setup(true);
    await job("transfer.sendProbe");
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"multipart": true');
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"status": 206');
    click("transfer.partBytes");
    expect([...vi.mocked(downloadTransferBytes).mock.calls.at(-1)![0]]).toEqual(
      Array.from({ length: 32 }, (_, i) => i),
    );
    change("transfer.part", "1");
    click("transfer.partBytes");
    expect([...vi.mocked(downloadTransferBytes).mock.calls.at(-1)![0]]).toEqual(
      Array.from({ length: 16 }, (_, i) => 240 + i),
    );
    click("transfer.packetExport");
    const packet = JSON.parse(exported());
    click("transfer.wire");
    expect(vi.mocked(downloadTransferBytes).mock.calls.at(-1)![0]).toEqual(
      decodeTransferBytes(packet.base64),
    );
    change("transfer.method", "HEAD");
    await job("transfer.sendProbe");
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"bodyBytes": 0');
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"content-length": "1024"');
  });
  it("applies strong If-Range and exact-date gating without modifying resources", async () => {
    await setup();
    await waitFor(() => expect(button("transfer.useTag")).toBeEnabled());
    click("transfer.useTag");
    expect(field("transfer.ifRangeMissing")).not.toBeChecked();
    await job("transfer.sendProbe");
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"status": 206');
    change("transfer.ifRange", 'W/"weak"');
    await job("transfer.sendProbe");
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"status": 200');
    change(
      "transfer.ifRange",
      emptyTransferProject().resources[0].lastModified!,
    );
    await job("transfer.sendProbe");
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"status": 200');
    fireEvent.click(field("transfer.dateStrong"));
    click("transfer.save");
    await job("transfer.sendProbe");
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"status": 206');
  });
  it("retains invalid byte/scenario drafts and guards selection/export until save or discard", async () => {
    await setup(true);
    change("transfer.payload", "/x==");
    change("transfer.resource", "replacement");
    expect(field("transfer.resource")).toHaveValue("original");
    expect(screen.getByRole("alert")).toHaveTextContent(en["transfer.pending"]);
    click("transfer.export");
    expect(downloadTextFile).not.toHaveBeenCalled();
    click("transfer.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["transfer.error.bytes"],
    );
    expect(field("transfer.payload")).toHaveValue("/x==");
    click("transfer.discard");
    change("transfer.attempts", "0");
    click("transfer.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["transfer.error.project"],
    );
    click("transfer.discard");
    change("transfer.faults", "{");
    click("transfer.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["transfer.error.json"],
    );
    click("transfer.discard");
    expect(project().scenarios).toHaveLength(8);
  });
  it("converts editable bytes without corrupting BOM and refuses invalid binary UTF-8", async () => {
    await setup();
    change("transfer.format", "utf8");
    change("transfer.payload", "\uFEFFhello");
    click("transfer.save");
    expect(project().resources[0].base64).toBe(
      encodeTransferBytes(new TextEncoder().encode("\uFEFFhello")),
    );
    change("transfer.format", "hex");
    expect(field("transfer.payload")).toHaveValue("ef bb bf 68 65 6c 6c 6f");
    change("transfer.payload", "00 ff");
    click("transfer.save");
    change("transfer.format", "utf8");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["transfer.error.bytes"],
    );
    expect(field("transfer.format")).toHaveValue("hex");
    expect(project().resources[0].base64).toBe("AP8=");
  });
  it("adds independent resources and scenarios while protecting referenced revisions", async () => {
    await setup();
    expect(button("transfer.deleteResource")).toBeDisabled();
    click("transfer.cloneResource");
    const cloned = project();
    expect(cloned.resources[1].base64).toBe(cloned.resources[0].base64);
    change("transfer.resourceName", "Independent revision");
    click("transfer.save");
    expect(project().resources[0].name).toBe("resource-1");
    click("transfer.addScenario");
    expect(button("transfer.deleteResource")).toBeDisabled();
    click("transfer.cloneScenario");
    click("transfer.deleteScenario");
    change("transfer.scenario", "scenario-2");
    click("transfer.deleteScenario");
    expect(button("transfer.deleteResource")).toBeEnabled();
    click("transfer.deleteResource");
    click("transfer.addResource");
    expect(project().resources).toHaveLength(2);
    click("transfer.deleteScenario");
    expect(screen.getByText(en["transfer.noScenarios"])).toBeInTheDocument();
    expect(button("transfer.runAll")).toBeDisabled();
    click("transfer.addScenario");
    expect(button("transfer.run")).toBeEnabled();
  });
  it("imports exact binary files as revisions and leaves saved bytes intact on invalid packet/project imports", async () => {
    await setup();
    file("transfer.file", Uint8Array.of(0, 255, 128, 10));
    await screen.findByRole("status");
    expect(field("transfer.resourceName")).toHaveValue("payload.bin");
    const p = project();
    expect(p.resources).toHaveLength(2);
    expect([...decodeTransferBytes(p.resources[1].base64)]).toEqual([
      0, 255, 128, 10,
    ]);
    file("transfer.import", "{");
    await screen.findByRole("alert");
    expect(field("transfer.resourceName")).toHaveValue("payload.bin");
    const r = await prepareTransferResource(p.resources[0]),
      packet = transferPacket(
        serveTransferBytes(r, {
          method: "GET",
          range: "bytes=0-3",
          ifRange: null,
        }),
      );
    file("transfer.packetImport", JSON.stringify(packet));
    await screen.findByText(en["transfer.packetLoaded"]);
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"status": 206');
    packet.headers["Content-Length"] = "900";
    file("transfer.packetImport", JSON.stringify(packet));
    await screen.findByText(en["transfer.error.packet"]);
    expect(
      screen.getByLabelText(en["transfer.responseMeta"]),
    ).toHaveTextContent('"status": 206');
    expect(project().resources[1].base64).toBe("AP+ACg==");
  });
  it("imports projects/checkpoints atomically, strips results and checks size before file reads", async () => {
    await setup(true);
    await job();
    const reader = vi.fn(async () => "{}");
    file("transfer.import", "{}", reader, MAX_TRANSFER_PROJECT + 1);
    await screen.findByText(en["transfer.error.limit"]);
    expect(reader).not.toHaveBeenCalled();
    expect(
      screen.getByRole("table", { name: en["transfer.results"] }),
    ).toBeInTheDocument();
    file(
      "transfer.checkpointImport",
      JSON.stringify({
        kind: "rsswag-transfer-checkpoint",
        version: 1,
        etag: 'W/"bad"',
        total: 1,
        segments: [],
      }),
    );
    await screen.findByText(en["transfer.error.checkpoint"]);
    expect(field("transfer.useCheckpoint")).toBeDisabled();
    const p = emptyTransferProject();
    p.scenarios = [];
    file(
      "transfer.import",
      JSON.stringify({
        ...p,
        results: ["injected"],
        runtime: { bytes: "secret" },
      }),
    );
    await screen.findByText(en["transfer.noScenarios"]);
    expect(
      screen.queryByRole("table", { name: en["transfer.results"] }),
    ).not.toBeInTheDocument();
    expect(project()).toEqual(p);
  });
  it("retains complete prior results on cancellation and ignores late file reads after cancellation/unmount", async () => {
    const view = await setup(true);
    await job();
    click("transfer.runAll");
    click("transfer.cancel");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["transfer.cancelled"],
    );
    expect(
      screen.getByRole("table", { name: en["transfer.results"] }),
    ).toBeInTheDocument();
    let resolve!: (s: string | ArrayBuffer) => void;
    file(
      "transfer.import",
      "{}",
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    click("transfer.cancel");
    await act(async () => resolve(JSON.stringify(emptyTransferProject())));
    expect(field("transfer.name")).toHaveValue(
      "Version-safe interrupted downloads",
    );
    file(
      "transfer.import",
      "{}",
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    view.unmount();
    await act(async () => resolve(JSON.stringify(emptyTransferProject())));
  });
  it("records expectations, filters attempt decisions and exports a payload-free toolkit with download recovery", async () => {
    await setup();
    await job("transfer.run");
    click("transfer.record");
    await job("transfer.run");
    expect(screen.getByRole("status")).toHaveTextContent("1/1");
    change("transfer.search", "accepted");
    expect(
      screen.getByRole("table", { name: en["transfer.timeline"] }),
    ).toHaveTextContent("accepted");
    fireEvent.keyDown(field("transfer.search"), { key: "Escape" });
    expect(field("transfer.search")).toHaveValue("");
    click("transfer.toolkit");
    expect(exported()).toContain("downloadBytes");
    expect(exported()).toContain("createByteRangeResponder");
    expect(exported()).not.toContain(
      emptyTransferProject().resources[0].base64,
    );
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    click("transfer.toolkit");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["transfer.error.download"],
    );
    click("transfer.toolkit");
    expect(screen.getByRole("status")).toHaveTextContent(
      en["transfer.downloaded"],
    );
  });
  it("renders Russian controls and complete demo feedback", async () => {
    act(() => setAppLanguage("ru"));
    const ru = transferTranslations.ru;
    render(<TransferPanel />);
    fireEvent.click(
      screen.getByText(ru["transfer.title"], { selector: "summary" }),
    );
    await screen.findByLabelText(ru["transfer.name"]);
    fireEvent.click(screen.getByRole("button", { name: ru["transfer.demo"] }));
    fireEvent.click(
      screen.getByRole("button", { name: ru["transfer.runAll"] }),
    );
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", { name: ru["transfer.cancel"] }),
        ).not.toBeInTheDocument(),
      { timeout: 7000 },
    );
    expect(
      screen.getByRole("table", { name: ru["transfer.results"] }),
    ).toHaveTextContent(ru["transfer.integrityFailed"]);
  });
});
