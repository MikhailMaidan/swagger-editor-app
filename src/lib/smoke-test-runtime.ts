// Kept as plain JavaScript so exported runners have no package dependencies.
export const SMOKE_TEST_RUNTIME = String.raw`
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const mediaType = (value) => value.split(";", 1)[0].trim().toLowerCase();
const matchesMedia = (documented, actual) => documented === actual ||
  (documented === "*/*" && Boolean(actual)) ||
  (documented.endsWith("/*") && actual.startsWith(documented.slice(0, -1)));

function checkStringMap(value) {
  return record(value) && Object.entries(value).every(([key, entry]) =>
    key.length > 0 && typeof entry === "string" && !/[\r\n]/.test(key + entry));
}

function prepareRequest(operation, config) {
  const settings = own(config.operations || {}, operation.key) ? config.operations[operation.key] : {};
  if (!record(settings)) throw new Error("invalid-operation-config");
  if (settings.enabled === false) return null;
  if (settings.enabled !== undefined && settings.enabled !== true) throw new Error("invalid-operation-config");
  const parameters = settings.parameters === undefined ? {} : settings.parameters;
  if (!record(parameters)) throw new Error("invalid-parameters");
  for (const location of ["path", "query", "header", "cookie"]) {
    if (parameters[location] !== undefined && !checkStringMap(parameters[location])) throw new Error("invalid-parameters");
  }
  const headers = new Headers(config.headers || {});
  for (const [key, value] of Object.entries(parameters.header || {})) {
    if (value || !headers.has(key)) headers.set(key, value);
  }
  const cookie = Object.entries(parameters.cookie || {}).map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value)).join("; ");
  if (cookie) headers.set("cookie", [headers.get("cookie"), cookie].filter(Boolean).join("; "));
  for (const parameter of operation.parameters) {
    if (!parameter.required && parameter.location !== "path") continue;
    const values = parameters[parameter.location] || {};
    const present = parameter.location === "header" ? Boolean(headers.get(parameter.name)) :
      own(values, parameter.name) && values[parameter.name] !== "";
    if (!present) throw new Error("missing-required-parameter");
  }
  const pathValues = parameters.path || {};
  const path = operation.path.replace(/\{([^{}]+)\}/g, (_, key) => {
    if (!own(pathValues, key) || !pathValues[key] || [".", ".."].includes(pathValues[key])) throw new Error("missing-path-parameter");
    return encodeURIComponent(pathValues[key]);
  });
  if (!path.startsWith("/") || /[?#\\{}]/.test(path) || path.split("/").some((part) => [".", ".."].includes(decodeURIComponent(part)))) throw new Error("invalid-path");
  const url = new URL(config.baseUrl);
  url.pathname = url.pathname.replace(/\/$/, "") + path;
  for (const [key, value] of Object.entries(parameters.query || {})) url.searchParams.set(key, value);
  return { url, headers };
}

async function readBody(response, signal) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("request-timeout");
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error("body-too-large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function checkResponse(operation, response, body, elapsedMs) {
  const checks = [];
  const add = (code, passed) => checks.push({ code, passed });
  add("successful-status", response.status >= 200 && response.status < 300);
  const documented = operation.responses.find((entry) => entry.status === String(response.status)) ||
    operation.responses.find((entry) => entry.status.toUpperCase() === String(response.status)[0] + "XX") ||
    operation.responses.find((entry) => entry.status === "default");
  add("documented-status", Boolean(documented));
  if (definition.maxDurationMs !== null) add("response-time", elapsedMs <= definition.maxDurationMs);
  if (operation.method === "HEAD" || response.status === 204 || response.status === 205) return checks;
  if (!documented) return checks;
  const actualType = mediaType(response.headers.get("content-type") || "");
  const content = documented.content.find((entry) => entry.mediaType === actualType) ||
    documented.content.find((entry) => matchesMedia(entry.mediaType, actualType));
  if (documented.content.length) add("documented-content-type", Boolean(content));
  if (!definition.checkJson || !content || !(actualType === "application/json" || actualType.endsWith("+json"))) return checks;
  let parsed;
  try { parsed = JSON.parse(body); } catch { add("valid-json", false); return checks; }
  add("valid-json", true);
  const type = parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
  if (["object", "array", "string", "number", "integer", "boolean", "null"].includes(content.type)) {
    add("json-top-level-type", content.type === "integer" ? Number.isInteger(parsed) : type === content.type);
  }
  if (content.required.length) add("json-required-properties", record(parsed) && content.required.every((key) => own(parsed, key)));
  return checks;
}

export async function runSmokeTests(config = {}, fetchImpl = globalThis.fetch) {
  const results = [];
  const report = { version: 1, kind: "rsswag-smoke-test-report", results, summary: { total: definition.operations.length, passed: 0, failed: 0, blocked: 0, skipped: 0 }, ok: false };
  let timeoutMs;
  try {
    if (!record(config) || !checkStringMap(config.headers || {}) || !record(config.operations || {})) throw new Error();
    const base = new URL(config.baseUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
    timeoutMs = config.timeoutMs === undefined ? definition.timeoutMs : config.timeoutMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new Error();
    // Reject misspelled operation keys before issuing any requests.
    if (Object.keys(config.operations || {}).some((key) => !definition.operations.some((operation) => operation.key === key))) throw new Error();
  } catch {
    report.error = "invalid-config";
    return report;
  }
  for (const operation of definition.operations) {
    const result = { method: operation.method, path: operation.path, outcome: "blocked", checks: [] };
    results.push(result);
    let request;
    try {
      request = prepareRequest(operation, config);
    } catch (error) {
      const allowed = ["invalid-operation-config", "invalid-parameters", "missing-required-parameter", "missing-path-parameter", "invalid-path"];
      result.reason = allowed.includes(error.message) ? error.message : "invalid-parameters";
      report.summary.blocked++;
      continue;
    }
    if (!request) { result.outcome = "skipped"; report.summary.skipped++; continue; }
    if (!["GET", "HEAD"].includes(operation.method)) {
      result.reason = "unsupported-method"; report.summary.blocked++; continue;
    }
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("request-timeout")); }, timeoutMs);
    });
    const started = performance.now();
    try {
      const task = (async () => {
        const response = await fetchImpl(request.url, { method: operation.method, headers: request.headers, redirect: "manual", signal: controller.signal });
        const body = await readBody(response, controller.signal);
        return { response, body };
      })();
      const { response, body } = await Promise.race([task, timeout]);
      result.durationMs = Math.round(performance.now() - started);
      result.status = response.status;
      result.checks = checkResponse(operation, response, body, result.durationMs);
      result.outcome = result.checks.every((check) => check.passed) ? "passed" : "failed";
    } catch (error) {
      result.outcome = "failed";
      result.reason = controller.signal.aborted ? "request-timeout" : error.message === "body-too-large" ? "body-too-large" : "request-failed";
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    report.summary[result.outcome]++;
  }
  report.ok = report.summary.passed > 0 && report.summary.failed === 0 && report.summary.blocked === 0;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = process.env.RSSWAG_SMOKE_CONFIG ? JSON.parse(await readFile(process.env.RSSWAG_SMOKE_CONFIG, "utf8")) : {};
    if (!record(config)) throw new Error();
    if (process.env.RSSWAG_BASE_URL) config.baseUrl = process.env.RSSWAG_BASE_URL;
    if (process.env.RSSWAG_HEADERS_JSON) {
      const headers = JSON.parse(process.env.RSSWAG_HEADERS_JSON);
      if (!checkStringMap(headers) || !checkStringMap(config.headers || {})) throw new Error();
      const merged = new Headers(config.headers || {});
      for (const [key, value] of Object.entries(headers)) merged.set(key, value);
      config.headers = Object.fromEntries(merged.entries());
    }
    const report = await runSmokeTests(config);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch {
    console.log(JSON.stringify({ version: 1, kind: "rsswag-smoke-test-report", ok: false, error: "invalid-config" }));
    process.exitCode = 1;
  }
}
`;
