import { describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE_GUIDE_CONFIG,
  STYLE_RULES,
} from "./api-style-guide-config";
import { createStyleGuideReport } from "./api-style-guide";
import {
  createStyleGuideExport,
  createStyleGuideMarkdown,
  styleRuleMessageKeys,
  styleRuleTitleKeys,
} from "./api-style-guide-export";
import { translations } from "./translations";

const root = {
  info: {
    contact: { name: "API team" },
    description: "Orders",
    license: { name: "MIT" },
    title: "Orders",
    version: "1",
  },
  openapi: "3.0.3",
  paths: {
    "/order_items": {
      get: { operationId: "listItems", responses: {} },
    },
  },
};
const config = {
  ...DEFAULT_STYLE_GUIDE_CONFIG,
  disabledRules: ["summary-style" as const],
};
const report = createStyleGuideReport(root, config);
const schema = { title: "Orders `API`", version: "2.0.0" };

describe("style guide export", () => {
  it("has English and Russian copy for every rule", () => {
    for (const rule of STYLE_RULES) {
      expect(translations.en[styleRuleTitleKeys[rule.id]]).toBeTruthy();
      expect(translations.ru[styleRuleMessageKeys[rule.id]]).toBeTruthy();
    }
  });

  it("creates a Markdown report with conventions, rule states, and findings", () => {
    const markdown = createStyleGuideMarkdown(report, config, schema);

    expect(markdown).toContain("# API style guide: Orders 'API'");
    expect(markdown).toContain("Version: 2.0.0");
    expect(markdown).toContain(
      `Style score ${report.score}/100 · ${STYLE_RULES.length - 2}/${STYLE_RULES.length - 1} rules passing · 0 must fix, 1 should fix, 0 to consider.`,
    );
    expect(markdown).toContain("- Path segments: `kebab-case`");
    expect(markdown).toContain(
      "- ✗ Path segment casing (Should fix): 1 findings",
    );
    expect(markdown).toContain("- ○ Concise summaries (Consider): Turned off");
    expect(markdown).toContain(
      "- ✓ Unambiguous path templates (Must fix): Passing",
    );
    expect(markdown).toContain(
      "- ✓ Consistent error model (Should fix): Not applicable",
    );
    expect(markdown).toContain(
      "- **Should fix** Path segment casing `GET /order_items`: Use kebab-case for path segments: order_items. Suggested: `/order-items` — `/paths/~1order_items`",
    );
    expect(createStyleGuideMarkdown(report, config, schema, "ru")).toContain(
      "## Находки",
    );
  });

  it("creates a dated JSON export with the ruleset and report", () => {
    const exported = createStyleGuideExport(
      report,
      config,
      schema,
      new Date("2026-05-06T07:08:09.000Z"),
    );

    expect(exported.fileName).toBe(
      "rsswag-orders-api-style-guide-2026-05-06.json",
    );
    expect(JSON.parse(exported.content)).toEqual({
      config: {
        conventions: {
          operationIdCase: "camelCase",
          parameterCase: "camelCase",
          pathCase: "kebab-case",
          propertyCase: "camelCase",
        },
        disabledRules: ["summary-style"],
        kind: "rsswag-style-guide",
        version: 1,
      },
      exportedAt: "2026-05-06T07:08:09.000Z",
      schema,
      styleGuide: report,
      version: 1,
    });
  });
});
