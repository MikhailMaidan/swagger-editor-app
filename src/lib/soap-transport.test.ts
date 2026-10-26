import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSoapRequest, soapCurl, soapHttpHeaders } from "./soap-transport";
import { soapFaultExample } from "./soap-studio";
import { inspectSoapEnvelope, wrapSoapBody } from "./soap-xml";

afterEach(() => vi.useRealTimers());
const input = () => ({
  url: "https://soap.example/service",
  version: "1.1" as const,
  action: "urn:GetCustomer",
  xml: wrapSoapBody(
    '<GetCustomer xmlns="urn:users"><id>1</id></GetCustomer>',
    "1.1",
  ),
  timeoutMs: 1000,
});
describe("SOAP HTTP bindings", () => {
  it("rejects an unexpectedly redirected response and cancels its body", async () => {
    const cancel = vi.fn(),
      response = new Response(new ReadableStream({ cancel }), {
        headers: { "Content-Type": "text/xml" },
      });
    Object.defineProperty(response, "redirected", { value: true });
    await expect(
      sendSoapRequest({
        ...input(),
        fetcher: vi.fn().mockResolvedValueOnce(response),
      }),
    ).rejects.toThrowError("network");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("sets quoted SOAPAction for 1.1 and content-type action for 1.2", () => {
    const one = soapHttpHeaders("1.1", 'urn:customer/"quoted"');
    expect(one.get("Content-Type")).toBe("text/xml; charset=utf-8");
    expect(one.get("SOAPAction")).toBe('"urn:customer/\\"quoted\\""');
    const two = soapHttpHeaders("1.2", "urn:customer");
    expect(two.get("Content-Type")).toBe(
      'application/soap+xml; charset=utf-8; action="urn:customer"',
    );
    expect(two.has("SOAPAction")).toBe(false);
    expect(soapHttpHeaders("1.1", "").get("SOAPAction")).toBe('""');
    expect(soapHttpHeaders("1.2", "").get("Content-Type")).not.toContain(
      "action=",
    );
  });
  it.each([
    '{"Cookie":"session=x"}',
    '{"Content-Type":"text/plain"}',
    '{"SOAPAction":"other"}',
    '{"X":"one","x":"two"}',
    '{"X":"bad\\nvalue"}',
    '{"Origin":"https://other.example"}',
    "[]",
    '{"X":1}',
  ])(
    "rejects controlled, duplicate, or malformed custom headers %s",
    (headers) =>
      expect(() => soapHttpHeaders("1.1", "urn:x", headers)).toThrowError(
        "headers",
      ),
  );
  it("exports shell-quoted commands without session credentials", () => {
    const curl = soapCurl(
      "https://soap.example/service",
      "1.2",
      "urn:test",
      "<r>O'Brien</r>",
    );
    expect(curl).toContain("--request POST");
    expect(curl).toContain("application/soap+xml");
    expect(curl).toContain("O'\\''Brien");
    expect(curl).not.toContain("Authorization");
  });
  it("preserves HTTP error fault bodies and sends exact XML with session-only headers", async () => {
    const body = soapFaultExample("1.1"),
      fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(body, {
          status: 500,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        }),
      );
    const response = await sendSoapRequest({
      ...input(),
      headers: '{"Authorization":"Bearer private"}',
      fetcher,
    });
    expect(response).toMatchObject({ status: 500, body, version: "1.1" });
    expect(inspectSoapEnvelope(response.body).fault).not.toBeNull();
    const opts = fetcher.mock.calls[0][1]!;
    expect(opts).toMatchObject({
      method: "POST",
      body: input().xml,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      mode: "cors",
    });
    expect(new Headers(opts.headers).get("Authorization")).toBe(
      "Bearer private",
    );
  });
  it("decodes UTF-8 incrementally across byte boundaries", async () => {
    const body = wrapSoapBody("<Result>Привет 🌍</Result>", "1.2"),
      bytes = new TextEncoder().encode(body);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(c) {
            for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
            c.close();
          },
        }),
        { headers: { "Content-Type": "application/soap+xml" } },
      ),
    );
    expect(
      (await sendSoapRequest({ ...input(), version: "1.2", fetcher })).body,
    ).toBe(body);
  });
  it("cancels rejected media types before reading a response", async () => {
    const cancel = vi.fn(),
      fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "text/html" },
        }),
      );
    await expect(sendSoapRequest({ ...input(), fetcher })).rejects.toThrowError(
      "mime",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("aborts a stalled body at its deadline and disposes timers", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(),
      fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          headers: { "Content-Type": "text/xml" },
        }),
      );
    const result = sendSoapRequest({
      ...input(),
      timeoutMs: 100,
      fetcher,
    }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toHaveProperty("code", "timeout");
    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("handles explicit cancellation and disposes a late fetch response", async () => {
    const abort = new AbortController(),
      cancel = vi.fn();
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const result = sendSoapRequest({
      ...input(),
      signal: abort.signal,
      fetcher,
    }).catch((e) => e);
    await Promise.resolve();
    abort.abort();
    expect(await result).toHaveProperty("code", "cancelled");
    resolve(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
  it("does not send an already-cancelled request", async () => {
    const abort = new AbortController();
    abort.abort();
    const fetcher = vi.fn();
    await expect(
      sendSoapRequest({ ...input(), signal: abort.signal, fetcher }),
    ).rejects.toThrowError("cancelled");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds streamed bytes and rejects malformed UTF-8", async () => {
    const cancel = vi.fn(),
      fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(512 * 1024 + 1));
            },
            cancel,
          }),
          { headers: { "Content-Type": "text/xml" } },
        ),
      );
    await expect(sendSoapRequest({ ...input(), fetcher })).rejects.toThrowError(
      "limit",
    );
    expect(cancel).toHaveBeenCalled();
    await expect(
      sendSoapRequest({
        ...input(),
        fetcher: vi.fn().mockResolvedValueOnce(
          new Response(new Uint8Array([255]), {
            headers: { "Content-Type": "text/xml" },
          }),
        ),
      }),
    ).rejects.toThrowError("xml");
  });
  it("turns network failures into a value-free issue code", async () => {
    await expect(
      sendSoapRequest({
        ...input(),
        fetcher: vi.fn().mockRejectedValueOnce(new Error("private endpoint")),
      }),
    ).rejects.toThrowError("network");
  });
});
