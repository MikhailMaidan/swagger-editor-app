import {
  inspectTransferPacket,
  prepareTransferResource,
  serveTransferBytes,
  transferDigest,
  transferPacket,
  type ByteInterval,
  type PreparedTransferResource,
  type TransferResponse,
} from "./transfer-engine";
import {
  TransferError,
  decodeTransferBytes,
  encodeTransferBytes,
  normalizeTransferCheckpoint,
  normalizeTransferProject,
  transferTag,
  type TransferCheckpoint,
  type TransferOutcome,
  type TransferProject,
  type TransferScenario,
} from "./transfer-project";
type Segment = { start: number; bytes: Uint8Array };
export function createTransferAssembly(
  etag: string,
  total: number,
  checkpoint?: TransferCheckpoint,
) {
  let state: TransferCheckpoint = normalizeTransferCheckpoint(
    checkpoint ?? {
      kind: "rsswag-transfer-checkpoint",
      version: 1,
      etag,
      total,
      segments: [],
    },
  );
  let segments: Segment[] = state.segments.map((s) => ({
    start: s.start,
    bytes: decodeTransferBytes(s.base64),
  }));
  function reset(tag: string, length: number) {
    state = {
      kind: "rsswag-transfer-checkpoint",
      version: 1,
      etag: tag,
      total: length,
      segments: [],
    };
    segments = [];
  }
  const initialRestart = state.etag !== etag || state.total !== total;
  if (initialRestart) reset(etag, total);
  const covered = () => segments.reduce((n, s) => n + s.bytes.length, 0);
  function next(chunkSize: number): ByteInterval | null {
    let start = 0;
    for (const s of segments) {
      if (s.start > start)
        return {
          start,
          end: Math.min(start + chunkSize - 1, s.start - 1, state.total - 1),
        };
      start = s.start + s.bytes.length;
    }
    return start < state.total
      ? { start, end: Math.min(start + chunkSize - 1, state.total - 1) }
      : null;
  }
  function accept(
    response: TransferResponse,
    requested: ByteInterval,
  ): {
    accepted: boolean;
    restart: boolean;
    reason: "accepted" | "packet" | "validator" | "range";
  } {
    let inspected: ReturnType<typeof inspectTransferPacket>;
    try {
      inspected = inspectTransferPacket(transferPacket(response));
    } catch {
      return { accepted: false, restart: false, reason: "packet" };
    }
    const tag = inspected.headers.etag;
    if (!transferTag(tag))
      return { accepted: false, restart: false, reason: "validator" };
    if (inspected.status === 200) {
      const restart = tag !== state.etag || inspected.total !== state.total;
      reset(tag, inspected.total!);
      segments = inspected.body.length
        ? [{ start: 0, bytes: inspected.body.slice() }]
        : [];
      return { accepted: true, restart, reason: "accepted" };
    }
    if (
      inspected.status !== 206 ||
      inspected.multipart ||
      inspected.parts.length !== 1
    )
      return { accepted: false, restart: false, reason: "packet" };
    if (tag !== state.etag || inspected.total !== state.total)
      return { accepted: false, restart: false, reason: "validator" };
    const part = inspected.parts[0];
    if (part.start !== requested.start || part.end !== requested.end)
      return { accepted: false, restart: false, reason: "range" };
    // Do not overwrite already received bytes. This client requests only missing intervals.
    if (
      segments.some(
        (s) => part.start < s.start + s.bytes.length && part.end >= s.start,
      )
    )
      return { accepted: false, restart: false, reason: "range" };
    const all = [
        ...segments,
        { start: part.start, bytes: part.bytes.slice() },
      ].sort((a, b) => a.start - b.start),
      merged: Segment[] = [];
    for (const s of all) {
      const p = merged.at(-1);
      if (p && p.start + p.bytes.length === s.start) {
        const bytes = new Uint8Array(p.bytes.length + s.bytes.length);
        bytes.set(p.bytes);
        bytes.set(s.bytes, p.bytes.length);
        p.bytes = bytes;
      } else merged.push({ ...s });
    }
    segments = merged;
    return { accepted: true, restart: false, reason: "accepted" };
  }
  function checkpointValue(): TransferCheckpoint {
    return {
      ...state,
      segments: segments.map((s) => ({
        start: s.start,
        base64: encodeTransferBytes(s.bytes),
      })),
    };
  }
  function bytes(): Uint8Array {
    if (covered() !== state.total) throw new TransferError("checkpoint");
    const out = new Uint8Array(state.total);
    for (const s of segments) out.set(s.bytes, s.start);
    return out;
  }
  return {
    next,
    accept,
    covered,
    checkpoint: checkpointValue,
    bytes,
    initialRestart,
    metadata: () => ({ etag: state.etag, total: state.total }),
    intervals: () =>
      segments.map((s) => ({
        start: s.start,
        end: s.start + s.bytes.length - 1,
      })),
  };
}
export type TransferAttempt = {
  attempt: number;
  resourceId: string;
  requested: ByteInterval;
  status: number | null;
  fault: string | null;
  received: number;
  covered: number;
  total: number;
  accepted: boolean;
  restart: boolean;
  reason: string;
};
export type TransferRun = {
  scenarioId: string;
  scenarioName: string;
  outcome: TransferOutcome;
  checked: boolean;
  passed: boolean;
  resumed: boolean;
  attempts: number;
  rejected: number;
  restarts: number;
  fullResponses: number;
  wireBytes: number;
  covered: number;
  total: number;
  intervals: ByteInterval[];
  journal: TransferAttempt[];
  checkpoint: TransferCheckpoint | null;
  output: Uint8Array | null;
};
type RunOptions = {
  checkpoint?: TransferCheckpoint;
  retain?: boolean;
  cancelled?: () => boolean;
  progress?: (attempt: number, max: number) => void;
};
async function executeTransfer(
  scenario: TransferScenario,
  resources: Map<string, PreparedTransferResource>,
  options: RunOptions,
): Promise<TransferRun> {
  const first = resources.get(scenario.resourceId)!,
    assembly = createTransferAssembly(
      first.etag,
      first.bytes.length,
      options.checkpoint,
    ),
    journal: TransferAttempt[] = [];
  const cancelled = options.cancelled ?? (() => false),
    progress = options.progress;
  let rejected = 0,
    restarts = Number(assembly.initialRestart),
    wireBytes = 0,
    fullResponses = 0;
  for (let attempt = 1; attempt <= scenario.maxAttempts; attempt++) {
    if (cancelled()) throw new TransferError("cancelled");
    const requested = assembly.next(scenario.chunkSize);
    if (!requested) break;
    const resource = resources.get(
        scenario.replacementId && attempt >= scenario.switchAt
          ? scenario.replacementId
          : scenario.resourceId,
      )!,
      fault = scenario.faults.find((f) => f.at === attempt)?.kind ?? null;
    const response = serveTransferBytes(
      fault === "ignore-range" ? { ...resource, ranges: false } : resource,
      {
        method: "GET",
        range: `bytes=${requested.start}-${requested.end}`,
        ifRange: assembly.metadata().etag,
      },
    );
    let decision: { accepted: boolean; restart: boolean; reason: string } = {
      accepted: false,
      restart: false,
      reason: "transport",
    };
    if (fault !== "drop") {
      if (fault === "truncate")
        response.body = response.body.slice(
          0,
          Math.max(0, response.body.length - 1),
        );
      if (fault === "corrupt" && response.body.length) response.body[0] ^= 255;
      if (fault === "wrong-validator")
        response.headers.ETag = `"sha256-${"0".repeat(64)}"`;
      if (fault === "wrong-range" && response.status === 206)
        response.headers["Content-Range"] =
          `bytes ${requested.start + 1}-${requested.end + 1}/${resource.bytes.length}`;
      wireBytes += response.body.length;
      fullResponses += Number(response.status === 200);
      decision = assembly.accept(response, requested);
    }
    if (!decision.accepted) rejected++;
    if (decision.restart) restarts++;
    journal.push({
      attempt,
      resourceId: resource.id,
      requested,
      status: fault === "drop" ? null : response.status,
      fault,
      received: fault === "drop" ? 0 : response.body.length,
      covered: assembly.covered(),
      total: assembly.metadata().total,
      ...decision,
    });
    if (attempt % 5 === 0 || !assembly.next(scenario.chunkSize)) {
      progress?.(attempt, scenario.maxAttempts);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (cancelled()) throw new TransferError("cancelled");
  let outcome: TransferOutcome = "exhausted",
    output: Uint8Array | null = null;
  if (assembly.covered() === assembly.metadata().total) {
    const bytes = assembly.bytes(),
      tag = `"sha256-${await transferDigest(bytes)}"`;
    outcome =
      tag === assembly.metadata().etag ? "complete" : "integrity-failed";
    if (outcome === "complete" && options.retain !== false) output = bytes;
  }
  if (cancelled()) throw new TransferError("cancelled");
  const expected = scenario.expect;
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    outcome,
    checked: expected !== null,
    passed:
      expected !== null &&
      expected.outcome === outcome &&
      rejected <= expected.maxRejected &&
      restarts <= expected.maxRestarts,
    resumed: !!options.checkpoint,
    attempts: journal.length,
    rejected,
    restarts,
    fullResponses,
    wireBytes,
    covered: assembly.covered(),
    total: assembly.metadata().total,
    intervals: assembly.intervals(),
    journal,
    checkpoint: options.retain === false ? null : assembly.checkpoint(),
    output,
  };
}
export async function runTransferScenario(
  value: TransferProject,
  id: string,
  options: RunOptions = {},
): Promise<TransferRun> {
  const p = normalizeTransferProject(value),
    s = p.scenarios.find((s) => s.id === id);
  if (!s) throw new TransferError("project");
  const checkpoint = options.checkpoint
    ? normalizeTransferCheckpoint(options.checkpoint)
    : undefined;
  const resources = await Promise.all(p.resources.map(prepareTransferResource));
  return executeTransfer(s, new Map(resources.map((r) => [r.id, r])), {
    ...options,
    checkpoint,
  });
}
export async function runTransferSuite(
  value: TransferProject,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
): Promise<TransferRun[]> {
  const p = normalizeTransferProject(value),
    resources = await Promise.all(p.resources.map(prepareTransferResource)),
    map = new Map(resources.map((r) => [r.id, r])),
    runs: TransferRun[] = [];
  for (const s of p.scenarios) {
    if (cancelled()) throw new TransferError("cancelled");
    runs.push(await executeTransfer(s, map, { retain: false, cancelled }));
    progress?.(runs.length, p.scenarios.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (cancelled()) throw new TransferError("cancelled");
  return runs;
}
export function transferRunReport(runs: TransferRun[], details = false) {
  return {
    kind: "rsswag-transfer-report",
    version: 1,
    total: runs.length,
    checked: runs.filter((r) => r.checked).length,
    passed: runs.filter((r) => r.passed).length,
    runs: runs.map((r) => ({
      scenarioId: r.scenarioId,
      scenarioName: r.scenarioName,
      outcome: r.outcome,
      checked: r.checked,
      passed: r.passed,
      resumed: r.resumed,
      attempts: r.attempts,
      rejected: r.rejected,
      restarts: r.restarts,
      fullResponses: r.fullResponses,
      wireBytes: r.wireBytes,
      covered: r.covered,
      total: r.total,
      intervals: r.intervals,
      ...(details
        ? {
            journal: r.journal.map((a) => ({
              attempt: a.attempt,
              requested: a.requested,
              status: a.status,
              fault: a.fault,
              received: a.received,
              covered: a.covered,
              total: a.total,
              accepted: a.accepted,
              restart: a.restart,
              reason: a.reason,
            })),
          }
        : {}),
    })),
  };
}
