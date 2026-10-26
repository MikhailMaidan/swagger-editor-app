import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoapStudioPanel } from "./soap-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import { demoSoapProject, soapFaultExample } from "@/lib/soap-studio";
import { DEMO_SOAP_WSDL } from "@/lib/soap-wsdl";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  fetcher.mockReset().mockRejectedValue(new Error("Unexpected network"));
  vi.stubGlobal("fetch", fetcher);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
async function setup(demo = true) {
  const user = userEvent.setup(),
    view = render(<SoapStudioPanel />);
  await user.click(
    screen.getByText("SOAP contract studio", { selector: "summary" }),
  );
  if (demo) await user.click(button("Load SOAP customer demo"));
  return { user, ...view };
}
function file(source: string) {
  const f = new File([source], "soap.json", { type: "application/json" });
  Object.defineProperty(f, "text", { value: async () => source });
  return f;
}
const importProject = (source: string) =>
  fireEvent.change(screen.getByLabelText("Import SOAP project"), {
    target: { files: [file(source)] },
  });

describe("SoapStudioPanel", () => {
  it("opens independently, replays all demo cases without traffic, and keeps data out of browser storage", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem"),
      { user } = await setup();
    await user.click(button("Run all SOAP response cases"));
    await screen.findByText("Checked 5/5 cases: 5 passed, 0 failed.");
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText(
        "Namespace-aware SOAP payload tree (first 16000 characters)",
      ),
    ).toHaveValue(
      JSON.stringify(
        JSON.parse(
          (
            screen.getByLabelText(
              "Namespace-aware SOAP payload tree (first 16000 characters)",
            ) as HTMLTextAreaElement
          ).value,
        ),
        null,
        2,
      ),
    );
    await user.click(button("Download SOAP regression report"));
    expect(JSON.parse(exported())).toMatchObject({ complete: true, passed: 5 });
    expect(exported()).not.toContain("Customer not found");
    expect(exported()).not.toContain("soap.example");
  });
  it("creates a project from pasted WSDL, inspects binding inventory, and checks a generated request", async () => {
    const { user } = await setup(false);
    change("WSDL 1.1 contract draft", DEMO_SOAP_WSDL);
    await user.click(
      button("Create SOAP project from WSDL (replaces studio work)"),
    );
    expect(screen.getByLabelText("SOAP project name")).toHaveValue(
      "CustomerService",
    );
    await user.click(button("SOAP operation inventory"));
    expect(JSON.parse(exported()).operations).toHaveLength(2);
    await user.click(button("Add SOAP response case"));
    expect(
      (
        screen.getByLabelText(
          "SOAP response fixture XML",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("GetCustomerResponse");
    const p = demoSoapProject();
    change("SOAP operation", p.request!.operationId); // Same operation retains a valid request template.
    await user.click(button("Save SOAP request draft"));
    await user.click(button("Check SOAP request envelope"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "SOAP version and request payload element match",
    );
  });
  it("changes SOAP versions as pending request edits and exports correct cURL without session secrets", async () => {
    const { user } = await setup();
    change(
      "SOAP session-only HTTP headers (JSON object)",
      '{"Authorization":"Bearer secret"}',
    );
    const second = demoSoapProject().cases[2].operationId;
    change("SOAP operation", second);
    expect(button("Send live SOAP request")).toBeDisabled();
    expect(
      (
        screen.getByLabelText(
          "SOAP request envelope XML",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("http://www.w3.org/2003/05/soap-envelope");
    await user.click(button("Save SOAP request draft"));
    await user.click(button("Download SOAP cURL command"));
    expect(exported()).toContain("application/soap+xml");
    expect(exported()).not.toContain("Bearer secret");
    expect(exported()).not.toContain("--header 'soapaction:");
    await user.click(button("Export SOAP project"));
    expect(exported()).not.toContain("Bearer secret");
  });
  it("guards invalid drafts and restores saved work without losing XML edits on a failed save", async () => {
    const { user } = await setup();
    change("SOAP request timeout, ms (100–30000)", "");
    expect(button("Export SOAP project")).toBeDisabled();
    await user.click(button("Save SOAP request draft"));
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid SOAP project");
    expect(
      screen.getByLabelText("SOAP request timeout, ms (100–30000)"),
    ).toHaveValue("");
    await user.click(button("Discard pending SOAP edits"));
    expect(
      screen.getByLabelText("SOAP request timeout, ms (100–30000)"),
    ).toHaveValue("10000");
  });
  it("edits namespace-aware assertions, records meaningful failures, and inspects faults", async () => {
    const { user } = await setup();
    change(
      "SOAP response checks (JSON array)",
      '[{"name":"ID","path":"/c:GetCustomerResponse/c:customer/c:id","operator":"equals","expected":"7","trim":true}]',
    );
    expect(button("Run all SOAP response cases")).toBeDisabled();
    await user.click(button("Save SOAP response case"));
    await user.click(button("Check selected SOAP response case"));
    await screen.findByText("Checked 1/1 cases: 0 passed, 1 failed.");
    change("Selected SOAP response case", "fault-1");
    expect(
      (
        screen.getByLabelText(
          "SOAP fault details (first 16000 characters)",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("Клиент не найден");
    change("SOAP case name", "Renamed fault");
    await user.click(button("Save SOAP response case"));
    await user.click(button("Delete SOAP response case"));
    expect(
      screen.queryByRole("option", { name: "Renamed fault" }),
    ).not.toBeInTheDocument();
  });
  it("saves an intentionally malformed XML negative case and rejects invalid rule paths", async () => {
    const { user } = await setup();
    change("Selected SOAP response case", "malformed");
    change("SOAP response fixture XML", "<!DOCTYPE r><r/>");
    await user.click(button("Save SOAP response case"));
    await user.click(button("Check selected SOAP response case"));
    await screen.findByText("Checked 1/1 cases: 1 passed, 0 failed.");
    change("Selected SOAP response case", "success-0");
    change(
      "SOAP response checks (JSON array)",
      '[{"name":"bad","path":"//c:id","operator":"exists","expected":"","trim":true}]',
    );
    await user.click(button("Save SOAP response case"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "simple absolute XML paths",
    );
    expect(
      (
        screen.getByLabelText(
          "SOAP response checks (JSON array)",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("//c:id");
  });
  it("imports projects atomically and drops imported credentials and reports", async () => {
    const { user } = await setup();
    importProject("{broken");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("SOAP project name")).toHaveValue(
      "Customer SOAP regression",
    );
    const p = {
      ...demoSoapProject(),
      name: "Imported SOAP",
      headers: { Authorization: "secret" },
      report: ["secret"],
    };
    importProject(JSON.stringify(p));
    await screen.findByText("SOAP project imported.");
    expect(screen.getByLabelText("SOAP project name")).toHaveValue(
      "Imported SOAP",
    );
    await user.click(button("Export SOAP project"));
    expect(exported()).not.toContain("secret");
  });
  it("rejects invalid request XML before live traffic", async () => {
    const { user } = await setup();
    change("SOAP request envelope XML", "<broken>");
    await user.click(button("Save SOAP request draft"));
    await user.click(button("Send live SOAP request"));
    await screen.findByRole("alert");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends an explicit POST, inspects HTTP 500 faults, and captures them for offline checking", async () => {
    const { user } = await setup(),
      fault = soapFaultExample("1.1");
    fetcher.mockResolvedValueOnce(
      new Response(fault, {
        status: 500,
        headers: { "Content-Type": "text/xml" },
      }),
    );
    change(
      "SOAP session-only HTTP headers (JSON object)",
      '{"Authorization":"Bearer session-secret"}',
    );
    await user.click(button("Send live SOAP request"));
    await screen.findByText(/Live response: HTTP 500/);
    expect(
      screen.getByLabelText("SOAP fault details (first 16000 characters)"),
    ).toBeInTheDocument();
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).get("SOAPAction"),
    ).toBe('"urn:rsswag:GetCustomer"');
    await user.click(button("Save live SOAP response as case"));
    await screen.findByText("Live response saved as a regression case.");
    expect(screen.getByLabelText("Expected SOAP response outcome")).toHaveValue(
      "fault",
    );
    await user.click(button("Check selected SOAP response case"));
    await screen.findByText("Checked 1/1 cases: 1 passed, 0 failed.");
    expect(fetcher).toHaveBeenCalledOnce();
    await user.click(button("Export SOAP project"));
    const p = JSON.parse(exported());
    expect(p.cases).toHaveLength(6);
    expect(exported()).not.toContain("session-secret");
  });
  it("cancels active requests and ignores late responses after unmount", async () => {
    const { user, unmount } = await setup(),
      cancel = vi.fn();
    let resolve!: (response: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await user.click(button("Send live SOAP request"));
    expect(button("Load SOAP customer demo")).toBeDisabled();
    await user.click(button("Cancel SOAP task"));
    await screen.findByText("SOAP task cancelled.");
    await act(async () =>
      resolve(new Response(new ReadableStream({ cancel }))),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    fetcher.mockImplementationOnce(() => new Promise(() => {}));
    await user.click(button("Send live SOAP request"));
    const signal = fetcher.mock.calls[1][1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
  });
  it("keeps partial suite reports when cancelled and retains work through collapse", async () => {
    const { user } = await setup();
    fireEvent.click(button("Run all SOAP response cases"));
    fireEvent.click(button("Cancel SOAP task"));
    await waitFor(() =>
      expect(button("Download SOAP regression report")).toBeEnabled(),
    );
    await user.click(button("Download SOAP regression report"));
    expect(JSON.parse(exported())).toMatchObject({ total: 5, complete: false });
    await user.click(
      screen.getByText("SOAP contract studio", { selector: "summary" }),
    );
    await user.click(
      screen.getByText("SOAP contract studio", { selector: "summary" }),
    );
    expect(screen.getByLabelText("SOAP project name")).toHaveValue(
      "Customer SOAP regression",
    );
  });
  it("reports blocked downloads and clipboard failures without losing inspected messages", async () => {
    const { user } = await setup();
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(button("Download inspected SOAP XML"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not start the SOAP download",
    );
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(button("Copy inspected SOAP XML"));
    await screen.findByText("Could not copy the SOAP XML.");
    expect(
      screen.getByLabelText("Inspected response XML (first 16000 characters)"),
    ).toBeInTheDocument();
  });
  it("localizes controls, faults and regression feedback in Russian", async () => {
    const { user } = await setup(false);
    act(() => setAppLanguage("ru"));
    await user.click(button("Загрузить пример SOAP-клиентов"));
    await user.click(button("Запустить все кейсы ответов SOAP"));
    await screen.findByText(
      "Проверено кейсов: 5/5; успешно: 5, с ошибками: 0.",
    );
    expect(
      screen.getByText("Студия контрактов SOAP", { selector: "summary" }),
    ).toBeInTheDocument();
  });
});
