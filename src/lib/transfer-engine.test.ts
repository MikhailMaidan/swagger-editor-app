import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectTransferPacket,
  parseTransferRanges,
  prepareTransferResource,
  serveTransferBytes,
  transferDigest,
  transferPacket,
} from "./transfer-engine";
import {
  MAX_TRANSFER_BYTES,
  decodeTransferBytes,
  encodeTransferBytes,
  newTransferResource,
  readTransferBytes,
} from "./transfer-project";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
const range = (header: string | null, length = 10) =>
  parseTransferRanges(header, length);
async function resource() {
  return prepareTransferResource({
    ...newTransferResource(),
    base64: encodeTransferBytes(Uint8Array.from({ length: 256 }, (_, i) => i)),
  });
}
describe("byte-exact HTTP range semantics", () => {
  it("handles closed/open/suffix ranges and clamps without integer overflow", () => {
    expect(range("bytes=2-4").ranges).toEqual([{ start: 2, end: 4 }]);
    expect(range("bytes=7-").ranges).toEqual([{ start: 7, end: 9 }]);
    expect(range("bytes=-3").ranges).toEqual([{ start: 7, end: 9 }]);
    expect(range("bytes=-999999999999999999999999999999999999").ranges).toEqual(
      [{ start: 0, end: 9 }],
    );
    expect(
      range("bytes=2-999999999999999999999999999999999999").ranges,
    ).toEqual([{ start: 2, end: 9 }]);
    expect(range("bytes=999999999999999999999999999999999999-").kind).toBe(
      "unsatisfiable",
    );
    expect(range("bytes=00002-00004").ranges).toEqual([{ start: 2, end: 4 }]);
  });
  it("merges overlap/adjacency, preserves first request order and discards unsatisfiable members", () => {
    expect(range("BYTES=8-9, 1-2,2-4,6-7,999-, -0").ranges).toEqual([
      { start: 6, end: 9 },
      { start: 1, end: 4 },
    ]);
    expect(range("bytes=-0,99-").kind).toBe("unsatisfiable");
    expect(range("bytes=, 0-0,,").ranges).toEqual([{ start: 0, end: 0 }]);
    expect(range("bytes=2-4,0-9").ranges).toEqual([{ start: 0, end: 9 }]);
  });
  it.each([
    null,
    "",
    "items=1-2",
    "bytes=4-2",
    "bytes=-",
    "bytes=1 -2",
    "bytes=+1-2",
    "bytes=0-0,nope",
    "bytes=1-2\r\nX: y",
    `bytes=${"9".repeat(81)}-`,
    "x".repeat(4097),
    "bytes=" + Array(17).fill("0-1").join(","),
  ])("ignores unsupported or malformed range fields: %s", (header) => {
    expect(range(header).kind).toBe("ignored");
  });
  it("ignores ranges on empty representations and rejects invalid resource lengths", () => {
    expect(range("bytes=-1", 0).kind).toBe("ignored");
    expect(() => range("bytes=0-0", MAX_TRANSFER_BYTES + 1)).toThrow("limit");
  });
  it("derives strong SHA-256 tags from exact binary bytes and produces correct HEAD/GET/416 responses", async () => {
    const r = await resource();
    expect(r.etag).toBe('"sha256-' + (await transferDigest(r.bytes)) + '"');
    const full = serveTransferBytes(r, {
      method: "GET",
      range: null,
      ifRange: null,
    });
    expect(full.status).toBe(200);
    expect(full.body).toEqual(r.bytes);
    full.body[0] = 42;
    expect(r.bytes[0]).toBe(0);
    const head = serveTransferBytes(r, {
      method: "HEAD",
      range: "bytes=0-1",
      ifRange: '"bad"',
    });
    expect(head).toMatchObject({
      status: 200,
      body: new Uint8Array(),
      headers: { "Content-Length": "256" },
    });
    const part = serveTransferBytes(r, {
      method: "GET",
      range: "bytes=254-999",
      ifRange: null,
    });
    expect(part).toMatchObject({
      status: 206,
      headers: { "Content-Range": "bytes 254-255/256", "Content-Length": "2" },
    });
    expect([...part.body]).toEqual([254, 255]);
    const no = serveTransferBytes(r, {
      method: "GET",
      range: "bytes=999-",
      ifRange: null,
    });
    expect(no).toMatchObject({
      status: 416,
      headers: { "Content-Range": "bytes */256", "Content-Length": "0" },
    });
    expect(
      serveTransferBytes(r, { method: "POST", range: null, ifRange: null }),
    ).toMatchObject({ status: 405, headers: { Allow: "GET, HEAD" } });
  });
  it("uses strong exact If-Range tags and explicitly asserted exact dates", async () => {
    const r = await resource(),
      get = (ifRange: string) =>
        serveTransferBytes(r, { method: "GET", range: "bytes=0-1", ifRange });
    expect(get(r.etag).status).toBe(206);
    for (const tag of ["W/" + r.etag, '"different"', "", r.lastModified!])
      expect(get(tag).status).toBe(200);
    r.dateStrong = true;
    expect(get(r.lastModified!).status).toBe(206);
    expect(get("Sun, 01 Nov 2026 12:00:01 GMT").status).toBe(200);
    expect(get("Sun, 01 Nov 2026 11:59:59 GMT").status).toBe(200);
    expect(get("2026-11-01T12:00:00Z").status).toBe(200);
    r.ranges = false;
    expect(get(r.etag)).toMatchObject({
      status: 200,
      headers: { "Accept-Ranges": "none" },
    });
  });
  it("serializes and parses multipart responses without decoding payload bytes", async () => {
    const r = await resource(),
      response = serveTransferBytes(r, {
        method: "GET",
        range: "bytes=250-255,0-3,100-101",
        ifRange: r.etag,
      });
    expect(response.status).toBe(206);
    expect(response.reason).toBe("multipart");
    expect(response.headers["Content-Range"]).toBeUndefined();
    const inspected = inspectTransferPacket(transferPacket(response));
    expect(inspected.multipart).toBe(true);
    expect(inspected.total).toBe(256);
    expect(inspected.parts.map((p) => [p.start, p.end, [...p.bytes]])).toEqual([
      [250, 255, [250, 251, 252, 253, 254, 255]],
      [0, 3, [0, 1, 2, 3]],
      [100, 101, [100, 101]],
    ]);
    expect(inspected.body).toEqual(response.body);
    expect(Number(response.headers["Content-Length"])).toBe(
      response.body.length,
    );
    const packet = transferPacket(response);
    packet.headers["Content-Type"] = packet.headers["Content-Type"].replace(
      /boundary=(.*)/,
      'boundary="$1"',
    );
    expect(inspectTransferPacket(packet).parts).toHaveLength(3);
  });
  it("chooses a collision-free boundary and coalesces a multi-range request into a single part", async () => {
    const r = await resource(),
      prefix = "rsswag_" + "0".repeat(32) + "_0";
    r.bytes = new TextEncoder().encode(prefix + "--payload" + prefix);
    r.etag = '"sha256-' + "0".repeat(64) + '"';
    const multi = serveTransferBytes(r, {
      method: "GET",
      range: "bytes=0-5,-5",
      ifRange: null,
    });
    expect(multi.headers["Content-Type"]).toContain("_1");
    expect(inspectTransferPacket(transferPacket(multi)).parts).toHaveLength(2);
    expect(
      serveTransferBytes(r, {
        method: "GET",
        range: "bytes=0-5,4-9",
        ifRange: null,
      }).reason,
    ).toBe("single");
  });
  it("validates content lengths, duplicate headers, coding and strict multipart framing atomically", async () => {
    const r = await resource(),
      single = transferPacket(
        serveTransferBytes(r, {
          method: "GET",
          range: "bytes=0-2",
          ifRange: null,
        }),
      ),
      multi = transferPacket(
        serveTransferBytes(r, {
          method: "GET",
          range: "bytes=0-2,9-11",
          ifRange: null,
        }),
      );
    for (const modify of [
      (p: typeof single) => {
        p.headers["Content-Length"] = "4";
      },
      (p) => {
        p.headers["content-type"] = p.headers["Content-Type"];
      },
      (p) => {
        p.headers["Content-Encoding"] = "gzip";
      },
      (p) => {
        p.headers["Content-Range"] = "bytes 0-3/256";
      },
      (p) => {
        p.headers["Content-Range"] = "bytes 0-2/2";
      },
      (p) => {
        p.headers.ETag = "bad\r\nheader";
      },
    ] as ((p: typeof single) => void)[]) {
      const p = structuredClone(single);
      modify(p);
      expect(() => inspectTransferPacket(p)).toThrow("packet");
    }
    const corrupted = structuredClone(multi),
      body = decodeTransferBytes(corrupted.base64);
    body[0] = 0;
    corrupted.base64 = encodeTransferBytes(body);
    expect(() => inspectTransferPacket(corrupted)).toThrow("packet");
    const wrongTotal = structuredClone(multi),
      source = new TextDecoder()
        .decode(decodeTransferBytes(wrongTotal.base64))
        .replace("9-11/256", "9-11/257");
    wrongTotal.base64 = encodeTransferBytes(new TextEncoder().encode(source));
    wrongTotal.headers["Content-Length"] = String(source.length);
    expect(() => inspectTransferPacket(wrongTotal)).toThrow("packet");
    const invalidHead = { ...single, method: "HEAD" };
    expect(() => inspectTransferPacket(invalidHead)).toThrow("packet");
    const invalidText = structuredClone(multi),
      invalidBytes = decodeTransferBytes(invalidText.base64);
    invalidBytes[invalidBytes.indexOf(67)] = 255;
    invalidText.base64 = encodeTransferBytes(invalidBytes);
    expect(() => inspectTransferPacket(invalidText)).toThrow("packet");
  });
  it("handles full/empty/HEAD/416 packets and refuses bytes in a HEAD response", async () => {
    const r = await resource();
    for (const q of [
      { method: "GET", range: null, ifRange: null },
      { method: "HEAD", range: "bytes=0-1", ifRange: null },
      { method: "GET", range: "bytes=999-", ifRange: null },
    ]) {
      const response = serveTransferBytes(r, q);
      expect(
        inspectTransferPacket(
          transferPacket(response, q.method as "GET" | "HEAD"),
        ).status,
      ).toBe(response.status);
    }
    const empty = await prepareTransferResource({
      ...newTransferResource(),
      base64: "",
    });
    const errorPacket = transferPacket(
      serveTransferBytes(r, {
        method: "GET",
        range: "bytes=999-",
        ifRange: null,
      }),
    );
    errorPacket.base64 = encodeTransferBytes(Uint8Array.of(0, 255, 1));
    errorPacket.headers["Content-Length"] = "3";
    expect([...inspectTransferPacket(errorPacket).body]).toEqual([0, 255, 1]);
    expect(
      inspectTransferPacket(
        transferPacket(
          serveTransferBytes(empty, {
            method: "GET",
            range: "bytes=-1",
            ifRange: null,
          }),
        ),
      ).total,
    ).toBe(0);
  });
  it("preserves every byte through canonical base64/hex and UTF-8 including BOM", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(decodeTransferBytes(encodeTransferBytes(bytes))).toEqual(bytes);
    expect(readTransferBytes("00 ff 0A", "hex")).toEqual(
      Uint8Array.of(0, 255, 10),
    );
    expect([...readTransferBytes("\uFEFFтест", "utf8").subarray(0, 3)]).toEqual(
      [239, 187, 191],
    );
    for (const s of ["/x==", "Zg=", "Zg", "AA_A", "!!!!"])
      expect(() => decodeTransferBytes(s)).toThrow();
    expect(() => readTransferBytes("abc", "hex")).toThrow("bytes");
    expect(() =>
      decodeTransferBytes(
        "A".repeat(4 * Math.ceil(MAX_TRANSFER_BYTES / 3) + 4),
      ),
    ).toThrow("limit");
    const large = Uint8Array.from({ length: 262144 }, (_, i) => i % 256);
    expect(decodeTransferBytes(encodeTransferBytes(large))).toEqual(large);
  });
});
