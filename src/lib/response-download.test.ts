import { describe, expect, it } from "vitest";
import { getResponseDownloadMetadata } from "./response-download";

describe("response download helpers", () => {
  it("uses the response content type and status in download metadata", () => {
    expect(
      getResponseDownloadMetadata(
        { "Content-Type": "application/problem+json; charset=utf-8" },
        "422",
      ),
    ).toEqual({
      contentType: "application/problem+json; charset=utf-8",
      fileName: "rsswag-response-422.json",
    });
  });

  it("falls back to a text download and sanitizes nonstandard statuses", () => {
    expect(getResponseDownloadMetadata({}, "Default response")).toEqual({
      contentType: "text/plain;charset=utf-8",
      fileName: "rsswag-response-default-response.txt",
    });
  });

  it.each(["", " ", "\t", " \r\n\t "])(
    "uses the text fallback for a blank Content-Type value %j",
    (contentType) => {
      expect(
        getResponseDownloadMetadata({ "Content-Type": contentType }, "200"),
      ).toEqual({
        contentType: "text/plain;charset=utf-8",
        fileName: "rsswag-response-200.txt",
      });
    },
  );

  it("preserves a nonblank Content-Type value including its original whitespace", () => {
    const contentType = " \tapplication/json; charset=utf-8 \t";
    expect(
      getResponseDownloadMetadata({ "Content-Type": contentType }, "200"),
    ).toEqual({ contentType, fileName: "rsswag-response-200.json" });
  });

  it.each([
    "text/json",
    "Text/JSON; charset=utf-8",
    "application/vnd.api+json",
    "Model/GLTF+JSON; charset=utf-8",
  ])("uses a JSON extension for response media type %s", (contentType) => {
    expect(
      getResponseDownloadMetadata({ "Content-Type": contentType }, "200"),
    ).toEqual({
      contentType,
      fileName: "rsswag-response-200.json",
    });
  });

  it.each([
    ["application/xml", "xml"],
    ["Text/XML; charset=utf-8", "xml"],
    ["application/soap+xml", "xml"],
    ["Image/SVG+XML; charset=utf-8", "svg"],
    ["application/yaml", "yaml"],
    ["text/x-yaml", "yaml"],
    ["application/vnd.oai.openapi+yaml", "yaml"],
    ["Application/Vnd.Example+YAML; charset=utf-8", "yaml"],
  ])("uses the %s media type's extension", (contentType, extension) => {
    expect(
      getResponseDownloadMetadata({ "Content-Type": contentType }, "200"),
    ).toEqual({
      contentType,
      fileName: `rsswag-response-200.${extension}`,
    });
  });

  it.each([
    "constructor",
    "__proto__",
    "+json",
    "problem+json",
    "application/+json",
    "application/foo/bar+json",
    "application/my type+json",
    "application/[problem]+json",
    ...["xml", "yaml"].flatMap((suffix) => [
      `+${suffix}`,
      `problem+${suffix}`,
      `application/+${suffix}`,
      `application/foo/bar+${suffix}`,
      `application/my type+${suffix}`,
      `application/[problem]+${suffix}`,
      `/problem+${suffix}`,
    ]),
  ])(
    "uses the text fallback for a malformed Content-Type of %s",
    (contentType) => {
      expect(
        getResponseDownloadMetadata({ "Content-Type": contentType }, "200")
          .fileName,
      ).toBe("rsswag-response-200.txt");
    },
  );

  it("bounds long response labels without truncating the extension or leaving a trailing separator", () => {
    expect(
      getResponseDownloadMetadata(
        { "content-type": "application/problem+json; charset=utf-8" },
        "A".repeat(300),
      ),
    ).toEqual({
      contentType: "application/problem+json; charset=utf-8",
      fileName: `rsswag-response-${"a".repeat(80)}.json`,
    });
    expect(
      getResponseDownloadMetadata(
        { "content-type": "application/xml" },
        `${"B".repeat(79)} / response`,
      ).fileName,
    ).toBe(`rsswag-response-${"b".repeat(79)}.xml`);
  });
});
