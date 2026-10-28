import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RpcStudioPanel } from "./rpc-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { rpcTranslations } from "@/lib/rpc-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  demoRpcProject,
  emptyRpcProject,
  serializeRpcProject,
} from "@/lib/rpc-studio";
import { MAX_RPC_PROJECT_BYTES } from "@/lib/rpc-json";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const fetcher = vi.fn();
const en = rpcTranslations.en;
type Key = keyof typeof en;
const field = (key: Key) => screen.getByLabelText(en[key]);
const button = (key: Key) => screen.getByRole("button", { name: en[key] });
const click = (key: Key) => fireEvent.click(button(key));
const change = (key: Key, value: string) =>
  fireEvent.change(field(key), { target: { value } });
const value = (key: Key) => (field(key) as HTMLInputElement).value;
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
async function setup(demo = false) {
  const view = render(<RpcStudioPanel />);
  await act(async () => {
    fireEvent.click(screen.getByText(en["rpc.title"], { selector: "summary" }));
  });
  await screen.findByLabelText(en["rpc.contract"]);
  if (demo) click("rpc.demo");
  return view;
}
function importFile(
  source: string,
  project = true,
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "rpc.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(project ? "rpc.import" : "rpc.importContract"), {
    target: { files: [file] },
  });
}
beforeEach(() => {
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  fetcher.mockReset().mockRejectedValue(new Error("Unexpected traffic"));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("JSON-RPC studio", () => {
  it("keeps the studio collapsed until opened and runs seven demo cases without traffic or storage writes", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<RpcStudioPanel />);
    expect(screen.queryByLabelText(en["rpc.contract"])).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        screen.getByText(en["rpc.title"], { selector: "summary" }),
      );
    });
    await screen.findByLabelText(en["rpc.contract"]);
    click("rpc.demo");
    click("rpc.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("7/7 passed");
    expect(
      within(
        screen.getByRole("region", { name: en["rpc.caseResultsTitle"] }),
      ).getAllByText("Passed"),
    ).toHaveLength(7);
    click("rpc.report");
    expect(JSON.parse(exported()).cases).toHaveLength(7);
    expect(exported()).not.toContain("Fixture rejection");
    expect(exported()).not.toContain("rpc.example");
    expect(exported()).not.toContain('"result":');
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });

  it("protects pending edits and retains invalid text until discard without mutating the saved project", async () => {
    await setup(true);
    change("rpc.timeout", "");
    for (const key of [
      "rpc.live",
      "rpc.mock",
      "rpc.runAll",
      "rpc.export",
      "rpc.demo",
    ] as const)
      expect(button(key)).toBeDisabled();
    expect(field("rpc.caseSelect")).toBeDisabled();
    click("rpc.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rpc.error.project"],
    );
    expect(field("rpc.timeout")).toHaveValue("");
    click("rpc.discard");
    click("rpc.export");
    expect(JSON.parse(exported()).timeoutMs).toBe(emptyRpcProject().timeoutMs);
  });

  it("builds named calls, advances numeric IDs, appends typed IDs and notifications, and rejects an ambiguous append", async () => {
    await setup();
    change("rpc.style", "named");
    click("rpc.generateParams");
    expect(JSON.parse(value("rpc.params"))).toEqual({ a: 0, b: 0 });
    change("rpc.params", '{"a":1,"b":2}');
    click("rpc.build");
    expect(field("rpc.id")).toHaveValue("2");
    change("rpc.id", '"1"');
    click("rpc.append");
    const before = value("rpc.request");
    expect(JSON.parse(before).map((r: { id: unknown }) => r.id)).toEqual([
      1,
      "1",
    ]);
    click("rpc.append");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rpc.error.request"],
    );
    expect(value("rpc.request")).toBe(before);
    change("rpc.method", "events.log");
    expect(field("rpc.notification")).toBeChecked();
    change("rpc.params", '["event"]');
    click("rpc.append");
    expect(JSON.parse(value("rpc.request"))[2]).toEqual({
      jsonrpc: "2.0",
      method: "events.log",
      params: ["event"],
    });
    click("rpc.save");
    click("rpc.mock");
    expect(
      screen.getByText(
        "Wire protocol: valid; complete contract checks: complete.",
      ),
    ).toBeInTheDocument();
  });

  it("inspects unsaved exchanges, shows typed-ID errors and marks a prior snapshot stale", async () => {
    await setup();
    change("rpc.response", '{"jsonrpc":"2.0","id":"1","result":false}');
    click("rpc.inspect");
    expect(
      screen.getByText(en["rpc.finding.unknown-id"], { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(en["rpc.finding.missing-response"], { exact: false }),
    ).toBeInTheDocument();
    change("rpc.response", '{"jsonrpc":"2.0","id":1,"result":0}');
    expect(screen.getByText(en["rpc.inspectionStale"])).toBeInTheDocument();
    click("rpc.inspect");
    expect(field("rpc.resultValue")).toHaveValue("0");
    expect(
      screen.queryByText(en["rpc.inspectionStale"]),
    ).not.toBeInTheDocument();
    click("rpc.inspectionReport");
    expect(JSON.parse(exported()).cases[0].rows[0].outcome).toBe("result");
  });

  it("captures a saved snapshot with optional exact result assertions and detects regression failures", async () => {
    await setup();
    click("rpc.mock");
    expect(button("rpc.capture")).toBeDisabled();
    click("rpc.save");
    fireEvent.click(field("rpc.recordResults"));
    click("rpc.capture");
    expect(JSON.parse(value("rpc.caseResults"))).toEqual({ "0": 3 });
    expect(field("rpc.caseMode")).toHaveValue("fixture");
    click("rpc.runAll");
    expect(screen.getByRole("status")).toHaveTextContent("1/1 passed");
    change("rpc.caseResults", '{"0":4}');
    click("rpc.save");
    click("rpc.runCase");
    expect(screen.getByRole("status")).toHaveTextContent("0/1 passed");
    click("rpc.export");
    expect(JSON.parse(exported()).cases[0].response).toContain('"result": 3');
    click("rpc.deleteCase");
    expect(screen.getByText(en["rpc.noCases"])).toBeInTheDocument();
  });

  it("saves edited error fixtures, preserves their source on export, and can add and delete fixtures", async () => {
    await setup();
    change("rpc.mockKind", "error");
    change(
      "rpc.mockValue",
      '{"code":901,"message":"private error","data":{"sensitive":true}}',
    );
    click("rpc.save");
    click("rpc.mock");
    expect(value("rpc.response")).toContain("private error");
    expect(screen.getByText("RPC error (901)")).toBeInTheDocument();
    click("rpc.save");
    click("rpc.mockExport");
    expect(exported()).toContain("createJsonRpcMockHandler");
    expect(exported()).toContain("private error");
    click("rpc.addMock");
    expect(field("rpc.mockMethod")).toHaveValue("mock.method-1");
    click("rpc.deleteMock");
    click("rpc.export");
    expect(JSON.parse(exported()).mocks).toHaveLength(3);
    // Fixture changes invalidate the previous exchange snapshot.
    expect(button("rpc.capture")).toBeDisabled();
  });

  it("imports OpenRPC metadata without changing the endpoint and adopts a server URL only explicitly", async () => {
    await setup();
    const root = JSON.parse(emptyRpcProject().contract);
    root.info["x-private"] = { keep: "exact" };
    root.servers = [{ name: "local", url: "https://new.example/rpc" }];
    const source = JSON.stringify(root, null, 4);
    await act(async () => importFile(source, false));
    expect(value("rpc.endpoint")).toBe("https://rpc.example/jsonrpc");
    expect(button("rpc.exportContract")).toBeDisabled();
    click("rpc.useServer");
    expect(field("rpc.endpoint")).toHaveValue("https://new.example/rpc");
    click("rpc.save");
    click("rpc.exportContract");
    expect(exported()).toBe(source);
    click("rpc.addMethod");
    click("rpc.save");
    click("rpc.exportContract");
    expect(JSON.parse(exported()).methods).toHaveLength(5);
    expect(JSON.parse(exported()).info["x-private"]).toEqual({ keep: "exact" });
  });

  it("rejects invalid or oversized imports atomically and drops untrusted result/header metadata from valid imports", async () => {
    await setup(true);
    click("rpc.runAll");
    await act(async () => importFile('{"kind":"bad"}'));
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rpc.error.project"],
    );
    expect(field("rpc.projectName")).toHaveValue(demoRpcProject().name);
    expect(
      screen.getByRole("region", { name: en["rpc.caseResultsTitle"] }),
    ).toBeInTheDocument();
    const text = vi.fn(async () => "{}");
    await act(async () =>
      importFile("{}", true, text, MAX_RPC_PROJECT_BYTES + 1),
    );
    expect(text).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(en["rpc.error.limit"]);
    change("rpc.headers", '{"Authorization":"session-secret"}');
    await act(async () =>
      importFile(
        JSON.stringify({
          ...emptyRpcProject(),
          headers: { Authorization: "injected" },
          results: [{ passed: true }],
        }),
      ),
    );
    expect(field("rpc.headers")).toHaveValue("{}");
    expect(
      screen.queryByRole("region", { name: en["rpc.caseResultsTitle"] }),
    ).not.toBeInTheDocument();
    click("rpc.export");
    expect(exported()).not.toContain("injected");
    expect(exported()).not.toContain('"results"');
  });

  it("sends only on explicit live action, keeps HTTP error bodies, and omits session headers from every export", async () => {
    await setup();
    change("rpc.headers", '{"Authorization":"Bearer private-live-token"}');
    click("rpc.export");
    expect(fetcher).not.toHaveBeenCalled();
    expect(exported()).not.toContain("private-live-token");
    fetcher.mockResolvedValue(
      new Response(
        '{"jsonrpc":"2.0","id":1,"error":{"code":-32001,"message":"private message"}}',
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    );
    await act(async () => click("rpc.live"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    expect(
      new Headers(fetcher.mock.calls[0][1].headers).get("Authorization"),
    ).toBe("Bearer private-live-token");
    expect(field("rpc.status")).toHaveValue("500");
    expect(screen.getByText(en["rpc.finding.http-status"])).toBeInTheDocument();
    click("rpc.inspectionReport");
    expect(exported()).not.toContain("private message");
    click("rpc.save");
    for (const key of [
      "rpc.export",
      "rpc.exportContract",
      "rpc.downloadRequest",
      "rpc.downloadResponse",
      "rpc.downloadCurl",
      "rpc.mockExport",
      "rpc.inspectionReport",
    ] as const) {
      click(key);
      expect(exported()).not.toContain("private-live-token");
    }
  });

  it("retains session headers for a path change and clears them for an origin change or project reload", async () => {
    await setup();
    change("rpc.headers", '{"Authorization":"private"}');
    change("rpc.endpoint", "https://rpc.example/another");
    click("rpc.save");
    expect(field("rpc.headers")).toHaveValue('{"Authorization":"private"}');
    change("rpc.endpoint", "https://other.example/rpc");
    click("rpc.save");
    expect(field("rpc.headers")).toHaveValue("{}");
    change("rpc.headers", '{"Authorization":"private"}');
    const project = {
      ...emptyRpcProject(),
      endpoint: "https://other.example/rpc",
    };
    await act(async () => importFile(serializeRpcProject(project)));
    expect(field("rpc.headers")).toHaveValue("{}");
  });

  it.each(["cancel", "unmount"])(
    "discards late responses and cancels their bodies after %s",
    async (mode) => {
      const view = await setup();
      let resolve!: (r: Response) => void;
      fetcher.mockImplementation(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      );
      await act(async () => click("rpc.live"));
      expect(field("rpc.endpoint")).toBeDisabled();
      expect(button("rpc.export")).toBeDisabled();
      if (mode === "cancel") {
        await act(async () => click("rpc.cancel"));
        expect(screen.getByRole("alert")).toHaveTextContent(
          en["rpc.error.cancelled"],
        );
        expect(field("rpc.response")).toHaveValue("");
      } else view.unmount();
      const cancel = vi.fn();
      await act(async () => {
        resolve(
          new Response(new ReadableStream({ cancel }), {
            headers: { "content-type": "application/json" },
          }),
        );
        await Promise.resolve();
      });
      expect(cancel).toHaveBeenCalled();
      if (mode === "cancel") expect(field("rpc.response")).toHaveValue("");
    },
  );

  it("locks mutations during a file read and ignores reads completing after unmount", async () => {
    const view = await setup();
    let resolve!: (s: string) => void;
    importFile(
      "{}",
      true,
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );
    expect(button("rpc.live")).toBeDisabled();
    expect(field("rpc.projectName")).toBeDisabled();
    view.unmount();
    await act(async () => {
      resolve(serializeRpcProject(demoRpcProject()));
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports download failures and validates explicit server adoption without usable servers", async () => {
    await setup();
    const contract = JSON.parse(emptyRpcProject().contract);
    delete contract.servers;
    change("rpc.contract", JSON.stringify(contract));
    click("rpc.save");
    click("rpc.useServer");
    expect(screen.getByRole("status")).toHaveTextContent(en["rpc.noServer"]);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("rpc.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["rpc.downloadFailed"],
    );
  });

  it("runs the demo with Russian labels and matching translated feedback", async () => {
    act(() => setAppLanguage("ru"));
    render(<RpcStudioPanel />);
    const ru = rpcTranslations.ru;
    await act(async () => {
      fireEvent.click(
        screen.getByText(ru["rpc.title"], { selector: "summary" }),
      );
    });
    await screen.findByLabelText(ru["rpc.contract"]);
    fireEvent.click(screen.getByRole("button", { name: ru["rpc.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["rpc.runAll"] }));
    expect(screen.getByRole("status")).toHaveTextContent("7/7");
    expect(screen.getByLabelText(ru["rpc.contract"])).toBeInTheDocument();
  });
});
