import { describe, expect, it } from "vitest";
import { importDecisionContexts } from "./decision-import";
import { demoDtProject } from "./decision-demo";
import { MAX_DT_PROJECT, serializeDtProject } from "./decision-model";
describe("decision context imports", () => {
  it("imports JSON and NDJSON as uniquely named unchecked cases and preserves source", () => {
    const p = demoDtProject(),
      before = serializeDtProject(p),
      context = { region: "EU", subtotal: 50, member: false };
    const imported = importDecisionContexts(
      p,
      "shipping",
      `[${JSON.stringify(context)}]`,
    );
    expect(imported.cases.at(-1)).toMatchObject({
      decisionId: "shipping",
      context,
      expect: null,
    });
    const again = importDecisionContexts(
      imported,
      "shipping",
      `\n${JSON.stringify(context)}\r\n${JSON.stringify(context)}`,
    );
    expect(new Set(again.cases.map((c) => c.id)).size).toBe(15);
    expect(serializeDtProject(p)).toBe(before);
  });
  it("rejects bad contexts and all source bounds atomically", () => {
    const p = demoDtProject();
    expect(() =>
      importDecisionContexts(p, "shipping", '{"region":"EU"}'),
    ).toThrow("context");
    expect(() =>
      importDecisionContexts(p, "shipping", " ".repeat(MAX_DT_PROJECT + 1)),
    ).toThrow("limit");
    expect(() =>
      importDecisionContexts(p, "shipping", Array(25).fill("{}").join("\n")),
    ).toThrow("limit");
    expect(() => importDecisionContexts(p, "missing", "{}")).toThrow(
      "reference",
    );
    expect(p.cases).toHaveLength(12);
  });
});
