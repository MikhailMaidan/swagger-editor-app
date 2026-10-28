import { webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookStudioPanel } from "./webhook-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { webhookTranslations } from "@/lib/webhook-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_HOOK_BODY,
  MAX_HOOK_PROJECT,
  emptyHookProject,
  serializeHookProject,
} from "@/lib/webhook-project";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = webhookTranslations.en;
type Key = keyof typeof en;
const field = (key: Key) => screen.getByLabelText(en[key]);
const button = (key: Key) => screen.getByRole("button", { name: en[key] });
const click = (key: Key) => fireEvent.click(button(key));
async function job(key: Key) {
  click(key);
  await waitFor(() =>
    expect(screen.queryByText(en["hook.busy"])).not.toBeInTheDocument(),
  );
}
const change = (key: Key, value: string) =>
  fireEvent.change(field(key), { target: { value } });
const value = (key: Key) => (field(key) as HTMLInputElement).value;
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
async function setup(demo = false) {
  const view = render(<WebhookStudioPanel />);
  fireEvent.click(screen.getByText(en["hook.title"], { selector: "summary" }));
  await screen.findByLabelText(en["hook.body"]);
  if (demo) await job("hook.demo");
  return view;
}
function fileImport(
  key: Key,
  source: string,
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "hook.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(key), { target: { files: [file] } });
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("webhook signature and replay studio", () => {
  it("runs twelve demos without network/storage writes and exports reports without delivery data or secrets", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job("hook.run");
    expect(screen.getByRole("status")).toHaveTextContent("12/12");
    const results = screen.getByRole("region", { name: en["hook.results"] });
    expect(
      within(results).getByText(
        /Duplicate signed message ID: Duplicate suppressed/,
      ),
    ).toBeInTheDocument();
    change("hook.result", "rotation");
    expect(JSON.parse(value("hook.details")).keyId).toBe("standard-key");
    click("hook.report");
    expect(JSON.parse(exported()).rows).toHaveLength(12);
    for (const literal of [
      "whsec_",
      "msg_one",
      "1700000000",
      "evt_private",
      "demo-only",
      "sha256=",
    ])
      expect(exported()).not.toContain(literal);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("signs and inspects edited drafts without reserializing the payload, then replays only saved work", async () => {
    await setup();
    click("hook.generateSecret");
    const body = '{\r\n  "event": "hello"\r\n}\r\n';
    // Textareas normalize pasted line endings. Exact file bytes are tested separately below.
    change("hook.body", body);
    const entered = value("hook.body");
    expect(button("hook.run")).toBeDisabled();
    await job("hook.sign");
    expect(JSON.parse(value("hook.headers"))["webhook-signature"]).toMatch(
      /^v1,/,
    );
    expect(value("hook.body")).toBe(entered);
    await job("hook.inspect");
    const inspection = screen.getByRole("region", {
      name: en["hook.inspection"],
    });
    expect(
      within(inspection).getByText(
        /Signature: valid; freshness: fresh; policy: Accepted/,
      ),
    ).toBeInTheDocument();
    change("hook.body", entered + " ");
    expect(screen.getByText(en["hook.inspectionStale"])).toBeInTheDocument();
    await job("hook.inspect");
    expect(
      screen.getByText(en["hook.finding.signature-mismatch"]),
    ).toBeInTheDocument();
    change("hook.expected", "rejected");
    click("hook.save");
    await job("hook.run");
    expect(screen.getByRole("status")).toHaveTextContent("1/1");
  });
  it("imports exact binary/BOM/CRLF payload bytes as Base64 without text conversion", async () => {
    await setup();
    const bytes = Uint8Array.of(0xef, 0xbb, 0xbf, 0, 255, 13, 10),
      file = new File([bytes], "wire.bin");
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => bytes.buffer,
    });
    await act(async () => {
      fireEvent.change(field("hook.importPayload"), {
        target: { files: [file] },
      });
    });
    expect(field("hook.encoding")).toHaveValue("base64");
    expect(value("hook.body")).toBe(Buffer.from(bytes).toString("base64"));
    click("hook.generateSecret");
    await job("hook.sign");
    click("hook.save");
    await job("hook.inspect");
    expect(screen.getByText(/7 raw bytes/)).toBeInTheDocument();
    click("hook.exportFixture");
    expect(JSON.parse(exported()).delivery.body).toBe(
      Buffer.from(bytes).toString("base64"),
    );
  });
  it("detects duplicates, supports replay-off comparisons and retains signatures when cloning deliveries", async () => {
    await setup();
    click("hook.generateSecret");
    await job("hook.sign");
    click("hook.save");
    click("hook.cloneDelivery");
    expect(field("hook.expected")).toHaveValue("duplicate");
    await job("hook.run");
    expect(screen.getByRole("status")).toHaveTextContent("2/2");
    change("hook.replay", "off");
    click("hook.save");
    await job("hook.run");
    expect(screen.getByRole("status")).toHaveTextContent("1/2");
    change("hook.expected", "accepted");
    click("hook.save");
    await job("hook.run");
    expect(screen.getByRole("status")).toHaveTextContent("2/2");
  });
  it("preserves invalid numeric drafts, blocks destructive switches and restores saved edits on discard", async () => {
    await setup(true);
    const name = value("hook.name");
    change("hook.capacity", "");
    for (const key of [
      "hook.run",
      "hook.export",
      "hook.demo",
      "hook.exportVerifier",
    ] as const)
      expect(button(key)).toBeDisabled();
    expect(field("hook.delivery")).toBeDisabled();
    expect(field("hook.key")).toBeDisabled();
    click("hook.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["hook.error.project"],
    );
    expect(field("hook.capacity")).toHaveValue("");
    click("hook.discard");
    expect(value("hook.name")).toBe(name);
    expect(field("hook.capacity")).toHaveValue("100");
  });
  it("keeps session secrets separate from project/fixture/verifier exports and clears them on project imports", async () => {
    await setup();
    click("hook.generateSecret");
    const secret = value("hook.secret");
    expect(field("hook.secret")).toHaveAttribute("type", "password");
    fireEvent.click(field("hook.showSecret"));
    expect(field("hook.secret")).toHaveAttribute("type", "text");
    await job("hook.sign");
    click("hook.save");
    for (const key of [
      "hook.export",
      "hook.exportFixture",
      "hook.exportVerifier",
    ] as const) {
      click(key);
      expect(exported()).not.toContain(secret);
    }
    click("hook.export");
    const source = exported();
    await act(async () => fileImport("hook.import", source));
    expect(field("hook.secret")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent(en["hook.loaded"]);
    await job("hook.inspect");
    expect(
      screen.getByText(en["hook.finding.missing-key"]),
    ).toBeInTheDocument();
  });
  it("marks inspections stale and clears prior replay results when session secrets change or are forgotten", async () => {
    await setup(true);
    await job("hook.inspect");
    await job("hook.run");
    change("hook.secret", "wrong");
    expect(
      screen.queryByRole("region", { name: en["hook.results"] }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(en["hook.inspectionStale"])).toBeInTheDocument();
    click("hook.forgetAll");
    expect(field("hook.secret")).toHaveValue("");
    expect(
      screen.queryByRole("region", { name: en["hook.inspection"] }),
    ).not.toBeInTheDocument();
  });
  it("adds and deletes unused key slots and profiles while protecting referenced entries", async () => {
    await setup();
    expect(button("hook.deleteKey")).toBeDisabled();
    expect(button("hook.deleteProfile")).toBeDisabled();
    click("hook.addKey");
    const key = value("hook.key");
    expect(key).toBe("standard-key-1");
    expect(button("hook.deleteKey")).toBeEnabled();
    fireEvent.click(
      screen.getByLabelText(en["hook.allowKey"].replace("{id}", key)),
    );
    click("hook.save");
    expect(button("hook.deleteKey")).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText(en["hook.allowKey"].replace("{id}", key)),
    );
    click("hook.save");
    click("hook.deleteKey");
    click("hook.addProfile");
    expect(button("hook.deleteProfile")).toBeEnabled();
    click("hook.deleteProfile");
    click("hook.deleteDelivery");
    expect(button("hook.run")).toBeDisabled();
    click("hook.addDelivery");
    expect(field("hook.body")).toBeInTheDocument();
  });
  it("imports untrusted projects without secrets/results and rejects invalid imports atomically", async () => {
    await setup(true);
    await job("hook.run");
    const before = value("hook.name");
    await act(async () => fileImport("hook.import", '{"kind":"wrong"}'));
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["hook.error.project"],
    );
    expect(value("hook.name")).toBe(before);
    expect(
      screen.getByRole("region", { name: en["hook.results"] }),
    ).toBeInTheDocument();
    const p = emptyHookProject();
    await act(async () =>
      fileImport(
        "hook.import",
        JSON.stringify({
          ...p,
          secrets: { "standard-key": "injected-secret" },
          run: { passed: 100 },
          keys: p.keys.map((k) => ({ ...k, secret: "injected-secret" })),
        }),
      ),
    );
    expect(field("hook.secret")).toHaveValue("");
    expect(
      screen.queryByRole("region", { name: en["hook.results"] }),
    ).not.toBeInTheDocument();
    click("hook.export");
    expect(exported()).not.toContain("injected-secret");
  });
  it("rejects oversized files before reading and retains the current project", async () => {
    await setup();
    const text = vi.fn(async () => "{}");
    await act(async () =>
      fileImport("hook.import", "{}", text, MAX_HOOK_PROJECT + 1),
    );
    expect(text).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(en["hook.error.limit"]);
    const payload = new File([""], "too-large.bin"),
      arrayBuffer = vi.fn();
    Object.defineProperties(payload, {
      size: { value: MAX_HOOK_BODY + 1 },
      arrayBuffer: { value: arrayBuffer },
    });
    fireEvent.change(field("hook.importPayload"), {
      target: { files: [payload] },
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("imports HAR deliveries into the selected receiver and retains existing deliveries and session secrets", async () => {
    await setup();
    click("hook.generateSecret");
    const secret = value("hook.secret");
    const har = {
      log: {
        entries: [
          {
            request: {
              method: "POST",
              postData: { text: "hello" },
              headers: [],
            },
          },
          { request: { method: "GET" } },
        ],
      },
    };
    await act(async () => fileImport("hook.importHar", JSON.stringify(har)));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Imported 1 POST captures; skipped 1",
    );
    expect(field("hook.body")).toHaveValue("hello");
    expect(value("hook.secret")).toBe(secret);
    click("hook.export");
    expect(JSON.parse(exported()).deliveries).toHaveLength(2);
  });
  it.each(["cancel", "forget", "unmount"])(
    "discards an in-flight crypto result after %s",
    async (mode) => {
      const view = await setup(true),
        native = webcrypto.subtle.verify.bind(webcrypto.subtle);
      let finish!: () => void;
      vi.spyOn(webcrypto.subtle, "verify").mockImplementation(
        async (...args) => {
          const result = await native(...args);
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
          return result;
        },
      );
      click("hook.inspect");
      await waitFor(() => expect(finish).toBeTypeOf("function"));
      expect(field("hook.body")).toBeDisabled();
      if (mode === "unmount") view.unmount();
      else if (mode === "forget") click("hook.forgetAll");
      else click("hook.cancel");
      await act(async () => finish());
      expect(
        screen.queryByRole("region", { name: en["hook.inspection"] }),
      ).not.toBeInTheDocument();
      if (mode === "cancel")
        expect(screen.getByRole("alert")).toHaveTextContent(
          en["hook.error.cancelled"],
        );
      if (mode === "forget") expect(field("hook.secret")).toHaveValue("");
    },
  );
  it("locks mutations during file reads and discards a late read after cancellation", async () => {
    await setup();
    let finish!: (s: string) => void;
    fileImport(
      "hook.import",
      "{}",
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    expect(button("hook.run")).toBeDisabled();
    expect(field("hook.name")).toBeDisabled();
    click("hook.cancel");
    await act(async () =>
      finish(
        serializeHookProject({
          ...emptyHookProject(),
          name: "late unwanted project",
        }),
      ),
    );
    expect(field("hook.name")).toHaveValue(emptyHookProject().name);
  });
  it("reports blocked downloads and runs the same workflow in Russian", async () => {
    await setup();
    vi.mocked(downloadTextFile).mockReturnValue(false);
    click("hook.export");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["hook.downloadFailed"],
    );
    act(() => setAppLanguage("ru"));
    const ru = webhookTranslations.ru;
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: ru["hook.demo"] })),
    );
    await waitFor(() =>
      expect(screen.queryByText(ru["hook.busy"])).not.toBeInTheDocument(),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: ru["hook.run"] })),
    );
    await waitFor(() =>
      expect(screen.queryByText(ru["hook.busy"])).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("12/12");
    expect(screen.getByLabelText(ru["hook.body"])).toBeInTheDocument();
  });
});
