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

  it("provides localized schema action errors", () => {
    expect(translate("en", "workspace.schemaCopyFailed")).toBe(
      "Could not copy schema.",
    );
    expect(translate("ru", "workspace.schemaCopyFailed")).toBe(
      "Не удалось скопировать схему.",
    );
    expect(translate("en", "workspace.schemaDownloadFailed")).toBe(
      "Could not download schema.",
    );
    expect(translate("en", "schemas.downloadError")).toBe(
      "Could not start download.",
    );
    expect(translate("en", "history.exportVisibleError")).toBe(
      "Could not export visible request history.",
    );
    expect(translate("en", "history.downloadDetailsError")).toBe(
      "Could not export this request.",
    );
    expect(translate("ru", "history.downloadDetailsSuccess")).toBe(
      "Экспорт запроса начался.",
    );
    expect(translate("en", "workspace.auditTitle")).toBe("API quality audit");
    expect(
      translate("ru", "workspace.auditIssueMissingPathParameter", {
        parameter: "id",
      }),
    ).toBe('Определите параметр пути "id".');
    expect(translate("en", "workspace.auditCopySuccess")).toBe(
      "Audit summary copied.",
    );
    expect(translate("ru", "workspace.auditNoFilteredIssues")).toBe(
      "Для выбранного уровня замечаний нет.",
    );
  });
});
