import { describe, expect, it, vi } from "vitest";
import type { NodeMockServerBuild } from "./node-mock-server";
import {
  createNodeMockServerExport,
  downloadNodeMockServerFile,
} from "./node-mock-server-export";
import { downloadTextFile } from "./schema-download";

vi.mock("./schema-download", () => ({
  downloadTextFile: vi.fn(),
}));

const build: NodeMockServerBuild = {
  routes: [],
  source: 'import { createServer } from "node:http";\n',
  summary: {
    bodyVariantCount: 0,
    deprecatedExcludedCount: 0,
    responseVariantCount: 0,
    routeCount: 0,
  },
};

describe("Node mock server export", () => {
  it("creates a runnable JavaScript module export", () => {
    expect(
      createNodeMockServerExport(build, { title: "People & Teams API" }),
    ).toEqual({
      content: build.source,
      contentType: "text/javascript;charset=utf-8",
      fileName: "rsswag-people-teams-api-mock-server.mjs",
    });
  });

  it("downloads generated source through the shared file helper", () => {
    vi.mocked(downloadTextFile).mockReturnValue(true);

    expect(downloadNodeMockServerFile(build, { title: "People API" })).toBe(
      true,
    );
    expect(downloadTextFile).toHaveBeenCalledWith(
      build.source,
      "rsswag-people-api-mock-server.mjs",
      "text/javascript;charset=utf-8",
    );
  });
});
