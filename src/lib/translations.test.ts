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
    expect(
      translate("en", "workspace.addEndpointFavorite", {
        method: "GET",
        path: "/users",
      }),
    ).toBe("Add GET /users to favorites");
    expect(translate("ru", "workspace.favoriteEndpoints", { count: "2" })).toBe(
      "Избранное (2)",
    );
    expect(translate("en", "workspace.changeTitle")).toBe("API change review");
    expect(
      translate("ru", "workspace.changeDetailResponseRemoved", {
        status: "404",
      }),
    ).toBe("Удален ответ 404.");
    expect(translate("en", "workspace.environmentTitle")).toBe(
      "Request environments",
    );
    expect(
      translate("ru", "workspace.environmentHeaderCount", { count: "3" }),
    ).toBe("Общие заголовки: 3");
    expect(
      translate("en", "workspace.remoteImportHttpError", { status: "404" }),
    ).toBe("The remote server returned HTTP 404.");
    expect(translate("ru", "workspace.remoteImportOpen")).toBe("Импорт по URL");
    expect(translate("en", "workspace.requestPresetSelector")).toBe(
      "Request preset",
    );
    expect(
      translate("ru", "workspace.requestPresetDeleteConfirm", {
        name: "Успешный сценарий",
      }),
    ).toBe('Удалить шаблон запроса "Успешный сценарий"?');
  });
});
