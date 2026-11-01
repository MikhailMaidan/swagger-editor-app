/** Bounded proactive negotiation: RFC 9110 media precedence and coding rules,
 * RFC 4647 basic language filtering, with explicitly defined server ranking. */
export type NegotiationVariant = {
  id: string;
  name: string;
  enabled: boolean;
  mediaType: string;
  language: string | null;
  encoding: "identity" | "gzip" | "br" | "deflate" | "zstd";
  weight: number;
};
export type NegotiationPolicy = {
  id: string;
  name: string;
  language: "filter" | "ignore";
  ranking: "product" | "media-first";
  variants: NegotiationVariant[];
};
export type NegotiationRequest = {
  accept: string | null;
  language: string | null;
  encoding: string | null;
};
export type NegotiationQuality = {
  q: number;
  range: string | null;
  specificity: number;
};
export type NegotiationCandidate = {
  variantId: string;
  media: NegotiationQuality;
  language: NegotiationQuality;
  encoding: NegotiationQuality;
  score: number;
  excluded: "disabled" | "media" | "language" | "encoding" | null;
};
export type NegotiationDecision = {
  status: 200 | 400 | 406;
  variantId: string | null;
  vary: string[];
  headers: Record<string, string>;
  candidates: NegotiationCandidate[];
  error: "accept" | "language" | "encoding" | null;
};
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
export const negotiationLanguage = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;
export const NEGOTIATION_HEADER_LIMIT = 8192;
type Media = { type: string; subtype: string; parameters: Map<string, string> };
type Range = { value: string; q: number; media?: Media };
function fail(): never {
  throw new Error("header");
}
function safeHeader(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > NEGOTIATION_HEADER_LIMIT ||
    new TextEncoder().encode(value).length > NEGOTIATION_HEADER_LIMIT ||
    /[^\t\x20-\xff]|\x7f/.test(value)
  )
    fail();
}
/** Delimiters inside quoted parameter values are data. Empty list members are ignored. */
const trimOws = (value: string) => value.replace(/^[ \t]+|[ \t]+$/g, "");
function split(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (!quoted && c === delimiter) {
      parts.push(trimOws(value.slice(start, i)));
      start = i + 1;
    }
  }
  if (quoted || escaped) fail();
  parts.push(trimOws(value.slice(start)));
  return parts;
}
function parameterValue(value: string): string {
  if (token.test(value)) return value;
  if (!/^"(?:[^"\\]|\\[\t\x20-\xff])*"$/.test(value)) fail();
  return value.slice(1, -1).replace(/\\(.)/g, "$1");
}
function member(value: string): {
  base: string;
  params: Map<string, string>;
  q: number;
} {
  const pieces = split(value, ";"),
    params = new Map<string, string>();
  let q = 1000;
  if (pieces.length > 33) fail();
  for (const piece of pieces.slice(1)) {
    const eq = piece.indexOf("="),
      key = trimOws(piece.slice(0, eq)).toLowerCase(),
      raw = trimOws(piece.slice(eq + 1));
    if (eq < 1 || !token.test(key) || params.has(key)) fail();
    if (key === "q") {
      if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw)) fail();
      q = Math.round(Number(raw) * 1000);
    }
    params.set(key, parameterValue(raw));
  }
  return { base: pieces[0].toLowerCase(), params, q };
}
function media(
  base: string,
  parameters: Map<string, string>,
  wild: boolean,
): Media {
  const parts = base.split("/");
  if (
    parts.length !== 2 ||
    !parts.every((p) => token.test(p)) ||
    (!wild && parts.includes("*")) ||
    (parts[0] === "*" && parts[1] !== "*")
  )
    fail();
  parameters.delete("q");
  return { type: parts[0], subtype: parts[1], parameters };
}
export function parseNegotiationMediaType(value: string): Media {
  safeHeader(value);
  const m = member(value);
  if (m.params.has("q")) fail();
  return media(m.base, m.params, false);
}
function ranges(
  value: string | null,
  kind: "accept" | "language" | "encoding",
): Range[] | null {
  if (value === null) return null;
  safeHeader(value);
  const parts = split(value, ",").filter(Boolean);
  if (parts.length > 64) fail();
  return parts.map((value) => {
    const m = member(value);
    if (kind === "accept")
      return { value, q: m.q, media: media(m.base, m.params, true) };
    if (
      [...m.params.keys()].some((p) => p !== "q") ||
      !(kind === "language"
        ? m.base === "*" || negotiationLanguage.test(m.base)
        : token.test(m.base))
    )
      fail();
    return { value: m.base, q: m.q };
  });
}
const quality = (
  q: number,
  range: string | null = null,
  specificity = -1,
): NegotiationQuality => ({ q, range, specificity });
function best(list: { r: Range; specificity: number }[]): NegotiationQuality {
  list.sort((a, b) => b.specificity - a.specificity || b.r.q - a.r.q);
  return list.length
    ? quality(list[0].r.q, list[0].r.value, list[0].specificity)
    : quality(0);
}
function mediaQuality(
  type: string,
  accepted: Range[] | null,
): NegotiationQuality {
  if (accepted === null) return quality(1000);
  const actual = parseNegotiationMediaType(type);
  return best(
    accepted.flatMap((r) => {
      const m = r.media!;
      if (
        (m.type !== "*" && m.type !== actual.type) ||
        (m.subtype !== "*" && m.subtype !== actual.subtype)
      )
        return [];
      for (const [k, v] of m.parameters) {
        const a = actual.parameters.get(k);
        if (
          a === undefined ||
          (k === "charset" ? a.toLowerCase() !== v.toLowerCase() : a !== v)
        )
          return [];
      }
      return [
        {
          r,
          specificity:
            (m.type === "*" ? 0 : m.subtype === "*" ? 100 : 200) +
            m.parameters.size,
        },
      ];
    }),
  );
}
function languageQuality(
  tag: string | null,
  accepted: Range[] | null,
): NegotiationQuality {
  if (tag === null || accepted === null) return quality(1000);
  const lower = tag.toLowerCase();
  return best(
    accepted.flatMap((r) =>
      r.value === "*" || lower === r.value || lower.startsWith(r.value + "-")
        ? [{ r, specificity: r.value === "*" ? 0 : r.value.split("-").length }]
        : [],
    ),
  );
}
function encodingQuality(
  coding: string,
  accepted: Range[] | null,
): NegotiationQuality {
  if (accepted === null) return quality(1000);
  const exact = accepted.filter((r) => r.value === coding);
  if (exact.length) return best(exact.map((r) => ({ r, specificity: 1 })));
  const wildcard = best(
    accepted.filter((r) => r.value === "*").map((r) => ({ r, specificity: 0 })),
  );
  if (coding === "identity")
    return wildcard.range !== null && wildcard.q === 0
      ? wildcard
      : quality(1000);
  return wildcard;
}
/** The policy must be normalized before calling; request errors yield 400. */
export function negotiateRepresentation(
  policy: NegotiationPolicy,
  request: NegotiationRequest,
): NegotiationDecision {
  const vary = [
    "Accept",
    "Accept-Encoding",
    ...(policy.language === "filter" ? ["Accept-Language"] : []),
  ];
  const response: NegotiationDecision = {
    status: 406,
    variantId: null,
    vary,
    headers: { Vary: vary.join(", ") },
    candidates: [],
    error: null,
  };
  let accept: Range[] | null,
    language: Range[] | null,
    encoding: Range[] | null;
  for (const field of ["accept", "language", "encoding"] as const) {
    try {
      if (field === "accept") accept = ranges(request.accept, field);
      else if (field === "language")
        language =
          policy.language === "ignore" ? null : ranges(request.language, field);
      else encoding = ranges(request.encoding, field);
    } catch {
      response.status = 400;
      response.error = field;
      return response;
    }
  }
  response.candidates = policy.variants.map((v) => {
    const m = mediaQuality(v.mediaType, accept!),
      l = languageQuality(v.language, language!),
      e = encodingQuality(v.encoding, encoding!);
    return {
      variantId: v.id,
      media: m,
      language: l,
      encoding: e,
      score: m.q * l.q * e.q * v.weight,
      excluded: !v.enabled
        ? "disabled"
        : !m.q
          ? "media"
          : !l.q
            ? "language"
            : !e.q
              ? "encoding"
              : null,
    };
  });
  const order = new Map(policy.variants.map((v, i) => [v.id, i]));
  const eligible = response.candidates
    .filter((c) => !c.excluded)
    .sort(
      (a, b) =>
        (policy.ranking === "media-first" ? b.media.q - a.media.q : 0) ||
        b.score - a.score ||
        order.get(a.variantId)! - order.get(b.variantId)!,
    );
  if (!eligible.length) return response;
  const selected = policy.variants.find((v) => v.id === eligible[0].variantId)!;
  response.status = 200;
  response.variantId = selected.id;
  response.headers["Content-Type"] = selected.mediaType;
  if (selected.language !== null)
    response.headers["Content-Language"] = selected.language;
  if (selected.encoding !== "identity")
    response.headers["Content-Encoding"] = selected.encoding;
  return response;
}
