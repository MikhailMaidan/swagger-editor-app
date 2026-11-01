import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NegotiationPanel } from "./negotiation-panel";
import { setAppLanguage } from "./i18n-provider";
import { negotiationTranslations } from "@/lib/negotiation-translations";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_NEGOTIATION_BYTES,
  emptyNegotiationProject,
} from "@/lib/negotiation-project";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
const en = negotiationTranslations.en;
type Key = keyof typeof en;
const field = (k: Key) => screen.getByLabelText(en[k]),
  button = (k: Key) => screen.getByRole("button", { name: en[k] }),
  click = (k: Key) => fireEvent.click(button(k)),
  change = (k: Key, value: string) =>
    fireEvent.change(field(k), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
const exportedProject = () => {
  click("neg.export");
  return JSON.parse(exported()) as ReturnType<typeof emptyNegotiationProject>;
};
async function setup(demo = false) {
  const view = render(
    <NegotiationPanel getSchemaText={() => DEFAULT_OPENAPI_SCHEMA} />,
  );
  fireEvent.click(screen.getByText(en["neg.title"], { selector: "summary" }));
  await screen.findByLabelText(en["neg.name"]);
  if (demo) click("neg.demo");
  return view;
}
async function job(k: Key = "neg.runAll") {
  click(k);
  await waitFor(
    () =>
      expect(
        screen.queryByRole("button", { name: en["neg.cancel"] }),
      ).not.toBeInTheDocument(),
    { timeout: 7000 },
  );
}
function upload(
  source: string,
  har = false,
  text?: () => Promise<string>,
  size?: number,
) {
  const file = new File([source], "negotiation.json", {
    type: "application/json",
  });
  Object.defineProperty(file, "text", { value: text ?? (async () => source) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(field(har ? "neg.har" : "neg.import"), {
    target: { files: [file] },
  });
}
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("content negotiation studio", () => {
  it("runs 36 offline expectations, explains qualities, searches and exports value-free reports", async () => {
    const fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    await setup(true);
    await job();
    expect(screen.getByRole("status")).toHaveTextContent("36/36");
    expect(
      within(
        screen.getByRole("table", { name: en["neg.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(37);
    change("neg.search", "Russian JSON");
    expect(
      within(
        screen.getByRole("table", { name: en["neg.results"] }),
      ).getAllByRole("row"),
    ).toHaveLength(4);
    fireEvent.keyDown(field("neg.search"), { key: "Escape" });
    expect(field("neg.search")).toHaveValue("");
    change("neg.result", "baseline/case-3");
    expect(screen.getByLabelText(en["neg.explain"])).toHaveTextContent(
      '"variantId": "json-gzip"',
    );
    expect(
      screen.getByRole("table", { name: en["neg.candidates"] }),
    ).toHaveTextContent(en["neg.excludedEncoding"]);
    click("neg.report");
    expect(JSON.parse(exported()).runs[0].candidates).toBeUndefined();
    fireEvent.click(field("neg.details"));
    click("neg.report");
    const report = JSON.parse(exported());
    expect(report.runs[0].candidates[0]).toHaveProperty("mediaQ");
    expect(exported()).not.toMatch(
      /application\/json|Content-Language|"range"/,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("retains invalid drafts and prevents destructive selection or export before save/discard", async () => {
    await setup(true);
    change("neg.weight", "0");
    change("neg.policy", "media-first");
    expect(field("neg.policy")).toHaveValue("baseline");
    expect(screen.getByRole("alert")).toHaveTextContent(en["neg.pending"]);
    click("neg.export");
    expect(downloadTextFile).not.toHaveBeenCalled();
    click("neg.save");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["neg.error.project"],
    );
    expect(field("neg.weight")).toHaveValue("0");
    click("neg.discard");
    expect(field("neg.weight")).toHaveValue("1000");
    change("neg.expect", "{");
    click("neg.save");
    expect(screen.getByRole("alert")).toHaveTextContent(en["neg.error.json"]);
    click("neg.discard");
    expect(exportedProject().policies).toHaveLength(3);
  });
  it("separates omitted and empty headers and records inspected outcomes as expectations", async () => {
    await setup();
    expect(field("neg.accept")).toBeDisabled();
    fireEvent.click(field("neg.acceptMissing"));
    expect(field("neg.accept")).toHaveValue("");
    click("neg.save");
    await job();
    expect(screen.getByLabelText(en["neg.explain"])).toHaveTextContent(
      '"status": 406',
    );
    click("neg.record");
    await job();
    expect(screen.getByRole("status")).toHaveTextContent("1/1");
    fireEvent.click(field("neg.acceptMissing"));
    click("neg.save");
    await job();
    expect(screen.getByRole("status")).toHaveTextContent("0/1");
    expect(screen.getByLabelText(en["neg.explain"])).toHaveTextContent(
      '"status": 200',
    );
  });
  it("edits models and variants without dropping unrelated expectations and preserves clone IDs", async () => {
    await setup(true);
    click("neg.clonePolicy");
    let p = exportedProject();
    expect(p.policies).toHaveLength(4);
    const clone = p.policies.at(-1)!;
    expect(clone.variants[0].id).toBe("json-en");
    expect(p.cases[0].expect[clone.id]).toEqual(p.cases[0].expect.baseline);
    click("neg.deleteVariant");
    p = exportedProject();
    expect(p.cases[0].expect[clone.id]).toBeUndefined();
    expect(p.cases[0].expect.baseline).toBeDefined();
    click("neg.addVariant");
    expect(field("neg.enabled")).not.toBeChecked();
    click("neg.cloneVariant");
    expect(field("neg.enabled")).not.toBeChecked();
    click("neg.deletePolicy");
    p = exportedProject();
    expect(p.policies).toHaveLength(3);
    expect(p.cases.every((c) => !(clone.id in c.expect))).toBe(true);
    click("neg.addPolicy");
    expect(exportedProject().policies).toHaveLength(4);
  });
  it("reorders tied variants and reads the OpenAPI media catalog without applying it", async () => {
    await setup();
    click("neg.cloneVariant");
    fireEvent.click(field("neg.enabled"));
    click("neg.save");
    click("neg.moveUp");
    await job();
    expect(screen.getByLabelText(en["neg.explain"])).toHaveTextContent(
      '"variantId": "variant-2"',
    );
    expect(button("neg.moveUp")).toBeDisabled();
    click("neg.catalog");
    expect(screen.getByRole("status")).toHaveTextContent("1 concrete");
    expect(field("neg.media")).toHaveValue("application/json");
    expect(
      document.getElementById("negotiation-media-catalog"),
    ).toHaveTextContent("");
    expect(
      document.querySelector(
        '#negotiation-media-catalog option[value="application/json"]',
      ),
    ).toBeInTheDocument();
  });
  it("keeps zero cases usable and appends Cartesian combinations atomically", async () => {
    await setup();
    click("neg.cloneCase");
    click("neg.deleteCase");
    click("neg.deleteCase");
    expect(screen.getByText(en["neg.noCases"])).toBeInTheDocument();
    expect(button("neg.runAll")).toBeDisabled();
    click("neg.generate");
    expect(screen.getByRole("status")).toHaveTextContent("36");
    expect(exportedProject().cases).toHaveLength(36);
    change(
      "neg.dimensions",
      JSON.stringify({
        accept: Array.from({ length: 12 }, (_, i) => `a/${i}`),
        language: Array.from({ length: 12 }, (_, i) => `l${i}`),
        encoding: [null, "", "gzip"],
      }),
    );
    click("neg.generate");
    expect(screen.getByRole("alert")).toHaveTextContent(en["neg.error.limit"]);
    expect(exportedProject().cases).toHaveLength(36);
    click("neg.addCase");
    expect(exportedProject().cases).toHaveLength(37);
  });
  it("compares selected policies and reports metadata or Vary changes", async () => {
    await setup(true);
    change("neg.candidate", "media-first");
    await job("neg.compare");
    expect(screen.getByText(/1\/12 saved cases/)).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: en["neg.comparison"] }),
    ).toHaveTextContent("Ranking tradeoff");
    change("neg.candidate", "language-agnostic");
    await job("neg.compare");
    expect(screen.getByText(/12\/12 saved cases/)).toBeInTheDocument();
    expect(screen.getAllByText(en["neg.varyChanged"])).toHaveLength(12);
    click("neg.report");
    expect(JSON.parse(exported()).comparison.changed).toBe(12);
  });
  it("imports HAR preferences as new cases while discarding unrelated captured values", async () => {
    await setup();
    upload(
      JSON.stringify({
        log: {
          entries: [
            {
              request: {
                url: "https://secret.test",
                headers: [
                  { name: "Accept", value: "application/json" },
                  { name: "Authorization", value: "secret" },
                  { name: "Accept-Encoding", value: "" },
                ],
              },
            },
            {},
          ],
        },
      }),
      true,
    );
    await screen.findByText(/Imported 1 cases; skipped 1/);
    expect(field("neg.accept")).toHaveValue("application/json");
    expect(field("neg.acceptEncoding")).toHaveValue("");
    expect(field("neg.encodingMissing")).not.toBeChecked();
    const p = exportedProject();
    expect(p.cases).toHaveLength(2);
    expect(JSON.stringify(p)).not.toContain("secret");
  });
  it("imports projects atomically, drops injected outputs and checks size before reading", async () => {
    await setup(true);
    await job();
    upload("{");
    await screen.findByRole("alert");
    expect(field("neg.name")).toHaveValue(
      "Multilingual representation release",
    );
    expect(
      screen.getByRole("table", { name: en["neg.results"] }),
    ).toBeInTheDocument();
    const reader = vi.fn(async () => "{}");
    upload("{}", false, reader, MAX_NEGOTIATION_BYTES + 1);
    await screen.findByText(en["neg.error.limit"]);
    expect(reader).not.toHaveBeenCalled();
    const p = emptyNegotiationProject();
    p.cases = [];
    upload(JSON.stringify({ ...p, results: ["injected"] }));
    await screen.findByText(en["neg.noCases"]);
    expect(
      screen.queryByRole("table", { name: en["neg.results"] }),
    ).not.toBeInTheDocument();
    expect(exportedProject()).toEqual(p);
  });
  it("cancels runs and delayed imports without publishing partial results or late unmount state", async () => {
    const view = await setup(true);
    await job();
    click("neg.runAll");
    click("neg.cancel");
    expect(screen.getByRole("status")).toHaveTextContent(en["neg.cancelled"]);
    expect(
      screen.getByRole("table", { name: en["neg.results"] }),
    ).toBeInTheDocument();
    let resolve!: (v: string) => void;
    upload(
      "{}",
      false,
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    click("neg.cancel");
    await act(async () => resolve(JSON.stringify(emptyNegotiationProject())));
    expect(field("neg.name")).toHaveValue(
      "Multilingual representation release",
    );
    upload(
      "{}",
      false,
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    view.unmount();
    await act(async () => resolve(JSON.stringify(emptyNegotiationProject())));
  });
  it("downloads the selected policy selector and recovers from blocked downloads", async () => {
    await setup(true);
    change("neg.policy", "media-first");
    click("neg.selector");
    expect(exported()).toContain('"id":"media-first"');
    expect(exported()).not.toContain("case-1");
    expect(exported()).toContain("selectRequest");
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    click("neg.selector");
    expect(screen.getByRole("alert")).toHaveTextContent(
      en["neg.error.download"],
    );
    click("neg.selector");
    expect(screen.getByRole("status")).toHaveTextContent(en["neg.downloaded"]);
  });
  it("renders complete Russian controls and feedback", async () => {
    act(() => setAppLanguage("ru"));
    const ru = negotiationTranslations.ru;
    render(<NegotiationPanel />);
    fireEvent.click(screen.getByText(ru["neg.title"], { selector: "summary" }));
    await screen.findByLabelText(ru["neg.name"]);
    fireEvent.click(screen.getByRole("button", { name: ru["neg.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: ru["neg.runAll"] }));
    await waitFor(
      () => expect(screen.getByRole("status")).toHaveTextContent("36/36"),
      { timeout: 7000 },
    );
    expect(
      screen.getByRole("table", { name: ru["neg.candidates"] }),
    ).toBeInTheDocument();
  });
});
