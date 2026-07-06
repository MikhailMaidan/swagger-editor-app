import { describe, expect, it } from "vitest";
import { translate, translations } from "./translations";

describe("translations", () => {
  it("keeps English and Russian dictionaries in sync", () => {
    expect(Object.keys(translations.ru).sort()).toEqual(
      Object.keys(translations.en).sort(),
    );
  });

  it("supports simple interpolation", () => {
    expect(translate("en", "workspace.version", { version: "1.0.0" })).toBe(
      "Version 1.0.0",
    );
    expect(translate("ru", "workspace.version", { version: "1.0.0" })).toBe(
      "Версия 1.0.0",
    );
  });
});
