import {
  DecisionError,
  dtObject,
  normalizeDtProject,
  type DTProject,
} from "./decision-model";
import { createDecisionEvaluator } from "./decision-engine";

class DTBodyError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
async function readDtRequest(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > 16384) {
    void request.body?.cancel().catch(() => {});
    throw new DTBodyError(413, "body-limit");
  }
  if (request.bodyUsed || request.body?.locked)
    throw new DTBodyError(400, "invalid-body");
  const reader = request.body?.getReader();
  if (!reader) throw new DTBodyError(400, "body-required");
  let reason: DTBodyError | null = null,
    size = 0,
    text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const stop = (error: DTBodyError) => {
    reason ??= error;
    void reader.cancel().catch(() => {});
  };
  const abort = () => stop(new DTBodyError(400, "request-aborted")),
    timer = setTimeout(() => stop(new DTBodyError(408, "body-timeout")), 5000);
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    if (request.signal.aborted) abort();
    while (true) {
      const chunk = await reader.read();
      if (reason) throw reason;
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16384) {
        stop(new DTBodyError(413, "body-limit"));
        throw reason;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    try {
      return JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
      throw new DTBodyError(400, "invalid-json");
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof DTBodyError) throw error;
    throw new DTBodyError(400, "invalid-body");
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    try {
      reader.releaseLock();
    } catch {}
  }
}
export function createDecisionHandler(
  source: DTProject,
): (request: Request) => Promise<Response> {
  const project = normalizeDtProject(source),
    evaluate = createDecisionEvaluator(project);
  const reply = (
    status: number,
    value: unknown,
    headers: Record<string, string> = {},
  ) =>
    new Response(JSON.stringify(value), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...headers,
      },
    });
  return async (request) => {
    if (new URL(request.url).pathname !== "/decide")
      return reply(404, { error: "route" });
    if (request.method !== "POST")
      return reply(405, { error: "method" }, { allow: "POST" });
    if (
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return reply(415, { error: "content-type" });
    try {
      const body = await readDtRequest(request);
      if (
        !dtObject(body) ||
        typeof body.decisionId !== "string" ||
        !Object.hasOwn(body, "context") ||
        Object.keys(body).some(
          (key) => key !== "decisionId" && key !== "context",
        )
      )
        return reply(400, { error: "envelope" });
      if (!project.decisions.some((d) => d.id === body.decisionId))
        return reply(404, { error: "decision" });
      const { result } = evaluate(body.decisionId, body.context);
      return reply(200, {
        decisionId: result.decisionId,
        status: result.status,
        output: result.output,
        matched: result.matched,
        selected: result.selected,
      });
    } catch (error) {
      if (error instanceof DTBodyError)
        return reply(error.status, { error: error.code });
      if (error instanceof DecisionError && error.code === "context")
        return reply(400, { error: "context" });
      return reply(500, { error: "evaluation" });
    }
  };
}
