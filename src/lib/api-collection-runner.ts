import {
  CollectionError,
  collectionError,
  collectionNextUrl,
  collectionStartUrl,
  collectionUrlKey,
  collectionValue,
  normalizeCollectionFixture,
  normalizeCollectionPlan,
  parseCollectionHeaders,
  parseCollectionJson,
  MAX_COLLECTION_PAGE_BYTES,
  MAX_COLLECTION_FIXTURES,
  type CollectionFixture,
  type CollectionIssue,
  type CollectionPlan,
} from "./api-collection";
import type { JsonValue } from "./api-transform";
import { evaluateResponseAssertions } from "./response-assertions";
import { getByteSize } from "./text-encoding";

export type CollectionPage = {
  index: number;
  url: string;
  status: number | null;
  bytes: number;
  received: number;
  added: number;
  duplicates: number;
  durationMs: number;
  accepted: boolean;
  issue?: CollectionIssue;
  body?: string;
  headers: Record<string, string>;
};
export type CollectionCheck = {
  type: "complete" | "count" | "duplicates" | "record";
  index?: number;
  passed: boolean;
  checked: number;
  failed: number;
};
export type CollectionRun = {
  planId: string;
  name: string;
  mode: "offline" | "live";
  reason: "complete" | CollectionIssue;
  passed: boolean;
  pages: CollectionPage[];
  records: JsonValue[];
  received: number;
  duplicates: number;
  bytes: number;
  elapsedMs: number;
  checks: CollectionCheck[];
};
export type CollectionRunOptions = {
  mode: "offline" | "live";
  fixtures?: CollectionFixture[];
  headers?: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  onPage?: (page: CollectionPage, count: number) => void;
};

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(new CollectionError("cancelled"));
    };
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
const cancelBody = (body: ReadableStream<Uint8Array> | null) => {
  try {
    void body?.cancel().catch(() => {});
  } catch {}
};
async function responseText(
  response: Response,
  remaining: number,
  signal: AbortSignal,
  onBytes: (count: number) => void,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let bytes = 0,
    complete = false;
  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) break;
      if (
        !ArrayBuffer.isView(value) ||
        Object.prototype.toString.call(value) !== "[object Uint8Array]"
      )
        throw new CollectionError("network");
      bytes += value.byteLength;
      onBytes(bytes);
      if (bytes > remaining || bytes > MAX_COLLECTION_PAGE_BYTES)
        throw new CollectionError("max-bytes");
      try {
        parts.push(decoder.decode(value, { stream: true }));
      } catch {
        throw new CollectionError("json");
      }
    }
    try {
      parts.push(decoder.decode());
    } catch {
      throw new CollectionError("json");
    }
    complete = true;
    return parts.join("");
  } finally {
    if (!complete) {
      try {
        void reader.cancel().catch(() => {});
      } catch {}
    }
    try {
      reader.releaseLock();
    } catch {}
  }
}
const elapsed = (start: number) =>
  Math.max(0, Math.round(performance.now() - start));
