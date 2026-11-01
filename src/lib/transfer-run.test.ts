import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  createTransferAssembly,
  runTransferScenario,
  runTransferSuite,
  transferRunReport,
} from "./transfer-run";
import { demoTransferProject } from "./transfer-studio";
import {
  MAX_TRANSFER_PROJECT,
  decodeTransferBytes,
  emptyTransferProject,
  encodeTransferBytes,
  normalizeTransferCheckpoint,
  normalizeTransferProject,
  parseTransferProject,
  serializeTransferProject,
} from "./transfer-project";
import { prepareTransferResource, serveTransferBytes } from "./transfer-engine";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("resumable transfer state and fault rehearsals", () => {
  it("passes all eight demo expectations with explicit recovery/version/integrity outcomes", async () => {
    const p = demoTransferProject(),
      runs = await runTransferSuite(p);
    expect(runs).toHaveLength(8);
    expect(runs.every((r) => r.checked && r.passed)).toBe(true);
    const get = (id: string) => runs.find((r) => r.scenarioId === id)!;
    expect(get("normal")).toMatchObject({
      outcome: "complete",
      attempts: 8,
      covered: 1024,
      rejected: 0,
    });
    expect(get("recovery")).toMatchObject({
      outcome: "complete",
      attempts: 10,
      rejected: 2,
    });
    expect(get("revision")).toMatchObject({
      outcome: "complete",
      attempts: 3,
      restarts: 1,
      total: 1200,
      fullResponses: 1,
    });
    expect(get("corruption")).toMatchObject({
      outcome: "integrity-failed",
      covered: 1024,
      rejected: 0,
    });
    expect(get("budget")).toMatchObject({
      outcome: "exhausted",
      covered: 384,
      attempts: 3,
    });
    expect(get("ignored")).toMatchObject({
      outcome: "complete",
      attempts: 2,
      wireBytes: 1152,
      fullResponses: 1,
    });
    expect(get("mismatch").rejected).toBe(2);
    expect(get("empty-case")).toMatchObject({
      outcome: "complete",
      attempts: 0,
      total: 0,
    });
    expect(runs.every((r) => r.checkpoint === null && r.output === null)).toBe(
      true,
    );
  });
  it("retains exact verified bytes, resumes gaps and resets a checkpoint from another revision", async () => {
    const p = demoTransferProject(),
      partial = await runTransferScenario(p, "budget"),
      resumed = await runTransferScenario(p, "normal", {
        checkpoint: partial.checkpoint!,
      });
    expect(partial.output).toBeNull();
    expect(partial.checkpoint!.segments).toHaveLength(1);
    expect(resumed).toMatchObject({
      outcome: "complete",
      attempts: 5,
      resumed: true,
      restarts: 0,
    });
    expect(resumed.journal[0].requested.start).toBe(384);
    expect(resumed.output).toEqual(decodeTransferBytes(p.resources[0].base64));
    p.scenarios[0].resourceId = "replacement";
    const changed = await runTransferScenario(p, "normal", {
      checkpoint: partial.checkpoint!,
    });
    expect(changed.restarts).toBe(1);
    expect(changed.output).toEqual(decodeTransferBytes(p.resources[1].base64));
    const corrupted = structuredClone(resumed.checkpoint!);
    corrupted.segments[0].base64 = encodeTransferBytes(new Uint8Array(1024));
    const detected = await runTransferScenario(
      demoTransferProject(),
      "normal",
      { checkpoint: corrupted },
    );
    expect(detected).toMatchObject({
      outcome: "integrity-failed",
      attempts: 0,
      output: null,
    });
  });
  it("never overwrites existing intervals and rejects invalid responses without mutating state", async () => {
    const r = await prepareTransferResource(demoTransferProject().resources[0]),
      assembly = createTransferAssembly(r.etag, r.bytes.length),
      requested = { start: 128, end: 255 };
    expect(
      assembly.accept(
        serveTransferBytes(r, {
          method: "GET",
          range: "bytes=128-255",
          ifRange: r.etag,
        }),
        requested,
      ).accepted,
    ).toBe(true);
    const before = assembly.checkpoint();
    expect(assembly.next(256)).toEqual({ start: 0, end: 127 });
    const response = serveTransferBytes(r, {
      method: "GET",
      range: "bytes=0-127",
      ifRange: r.etag,
    });
    response.headers.ETag = '"wrong"';
    expect(assembly.accept(response, { start: 0, end: 127 }).accepted).toBe(
      false,
    );
    expect(assembly.checkpoint()).toEqual(before);
    expect(
      assembly.accept(
        serveTransferBytes(r, {
          method: "GET",
          range: "bytes=128-255",
          ifRange: r.etag,
        }),
        requested,
      ).accepted,
    ).toBe(false);
    expect(assembly.checkpoint()).toEqual(before);
    const snapshot = assembly.checkpoint();
    snapshot.segments[0].base64 = "";
    expect(assembly.covered()).toBe(128);
    expect(() => assembly.bytes()).toThrow("checkpoint");
  });
  it("validates checkpoint identity, dense intervals, bounds and overlap with atomic normalization", async () => {
    const c = (await runTransferScenario(demoTransferProject(), "budget"))
      .checkpoint!;
    for (const modify of [
      (v: typeof c) => {
        v.etag = "W/" + v.etag;
      },
      (v) => {
        v.total = -1;
      },
      (v) => {
        v.segments.push(v.segments[0]);
      },
      (v) => {
        v.segments[0].start = 1024;
      },
      (v) => {
        v.segments = new Array(1);
      },
    ] as ((v: typeof c) => void)[]) {
      const copy = structuredClone(c);
      modify(copy);
      expect(() => normalizeTransferCheckpoint(copy)).toThrow();
    }
    expect(normalizeTransferCheckpoint({ ...c, runtime: "ignored" })).toEqual(
      c,
    );
  });
  it("keeps saved scenarios independent and verifies bounded expectation failures and unchecked outcomes", async () => {
    const p = demoTransferProject();
    p.scenarios[1].expect!.maxRejected = 0;
    expect((await runTransferScenario(p, "recovery")).passed).toBe(false);
    p.scenarios[0].expect = null;
    expect(await runTransferScenario(p, "normal")).toMatchObject({
      checked: false,
      passed: false,
    });
    expect((await runTransferScenario(p, "revision")).output).toEqual(
      decodeTransferBytes(p.resources[1].base64),
    );
    expect(p.resources[0].base64).toBe(
      demoTransferProject().resources[0].base64,
    );
  });
  it("snapshots input, checks cancellation during progress/digest and performs no I/O", async () => {
    const p = demoTransferProject(),
      fetcher = vi.fn(),
      storage = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetcher);
    const promise = runTransferScenario(p, "normal");
    p.resources[0].base64 = "";
    expect((await promise).covered).toBe(1024);
    let cancelled = false;
    await expect(
      runTransferSuite(
        demoTransferProject(),
        () => cancelled,
        () => {
          cancelled = true;
        },
      ),
    ).rejects.toThrow("cancelled");
    cancelled = false;
    await expect(
      runTransferScenario(demoTransferProject(), "normal", {
        cancelled: () => cancelled,
        progress: () => {
          cancelled = true;
        },
      }),
    ).rejects.toThrow("cancelled");
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
  it("round trips portable definitions while rejecting references, noncanonical bytes and invalid metadata", () => {
    const p = emptyTransferProject();
    expect(parseTransferProject(serializeTransferProject({ ...p }))).toEqual(p);
    expect(
      parseTransferProject(
        JSON.stringify({
          ...p,
          results: ["ignored"],
          runtime: { bytes: "private" },
        }),
      ),
    ).toEqual(p);
    for (const modify of [
      (v: typeof p) => {
        v.resources = [];
      },
      (v) => {
        v.resources[0].contentType = "text/html\r\nX: y";
      },
      (v) => {
        v.resources[0].base64 = "/x==";
      },
      (v) => {
        v.resources[0].lastModified = "2026-11-01";
      },
      (v) => {
        v.scenarios[0].resourceId = "missing";
      },
      (v) => {
        v.scenarios[0].chunkSize = 0;
      },
      (v) => {
        v.scenarios[0].faults = [
          { at: 1, kind: "drop" },
          { at: 1, kind: "corrupt" },
        ];
      },
      (v) => {
        v.scenarios.push(v.scenarios[0]);
      },
      (v) => {
        v.scenarios = new Array(1);
      },
    ] as ((v: typeof p) => void)[]) {
      const copy = structuredClone(p);
      modify(copy);
      expect(() => normalizeTransferProject(copy)).toThrow();
    }
    expect(() =>
      parseTransferProject(" ".repeat(MAX_TRANSFER_PROJECT + 1)),
    ).toThrow("limit");
    p.scenarios = [];
    expect(normalizeTransferProject(p).scenarios).toEqual([]);
  });
  it("omits bytes, validators, resource identity and captured headers from both report modes", async () => {
    const runs = await runTransferSuite(demoTransferProject());
    for (const details of [false, true]) {
      const report = transferRunReport(runs, details),
        s = JSON.stringify(report);
      expect(s).not.toMatch(
        /sha256-|"base64"|ETag|Content-|"resourceId"|"checkpoint"|"output"/,
      );
      expect(report.runs[0].journal !== undefined).toBe(details);
    }
  });
});
