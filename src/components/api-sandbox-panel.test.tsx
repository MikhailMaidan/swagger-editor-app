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
import { ApiSandboxPanel } from "./api-sandbox-panel";
import { setAppLanguage } from "./i18n-provider";
import {
  createSandboxDemo,
  MAX_SANDBOX_BYTES,
  parseSandboxProject,
  serializeSandboxProject,
} from "@/lib/api-sandbox";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { downloadTextFile } from "@/lib/schema-download";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => vi.mocked(downloadTextFile).mockReset().mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const records = () =>
  JSON.parse(
    screen.getByLabelText("Current records preview (first 16,000 characters)")
      .textContent!,
  );
const response = () =>
  JSON.parse(
    within(screen.getByRole("region", { name: "Sandbox response" })).getByText(
      /"status":/,
    ).textContent!,
  );
const file = (text: string) => {
  const f = new File([text], "sandbox.json", { type: "application/json" });
  Object.defineProperty(f, "text", {
    configurable: true,
    value: async () => text,
  });
  return f;
};
async function setup() {
  const user = userEvent.setup();
  let editor = DEFAULT_OPENAPI_SCHEMA;
  const view = render(<ApiSandboxPanel getSchemaText={() => editor} />);
  await user.click(screen.getByText("Stateful API sandbox"));
  return {
    user,
    ...view,
    setEditor: (text: string) => {
      editor = text;
    },
  };
}
const start = () => button("Validate and start/restart sandbox");
const send = () => button("Send local request");
const uploadInput = () =>
  screen.getByLabelText(
    "Restore sandbox project (replaces configuration and running state)",
  );

