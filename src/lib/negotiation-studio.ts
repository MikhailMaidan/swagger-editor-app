import { parseOpenApiSchema } from "./openapi";
import { getByteSize } from "./text-encoding";
import {
  negotiateRepresentation,
  type NegotiationDecision,
  type NegotiationRequest,
  parseNegotiationMediaType,
} from "./negotiation-engine";
import {
  NegotiationError,
  emptyNegotiationProject,
  negotiationJson,
  negotiationObject,
  newNegotiationCase,
  newNegotiationVariant,
  normalizeNegotiationProject,
  type NegotiationCase,
  type NegotiationProject,
} from "./negotiation-project";
export type NegotiationRun = {
  policyId: string;
  policyName: string;
  caseId: string;
  caseName: string;
  checked: boolean;
  passed: boolean;
  decision: NegotiationDecision;
};
export async function runNegotiationMatrix(
  value: NegotiationProject,
  caseId?: string,
  cancelled = () => false,
  progress?: (done: number, total: number) => void,
): Promise<NegotiationRun[]> {
  const project = normalizeNegotiationProject(value),
    cases = caseId
      ? project.cases.filter((c) => c.id === caseId)
      : project.cases;
  if (caseId && !cases.length) throw new NegotiationError("project");
  const results: NegotiationRun[] = [];
  for (const c of cases)
    for (const p of project.policies) {
      if (cancelled()) throw new NegotiationError("cancelled");
      const decision = negotiateRepresentation(p, c.request),
        expected = Object.hasOwn(c.expect, p.id) ? c.expect[p.id] : undefined;
      results.push({
        policyId: p.id,
        policyName: p.name,
        caseId: c.id,
        caseName: c.name,
        checked: !!expected,
        passed:
          !!expected &&
          decision.status === expected.status &&
          decision.variantId === expected.variantId,
        decision,
      });
      if (
        results.length % 10 === 0 ||
        results.length === cases.length * project.policies.length
      ) {
        progress?.(results.length, cases.length * project.policies.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  if (cancelled()) throw new NegotiationError("cancelled");
  return results;
}
export function compareNegotiationRuns(
  runs: NegotiationRun[],
  baselineId: string,
  candidateId: string,
) {
  const rows = runs
    .filter((r) => r.policyId === baselineId)
    .map((b) => {
      const c = runs.find(
        (r) => r.caseId === b.caseId && r.policyId === candidateId,
      );
      if (!c) throw new NegotiationError("project");
      const representationChanged = [
        "Content-Type",
        "Content-Language",
        "Content-Encoding",
      ].some((k) => b.decision.headers[k] !== c.decision.headers[k]);
      const varyChanged = b.decision.headers.Vary !== c.decision.headers.Vary;
      return {
        caseId: b.caseId,
        caseName: b.caseName,
        baseline: {
          status: b.decision.status,
          variantId: b.decision.variantId,
        },
        candidate: {
          status: c.decision.status,
          variantId: c.decision.variantId,
        },
        representationChanged,
        varyChanged,
        changed:
          representationChanged ||
          varyChanged ||
          b.decision.status !== c.decision.status ||
          b.decision.variantId !== c.decision.variantId,
      };
    });
  return {
    baselineId,
    candidateId,
    changed: rows.filter((r) => r.changed).length,
    total: rows.length,
    rows,
  };
}
export function generateNegotiationCases(
  value: unknown,
  existingIds: string[] = [],
): NegotiationCase[] {
  if (!negotiationObject(value)) throw new NegotiationError("headers");
  const fields = ["accept", "language", "encoding"] as const;
  const dimensions = fields.map((f) => {
    const values = value[f];
    if (
      !Array.isArray(values) ||
      !values.length ||
      values.length > 12 ||
      values.some(
        (v) => v !== null && (typeof v !== "string" || getByteSize(v) > 8192),
      )
    )
      throw new NegotiationError("limit");
    for (let i = 0; i < values.length; i++)
      if (!Object.hasOwn(values, i)) throw new NegotiationError("headers");
    return [...new Set(values)] as (string | null)[];
  });
  if (dimensions.reduce((n, d) => n * d.length, 1) > 200)
    throw new NegotiationError("limit");
  const used = new Set(existingIds),
    cases: NegotiationCase[] = [];
  let next = 1;
  for (const accept of dimensions[0])
    for (const language of dimensions[1])
      for (const encoding of dimensions[2]) {
        while (used.has(`matrix-${next}`)) next++;
        const id = `matrix-${next++}`;
        used.add(id);
        cases.push({
          id,
          name: id,
          request: { accept, language, encoding },
          expect: {},
        });
      }
  return cases;
}
/** Retain only negotiation request fields; response status cannot establish a variant expectation. */
export function importNegotiationHar(
  source: string,
  existingIds: string[] = [],
): { cases: NegotiationCase[]; skipped: number } {
  let data: unknown;
  try {
    data = negotiationJson(source, 5 * 1024 * 1024);
  } catch (e) {
    if (e instanceof NegotiationError && e.code === "limit") throw e;
    throw new NegotiationError("har");
  }
  if (
    !negotiationObject(data) ||
    !negotiationObject(data.log) ||
    !Array.isArray(data.log.entries) ||
    data.log.entries.length > 5000
  )
    throw new NegotiationError("har");
  const cases: NegotiationCase[] = [],
    used = new Set(existingIds);
  let skipped = 0,
    next = 1;
  for (const entry of data.log.entries) {
    if (
      !negotiationObject(entry) ||
      !negotiationObject(entry.request) ||
      !Array.isArray(entry.request.headers)
    ) {
      skipped++;
      continue;
    }
    const headers = new Map<string, string[]>();
    let valid = true;
    for (const h of entry.request.headers) {
      if (
        !negotiationObject(h) ||
        typeof h.name !== "string" ||
        typeof h.value !== "string"
      ) {
        valid = false;
        break;
      }
      const key = h.name.toLowerCase();
      if (["accept", "accept-language", "accept-encoding"].includes(key))
        headers.set(key, [...(headers.get(key) ?? []), h.value]);
    }
    if (!valid) {
      skipped++;
      continue;
    }
    while (used.has(`har-${next}`)) next++;
    const id = `har-${next++}`;
    used.add(id);
    const field = (name: string) =>
      headers.has(name) ? headers.get(name)!.join(", ") : null;
    const c = {
      ...newNegotiationCase(id),
      request: {
        accept: field("accept"),
        language: field("accept-language"),
        encoding: field("accept-encoding"),
      },
    };
    if (
      Object.values(c.request).some(
        (v) => v !== null && getByteSize(v) > 8192,
      ) ||
      cases.length >= 200
    )
      throw new NegotiationError("limit");
    cases.push(c);
  }
  if (!cases.length) throw new NegotiationError("har");
  return { cases, skipped };
}
export function negotiationMediaCatalog(source: string): string[] {
  if (getByteSize(source) > MAX_SCHEMA_BYTES)
    throw new NegotiationError("limit");
  const parsed = parseOpenApiSchema(source);
  if (!parsed.ok) throw new NegotiationError("schema");
  const types = new Set<string>();
  for (const endpoint of parsed.value.endpoints)
    for (const response of endpoint.responses)
      for (const type of response.contentTypes) {
        try {
          parseNegotiationMediaType(type);
          types.add(type);
        } catch {
          /* Non-concrete ranges are not offered as representations. */
        }
      }
  if (types.size > 200) throw new NegotiationError("limit");
  return [...types];
}
const MAX_SCHEMA_BYTES = 2 * 1024 * 1024;
export function negotiationReport(
  runs: NegotiationRun[],
  details = false,
  comparison?: ReturnType<typeof compareNegotiationRuns>,
) {
  return {
    kind: "rsswag-negotiation-report",
    version: 1,
    total: runs.length,
    checked: runs.filter((r) => r.checked).length,
    passed: runs.filter((r) => r.passed).length,
    ...(comparison ? { comparison } : {}),
    runs: runs.map((r) => ({
      policyId: r.policyId,
      policyName: r.policyName,
      caseId: r.caseId,
      caseName: r.caseName,
      checked: r.checked,
      passed: r.passed,
      status: r.decision.status,
      variantId: r.decision.variantId,
      error: r.decision.error,
      ...(details
        ? {
            candidates: r.decision.candidates.map((c) => ({
              variantId: c.variantId,
              mediaQ: c.media.q,
              languageQ: c.language.q,
              encodingQ: c.encoding.q,
              score: c.score,
              excluded: c.excluded,
            })),
          }
        : {}),
    })),
  };
}
export function demoNegotiationProject(): NegotiationProject {
  const p = emptyNegotiationProject();
  p.name = "Multilingual representation release";
  const variants = [
    {
      ...newNegotiationVariant("json-en"),
      name: "English JSON",
      language: "en",
    },
    {
      ...newNegotiationVariant("json-ru"),
      name: "Russian JSON",
      language: "ru",
    },
    {
      ...newNegotiationVariant("json-gzip"),
      name: "Compressed English JSON",
      language: "en",
      encoding: "gzip" as const,
      weight: 950,
    },
    {
      ...newNegotiationVariant("html-en"),
      name: "English HTML",
      mediaType: "text/html; charset=utf-8",
      language: "en",
      weight: 900,
    },
    {
      ...newNegotiationVariant("json-v2"),
      name: "Version 2 JSON",
      mediaType: "application/json; version=2",
      language: "en",
      weight: 800,
    },
  ];
  p.policies = [
    {
      id: "baseline",
      name: "Strict preferences",
      language: "filter",
      ranking: "product",
      variants,
    },
    {
      id: "language-agnostic",
      name: "Ignore language preferences",
      language: "ignore",
      ranking: "product",
      variants: structuredClone(variants),
    },
    {
      id: "media-first",
      name: "Prioritize media quality",
      language: "filter",
      ranking: "media-first",
      variants: structuredClone(variants),
    },
  ];
  const requests: [string, Partial<NegotiationRequest>][] = [
    ["No preference fields", {}],
    ["Russian JSON", { accept: "application/json", language: "ru" }],
    [
      "Only compressed JSON",
      {
        accept: "application/json",
        language: "en",
        encoding: "gzip, identity;q=0",
      },
    ],
    ["Empty coding field", { encoding: "" }],
    [
      "Specific exclusion overrides wildcard",
      { accept: "application/json;q=0, */*;q=0.8" },
    ],
    ["Unsupported format", { accept: "application/xml" }],
    ["Excluded identity and all codings", { encoding: "*;q=0" }],
    ["Version parameter", { accept: "application/json;version=2" }],
    ["Language prefix boundary", { language: "en-US" }],
    ["Malformed weight", { accept: "application/json;q=1.5" }],
    ["Empty media field", { accept: "" }],
    [
      "Ranking tradeoff",
      {
        accept: "text/html;q=1,application/json;q=0.8",
        language: "en;q=0.1,ru;q=1",
      },
    ],
  ];
  p.cases = requests.map(([name, request], i) => {
    const c = {
      ...newNegotiationCase(`case-${i + 1}`),
      name,
      request: { accept: null, language: null, encoding: null, ...request },
    };
    c.expect = Object.fromEntries(
      p.policies.map((policy) => {
        const d = negotiateRepresentation(policy, c.request);
        return [policy.id, { status: d.status, variantId: d.variantId }];
      }),
    );
    return c;
  });
  return normalizeNegotiationProject(p);
}
