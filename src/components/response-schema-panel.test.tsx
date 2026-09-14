import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadTextFile } from "@/lib/schema-download";
import { ResponseSchemaPanel } from "./response-schema-panel";

vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));

async function setup(body: string | null = null) {
  const user = userEvent.setup();
  const view = render(<ResponseSchemaPanel body={body} />);
  await user.click(screen.getByText("Response schema builder"));
  await screen.findByLabelText("JSON schema example");
  return { user, ...view };
}
async function add(user: ReturnType<typeof userEvent.setup>, body: string) {
  fireEvent.change(screen.getByLabelText("JSON schema example"), {
    target: { value: body },
  });
  await user.click(screen.getByRole("button", { name: "Add JSON example" }));
}
function preview() {
  return JSON.parse(
    screen.getByLabelText("Inferred schema preview").textContent!,
  );
}

beforeEach(() => {
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
});

describe("ResponseSchemaPanel", () => {
  it("captures successive responses, merges pasted examples, and retains samples on closing and clearing responses", async () => {
    const { user, rerender } = await setup('{"id":1,"name":"Ada"}');
    await user.click(
      screen.getByRole("button", { name: "Capture current response" }),
    );
    rerender(<ResponseSchemaPanel body={'{"id":2}'} />);
    await user.click(
      screen.getByRole("button", { name: "Capture current response" }),
    );
    await add(user, '{"id":3,"active":true}');
    expect(preview().required).toEqual(["id"]);
    expect(screen.getByText("Captured examples: 3/10")).toBeVisible();
    await user.click(screen.getByText("Response schema builder"));
    rerender(<ResponseSchemaPanel body={null} />);
    await user.click(screen.getByText("Response schema builder"));
    expect(await screen.findByText("Captured examples: 3/10")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Capture current response" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove example 1" }));
    expect(preview().properties).not.toHaveProperty("name");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("preserves good examples after invalid input and enforces the sample limit", async () => {
    const { user } = await setup();
    await add(user, "{}");
    await add(user, "oops");
    expect(screen.getByRole("alert")).toHaveTextContent("not valid JSON");
    expect(screen.getByText("Captured examples: 1/10")).toBeVisible();
    expect(screen.getByLabelText("JSON schema example")).toHaveValue("oops");
    await add(user, "9007199254740992");
    expect(screen.getByRole("alert")).toHaveTextContent("represented safely");
    for (let i = 1; i < 10; i++) await add(user, "null");
    expect(
      screen.getByRole("button", { name: "Add JSON example" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Clear schema examples" }),
    );
    expect(screen.getByText("Captured examples: 0/10")).toBeVisible();
    expect(
      screen.queryByLabelText("Inferred schema preview"),
    ).not.toBeInTheDocument();
  });

  it("updates schema options and exports the complete JSON or YAML schema", async () => {
    const { user } = await setup();
    await add(user, '{"id":1,"nested":{"name":"private-value"}}');
    await user.click(
      screen.getByLabelText("Require fields present in every observed object"),
    );
    await user.click(
      screen.getByLabelText("Allow additional object properties"),
    );
    expect(preview()).not.toHaveProperty("required");
    expect(preview().properties.nested.additionalProperties).toBe(false);
    fireEvent.change(screen.getByLabelText("Schema component name"), {
      target: { value: "User" },
    });
    await user.click(
      screen.getByRole("button", { name: "Copy inferred schema" }),
    );
    expect(
      JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]),
    ).toEqual(preview());
    expect(vi.mocked(writeTextToClipboard).mock.calls[0][0]).not.toContain(
      "private-value",
    );
    await user.selectOptions(
      screen.getByLabelText("Inferred schema format"),
      "openapi-yaml",
    );
    await user.click(
      screen.getByRole("button", { name: "Download inferred schema" }),
    );
    const [content, filename, mime] = vi.mocked(downloadTextFile).mock.calls[0];
    expect(parse(content).components.schemas.User.additionalProperties).toBe(
      false,
    );
    expect(filename).toBe("rsswag-User-openapi-component.yaml");
    expect(mime).toBe("application/yaml");
    fireEvent.change(screen.getByLabelText("Schema component name"), {
      target: { value: "../bad" },
    });
    expect(
      screen.getByRole("button", { name: "Copy inferred schema" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("1–80");
  });

  it("searches and paginates fields without narrowing exports", async () => {
    const { user } = await setup();
    await add(
      user,
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 60 }, (_, i) => [
            `field${String(i).padStart(2, "0")}`,
            i,
          ]),
        ),
      ),
    );
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      26,
    );
    await user.click(
      screen.getByRole("button", { name: "Next schema fields" }),
    );
    expect(screen.getByText("Page 2 of 3")).toBeVisible();
    await user.type(
      screen.getByLabelText("Search inferred schema paths and types"),
      "FIELD59 integer",
    );
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      2,
    );
    await user.click(
      screen.getByRole("button", { name: "Download inferred schema" }),
    );
    expect(
      Object.keys(
        JSON.parse(vi.mocked(downloadTextFile).mock.calls[0][0]).properties,
      ),
    ).toHaveLength(60);
  });

  it("reports export errors and ignores delayed clipboard feedback after edits", async () => {
    const { user } = await setup();
    await add(user, "{}");
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(
      screen.getByRole("button", { name: "Copy inferred schema" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not copy");
    let finish!: (value: boolean) => void;
    vi.mocked(writeTextToClipboard).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Copy inferred schema" }),
    );
    await user.click(
      screen.getByLabelText("Allow additional object properties"),
    );
    await act(async () => finish(true));
    expect(
      screen.queryByText("Inferred schema copied."),
    ).not.toBeInTheDocument();
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(
      screen.getByRole("button", { name: "Download inferred schema" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not download");
    await user.click(
      screen.getByRole("button", { name: "Download inferred schema" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("download started");
  });

  it("exports full schemas when the preview is shortened", async () => {
    const { user } = await setup();
    const key = "long".repeat(4000);
    await add(user, JSON.stringify({ [key]: "secret-example" }));
    expect(screen.getByText(/Preview shortened to 12,000/)).toBeVisible();
    expect(
      screen.getByLabelText("Inferred schema preview").textContent,
    ).toHaveLength(12000);
    await user.click(
      screen.getByRole("button", { name: "Copy inferred schema" }),
    );
    expect(
      JSON.parse(vi.mocked(writeTextToClipboard).mock.calls[0][0]).properties[
        key
      ],
    ).toEqual({ type: "string" });
    await user.click(
      screen.getByRole("button", { name: "Download inferred schema" }),
    );
    expect(vi.mocked(downloadTextFile).mock.calls[0][0]).toBe(
      vi.mocked(writeTextToClipboard).mock.calls[0][0],
    );
  });

  it("keeps accepted samples when their combined size would exceed the limit", async () => {
    const { user } = await setup();
    const body = JSON.stringify("a".repeat(750000));
    await add(user, body);
    await add(user, body);
    await add(user, body);
    expect(screen.getByRole("alert")).toHaveTextContent("2 MiB combined");
    expect(screen.getByText("Captured examples: 2/10")).toBeVisible();
    expect(preview().type).toBe("string");
  });

  it("renders Russian controls", async () => {
    window.localStorage.setItem("rsswagger-language", "ru");
    const user = userEvent.setup();
    render(<ResponseSchemaPanel body={null} />);
    await user.click(screen.getByText("Конструктор схемы ответа"));
    expect(await screen.findByLabelText("Пример JSON для схемы")).toBeVisible();
  });
});