describe("ApiSandboxPanel", () => {
  it("runs a CRUD workflow, undoes failed/read/write requests, and resets without network or storage", async () => {
    const { user } = await setup();
    const fetch = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    await user.click(start());
    change("Sandbox request method", "POST");
    await user.click(send());
    expect(response().status).toBe(201);
    expect(records()).toHaveLength(2);
    change("Sandbox request method", "GET");
    change("Sandbox request path and query", "/tasks/2");
    await user.click(send());
    expect(response().body).toMatchObject({ id: 2, title: "New task" });
    change("Sandbox request method", "PATCH");
    change("Sandbox request JSON body", '{"done":true}');
    await user.click(send());
    expect(records()[1].done).toBe(true);
    change("Sandbox request JSON body", '{"id":1}');
    await user.click(send());
    expect(response().status).toBe(409);
    await user.click(button("Undo last sandbox request"));
    expect(records()[1].done).toBe(true);
    await user.click(button("Undo last sandbox request"));
    expect(records()[1].done).toBe(false);
    await user.click(button("Undo last sandbox request"));
    expect(records()).toHaveLength(2);
    await user.click(button("Undo last sandbox request"));
    expect(records()).toHaveLength(1);
    expect(button("Undo last sandbox request")).toBeDisabled();
    change("Sandbox request method", "POST");
    change("Sandbox request path and query", "/tasks");
    change("Sandbox request JSON body", "{}");
    await user.click(send());
    expect(response().body.id).toBe(2);
    await user.click(button("Reset records to seeds"));
    expect(records()).toHaveLength(1);
    expect(
      screen.queryByRole("region", { name: "Sandbox response" }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("protects the running state from invalid draft edits and restores it on discard", async () => {
    const { user } = await setup();
    await user.click(start());
    change("Sandbox request method", "POST");
    await user.click(send());
    change("Seed records (JSON array)", "[");
    expect(send()).toBeDisabled();
    expect(button("Download sandbox project")).toBeDisabled();
    await user.click(start());
    expect(screen.getByRole("alert")).toHaveTextContent("valid JSON");
    expect(records()).toHaveLength(2);
    await user.click(button("Discard configuration edits"));
    expect(send()).toBeEnabled();
    expect(records()).toHaveLength(2);
    change("Seed records (JSON array)", '[{"id":8,"title":"Reset seed"}]');
    await user.click(start());
    expect(records()).toEqual([{ id: 8, title: "Reset seed" }]);
  });
  it("creates and renames resources, binds editor endpoints, and retains draft text across selections", async () => {
    const { user, setEditor } = await setup();
    await user.click(button("Add resource"));
    change("Resource key", "constructor");
    expect(screen.getByLabelText("Seed records (JSON array)")).toHaveValue(
      "[]",
    );
    change("Seed records (JSON array)", '[{"id":42}]');
    change("Resource to configure", "tasks");
    change("Resource to configure", "constructor");
    expect(screen.getByLabelText("Seed records (JSON array)")).toHaveValue(
      '[{"id":42}]',
    );
    await user.click(button("Read endpoints from editor"));
    change("Endpoint for a new binding", "0");
    await user.click(button("Add binding to selected resource"));
    expect(screen.getByLabelText("Binding path template")).toHaveValue(
      "/users/{id}",
    );
    expect(
      screen.getByLabelText("ID path parameter (blank for list/create)"),
    ).toHaveValue("id");
    await user.click(start());
    change("Sandbox request path and query", "/users/42");
    await user.click(send());
    expect(response().body).toEqual({ id: 42 });
    setEditor("openapi: [");
    await user.click(button("Read endpoints from editor"));
    expect(screen.getByRole("alert")).toHaveTextContent("valid OpenAPI");
    expect(records()).toEqual([{ id: 42 }]);
  });
  it("does not restore removed route or resource draft data when keys are reused", async () => {
    const { user } = await setup();
    await user.click(button("Add resource"));
    change("Seed records (JSON array)", "bad resource draft");
    await user.click(button("Add binding to selected resource"));
    change("Parent scope mapping (JSON object)", "bad route draft");
    await user.click(button("Remove resource and its routes"));
    await user.click(button("Add resource"));
    expect(screen.getByLabelText("Seed records (JSON array)")).toHaveValue(
      "[]",
    );
    await user.click(button("Add binding to selected resource"));
    expect(
      screen.getByLabelText("Parent scope mapping (JSON object)"),
    ).toHaveValue("{}");
    change("Parent scope mapping (JSON object)", "bad draft");
    await user.click(button("Remove binding"));
    await user.click(button("Add binding to selected resource"));
    expect(
      screen.getByLabelText("Parent scope mapping (JSON object)"),
    ).toHaveValue("{}");
    await user.click(start());
    expect(send()).toBeEnabled();
  });
  it("downloads projects, records, and value-free logs and checkpoints current records as seeds", async () => {
    const { user } = await setup();
    await user.click(start());
    change("Sandbox request method", "POST");
    change("Sandbox request JSON body", '{"secret":"only-in-records"}');
    await user.click(send());
    await user.click(button("Download sandbox project"));
    expect(
      parseSandboxProject(vi.mocked(downloadTextFile).mock.calls.at(-1)![0])
        .resources[0].seed,
    ).toHaveLength(1);
    await user.click(button("Download all current records"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).toContain(
      "only-in-records",
    );
    await user.click(button("Download sandbox run log"));
    expect(vi.mocked(downloadTextFile).mock.calls.at(-1)![0]).not.toContain(
      "only-in-records",
    );
    await user.click(button("Use current records as seeds and restart"));
    expect(records()).toHaveLength(2);
    expect(button("Undo last sandbox request")).toBeDisabled();
    await user.click(button("Download sandbox project"));
    expect(
      parseSandboxProject(vi.mocked(downloadTextFile).mock.calls.at(-1)![0])
        .resources[0].seed,
    ).toHaveLength(2);
    vi.mocked(downloadTextFile).mockReturnValue(false);
    await user.click(button("Download all current records"));
    expect(screen.getByRole("alert")).toHaveTextContent("could not start");
  });
  it("restores valid projects atomically and preserves current work on failed or oversized imports", async () => {
    const { user } = await setup();
    await user.click(start());
    const project = createSandboxDemo();
    project.name = "Imported sandbox";
    project.resources[0].seed = [{ id: 10 }];
    await user.upload(uploadInput(), file(serializeSandboxProject(project)));
    await waitFor(() => expect(records()).toEqual([{ id: 10 }]));
    expect(screen.getByLabelText("Sandbox name")).toHaveValue(
      "Imported sandbox",
    );
    await user.upload(uploadInput(), file("{}"));
    expect(await screen.findByRole("alert")).toHaveTextContent("version 1");
    expect(records()).toEqual([{ id: 10 }]);
    const large = file("{}");
    Object.defineProperty(large, "size", { value: MAX_SANDBOX_BYTES + 1 });
    await user.upload(uploadInput(), large);
    expect(await screen.findByRole("alert")).toHaveTextContent("exceeds");
    expect(records()).toEqual([{ id: 10 }]);
  });
  it("blocks configuration and execution while a file is being read", async () => {
    const { user } = await setup();
    await user.click(start());
    let resolve!: (text: string) => void;
    const pending = file("{}");
    Object.defineProperty(pending, "text", {
      value: () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    });
    await user.upload(uploadInput(), pending);
    expect(send()).toBeDisabled();
    expect(start()).toBeDisabled();
    expect(button("Add resource")).toBeDisabled();
    await act(async () =>
      resolve(serializeSandboxProject(createSandboxDemo())),
    );
    expect(
      await screen.findByText(
        "Sandbox project restored and started from seeds.",
      ),
    ).toBeInTheDocument();
    expect(send()).toBeEnabled();
  });
  it("retains running state when collapsed and bounds the request log", async () => {
    const { user } = await setup();
    await user.click(start());
    for (let i = 0; i < 22; i++) fireEvent.click(send());
    expect(
      within(
        screen.getByRole("list", { name: "Sandbox request log" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(20);
    await user.click(screen.getByText("Stateful API sandbox"));
    expect(
      screen.queryByLabelText("Sandbox request method"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByText("Stateful API sandbox"));
    expect(records()).toHaveLength(1);
    expect(
      within(
        screen.getByRole("list", { name: "Sandbox request log" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(20);
  });
  it("localizes the tool in Russian", async () => {
    const { user } = await setup();
    act(() => setAppLanguage("ru"));
    expect(screen.getByText("Песочница API с состоянием")).toBeInTheDocument();
    await user.click(button("Проверить и запустить/перезапустить песочницу"));
    await user.click(button("Отправить локальный запрос"));
    expect(
      screen.getByRole("region", { name: "Ответ песочницы" }),
    ).toHaveTextContent("200");
  });
});
