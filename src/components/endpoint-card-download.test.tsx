import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseOpenApiSchema } from "@/lib/openapi";
import { setAppLanguage } from "./i18n-provider";
import { EndpointCard } from "./endpoint-card";

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info: { title: Downloads, version: '1' }
servers: [{ url: 'https://example.test' }]
paths:
  /item:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              example: { name: Ada }
        '404':
          description: Missing
          content:
            application/json:
              example: { error: missing }
`);
if (!parsed.ok) throw new Error(parsed.error);
const endpoint = parsed.value.endpoints[0];
const createDescriptor = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL",
);
const revokeDescriptor = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL",
);
const createObjectURL = vi.fn<(value: Blob | MediaSource) => string>();
const revokeObjectURL = vi.fn();
beforeEach(() => {
  createObjectURL.mockReset().mockReturnValue("blob:response-download");
  revokeObjectURL.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, descriptor] of [
    ["createObjectURL", createDescriptor],
    ["revokeObjectURL", revokeDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(URL, key, descriptor);
    else Reflect.deleteProperty(URL, key);
  }
});
function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
const download = () =>
  screen.getByRole("button", { name: "Download response" });

describe("endpoint response downloads", () => {
  it("reports unavailable or blocked downloads, preserves the response, and retries with the original bytes", async () => {
    const user = userEvent.setup();
    const body = '  {"name":"Ada"}\n';
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        body,
        status: "200",
        headers: { "content-type": "application/json" },
        durationMs: 1,
        requestSize: 0,
        responseSize: body.length,
        url: "https://example.test/item",
        errorDetails: null,
      }),
    );
    render(
      <EndpointCard
        endpoint={endpoint}
        canSaveHistory={false}
        executionMode="live"
        mockResponseDelayMs={0}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Try It Out" }));
    await screen.findByLabelText("Response body");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: undefined,
    });
    await user.click(download());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not download the response",
    );
    expect(screen.getByLabelText("Response body")).toHaveTextContent("Ada");
    expect(
      screen.getByRole("button", { name: "Copy response body" }),
    ).toBeEnabled();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    createObjectURL.mockImplementationOnce(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    await user.click(download());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not download the response",
    );
    expect(revokeObjectURL).not.toHaveBeenCalled();

    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    revokeObjectURL.mockImplementationOnce(() => {
      throw new Error("cleanup unavailable");
    });
    await user.click(download());
    expect(screen.getByText("Response download started.")).toBeVisible();
    expect(
      screen.queryByText(/Could not download the response/),
    ).not.toBeInTheDocument();
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toMatchObject({
      download: "rsswag-response-200.json",
      href: "blob:response-download",
    });
    const blob = createObjectURL.mock.calls.at(-1)![0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(await readBlob(blob)).toBe(body);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:response-download");
  });

  it("clears feedback for an older response downloaded while the next request is pending", async () => {
    const user = userEvent.setup();
    const payload = {
      body: '{"name":"Ada"}',
      status: "200",
      headers: { "content-type": "application/json" },
      durationMs: 1,
      requestSize: 0,
      responseSize: 14,
      url: "https://example.test/item",
      errorDetails: null,
    };
    let finish!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(payload))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(
      <EndpointCard
        endpoint={endpoint}
        canSaveHistory={false}
        executionMode="live"
        mockResponseDelayMs={0}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Try It Out" }));
    expect(await screen.findByLabelText("Response body")).toHaveTextContent(
      "Ada",
    );
    await user.click(screen.getByRole("button", { name: "Try It Out" }));
    await user.click(download());
    expect(screen.getByText("Response download started.")).toBeVisible();
    await act(async () =>
      finish(Response.json({ ...payload, body: '{"name":"Grace"}' })),
    );
    expect(screen.getByLabelText("Response body")).toHaveTextContent("Grace");
    expect(
      screen.queryByText("Response download started."),
    ).not.toBeInTheDocument();
  });

  it("cleans up failed clicks, localizes feedback, and clears messages for subsequent or cleared responses", async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementationOnce(() => {
        throw new Error("click blocked");
      });
    render(
      <EndpointCard
        endpoint={endpoint}
        canSaveHistory={false}
        executionMode="mock"
        mockResponseDelayMs={0}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Generate Mock" }));
    await user.click(
      await screen.findByRole("button", { name: "Download response" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not download the response",
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:response-download");
    act(() => setAppLanguage("ru"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не удалось скачать ответ",
    );
    act(() => setAppLanguage("en"));
    click.mockImplementation(() => {});
    await user.click(download());
    expect(screen.getByText("Response download started.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Generate Mock" }));
    await screen.findByRole("button", { name: "Download response" });
    expect(
      screen.queryByText("Response download started."),
    ).not.toBeInTheDocument();
    await user.click(download());
    await user.click(screen.getByRole("button", { name: "Clear response" }));
    expect(
      screen.queryByText("Response download started."),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate Mock" }));
    await user.click(
      await screen.findByRole("button", { name: "Download response" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Mock response status"),
      "404",
    );
    expect(
      screen.queryByText("Response download started."),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Response body")).not.toBeInTheDocument();
  });
});
