export type NamingConvention =
  "camelCase" | "kebab-case" | "PascalCase" | "snake_case";

export type StyleSeverity = "error" | "info" | "warning";

export type StyleRuleCategory =
  "document" | "operations" | "parameters" | "paths" | "responses" | "schemas";

export type StyleRuleId =
  | "enum-value-casing"
  | "error-schema-consistency"
  | "info-metadata"
  | "operation-id-casing"
  | "page-size-name"
  | "pagination-style"
  | "parameter-casing"
  | "parameter-description"
  | "path-ambiguous"
  | "path-casing"
  | "path-file-extension"
  | "path-trailing-slash"
  | "path-verbs"
  | "post-create-status"
  | "property-casing"
  | "property-type"
  | "request-body-on-safe-method"
  | "reserved-header-parameter"
  | "schema-name-casing"
  | "server-https"
  | "summary-style"
  | "tag-declared"
  | "tag-description";

export type StyleRuleDefinition = {
  category: StyleRuleCategory;
  id: StyleRuleId;
  severity: StyleSeverity;
};

export type StyleGuideConfig = {
  disabledRules: StyleRuleId[];
  operationIdCase: NamingConvention;
  parameterCase: NamingConvention;
  pathCase: NamingConvention;
  propertyCase: NamingConvention;
};

export type StyleGuideConventionKey = Exclude<
  keyof StyleGuideConfig,
  "disabledRules"
>;

export const STYLE_GUIDE_CONFIG_STORAGE_KEY = "rsswagger-style-guide-config";
export const MAX_STYLE_GUIDE_CONFIG_BYTES = 64 * 1024;

export const NAMING_CONVENTIONS: NamingConvention[] = [
  "camelCase",
  "snake_case",
  "kebab-case",
  "PascalCase",
];

export const STYLE_RULE_CATEGORIES: StyleRuleCategory[] = [
  "paths",
  "operations",
  "parameters",
  "schemas",
  "responses",
  "document",
];

export const STYLE_RULES: StyleRuleDefinition[] = [
  { category: "paths", id: "path-ambiguous", severity: "error" },
  { category: "paths", id: "path-casing", severity: "warning" },
  { category: "paths", id: "path-trailing-slash", severity: "warning" },
  { category: "paths", id: "path-verbs", severity: "info" },
  { category: "paths", id: "path-file-extension", severity: "info" },
  { category: "operations", id: "operation-id-casing", severity: "warning" },
  {
    category: "operations",
    id: "request-body-on-safe-method",
    severity: "warning",
  },
  { category: "operations", id: "post-create-status", severity: "info" },
  { category: "operations", id: "summary-style", severity: "info" },
  { category: "parameters", id: "parameter-casing", severity: "warning" },
  {
    category: "parameters",
    id: "reserved-header-parameter",
    severity: "warning",
  },
  { category: "parameters", id: "pagination-style", severity: "warning" },
  { category: "parameters", id: "page-size-name", severity: "info" },
  { category: "parameters", id: "parameter-description", severity: "info" },
  { category: "schemas", id: "schema-name-casing", severity: "warning" },
  { category: "schemas", id: "property-casing", severity: "warning" },
  { category: "schemas", id: "enum-value-casing", severity: "info" },
  { category: "schemas", id: "property-type", severity: "info" },
  {
    category: "responses",
    id: "error-schema-consistency",
    severity: "warning",
  },
  { category: "document", id: "server-https", severity: "error" },
  { category: "document", id: "tag-declared", severity: "warning" },
  { category: "document", id: "tag-description", severity: "info" },
  { category: "document", id: "info-metadata", severity: "info" },
];

export const STYLE_GUIDE_CONVENTION_KEYS: StyleGuideConventionKey[] = [
  "pathCase",
  "parameterCase",
  "propertyCase",
  "operationIdCase",
];

export const DEFAULT_STYLE_GUIDE_CONFIG: StyleGuideConfig = {
  disabledRules: [],
  operationIdCase: "camelCase",
  parameterCase: "camelCase",
  pathCase: "kebab-case",
  propertyCase: "camelCase",
};

