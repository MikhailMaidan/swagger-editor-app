import { describe, expect, it } from "vitest";
import {
  negotiateRepresentation,
  parseNegotiationMediaType,
  type NegotiationRequest,
} from "./negotiation-engine";
import {
  newNegotiationPolicy,
  newNegotiationVariant,
} from "./negotiation-project";
const request = (v: Partial<NegotiationRequest> = {}): NegotiationRequest => ({
  accept: null,
  language: null,
  encoding: null,
  ...v,
});
describe("HTTP representation selection", () => {
  it("applies RFC media range precedence before quality, including a specific exclusion", () => {
    const p = newNegotiationPolicy();
    p.variants = [
      "text/plain;format=flowed",
      "text/plain",
      "text/html",
      "image/jpeg",
      "text/plain;format=fixed",
    ].map((type, i) => ({
      ...newNegotiationVariant(`v${i}`),
      mediaType: type,
    }));
    const d = negotiateRepresentation(
      p,
      request({
        accept:
          "text/*;q=0.3,text/plain;q=0.7,text/plain;format=flowed,text/plain;format=fixed;q=0.4,*/*;q=0.5",
      }),
    );
    expect(d.candidates.map((c) => c.media.q)).toEqual([
      1000, 700, 300, 500, 400,
    ]);
    expect(d.variantId).toBe("v0");
    const excluded = negotiateRepresentation(
      p,
      request({ accept: "text/plain;q=0,text/*;q=1,*/*;q=0.5" }),
    );
    expect(excluded.candidates[0].excluded).toBe("media");
    expect(excluded.variantId).toBe("v2");
  });
  it("preserves quoted delimiters and escapes, with case sensitive values except charset", () => {
    const p = newNegotiationPolicy();
    p.variants[0].mediaType = 'Text/Plain; profile="a,b;c\\\"d";charset=UTF-8';
    expect(
      negotiateRepresentation(
        p,
        request({ accept: 'text/plain;PROFILE="a,b;c\\\"d";charset=utf-8' }),
      ).status,
    ).toBe(200);
    expect(
      negotiateRepresentation(
        p,
        request({ accept: 'text/plain;profile="A,b;c\\\"d"' }),
      ).status,
    ).toBe(406);
    expect(
      negotiateRepresentation(
        p,
        request({ accept: '\t text/plain ; q=0.25 ; charset="UTF-8" ' }),
      ).candidates[0].media.q,
    ).toBe(250);
    expect(
      negotiateRepresentation(p, request({ accept: "\u00a0text/plain" }))
        .status,
    ).toBe(400);
  });
  it("does not invent structured suffix matching or ignore required media parameters", () => {
    const p = newNegotiationPolicy();
    p.variants[0].mediaType = "application/problem+json";
    expect(
      negotiateRepresentation(p, request({ accept: "application/*+json" }))
        .status,
    ).toBe(406);
    expect(
      negotiateRepresentation(p, request({ accept: "application/*;version=2" }))
        .status,
    ).toBe(406);
    expect(
      negotiateRepresentation(p, request({ accept: "application/*" })).status,
    ).toBe(200);
  });
  it("distinguishes missing and empty fields and ignores empty comma-list members", () => {
    const p = newNegotiationPolicy();
    p.variants[0].language = "en";
    p.variants[0].encoding = "gzip";
    expect(negotiateRepresentation(p, request()).status).toBe(200);
    for (const field of ["accept", "language", "encoding"] as const)
      expect(negotiateRepresentation(p, request({ [field]: "" })).status).toBe(
        406,
      );
    expect(
      negotiateRepresentation(
        p,
        request({
          accept: ", ,application/json,,",
          language: ",en,,",
          encoding: ",gzip,,",
        }),
      ).status,
    ).toBe(200);
  });
  it("uses language prefix boundaries and most specific quality, with neutral representations", () => {
    const p = newNegotiationPolicy();
    p.variants = ["en-US", "en", "en-Latn-US", "ru"].map((language, i) => ({
      ...newNegotiationVariant(`v${i}`),
      language,
    }));
    expect(
      negotiateRepresentation(
        p,
        request({ language: "EN-us;q=0,en;q=0.7,*;q=1" }),
      ).candidates.map((c) => c.language.q),
    ).toEqual([0, 700, 700, 1000]);
    expect(
      negotiateRepresentation(p, request({ language: "en-US" })).variantId,
    ).toBe("v0");
    expect(
      negotiateRepresentation(p, request({ language: "en-U" })).status,
    ).toBe(406);
    p.variants = [newNegotiationVariant()];
    expect(
      negotiateRepresentation(p, request({ language: "*;q=0" })).status,
    ).toBe(200);
    p.language = "ignore";
    const ignored = negotiateRepresentation(
      p,
      request({ language: "bad;q=2\r\n" }),
    );
    expect(ignored.status).toBe(200);
    expect(ignored.vary).not.toContain("Accept-Language");
  });
  it("implements identity defaults, exact coding exclusions, wildcard exclusions and coding case", () => {
    const p = newNegotiationPolicy();
    p.variants = ["identity", "gzip", "br"].map((encoding, i) => ({
      ...newNegotiationVariant(`v${i}`),
      encoding: encoding as "identity" | "gzip" | "br",
    }));
    const qualities = (encoding: string | null) =>
      negotiateRepresentation(p, request({ encoding })).candidates.map(
        (c) => c.encoding.q,
      );
    expect(qualities(null)).toEqual([1000, 1000, 1000]);
    expect(qualities("")).toEqual([1000, 0, 0]);
    expect(qualities("GZIP;q=0.5")).toEqual([1000, 500, 0]);
    expect(qualities("*;q=0.5")).toEqual([1000, 500, 500]);
    expect(qualities("*;q=0,gzip;q=0.3")).toEqual([0, 300, 0]);
    expect(qualities("*;q=1,gzip;q=0,identity;q=0.2")).toEqual([200, 0, 1000]);
    expect(qualities("identity;q=0,*;q=0")).toEqual([0, 0, 0]);
  });
  it("ranks quality products using exact integers and supports media-first ordering", () => {
    const p = newNegotiationPolicy();
    p.variants = [
      { ...newNegotiationVariant("json"), language: "ru" },
      {
        ...newNegotiationVariant("html"),
        mediaType: "text/html",
        language: "en",
      },
    ];
    const r = request({
      accept: "text/html,application/json;q=0.8",
      language: "en;q=0.1,ru",
    });
    const d = negotiateRepresentation(p, r);
    expect(d.variantId).toBe("json");
    expect(d.candidates[0].score).toBe(800_000_000_000);
    p.ranking = "media-first";
    expect(negotiateRepresentation(p, r).variantId).toBe("html");
    p.variants[0].weight = 1;
    p.ranking = "product";
    expect(negotiateRepresentation(p, r).variantId).toBe("html");
  });
  it("uses server order for ties, disabled offers cannot win, all-disabled produces 406", () => {
    const p = newNegotiationPolicy();
    p.variants.push(newNegotiationVariant("second"));
    expect(negotiateRepresentation(p, request()).variantId).toBe("variant-1");
    p.variants.reverse();
    expect(negotiateRepresentation(p, request()).variantId).toBe("second");
    p.variants[0].enabled = false;
    expect(negotiateRepresentation(p, request()).variantId).toBe("variant-1");
    p.variants[1].enabled = false;
    expect(negotiateRepresentation(p, request()).status).toBe(406);
  });
  it("chooses highest quality for equally specific duplicate ranges", () => {
    const p = newNegotiationPolicy();
    const d = negotiateRepresentation(
      p,
      request({
        accept: "application/json;q=0,application/json;q=0.9",
        encoding: "identity;q=0,identity;q=0.2",
      }),
    );
    expect(d.status).toBe(200);
    expect(d.candidates[0].media.q).toBe(900);
    expect(d.candidates[0].encoding.q).toBe(200);
  });
  it.each([
    "application/json;q=.5",
    "application/json;q=1.001",
    "application/json;q=0.0001",
    'application/json;q="0.5"',
    "application/json;q=0.1;Q=0.2",
    "*/json",
    'application/json;profile="unfinished',
    "application/json;profile=x;profile=y",
    "application/json;",
    "application/json\r\nX-Evil: yes",
    "application/json\u007f",
    "application/json\u2028",
    "x".repeat(8193),
    Array(65).fill("application/json").join(","),
  ])("rejects malformed media fields atomically: %s", (accept) => {
    const d = negotiateRepresentation(
      newNegotiationPolicy(),
      request({ accept }),
    );
    expect(d).toMatchObject({
      status: 400,
      variantId: null,
      candidates: [],
      error: "accept",
    });
    expect(d.headers).toEqual({
      Vary: "Accept, Accept-Encoding, Accept-Language",
    });
  });
  it("rejects invalid non-media parameters, retains Vary on all decisions, and sets only actual metadata", () => {
    const p = newNegotiationPolicy();
    p.variants[0].language = "en";
    p.variants[0].encoding = "br";
    expect(negotiateRepresentation(p, request()).headers).toEqual({
      Vary: "Accept, Accept-Encoding, Accept-Language",
      "Content-Type": "application/json",
      "Content-Language": "en",
      "Content-Encoding": "br",
    });
    expect(
      negotiateRepresentation(p, request({ encoding: "gzip;other=x" })),
    ).toMatchObject({ status: 400, error: "encoding" });
    expect(
      negotiateRepresentation(p, request({ language: "en-*" })),
    ).toMatchObject({ status: 400, error: "language" });
    p.variants[0].encoding = "identity";
    p.variants[0].language = null;
    expect(negotiateRepresentation(p, request()).headers).toEqual({
      Vary: "Accept, Accept-Encoding, Accept-Language",
      "Content-Type": "application/json",
    });
    expect(() => parseNegotiationMediaType("application/json;q=1")).toThrow();
    expect(() => parseNegotiationMediaType("*/*")).toThrow();
  });
});
