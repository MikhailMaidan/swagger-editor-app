import { getByteSize } from "./text-encoding";
import {
  negotiationLanguage,
  parseNegotiationMediaType,
  type NegotiationPolicy,
  type NegotiationRequest,
  type NegotiationVariant,
} from "./negotiation-engine";
export const MAX_NEGOTIATION_BYTES = 2 * 1024 * 1024;
export type NegotiationExpectation = {
  status: 200 | 400 | 406;
  variantId: string | null;
};
export type NegotiationCase = {
  id: string;
  name: string;
  request: NegotiationRequest;
  expect: Record<string, NegotiationExpectation>;
};
export type NegotiationProject = {
  kind: "rsswag-negotiation-project";
  version: 1;
  name: string;
  policies: NegotiationPolicy[];
  cases: NegotiationCase[];
};
export class NegotiationError extends Error {
  constructor(
    public code:
      "json" | "project" | "limit" | "headers" | "har" | "schema" | "cancelled",
  ) {
    super(code);
    this.name = "NegotiationError";
  }
}
export const negotiationObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && getByteSize(v) <= max;
const id = (v: unknown): v is string =>
  text(v, 80) && /^[A-Za-z0-9_-]+$/.test(v);
const name = (v: unknown): v is string => text(v, 120) && !!v.trim();
function list(v: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    throw new NegotiationError("limit");
  for (let i = 0; i < v.length; i++)
    if (!Object.hasOwn(v, i)) throw new NegotiationError("project");
  return v;
}
function unique<T extends { id: string }>(values: T[]): T[] {
  if (new Set(values.map((v) => v.id)).size !== values.length)
    throw new NegotiationError("project");
  return values;
}
export function negotiationJson(
  source: string,
  max = MAX_NEGOTIATION_BYTES,
): unknown {
  if (getByteSize(source) > max) throw new NegotiationError("limit");
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new NegotiationError("json");
  }
}
export function normalizeNegotiationRequest(v: unknown): NegotiationRequest {
  if (
    !negotiationObject(v) ||
    ![v.accept, v.language, v.encoding].every(
      (v) => v === null || text(v, 8192),
    )
  )
    throw new NegotiationError("headers");
  return {
    accept: v.accept as string | null,
    language: v.language as string | null,
    encoding: v.encoding as string | null,
  };
}
export function normalizeNegotiationVariant(v: unknown): NegotiationVariant {
  if (
    !negotiationObject(v) ||
    !id(v.id) ||
    !name(v.name) ||
    typeof v.enabled !== "boolean" ||
    !text(v.mediaType, 512) ||
    !v.mediaType.trim() ||
    !(
      v.language === null ||
      (text(v.language, 80) && negotiationLanguage.test(v.language))
    ) ||
    !["identity", "gzip", "br", "deflate", "zstd"].includes(
      v.encoding as string,
    ) ||
    typeof v.weight !== "number" ||
    !Number.isInteger(v.weight) ||
    v.weight < 1 ||
    v.weight > 1000
  )
    throw new NegotiationError("project");
  try {
    parseNegotiationMediaType(v.mediaType);
  } catch {
    throw new NegotiationError("project");
  }
  return {
    id: v.id,
    name: v.name,
    enabled: v.enabled,
    mediaType: v.mediaType,
    language: v.language as string | null,
    encoding: v.encoding as NegotiationVariant["encoding"],
    weight: v.weight,
  };
}
export function normalizeNegotiationPolicy(v: unknown): NegotiationPolicy {
  if (
    !negotiationObject(v) ||
    !id(v.id) ||
    !name(v.name) ||
    !["filter", "ignore"].includes(v.language as string) ||
    !["product", "media-first"].includes(v.ranking as string)
  )
    throw new NegotiationError("project");
  return {
    id: v.id,
    name: v.name,
    language: v.language as NegotiationPolicy["language"],
    ranking: v.ranking as NegotiationPolicy["ranking"],
    variants: unique(list(v.variants, 1, 64).map(normalizeNegotiationVariant)),
  };
}
export function normalizeNegotiationProject(v: unknown): NegotiationProject {
  if (
    !negotiationObject(v) ||
    v.kind !== "rsswag-negotiation-project" ||
    v.version !== 1 ||
    !name(v.name)
  )
    throw new NegotiationError("project");
  const policies = unique(
    list(v.policies, 1, 5).map(normalizeNegotiationPolicy),
  );
  const cases = unique(
    list(v.cases, 0, 200).map((c): NegotiationCase => {
      if (
        !negotiationObject(c) ||
        !id(c.id) ||
        !name(c.name) ||
        !negotiationObject(c.expect)
      )
        throw new NegotiationError("project");
      const expect = Object.fromEntries(
        Object.entries(c.expect).map(([key, value]) => {
          const policy = policies.find((p) => p.id === key);
          if (
            !policy ||
            !negotiationObject(value) ||
            ![200, 400, 406].includes(value.status as number) ||
            (value.status === 200
              ? !policy.variants.some((v) => v.id === value.variantId)
              : value.variantId !== null)
          )
            throw new NegotiationError("project");
          return [
            key,
            {
              status: value.status as 200 | 400 | 406,
              variantId: value.variantId as string | null,
            },
          ];
        }),
      );
      return {
        id: c.id,
        name: c.name,
        request: normalizeNegotiationRequest(c.request),
        expect,
      };
    }),
  );
  const project: NegotiationProject = {
    kind: "rsswag-negotiation-project",
    version: 1,
    name: v.name,
    policies,
    cases,
  };
  if (getByteSize(JSON.stringify(project)) > MAX_NEGOTIATION_BYTES)
    throw new NegotiationError("limit");
  return project;
}
export const parseNegotiationProject = (source: string) =>
  normalizeNegotiationProject(negotiationJson(source));
export function serializeNegotiationProject(
  project: NegotiationProject,
): string {
  const p = normalizeNegotiationProject(project),
    pretty = JSON.stringify(p, null, 2);
  return getByteSize(pretty) <= MAX_NEGOTIATION_BYTES
    ? pretty
    : JSON.stringify(p);
}
export function newNegotiationVariant(id = "variant-1"): NegotiationVariant {
  return {
    id,
    name: id,
    enabled: true,
    mediaType: "application/json",
    language: null,
    encoding: "identity",
    weight: 1000,
  };
}
export function newNegotiationPolicy(id = "policy-1"): NegotiationPolicy {
  return {
    id,
    name: id,
    language: "filter",
    ranking: "product",
    variants: [newNegotiationVariant()],
  };
}
export function newNegotiationCase(id = "case-1"): NegotiationCase {
  return {
    id,
    name: id,
    request: { accept: null, language: null, encoding: null },
    expect: {},
  };
}
export function emptyNegotiationProject(): NegotiationProject {
  return {
    kind: "rsswag-negotiation-project",
    version: 1,
    name: "Content negotiation",
    policies: [newNegotiationPolicy()],
    cases: [newNegotiationCase()],
  };
}