const STYLE_RULE_IDS = new Set<string>(STYLE_RULES.map((rule) => rule.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNamingConvention(value: unknown): value is NamingConvention {
  return NAMING_CONVENTIONS.includes(value as NamingConvention);
}

export function isStyleRuleId(value: unknown): value is StyleRuleId {
  return typeof value === "string" && STYLE_RULE_IDS.has(value);
}

function readDisabledRules(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  // Rule ids from newer versions are ignored so shared rulesets stay usable.
  return STYLE_RULES.map((rule) => rule.id).filter((id) => value.includes(id));
}

export function normalizeStyleGuideConfig(value: unknown): StyleGuideConfig {
  if (!isRecord(value)) {
    return { ...DEFAULT_STYLE_GUIDE_CONFIG, disabledRules: [] };
  }

  const config: StyleGuideConfig = {
    ...DEFAULT_STYLE_GUIDE_CONFIG,
    disabledRules: readDisabledRules(value.disabledRules),
  };

  for (const key of STYLE_GUIDE_CONVENTION_KEYS) {
    if (isNamingConvention(value[key])) {
      config[key] = value[key];
    }
  }

  return config;
}

export function serializeStyleGuideConfig(config: StyleGuideConfig) {
  const normalized = normalizeStyleGuideConfig(config);

  return `${JSON.stringify(
    {
      conventions: {
        operationIdCase: normalized.operationIdCase,
        parameterCase: normalized.parameterCase,
        pathCase: normalized.pathCase,
        propertyCase: normalized.propertyCase,
      },
      disabledRules: normalized.disabledRules,
      kind: "rsswag-style-guide",
      version: 1,
    },
    null,
    2,
  )}\n`;
}

export function parseStyleGuideConfig(
  text: string,
):
  | { config: StyleGuideConfig; ok: true }
  | { issue: "invalid" | "too-large"; ok: false } {
  if (
    text.length > MAX_STYLE_GUIDE_CONFIG_BYTES ||
    new TextEncoder().encode(text).length > MAX_STYLE_GUIDE_CONFIG_BYTES
  ) {
    return { issue: "too-large", ok: false };
  }

  let data: unknown;

  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { issue: "invalid", ok: false };
  }

  if (
    !isRecord(data) ||
    data.kind !== "rsswag-style-guide" ||
    data.version !== 1 ||
    !isRecord(data.conventions) ||
    (data.disabledRules !== undefined &&
      (!Array.isArray(data.disabledRules) ||
        data.disabledRules.some((rule) => typeof rule !== "string")))
  ) {
    return { issue: "invalid", ok: false };
  }

  const conventions = data.conventions;

  if (
    STYLE_GUIDE_CONVENTION_KEYS.some(
      (key) =>
        conventions[key] !== undefined && !isNamingConvention(conventions[key]),
    )
  ) {
    return { issue: "invalid", ok: false };
  }

  return {
    config: normalizeStyleGuideConfig({
      ...conventions,
      disabledRules: data.disabledRules,
    }),
    ok: true,
  };
}

export function readStyleGuideConfigPreference(): StyleGuideConfig {
  if (typeof window === "undefined") {
    return normalizeStyleGuideConfig(null);
  }

  try {
    const storedValue = window.localStorage.getItem(
      STYLE_GUIDE_CONFIG_STORAGE_KEY,
    );

    return normalizeStyleGuideConfig(
      storedValue ? JSON.parse(storedValue) : null,
    );
  } catch {
    return normalizeStyleGuideConfig(null);
  }
}

export function saveStyleGuideConfigPreference(config: StyleGuideConfig) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const normalized = normalizeStyleGuideConfig(config);
    const isDefault =
      normalized.disabledRules.length === 0 &&
      STYLE_GUIDE_CONVENTION_KEYS.every(
        (key) => normalized[key] === DEFAULT_STYLE_GUIDE_CONFIG[key],
      );

    if (isDefault) {
      window.localStorage.removeItem(STYLE_GUIDE_CONFIG_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        STYLE_GUIDE_CONFIG_STORAGE_KEY,
        JSON.stringify(normalized),
      );
    }

    return true;
  } catch {
    // The ruleset still applies for this session when storage is blocked.
    return false;
  }
}
