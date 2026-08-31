import { describe, expect, it, vi } from "vitest";
import {
  createSchemaModelsTypeScriptExport,
  downloadSchemaModelsTypeScriptFile,
} from "./schema-model-export";
import type { SchemaModel } from "./schema-models";

const models: SchemaModel[] = [
  {
    deprecated: false,
    description: "",
    example: '{\n  "id": 0\n}',
    name: "User",
    properties: [],
    referencedBy: [],
    references: [],
    type: "object",
    typeScript: "export interface User {\n  id: number;\n}",
    usages: [],
  },
];

describe("schema model TypeScript export", () => {
  it("creates a deterministic, safely named TypeScript file", () => {
    expect(
      createSchemaModelsTypeScriptExport(models, {
        title: "Catalog */ API\nInternal",
        version: "2.0.0",
      }),
    ).toEqual({
      content:
        "// Generated from Catalog * / API Internal v2.0.0 by RSSwag.\n\nexport interface User {\n  id: number;\n}\n",
      contentType: "text/typescript;charset=utf-8",
      fileName: "catalog-api-internal-models.ts",
    });
  });

  it("starts a browser download and cleans up the object URL", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const createObjectURL = vi.fn().mockReturnValue("blob:models");
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      expect(
        downloadSchemaModelsTypeScriptFile(models, {
          title: "Catalog API",
          version: "2.0.0",
        }),
      ).toBe(true);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:models");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });
});
