import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { generateTransferToolkit } from "./transfer-export";
import {
  inspectTransferPacket,
  parseTransferRanges,
  prepareTransferResource,
  serveTransferBytes,
  transferPacket,
} from "./transfer-engine";
import { demoTransferProject } from "./transfer-studio";
import {
  MAX_TRANSFER_BYTES,
  decodeTransferBytes,
  encodeTransferBytes,
  newTransferResource,
  type TransferCheckpoint,
  type TransferResource,
  type TransferScenario,
} from "./transfer-project";
import { runTransferScenario } from "./transfer-run";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
type Download = {
  outcome: string;
  attempts: number;
  rejected: number;
  restarts: number;
  wireBytes: number;
  covered: number;
  total: number;
  checkpoint: TransferCheckpoint;
  bytes: Uint8Array | null;
};
type Options = {
  chunkSize?: number;
  maxAttempts?: number;
  checkpoint?: TransferCheckpoint;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
  deadlineMs?: number;
  onProgress?: (v: unknown) => void;
  headers?: HeadersInit;
};
async function artifact(r: TransferResource = newTransferResource()) {
  const source = generateTransferToolkit(r),
    exported = (await import(
      /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )) as {
      createByteRangeResponder: (
        b: Uint8Array,
        options?: Record<string, unknown>,
      ) => Promise<(r: Request) => Response>;
      parseByteRanges: typeof parseTransferRanges;
      inspectRangeResponse: typeof inspectTransferPacket;
      normalizeCheckpoint: (c: unknown) => TransferCheckpoint;
      downloadBytes: (url: string, o?: Options) => Promise<Download>;
    };
  return { source, ...exported };
}
async function simulated(s: TransferScenario) {
  const p = demoTransferProject(),
    resources = await Promise.all(p.resources.map(prepareTransferResource)),
    map = new Map(resources.map((r) => [r.id, r]));
  let attempt = 0;
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const h = new Headers(init.headers);
    if (init.method === "GET") attempt++;
    const r = map.get(
        init.method === "GET" && s.replacementId && attempt >= s.switchAt
          ? s.replacementId
          : s.resourceId,
      )!,
      fault =
        init.method === "GET"
          ? s.faults.find((f) => f.at === attempt)?.kind
          : null;
    if (fault === "drop") throw new TypeError("interrupted");
    const response = serveTransferBytes(
      fault === "ignore-range" ? { ...r, ranges: false } : r,
      {
        method: init.method!,
        range: h.get("Range"),
        ifRange: h.get("If-Range"),
      },
    );
    if (fault === "truncate") response.body = response.body.slice(0, -1);
    if (fault === "corrupt" && response.body.length) response.body[0] ^= 255;
    if (fault === "wrong-validator")
      response.headers.ETag = '"sha256-' + "0".repeat(64) + '"';
    if (fault === "wrong-range") {
      const m = /bytes=(\d+)-(\d+)/.exec(h.get("Range")!)!;
      response.headers["Content-Range"] =
        `bytes ${Number(m[1]) + 1}-${Number(m[2]) + 1}/${r.bytes.length}`;
    }
    return new Response(
      init.method === "HEAD" ? null : new Uint8Array(response.body).buffer,
      { status: response.status, headers: response.headers },
    );
  });
  return fetcher;
}
describe("portable HTTP transfer toolkit", () => {
  it("executes native ESM range responder/parser/inspector with byte and metadata parity", async () => {
    const r = await prepareTransferResource(demoTransferProject().resources[0]),
      exported = await artifact(r),
      respond = await exported.createByteRangeResponder(r.bytes);
    for (const method of ["GET", "HEAD"])
      for (const header of [
        null,
        "",
        "bytes=0-3",
        "bytes=-5",
        "bytes=900-9999999999999999999999999999",
        "bytes=99999999999999999999-",
        "bytes=0-1,8-9",
        "bytes=0-3,2-5",
        "BYTES=99-,0-0",
        "unknown=0-1",
        "bytes=4-2",
      ]) {
        const h = new Headers();
        if (header !== null) h.set("Range", header);
        const response = respond(
            new Request("https://example.test/file", { method, headers: h }),
          ),
          core = serveTransferBytes(r, {
            method,
            range: header,
            ifRange: null,
          }),
          bytes = new Uint8Array(await response.arrayBuffer());
        expect(response.status).toBe(core.status);
        expect(bytes).toEqual(core.body);
        expect(Object.fromEntries(response.headers)).toEqual(
          Object.fromEntries(
            Object.entries(core.headers).map(([k, v]) => [k.toLowerCase(), v]),
          ),
        );
        expect(exported.parseByteRanges(header, r.bytes.length)).toEqual(
          parseTransferRanges(header, r.bytes.length),
        );
        const packet = transferPacket(core, method as "GET" | "HEAD");
        expect(exported.inspectRangeResponse(packet)).toEqual(
          inspectTransferPacket(packet),
        );
      }
  });
  it.each([
    "normal",
    "recovery",
    "revision",
    "corruption",
    "budget",
    "ignored",
    "mismatch",
    "empty-case",
  ])("downloads %s with the same outcomes as offline rehearsal", async (id) => {
    const p = demoTransferProject(),
      s = p.scenarios.find((s) => s.id === id)!,
      fetcher = await simulated(s),
      exported = await artifact(p.resources[0]),
      core = await runTransferScenario(p, id);
    const result = await exported.downloadBytes("https://example.test/file", {
      fetch: fetcher,
      chunkSize: s.chunkSize,
      maxAttempts: s.maxAttempts,
    });
    expect(result).toMatchObject({
      outcome: core.outcome,
      attempts: core.attempts,
      rejected: core.rejected,
      restarts: core.restarts,
      wireBytes: core.wireBytes,
      covered: core.covered,
      total: core.total,
    });
    expect(result.bytes).toEqual(core.output);
    expect(result.checkpoint).toEqual(core.checkpoint);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
      });
      expect(new Headers(init.headers).get("Accept-Encoding")).toBe("identity");
    }
  });
  it("resumes a portable checkpoint, rejects overlaps, and verifies supplied complete checkpoint bytes", async () => {
    const p = demoTransferProject(),
      partial = await runTransferScenario(p, "budget"),
      exported = await artifact(),
      fetcher = await simulated(p.scenarios[0]);
    const result = await exported.downloadBytes("https://example.test/file", {
      fetch: fetcher,
      checkpoint: partial.checkpoint!,
      chunkSize: 128,
    });
    expect(result.attempts).toBe(5);
    expect(result.bytes).toEqual(decodeTransferBytes(p.resources[0].base64));
    const bad = structuredClone(result.checkpoint);
    bad.segments.push(bad.segments[0]);
    expect(() => exported.normalizeCheckpoint(bad)).toThrow("checkpoint");
    const corrupt = structuredClone(result.checkpoint);
    corrupt.segments[0].base64 = encodeTransferBytes(new Uint8Array(1024));
    expect(
      await exported.downloadBytes("https://example.test/file", {
        fetch: fetcher,
        checkpoint: corrupt,
      }),
    ).toMatchObject({ outcome: "integrity-failed", attempts: 0, bytes: null });
  });
  it("honors strong date gating, preserves immutable resource snapshots and rejects invalid metadata", async () => {
    const p = newTransferResource(),
      bytes = decodeTransferBytes(p.base64),
      exported = await artifact(p),
      respond = await exported.createByteRangeResponder(bytes, {
        dateStrong: true,
      });
    bytes.fill(0);
    const get = (ifRange: string) =>
      respond(
        new Request("https://example.test/file", {
          headers: { Range: "bytes=0-1", "If-Range": ifRange },
        }),
      );
    expect(get(p.lastModified!).status).toBe(206);
    expect(get('W/"tag"').status).toBe(200);
    expect(new Uint8Array(await get(p.lastModified!).arrayBuffer())).toEqual(
      decodeTransferBytes(p.base64).slice(0, 2),
    );
    await expect(
      exported.createByteRangeResponder(bytes, { contentType: "bad\r\n" }),
    ).rejects.toThrow("metadata");
    await expect(
      exported.createByteRangeResponder(new Uint8Array(MAX_TRANSFER_BYTES + 1)),
    ).rejects.toThrow("bytes");
  });
  it("does not send traffic on import, refuses redirects/userinfo schemes, honors cancellation and propagates progress failures", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const exported = await artifact();
    expect(network).not.toHaveBeenCalled();
    for (const url of ["file:///secret", "https://user:pass@example.test/a"])
      await expect(exported.downloadBytes(url)).rejects.toThrow("url");
    const aborted = new AbortController();
    aborted.abort(new Error("stopped"));
    await expect(
      exported.downloadBytes("https://example.test/file", {
        signal: aborted.signal,
      }),
    ).rejects.toThrow("stopped");
    expect(network).not.toHaveBeenCalled();
    const s = demoTransferProject().scenarios[0],
      fetcher = await simulated(s);
    await expect(
      exported.downloadBytes("https://example.test/file", {
        fetch: fetcher,
        onProgress: () => {
          throw new Error("callback");
        },
      }),
    ).rejects.toThrow("callback");
    const slow = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init.signal!.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          { once: true },
        ),
      );
    await expect(
      exported.downloadBytes("https://example.test/file", {
        fetch: slow,
        deadlineMs: 5,
      }),
    ).rejects.toThrow("deadline");
  });
  it("bounds streaming bodies before assembly and never exposes oversized or unverified output", async () => {
    const p = demoTransferProject(),
      r = await prepareTransferResource(p.resources[0]),
      exported = await artifact();
    let cancelled = false;
    const fetcher = async (_url: string, init: RequestInit) =>
      init.method === "HEAD"
        ? new Response(null, {
            headers: { ETag: r.etag, "Content-Length": "1024" },
          })
        : new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new Uint8Array(MAX_TRANSFER_BYTES));
                c.enqueue(Uint8Array.of(1));
              },
              cancel() {
                cancelled = true;
              },
            }),
            {
              headers: {
                ETag: r.etag,
                "Content-Type": "application/octet-stream",
              },
            },
          );
    const result = await exported.downloadBytes("https://example.test/file", {
      fetch: fetcher,
      maxAttempts: 1,
    });
    expect(result).toMatchObject({
      outcome: "exhausted",
      covered: 0,
      rejected: 1,
      bytes: null,
    });
    expect(cancelled).toBe(true);
  });
  it("omits resource bytes and safely serializes metadata defaults", async () => {
    const r = newTransferResource();
    r.name = "</script>\u2028";
    const exported = await artifact(r);
    expect(exported.source).not.toContain(r.base64);
    expect(exported.source).not.toContain("</script>");
    expect(exported.source).not.toContain("scenario-1");
    expect(exported.source).not.toMatch(/localStorage|sessionStorage|eval\(/);
  });
});
