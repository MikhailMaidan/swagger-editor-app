import { describe, expect, it } from "vitest";
import { generateNegotiationSelector } from "./negotiation-export";
import {
  negotiateRepresentation,
  type NegotiationDecision,
  type NegotiationRequest,
  type NegotiationVariant,
} from "./negotiation-engine";
import {
  demoNegotiationProject,
  generateNegotiationCases,
} from "./negotiation-studio";
import { newNegotiationPolicy } from "./negotiation-project";
async function artifact(policy = newNegotiationPolicy()) {
  const source = generateNegotiationSelector(policy);
  const exported = (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  )) as {
    selectRepresentation: (r: NegotiationRequest) => NegotiationDecision;
    selectRequest: (r: { headers: Headers }) => NegotiationDecision;
    describeVariant: (id: string) => NegotiationVariant | null;
    mergeNegotiationVary: (h: HeadersInit, d: NegotiationDecision) => Headers;
  };
  return { source, ...exported };
}
describe("standalone representation selector", () => {
  it.each(["baseline", "language-agnostic", "media-first"])(
    "executes native %s ESM with full engine parity across preference boundaries",
    async (id) => {
      const p = demoNegotiationProject().policies.find((p) => p.id === id)!,
        exported = await artifact(p);
      const accepts = [
        null,
        "",
        "*/*",
        "application/json;q=0,*/*;q=1",
        "text/html,application/json;q=0.8",
        "application/json;version=2",
        'application/json;profile="a,b;c"',
        "application/json;q=.5",
      ];
      const requests = [0, 4].flatMap((start) =>
        generateNegotiationCases({
          accept: accepts.slice(start, start + 4),
          language: [null, "", "ru", "EN-us;q=0,en;q=0.2,*;q=0.9", "en;q=2"],
          encoding: [
            null,
            "",
            "GZIP,identity;q=0",
            "*;q=0.1",
            "*;q=0",
            "gzip;q=2",
          ],
        }),
      );
      for (const c of requests)
        expect(exported.selectRepresentation(c.request)).toEqual(
          negotiateRepresentation(p, c.request),
        );
      expect(exported.source).not.toContain("Ranking tradeoff");
      expect(exported.source).not.toContain("case-1");
    },
  );
  it("preserves Fetch header absence/emptiness and merges Vary without losing application fields", async () => {
    const exported = await artifact(),
      headers = new Headers({ "Accept-Encoding": "" }),
      result = exported.selectRequest({ headers });
    expect(result).toEqual(
      negotiateRepresentation(newNegotiationPolicy(), {
        accept: null,
        language: null,
        encoding: "",
      }),
    );
    expect(
      exported
        .mergeNegotiationVary(
          { Vary: "Origin, aCcEpT", "X-Existing": "keep" },
          result,
        )
        .get("Vary"),
    ).toBe("Origin, aCcEpT, Accept-Encoding, Accept-Language");
    expect(
      exported.mergeNegotiationVary({ Vary: "*" }, result).get("Vary"),
    ).toBe("*");
    const v = exported.describeVariant("variant-1")!;
    v.mediaType = "text/html";
    expect(exported.describeVariant("variant-1")!.mediaType).toBe(
      "application/json",
    );
    expect(exported.describeVariant("missing")).toBeNull();
    result.headers["Content-Type"] = "changed";
    result.vary.push("X-Injected");
    expect(exported.selectRequest({ headers }).headers["Content-Type"]).toBe(
      "application/json",
    );
  });
  it("escapes source-sensitive values and retains quoted parameter matching without dependencies", async () => {
    const p = newNegotiationPolicy();
    p.name = "</script>`\u2028\u2029";
    p.variants[0].mediaType = 'application/json;profile="</script>;,\\\""';
    const exported = await artifact(p),
      request = {
        accept: p.variants[0].mediaType,
        language: null,
        encoding: null,
      };
    expect(exported.source).not.toContain("</script>");
    expect(exported.source).not.toContain("\u2028");
    expect(exported.selectRepresentation(request)).toEqual(
      negotiateRepresentation(p, request),
    );
    expect(exported.source).not.toMatch(
      /fetch\(|localStorage|sessionStorage|eval\(/,
    );
  });
});
