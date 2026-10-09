import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumerContractPanel } from "./consumer-contract-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import {
  MAX_CONSUMER_BYTES,
  parseConsumerProject,
} from "@/lib/consumer-contracts";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const definition = (type = "string") =>
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Catalog", version: type === "string" ? "1" : "2" },
    paths: {
      "/items/{id}": {
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        get: {
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["id", "name"],
                    properties: { id: { type: "integer" }, name: { type } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const report = () =>
  within(screen.getByRole("region", { name: "Consumer impact report" }));
const file = (text: string) => {
  const f = new File([text], "consumers.json", { type: "application/json" });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
};
async function setup() {
  const user = userEvent.setup();
  let editor = definition();
  const view = render(<ConsumerContractPanel getSchemaText={() => editor} />);
  await user.click(screen.getByText("Consumer compatibility workbench"));
  return {
    user,
    ...view,
    edit: (text: string) => {
      editor = text;
    },
    getEditor: () => editor,
  };
}
async function capture(
  user: ReturnType<typeof userEvent.setup>,
  name = "Web app",
  field = "/name",
) {
  await user.click(button("Add consumer"));
  change("Consumer name", name);
  await user.click(button("Capture current editor as reference"));
  await user.click(
    screen.getByRole("checkbox", { name: `Track response field ${field}` }),
  );
  await user.click(button("Add dependency to selected consumer"));
}

describe("ConsumerContractPanel", () => {
  it("reports consumer-specific impact, filters dependencies, and exports without network or editor changes", async () => {
    const { user, getEditor } = await setup();
    const network = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await capture(user);
    await capture(user, "Mobile app", "/id");
    await user.click(button("Check current editor against consumers"));
    expect(report().getByText(/Consumers · compatible: 2/)).toBeInTheDocument();
    change("Candidate OpenAPI definition (JSON/YAML)", definition("integer"));
    await user.click(button("Check pasted candidate"));
    expect(
      report().getByText(/compatible: 1 · affected: 1/),
    ).toBeInTheDocument();
    expect(
      report().getByText(/provider may return a type/),
    ).toBeInTheDocument();
    change("Filter dependency outcome", "breaking");
    expect(
      report().getByRole("heading", { name: /Web app · GET/ }),
    ).toBeInTheDocument();
    expect(
      report().queryByRole("heading", { name: /Mobile app · GET/ }),
    ).not.toBeInTheDocument();
    change("Filter dependency outcome", "all");
    change("Search consumer dependencies", "Mobile items");
    expect(
      report().getByRole("heading", { name: /Mobile app · GET/ }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search consumer dependencies"), {
      key: "Escape",
    });
    expect(
      report().getByRole("heading", { name: /Web app · GET/ }),
    ).toBeInTheDocument();
    await user.click(button("Download consumer impact JSON"));
    expect(
      JSON.parse(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).counts
        .breaking,
    ).toBe(1);
    await user.click(button("Download release review checklist"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).toContain(
      "Web app",
    );
    expect(getEditor()).toBe(definition());
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("saves editable requirements/request examples and protects pending drafts across consumers", async () => {
    const { user } = await setup();
    await capture(user);
    change(
      "Request example (JSON; blank to skip request checks)",
      '{"parameters":[{"name":"id","location":"path","value":"bad"}]}',
    );
    expect(button("Check current editor against consumers")).toBeDisabled();
    expect(button("Download consumer project")).toBeDisabled();
    await user.click(button("Validate and save dependency JSON"));
    await user.click(button("Check current editor against consumers"));
    expect(report().getByText(/request example violates/)).toBeInTheDocument();
    change("Response field expectations (JSON array)", "[");
    await user.click(button("Add consumer"));
    change("Consumer to configure", "consumer-1");
    expect(
      screen.getByLabelText("Response field expectations (JSON array)"),
    ).toHaveValue("[");
    await user.click(button("Validate and save dependency JSON"));
    expect(screen.getByRole("alert")).toHaveTextContent("valid JSON");
    await user.click(button("Discard dependency JSON edits"));
    expect(button("Check current editor against consumers")).toBeEnabled();
    change(
      "Request example (JSON; blank to skip request checks)",
      '{"parameters":[{"name":"id","location":"path","value":1}]}',
    );
    await user.click(button("Validate and save dependency JSON"));
    await user.click(button("Check current editor against consumers"));
    expect(
      report().getByText(/compatible: 1 · affected: 0/),
    ).toBeInTheDocument();
    await user.click(button("Download consumer project"));
    expect(
      parseConsumerProject(vi.mocked(downloadTextFile).mock.calls.at(-1)![0])
        .consumers[0].contracts[0].request?.parameters[0].value,
    ).toBe(1);
  });
  it("tracks security requirements and allows dependencies/consumers to be excluded", async () => {
    const { user, edit } = await setup();
    await capture(user);
    const secured = JSON.parse(definition());
    secured.security = [{ bearer: [] }];
    edit(JSON.stringify(secured));
    await user.click(button("Check current editor against consumers"));
    expect(
      report().getByText(/no longer offers an authentication-free/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Require an authentication-free alternative",
      }),
    );
    await user.click(button("Check current editor against consumers"));
    expect(
      report().getByText(/compatible: 1 · affected: 0/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Include dependency in checks" }),
    );
    await user.click(button("Check current editor against consumers"));
    expect(report().getByText(/untracked: 1/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Include dependency in checks" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Include consumer in checks" }),
    );
    await user.click(button("Check current editor against consumers"));
    expect(report().getByText(/untracked: 1/)).toBeInTheDocument();
  });
  it("restores projects atomically and preserves existing profiles/report on invalid imports", async () => {
    const { user } = await setup();
    await capture(user);
    await user.click(button("Download consumer project"));
    const text = vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
    await user.click(button("Check current editor against consumers"));
    const importLabel = "Restore consumer project (replaces current profiles)";
    await user.upload(screen.getByLabelText(importLabel), file("{}"));
    expect(await screen.findByRole("alert")).toHaveTextContent("version 1");
    expect(report().getByText(/compatible: 1/)).toBeInTheDocument();
    expect(screen.getByLabelText("Consumer name")).toHaveValue("Web app");
    await user.click(button("Remove consumer and dependencies"));
    expect(button("Check current editor against consumers")).toBeDisabled();
    await user.upload(screen.getByLabelText(importLabel), file(text));
    expect(
      await screen.findByText("Consumer project restored."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Consumer name")).toHaveValue("Web app");
    await user.click(button("Check current editor against consumers"));
    expect(report().getByText(/compatible: 1/)).toBeInTheDocument();
  });
  it("imports candidate files, blocks mutations during reading, and preserves report on failures", async () => {
    const { user } = await setup();
    await capture(user);
    let resolve!: (text: string) => void;
    const pending = file("{}");
    Object.defineProperty(pending, "text", {
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(
      screen.getByLabelText("Import and check candidate definition"),
      pending,
    );
    expect(button("Add consumer")).toBeDisabled();
    expect(button("Check current editor against consumers")).toBeDisabled();
    await act(async () => resolve(definition("integer")));
    await waitFor(() =>
      expect(report().getByText(/affected: 1/)).toBeInTheDocument(),
    );
    await user.upload(
      screen.getByLabelText("Import and check candidate definition"),
      file("openapi: ["),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("valid OpenAPI");
    expect(report().getByText(/affected: 1/)).toBeInTheDocument();
    const large = file("{}");
    Object.defineProperty(large, "size", { value: MAX_CONSUMER_BYTES + 1 });
    await user.upload(
      screen.getByLabelText("Import and check candidate definition"),
      large,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("exceeds");
    expect(report().getByText(/affected: 1/)).toBeInTheDocument();
  });
  it("clears removed drafts before reusing keys and reports blocked downloads", async () => {
    const { user } = await setup();
    await capture(user);
    change("Response field expectations (JSON array)", "bad draft");
    await user.click(button("Remove dependency"));
    await user.click(button("Add dependency to selected consumer"));
    expect(
      screen.getByLabelText("Response field expectations (JSON array)"),
    ).not.toHaveValue("bad draft");
    change(
      "Request example (JSON; blank to skip request checks)",
      "bad request",
    );
    await user.click(button("Remove consumer and dependencies"));
    await user.click(button("Add consumer"));
    await user.click(button("Add dependency to selected consumer"));
    expect(
      screen.getByLabelText(
        "Request example (JSON; blank to skip request checks)",
      ),
    ).toHaveValue("");
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download consumer project"));
    expect(screen.getByRole("alert")).toHaveTextContent("could not start");
  });
  it("retains profiles, drafts, and reports when collapsed and localizes in Russian", async () => {
    const { user } = await setup();
    await capture(user);
    await user.click(button("Check current editor against consumers"));
    await user.click(screen.getByText("Consumer compatibility workbench"));
    expect(screen.queryByLabelText("Consumer name")).not.toBeInTheDocument();
    await user.click(screen.getByText("Consumer compatibility workbench"));
    expect(report().getByText(/compatible: 1/)).toBeInTheDocument();
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Проверка совместимости потребителей API"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Отчёт о влиянии на потребителей" }),
    ).toBeInTheDocument();
    await user.click(button("Проверить редактор для потребителей"));
    expect(
      screen.getByText("Определение проверено по проекту потребителей."),
    ).toBeInTheDocument();
  });
});
