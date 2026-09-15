import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { POST } from "./route";
import { DEFAULT_SERVER_URL } from "@/lib/openapi";

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  return { lookup, default: { lookup } };
});
const payload = {
  requireLive: true,
  serverUrl: "https://example.test",
  method: "GET",
  path: "/users",
};
function request(patch = {}, signal?: AbortSignal) {
  return new Request("http://localhost/api/try-it-out", {
    method: "POST",
    body: JSON.stringify({ ...payload, ...patch }),
    signal,
  });
}
beforeEach(() => {
  vi.mocked(lookup).mockReset();
  vi.mocked(lookup).mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
  ] as never);
});

describe("strict Live scenario route", () => {
  it("executes the usual demo host when Live is explicitly required", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ id: 7 }, { status: 201 }));
    try {
      const response = await POST(request({ serverUrl: DEFAULT_SERVER_URL }));
      expect(await response.json()).toMatchObject({
        status: "201",
        body: '{"id":7}',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        `${DEFAULT_SERVER_URL}/users`,
        expect.objectContaining({
          redirect: "manual",
          signal: expect.any(AbortSignal),
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
  it.each([
    "http://localhost",
    "http://127.0.0.1",
    "https://user:secret@example.test",
    "https://example.test?token=secret",
  ])("rejects invalid target %s without a fallback", async (serverUrl) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      expect((await POST(request({ serverUrl }))).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("rejects DNS results pointing to private addresses", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "10.0.0.1", family: 4 },
    ] as never);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      expect((await POST(request())).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("reports redirects without replaying credentials at the destination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("redirect", {
        status: 302,
        headers: { location: "http://localhost/secret" },
      }),
    );
    try {
      expect(await (await POST(request())).json()).toMatchObject({
        status: "302",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1]?.redirect).toBe("manual");
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("bounds response bodies and reports size failures without response values", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("a".repeat(1024 * 1024 + 1)));
    try {
      expect(await (await POST(request())).json()).toEqual({
        status: "0",
        durationMs: 0,
        body: "",
        headers: {},
        errorCode: "response-limit",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("passes cancellation to the upstream request", async () => {
    const abort = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          started();
          init!.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Stopped", "AbortError")),
            { once: true },
          );
        }),
    );
    try {
      const pending = POST(request({}, abort.signal));
      await ready;
      abort.abort();
      expect(await (await pending).json()).toMatchObject({
        status: "0",
        errorCode: "timeout",
      });
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
