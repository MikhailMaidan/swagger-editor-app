import { describe, expect, it, vi } from "vitest";
import { downloadTextFile } from "./schema-download";
import type { TypeScriptClientBuild } from "./typescript-client";
import {
  createTypeScriptClientExport,
  downloadTypeScriptClientFile,
} from "./typescript-client-export";

vi.mock("./schema-download", () => ({
  downloadTextFile: vi.fn(),
}));

const build: TypeScriptClientBuild = {
  clientName: "createPeopleApiClient",
  operations: [],
  source: "export function createPeopleApiClient() {}\n",
  summary: {
    excludedDeprecatedCount: 0,
    generatedNameCount: 0,
    modelCount: 0,
    operationCount: 0,
  },
};

describe("TypeScript client export", () => {
  it("creates a TypeScript source file", () => {
    expect(
      createTypeScriptClientExport(build, { title: "People & Teams API" }),
    ).toEqual({
      content: build.source,
      contentType: "text/typescript;charset=utf-8",
      fileName: "people-teams-api-client.ts",
    });
  });

  it("downloads the generated source", () => {
    vi.mocked(downloadTextFile).mockReturnValue(true);

    expect(downloadTypeScriptClientFile(build, { title: "People API" })).toBe(
      true,
    );
    expect(downloadTextFile).toHaveBeenCalledWith(
      build.source,
      "people-api-client.ts",
      "text/typescript;charset=utf-8",
    );
  });
});
