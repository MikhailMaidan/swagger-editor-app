import {
  CacheError,
  cacheHeaders,
  cacheObject,
  cacheText,
  type CacheHeaders,
} from "./http-cache";
import {
  CACHE_METHODS,
  MAX_CACHE_BODY_BYTES,
  MAX_CACHE_PROJECT_BYTES,
  MAX_CACHE_STEPS,
  defaultCacheBudgets,
  emptyCacheProject,
  normalizeCacheProject,
  type CacheMethod,
  type CacheProject,
  type CacheStep,
} from "./http-cache-project";
import { getByteSize } from "./text-encoding";

function harHeaders(v: unknown): CacheHeaders {
  if (!Array.isArray(v) || v.length > 80) throw new CacheError("har");
  const combined = new Map<string, string>();
  for (const field of v) {
    if (
      !cacheObject(field) ||
      !cacheText(field.name, 128) ||
      !cacheText(field.value, 8192)
    )
      throw new CacheError("har");
    // HTTP/2 pseudo-fields are represented by the HAR URL and method instead.
    if (field.name.startsWith(":")) continue;
    const key = field.name.toLowerCase();
    combined.set(
      key,
      combined.has(key) ? `${combined.get(key)}, ${field.value}` : field.value,
    );
  }
  return cacheHeaders(Object.fromEntries(combined));
}
export function cacheProjectFromHar(source: string): {
  project: CacheProject;
  skipped: number;
  missingBodies: number;
} {
  if (getByteSize(source) > MAX_CACHE_PROJECT_BYTES)
    throw new CacheError("limit");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new CacheError("json");
  }
  if (
    !cacheObject(value) ||
    !cacheObject(value.log) ||
    !Array.isArray(value.log.entries) ||
    value.log.entries.length > 1000
  )
    throw new CacheError("har");
  let skipped = 0,
    missingBodies = 0;
  const selected: { time: number; step: CacheStep }[] = [];
  for (const entry of value.log.entries) {
    if (
      !cacheObject(entry) ||
      !cacheObject(entry.request) ||
      !cacheObject(entry.response)
    )
      throw new CacheError("har");
    const request = entry.request,
      response = entry.response;
    if (!CACHE_METHODS.includes(request.method as CacheMethod)) {
      skipped++;
      continue;
    }
    if (selected.length >= MAX_CACHE_STEPS) throw new CacheError("limit");
    if (
      !cacheText(entry.startedDateTime, 80) ||
      !Number.isFinite(Date.parse(entry.startedDateTime)) ||
      typeof entry.time !== "number" ||
      !Number.isFinite(entry.time) ||
      entry.time < 0 ||
      entry.time > 60000 ||
      !Number.isInteger(response.status) ||
      (response.status as number) < 0
    )
      throw new CacheError("har");
    let body = "";
    if (response.status !== 0) {
      if (!cacheObject(response.content)) throw new CacheError("har");
      if (
        request.method !== "HEAD" &&
        ![204, 205, 304].includes(response.status as number)
      ) {
        if (response.content.text === undefined) missingBodies++;
        else if (!cacheText(response.content.text, MAX_CACHE_BODY_BYTES * 2))
          throw new CacheError("limit");
        else if (response.content.encoding === "base64") {
          try {
            const binary = atob(response.content.text);
            const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
            body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            throw new CacheError("har");
          }
        } else if (response.content.encoding === undefined)
          body = response.content.text;
        else throw new CacheError("har");
      }
    }
    const headers = harHeaders(request.headers),
      responseHeaders = harHeaders(response.headers);
    // The body is decoded text, not the encoded entity or transfer framing.
    delete responseHeaders["content-encoding"];
    delete responseHeaders["content-length"];
    selected.push({
      time: Date.parse(entry.startedDateTime),
      step: {
        id: `har-${selected.length + 1}`,
        name: `HAR request ${selected.length + 1}`,
        atMs: 0,
        method: request.method as CacheMethod,
        url: String(request.url),
        headers,
        origin:
          response.status === 0
            ? { kind: "network-error", delayMs: Math.round(entry.time) }
            : {
                kind: "response",
                status: response.status as number,
                headers: responseHeaders,
                body,
                delayMs: Math.round(entry.time),
              },
        expect: {},
      },
    });
  }
  if (!selected.length) throw new CacheError("har");
  selected.sort((a, b) => a.time - b.time);
  const first = selected[0].time,
    project = emptyCacheProject();
  project.name = "HAR cache experiment";
  project.startTime = new Date(first).toISOString();
  project.scenarios = [
    {
      id: "har-sequence",
      name: "Imported HAR sequence",
      budgets: defaultCacheBudgets(),
      steps: selected.map(({ time, step }) => ({
        ...step,
        atMs: time - first,
      })),
    },
  ];
  return { project: normalizeCacheProject(project), skipped, missingBodies };
}
