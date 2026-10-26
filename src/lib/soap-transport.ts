import { parseTransformValue } from "./api-transform";
import { getByteSize } from "./text-encoding";
import {
  MAX_SOAP_XML_BYTES,
  SoapError,
  soapError,
  type SoapVersion,
} from "./soap-xml";
import { soapUrl } from "./soap-studio";

export type SoapExchange = {
  status: number;
  body: string;
  bytes: number;
  durationMs: number;
  contentType: string;
  version: SoapVersion;
};
export function soapHttpHeaders(
  version: SoapVersion,
  action: string,
  custom = "{}",
): Headers {
  if (
    action.length > 2048 ||
    /[\x00-\x1f\x7f]/.test(action) ||
    getByteSize(custom) > 16384
  )
    throw new SoapError("headers");
  let parsed: unknown;
  try {
    parsed = parseTransformValue(custom);
  } catch {
    throw new SoapError("headers");
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length > 40
  )
    throw new SoapError("headers");
  const names = new Set<string>(),
    entries: [string, string][] = [];
  for (const [name, value] of Object.entries(parsed)) {
    if (
      !/^[!#$%&'*+.^_`|~\w-]+$/.test(name) ||
      typeof value !== "string" ||
      /[\r\n\0]/.test(value) ||
      names.has(name.toLowerCase()) ||
      /^(content-type|soapaction|cookie|set-cookie|host|origin|referer|connection|content-length|transfer-encoding|upgrade|proxy-.*|sec-.*)$/i.test(
        name,
      )
    )
      throw new SoapError("headers");
    names.add(name.toLowerCase());
    entries.push([name, value]);
  }
  try {
    const headers = new Headers(entries),
      quoted = '"' + action.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    headers.set(
      "Content-Type",
      version === "1.1"
        ? "text/xml; charset=utf-8"
        : `application/soap+xml; charset=utf-8${action ? `; action=${quoted}` : ""}`,
    );
    if (version === "1.1") headers.set("SOAPAction", quoted);
    if (!headers.has("Accept"))
      headers.set(
        "Accept",
        version === "1.1"
          ? "text/xml, application/xml"
          : "application/soap+xml",
      );
    return headers;
  } catch {
    throw new SoapError("headers");
  }
}
export function soapCurl(
  url: string,
  version: SoapVersion,
  action: string,
  xml: string,
): string {
  const quote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
  const headers = soapHttpHeaders(version, action);
  return (
    [
      "curl --request POST",
      quote(soapUrl(url)),
      ...Array.from(headers.entries()).map(
        ([name, value]) => `--header ${quote(`${name}: ${value}`)}`,
      ),
      `--data-binary ${quote(xml)}`,
    ].join(" \\\n  ") + "\n"
  );
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(new SoapError("cancelled"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (v) => {
        cleanup();
        resolve(v);
      },
      (e) => {
        cleanup();
        reject(e);
      },
    );
    if (signal.aborted) abort();
  });
}
const discard = (body: ReadableStream<Uint8Array> | null) => {
  try {
    void body?.cancel().catch(() => {});
  } catch {}
};
export async function sendSoapRequest(input: {
  url: string;
  version: SoapVersion;
  action: string;
  xml: string;
  timeoutMs: number;
  headers?: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<SoapExchange> {
  const url = soapUrl(input.url),
    headers = soapHttpHeaders(input.version, input.action, input.headers);
  if (
    getByteSize(input.xml) > MAX_SOAP_XML_BYTES ||
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs < 100 ||
    input.timeoutMs > 30000
  )
    throw new SoapError("limit");
  const controller = new AbortController(),
    signal = controller.signal,
    started = performance.now();
  let reason: SoapIssueReason | undefined,
    response: Response | undefined,
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
    complete = false;
  type SoapIssueReason = "timeout" | "cancelled";
  const stop = (r: SoapIssueReason) => {
    if (!reason) {
      reason = r;
      controller.abort();
      try {
        void reader?.cancel().catch(() => {});
      } catch {}
    }
  };
  const abort = () => stop("cancelled");
  input.signal?.addEventListener("abort", abort, { once: true });
  if (input.signal?.aborted) abort();
  const timer = setTimeout(() => stop("timeout"), input.timeoutMs);
  try {
    if (signal.aborted) throw new SoapError(reason ?? "cancelled");
    response = await abortable<Response>(
      Promise.resolve().then(async () => {
        const fetched = await (input.fetcher ?? fetch)(url, {
          method: "POST",
          headers,
          body: input.xml,
          credentials: "omit",
          redirect: "error",
          mode: "cors",
          cache: "no-store",
          signal,
        });
        if (signal.aborted) {
          discard(fetched.body);
          throw new SoapError(reason ?? "cancelled");
        }
        return fetched;
      }),
      signal,
    );
    if (response.redirected || response.type === "opaqueredirect")
      throw new SoapError("network");
    const contentType = response.headers.get("Content-Type") ?? "",
      mime = contentType.split(";", 1)[0].trim().toLowerCase();
    if (
      !(input.version === "1.1"
        ? ["text/xml", "application/xml"].includes(mime)
        : mime === "application/soap+xml")
    )
      throw new SoapError("mime");
    if (!response.body) throw new SoapError("body");
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true }),
      chunks: string[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (signal.aborted) throw new SoapError(reason ?? "cancelled");
      if (performance.now() - started >= input.timeoutMs)
        throw new SoapError("timeout");
      if (done) break;
      if (
        !ArrayBuffer.isView(value) ||
        Object.prototype.toString.call(value) !== "[object Uint8Array]"
      )
        throw new SoapError("network");
      bytes += value.byteLength;
      if (bytes > MAX_SOAP_XML_BYTES) throw new SoapError("limit");
      try {
        chunks.push(decoder.decode(value, { stream: true }));
      } catch {
        throw new SoapError("xml");
      }
    }
    try {
      chunks.push(decoder.decode());
    } catch {
      throw new SoapError("xml");
    }
    complete = true;
    // Faults often use HTTP 500, so preserve HTTP status and XML for envelope inspection.
    return {
      status: response.status,
      body: chunks.join(""),
      bytes,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      contentType,
      version: input.version,
    };
  } catch (e) {
    throw new SoapError(reason ?? soapError(e).code);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abort);
    if (!complete) {
      if (reader) {
        try {
          void reader.cancel().catch(() => {});
        } catch {}
      } else if (response) discard(response.body);
    }
    try {
      reader?.releaseLock();
    } catch {}
  }
}