export async function runCollection(
  source: CollectionPlan,
  options: CollectionRunOptions,
): Promise<CollectionRun> {
  const plan = normalizeCollectionPlan(source),
    headers =
      options.mode === "live"
        ? parseCollectionHeaders(options.headers ?? "{}")
        : {};
  const fixtures = new Map<string, CollectionFixture>();
  if (options.mode === "offline")
    for (const raw of options.fixtures ?? []) {
      const fixture = normalizeCollectionFixture(raw),
        key = collectionUrlKey(fixture.url);
      if (fixtures.has(key)) throw new CollectionError("fixture");
      fixtures.set(key, fixture);
    }
  const start = performance.now(),
    controller = new AbortController(),
    signal = controller.signal;
  let reason: CollectionRun["reason"] | null = null;
  const stop = (r: CollectionRun["reason"]) => {
    if (reason === null) {
      reason = r;
      controller.abort();
    }
  };
  const abort = () => stop("cancelled");
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => stop("timeout"), plan.durationMs);
  const records: JsonValue[] = [],
    pages: CollectionPage[] = [],
    seen = new Set<string>(),
    identities = new Map<string, number>();
  let received = 0,
    duplicates = 0,
    bytes = 0,
    url: string | null = collectionStartUrl(plan);
  try {
    while (url !== null && reason === null) {
      if (elapsed(start) >= plan.durationMs) {
        stop("timeout");
        break;
      }
      const key = collectionUrlKey(url);
      if (seen.has(key)) {
        stop("loop");
        break;
      }
      if (pages.length >= plan.maxPages) {
        stop("max-pages");
        break;
      }
      if (received >= plan.maxRecords) {
        stop("max-records");
        break;
      }
      if (bytes >= plan.maxBytes) {
        stop("max-bytes");
        break;
      }
      seen.add(key);
      if (pages.length && plan.intervalMs) {
        let delay: ReturnType<typeof setTimeout> | undefined;
        try {
          await abortable(
            new Promise<void>((resolve) => {
              delay = setTimeout(resolve, plan.intervalMs);
            }),
            signal,
          );
        } finally {
          clearTimeout(delay);
        }
      }
      if (reason !== null || elapsed(start) >= plan.durationMs) {
        stop("timeout");
        break;
      }
      const pageStart = performance.now(),
        page: CollectionPage = {
          index: pages.length + 1,
          url,
          status: null,
          bytes: 0,
          received: 0,
          added: 0,
          duplicates: 0,
          durationMs: 0,
          accepted: false,
          headers: {},
        };
      let timeout: ReturnType<typeof setTimeout> | undefined,
        response: Response | null = null;
      try {
        if (options.mode === "offline") {
          const fixture = fixtures.get(key);
          if (!fixture) throw new CollectionError("fixture");
          page.status = fixture.status;
          page.headers = { ...fixture.headers };
          page.body = fixture.body;
          page.bytes = getByteSize(page.body);
          if (
            page.bytes > plan.maxBytes - bytes ||
            page.bytes > MAX_COLLECTION_PAGE_BYTES
          )
            throw new CollectionError("max-bytes");
        } else {
          timeout = setTimeout(() => stop("timeout"), plan.requestTimeoutMs);
          const requestHeaders = new Headers(headers);
          if (!requestHeaders.has("Accept"))
            requestHeaders.set("Accept", "application/json");
          response = await abortable<Response>(
            Promise.resolve().then(async () => {
              const fetched = await (options.fetcher ?? fetch)(url!, {
                method: "GET",
                headers: requestHeaders,
                credentials: "omit",
                redirect: "error",
                cache: "no-store",
                mode: "cors",
                signal,
              });
              if (signal.aborted) {
                cancelBody(fetched.body);
                throw new CollectionError("cancelled");
              }
              return fetched;
            }),
            signal,
          );
          if (response.redirected || response.type === "opaqueredirect")
            throw new CollectionError("origin");
          page.status = response.status;
          page.headers = Object.fromEntries(
            ["content-type", "link"].flatMap((name) =>
              response!.headers.has(name)
                ? [[name, response!.headers.get(name)!]]
                : [],
            ),
          );
          if (page.status < 200 || page.status > 299)
            throw new CollectionError("status");
          const mime = (page.headers["content-type"] ?? "")
            .split(";", 1)[0]
            .trim()
            .toLowerCase();
          if (
            mime !== "application/json" &&
            !/^application\/[\w!#$&^.+-]+\+json$/.test(mime)
          )
            throw new CollectionError("content-type");
          page.body = await responseText(
            response,
            plan.maxBytes - bytes,
            signal,
            (count) => {
              page.bytes = count;
            },
          );
        }
        if (signal.aborted) throw new CollectionError("cancelled");
        if (
          elapsed(pageStart) >= plan.requestTimeoutMs ||
          elapsed(start) >= plan.durationMs
        )
          throw new CollectionError("timeout");
        if (page.status === null || page.status < 200 || page.status > 299)
          throw new CollectionError("status");
        const mime = (page.headers["content-type"] ?? "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (
          mime !== "application/json" &&
          !/^application\/[\w!#$&^.+-]+\+json$/.test(mime)
        )
          throw new CollectionError("content-type");
        const body = parseCollectionJson(page.body ?? ""),
          items = collectionValue(body, plan.itemsPointer);
        if (!Array.isArray(items)) throw new CollectionError("items");
        page.received = items.length;
        if (received + items.length > plan.maxRecords)
          throw new CollectionError("max-records");
        // A page commits atomically: an invalid identity or exceeded cap never leaves half a page.
        const nextRecords = records.slice(),
          nextIdentities = new Map(identities);
        let pageDuplicates = 0;
        for (const item of items) {
          if (plan.deduplicate === "none") {
            nextRecords.push(item);
            continue;
          }
          const identity = collectionValue(item, plan.identityPointer);
          if (
            identity === undefined ||
            (identity !== null && typeof identity === "object")
          )
            throw new CollectionError("identity");
          const id = JSON.stringify(identity),
            position = nextIdentities.get(id);
          if (position !== undefined) {
            pageDuplicates++;
            if (plan.deduplicate === "error")
              throw new CollectionError("duplicate");
            if (plan.deduplicate === "last") nextRecords[position] = item;
          } else {
            nextIdentities.set(id, nextRecords.length);
            nextRecords.push(item);
          }
        }
        page.added = nextRecords.length - records.length;
        page.duplicates = pageDuplicates;
        records.splice(0, records.length, ...nextRecords);
        identities.clear();
        nextIdentities.forEach((v, k) => identities.set(k, v));
        received += items.length;
        duplicates += pageDuplicates;
        page.accepted = true;
        url = collectionNextUrl(
          plan,
          page.url,
          body,
          page.headers,
          items.length,
          page.index,
        );
        if (url === null) reason = "complete";
      } catch (e) {
        const issue = reason ?? collectionError(e).code;
        if (issue !== "complete") page.issue = issue;
        if (reason === null) stop(collectionError(e).code);
      } finally {
        clearTimeout(timeout);
        if (response && page.body === undefined) cancelBody(response.body);
        bytes += page.bytes;
        page.durationMs = elapsed(pageStart);
        pages.push(page);
        options.onPage?.(
          { ...page, headers: { ...page.headers } },
          records.length,
        );
      }
      // Yield between pages for cancellation, painting, and deadline timers even with buffered responses.
      if (reason === null)
        await abortable(
          new Promise<void>((resolve) => setTimeout(resolve, 0)),
          signal,
        );
    }
  } catch (e) {
    if (reason === null) stop(collectionError(e).code);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
  const stopReason = reason ?? "complete";
  const checks: CollectionCheck[] = [
    {
      type: "complete",
      passed: stopReason === "complete",
      checked: 1,
      failed: stopReason === "complete" ? 0 : 1,
    },
    {
      type: "count",
      passed:
        records.length >= plan.minRecords &&
        records.length <= plan.expectedMaxRecords,
      checked: 1,
      failed:
        records.length >= plan.minRecords &&
        records.length <= plan.expectedMaxRecords
          ? 0
          : 1,
    },
    {
      type: "duplicates",
      passed: duplicates <= plan.maxDuplicates,
      checked: 1,
      failed: duplicates <= plan.maxDuplicates ? 0 : 1,
    },
  ];
  for (const [index, assertion] of plan.assertions.entries()) {
    let failed = 0;
    for (const item of records)
      if (
        evaluateResponseAssertions([assertion], {
          body: JSON.stringify(item),
          headers: {},
          status: "200",
          durationMs: 0,
          source: options.mode === "live" ? "live" : "mock",
        })[0].outcome !== "pass"
      )
        failed++;
    checks.push({
      type: "record",
      index,
      passed: records.length > 0 && !failed,
      checked: records.length,
      failed,
    });
  }
  return {
    planId: plan.id,
    name: plan.name,
    mode: options.mode,
    reason: stopReason,
    passed: checks.every((c) => c.passed),
    pages,
    records,
    received,
    duplicates,
    bytes,
    elapsedMs: elapsed(start),
    checks,
  };
}

export function collectionRunReport(
  runs: CollectionRun[],
  total = runs.length,
) {
  return {
    kind: "rsswag-collection-report",
    version: 1,
    complete:
      runs.length === total && runs.every((r) => r.reason !== "cancelled"),
    total,
    completed: runs.length,
    passed: runs.filter((r) => r.passed).length,
    failed: runs.filter((r) => !r.passed).length,
    runs: runs.map((r) => ({
      planId: r.planId,
      name: r.name,
      mode: r.mode,
      reason: r.reason,
      passed: r.passed,
      received: r.received,
      records: r.records.length,
      duplicates: r.duplicates,
      bytes: r.bytes,
      elapsedMs: r.elapsedMs,
      checks: r.checks.map((c) => ({ ...c })),
      pages: r.pages.map(
        ({
          index,
          status,
          bytes,
          received,
          added,
          duplicates,
          durationMs,
          accepted,
          issue,
        }) => ({
          index,
          status,
          bytes,
          received,
          added,
          duplicates,
          durationMs,
          accepted,
          ...(issue ? { issue } : {}),
        }),
      ),
    })),
  };
}
export function collectionFixturesFromRun(
  run: CollectionRun,
): CollectionFixture[] {
  const pages = run.pages.filter(
    (p) => p.body !== undefined && p.status !== null,
  );
  if (!pages.length || pages.length > MAX_COLLECTION_FIXTURES)
    throw new CollectionError("fixture");
  return pages.map((p, i) =>
    normalizeCollectionFixture({
      id: `captured-${i + 1}`,
      name: `Captured page ${i + 1}`,
      url: p.url,
      status: p.status,
      headers: p.headers,
      body: p.body,
    }),
  );
}
