import {
  FlagError,
  normalizeFlagContext,
  normalizeFlagDefinition,
  normalizeFlagJson,
  flagList,
  type FlagCondition,
  type FlagContext,
  type FlagDefinition,
  type FlagJson,
  type FlagReason,
} from "./flag-model";
export type FlagCheck = {
  index: number;
  operator: FlagCondition["operator"];
  passed: boolean;
  reason: "matched" | "different" | "missing" | "type";
};
export type FlagTrace = {
  id: string;
  status: "audience" | "conditions" | "percentage" | "matched";
  checks: FlagCheck[];
  bucket: number | null;
};
export type FlagDecision = {
  flagId: string;
  served: boolean;
  variantId: string | null;
  value: FlagJson;
  reason: FlagReason;
  rolloutBucket: number | null;
  allocationBucket: number | null;
  prerequisites: {
    flagId: string;
    variantId: string | null;
    passed: boolean;
  }[];
  segments: { id: string; matched: boolean; checks: FlagCheck[] }[];
  rules: FlagTrace[];
};
export function checkFlagCondition(
  condition: FlagCondition,
  attributes: FlagContext["attributes"],
  index = 0,
): FlagCheck {
  let value: FlagJson = attributes,
    found = true;
  if (condition.pointer !== "")
    for (const encoded of condition.pointer.slice(1).split("/")) {
      const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
      if (
        value === null ||
        typeof value !== "object" ||
        !Object.hasOwn(value, key) ||
        (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))
      ) {
        found = false;
        break;
      }
      value = (value as Record<string, FlagJson>)[key];
    }
  const result = (
    passed: boolean,
    reason: FlagCheck["reason"] = passed ? "matched" : "different",
  ) => ({ index, operator: condition.operator, passed, reason });
  if (condition.operator === "exists") return result(found);
  if (condition.operator === "absent") return result(!found);
  if (!found) return result(false, "missing");
  const right = condition.value!,
    equal = (a: FlagJson, b: FlagJson) =>
      JSON.stringify(normalizeFlagJson(a, 8192)) ===
      JSON.stringify(normalizeFlagJson(b, 8192));
  switch (condition.operator) {
    case "equal":
      return result(equal(value, right));
    case "notEqual":
      return result(!equal(value, right));
    case "in":
      return Array.isArray(right)
        ? result(right.some((v) => equal(value, v)))
        : result(false, "type");
    case "contains":
      return Array.isArray(value)
        ? result(value.some((v) => equal(v, right)))
        : result(false, "type");
    case "startsWith":
      return typeof value === "string" && typeof right === "string"
        ? result(value.startsWith(right))
        : result(false, "type");
    default:
      if (typeof value !== "number" || typeof right !== "number")
        return result(false, "type");
      return result(
        condition.operator === "greater"
          ? value > right
          : condition.operator === "greaterOrEqual"
            ? value >= right
            : condition.operator === "less"
              ? value < right
              : value <= right,
      );
  }
}
export async function flagBucket(
  salt: string,
  flagId: string,
  flagSalt: string,
  domain: string,
  key: string,
): Promise<number> {
  try {
    const bytes = new TextEncoder().encode(
        JSON.stringify([
          "rsswag-flags-v1",
          salt,
          flagId,
          flagSalt,
          domain,
          key,
        ]),
      ),
      digest = await crypto.subtle.digest("SHA-256", bytes);
    return Math.floor(
      (new DataView(digest).getUint32(0, false) * 1000000) / 4294967296,
    );
  } catch {
    throw new FlagError("crypto");
  }
}
export function createFlagEvaluator(value: FlagDefinition) {
  const definition = normalizeFlagDefinition(value);
  return async (
    input: unknown,
    flagIds?: string[],
  ): Promise<FlagDecision[]> => {
    const context = normalizeFlagContext(input),
      ids =
        flagIds === undefined
          ? definition.flags.map((f) => f.id)
          : flagList(flagIds, 16).map((id) => {
              if (typeof id !== "string") throw new FlagError("reference");
              return id;
            });
    if (
      !Array.isArray(ids) ||
      ids.length > 16 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !definition.flags.some((f) => f.id === id))
    )
      throw new FlagError("reference");
    const memo = new Map<string, Promise<FlagDecision>>(),
      segmentCache = new Map<string, FlagDecision["segments"][number]>();
    function segment(id: string) {
      let cached = segmentCache.get(id);
      if (!cached) {
        const s = definition.segments.find((s) => s.id === id)!,
          checks = s.conditions.map((c, i) =>
            checkFlagCondition(c, context.attributes, i),
          );
        cached = { id, matched: checks.every((c) => c.passed), checks };
        segmentCache.set(id, cached);
      }
      return cached;
    }
    function evaluate(id: string): Promise<FlagDecision> {
      const cached = memo.get(id);
      if (cached) return cached;
      const promise = decide(id);
      memo.set(id, promise);
      return promise;
    }
    async function decide(id: string): Promise<FlagDecision> {
      const flag = definition.flags.find((f) => f.id === id)!,
        decision: FlagDecision = {
          flagId: id,
          served: false,
          variantId: null,
          value: flag.offValue,
          reason: "disabled",
          rolloutBucket: null,
          allocationBucket: null,
          prerequisites: [],
          segments: [],
          rules: [],
        },
        usedSegments = new Set<string>();
      const audience = (include: string[], exclude: string[]) => {
        include.forEach((id) => usedSegments.add(id));
        exclude.forEach((id) => usedSegments.add(id));
        if (exclude.some((id) => segment(id).matched))
          return "excluded" as const;
        if (!include.every((id) => segment(id).matched))
          return "audience" as const;
        return null;
      };
      const finish = (reason: FlagReason, variantId: string | null = null) => {
        decision.reason = reason;
        decision.served = variantId !== null;
        decision.variantId = variantId;
        decision.value =
          variantId === null
            ? flag.offValue
            : flag.variants.find((v) => v.id === variantId)!.value;
        decision.segments = [...usedSegments].map(segment);
        return decision;
      };
      if (!flag.enabled) return finish("disabled");
      if (
        (flag.startMs !== null && context.nowMs < flag.startMs) ||
        (flag.endMs !== null && context.nowMs >= flag.endMs)
      )
        return finish("schedule");
      const blocked = audience(flag.include, flag.exclude);
      if (blocked) return finish(blocked);
      for (const p of flag.prerequisites) {
        const d = await evaluate(p.flagId),
          passed = d.served && d.variantId === p.variantId;
        decision.prerequisites.push({
          flagId: p.flagId,
          variantId: d.variantId,
          passed,
        });
        if (!passed) return finish("prerequisite");
      }
      for (const r of flag.rules) {
        const blocked = audience(r.include, r.exclude),
          checks = r.conditions.map((c, i) =>
            checkFlagCondition(c, context.attributes, i),
          );
        if (blocked) {
          decision.rules.push({
            id: r.id,
            status: "audience",
            checks,
            bucket: null,
          });
          continue;
        }
        if (checks.some((c) => !c.passed)) {
          decision.rules.push({
            id: r.id,
            status: "conditions",
            checks,
            bucket: null,
          });
          continue;
        }
        const bucket = await flagBucket(
          definition.salt,
          id,
          flag.salt,
          `rule:${r.id}`,
          context.key,
        );
        if (bucket >= r.rolloutPpm) {
          decision.rules.push({
            id: r.id,
            status: "percentage",
            checks,
            bucket,
          });
          continue;
        }
        decision.rules.push({ id: r.id, status: "matched", checks, bucket });
        return finish("rule", r.variantId);
      }
      decision.rolloutBucket = await flagBucket(
        definition.salt,
        id,
        flag.salt,
        "rollout",
        context.key,
      );
      if (decision.rolloutBucket >= flag.rolloutPpm) return finish("rollout");
      decision.allocationBucket = await flagBucket(
        definition.salt,
        id,
        flag.salt,
        "allocation",
        context.key,
      );
      let boundary = 0;
      for (const v of flag.variants) {
        boundary += v.weightPpm;
        if (decision.allocationBucket < boundary)
          return finish("allocated", v.id);
      }
      throw new FlagError("definition");
    }
    return JSON.parse(
      JSON.stringify(await Promise.all(ids.map(evaluate))),
    ) as FlagDecision[];
  };
}
