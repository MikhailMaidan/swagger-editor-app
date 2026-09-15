import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_STYLE_GUIDE_CONFIG,
  MAX_STYLE_GUIDE_CONFIG_BYTES,
  normalizeStyleGuideConfig,
  parseStyleGuideConfig,
  readStyleGuideConfigPreference,
  saveStyleGuideConfigPreference,
  serializeStyleGuideConfig,
  STYLE_GUIDE_CONFIG_STORAGE_KEY,
  STYLE_RULES,
} from "./api-style-guide-config";

describe("style guide configuration", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defines every rule exactly once", () => {
    const ids = STYLE_RULES.map((rule) => rule.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("normalizes unknown values to safe defaults while keeping known rule ids in rule order", () => {
    expect(normalizeStyleGuideConfig("nope")).toEqual(
      DEFAULT_STYLE_GUIDE_CONFIG,
    );
    expect(
      normalizeStyleGuideConfig({
        disabledRules: ["summary-style", "future-rule", "path-casing", 7],
        parameterCase: "snake_case",
        pathCase: "SCREAMING",
      }),
    ).toEqual({
      ...DEFAULT_STYLE_GUIDE_CONFIG,
      disabledRules: ["path-casing", "summary-style"],
      parameterCase: "snake_case",
    });
  });

  it("round-trips rulesets and accepts a byte-order mark", () => {
    const config = {
      ...DEFAULT_STYLE_GUIDE_CONFIG,
      disabledRules: ["info-metadata" as const],
      propertyCase: "snake_case" as const,
    };
    const serialized = serializeStyleGuideConfig(config);

    expect(JSON.parse(serialized)).toEqual({
      conventions: {
        operationIdCase: "camelCase",
        parameterCase: "camelCase",
        pathCase: "kebab-case",
        propertyCase: "snake_case",
      },
      disabledRules: ["info-metadata"],
      kind: "rsswag-style-guide",
      version: 1,
    });
    expect(
      parseStyleGuideConfig(`${String.fromCharCode(0xfeff)}${serialized}`),
    ).toEqual({
      config,
      ok: true,
    });
  });

  it("rejects malformed, unsupported, and oversized rulesets", () => {
    for (const text of [
      "not json",
      JSON.stringify({ kind: "other", version: 1, conventions: {} }),
      JSON.stringify({
        kind: "rsswag-style-guide",
        version: 2,
        conventions: {},
      }),
      JSON.stringify({ kind: "rsswag-style-guide", version: 1 }),
      JSON.stringify({
        conventions: { pathCase: "Title Case" },
        kind: "rsswag-style-guide",
        version: 1,
      }),
      JSON.stringify({
        conventions: {},
        disabledRules: [1],
        kind: "rsswag-style-guide",
        version: 1,
      }),
    ]) {
      expect(parseStyleGuideConfig(text)).toEqual({
        issue: "invalid",
        ok: false,
      });
    }

    expect(
      parseStyleGuideConfig(" ".repeat(MAX_STYLE_GUIDE_CONFIG_BYTES + 1)),
    ).toEqual({ issue: "too-large", ok: false });
  });

  it("persists only non-default configurations and tolerates blocked storage", () => {
    const custom = {
      ...DEFAULT_STYLE_GUIDE_CONFIG,
      pathCase: "snake_case" as const,
    };

    expect(saveStyleGuideConfigPreference(custom)).toBe(true);
    expect(readStyleGuideConfigPreference()).toEqual(custom);

    expect(saveStyleGuideConfigPreference(DEFAULT_STYLE_GUIDE_CONFIG)).toBe(
      true,
    );
    expect(
      window.localStorage.getItem(STYLE_GUIDE_CONFIG_STORAGE_KEY),
    ).toBeNull();

    window.localStorage.setItem(STYLE_GUIDE_CONFIG_STORAGE_KEY, "{broken");
    expect(readStyleGuideConfigPreference()).toEqual(
      DEFAULT_STYLE_GUIDE_CONFIG,
    );

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(saveStyleGuideConfigPreference(custom)).toBe(false);
  });
});
