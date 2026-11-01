import { normalizeNegotiationPolicy } from "./negotiation-project";
import type { NegotiationPolicy } from "./negotiation-engine";
/** Literal source keeps the artifact independent of bundler-renamed functions. */
export function generateNegotiationSelector(value: NegotiationPolicy): string {
  const policy = JSON.stringify(normalizeNegotiationPolicy(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return (
    `// RSSwag content negotiation selector. ES module; no dependencies or network calls.
// RFC 9110 media/coding rules; RFC 4647 basic language filtering.
// Product ranking and language precedence are explicit server policies.
// A 200 decision describes a representation; it is not an HTTP response body.
// Supply exactly those bytes, language and coding. This module does not compress,
// translate, transcode, route, authenticate or validate payloads.
// Preserve existing Vary fields (and Vary: *) when applying decision headers.
// Use selectRequest on the server: browsers may rewrite Accept-Encoding.
const policy = ${policy};
` + RUNTIME
  );
}
const RUNTIME = String.raw`
const token = /^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/;
const languagePattern = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;
const fail = () => { throw new Error("header"); };
function safeHeader(value) {
  if (typeof value !== "string" || value.length > 8192 || new TextEncoder().encode(value).length > 8192 || /[^\t\x20-\xff]|\x7f/.test(value)) fail();
}
const trimOws = value => value.replace(/^[ \t]+|[ \t]+$/g, "");
function split(value, delimiter) {
  const parts = []; let start = 0, quoted = false, escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (escaped) { escaped = false; continue; }
    if (quoted && c === "\\") { escaped = true; continue; }
    if (c === '"') quoted = !quoted;
    if (!quoted && c === delimiter) { parts.push(trimOws(value.slice(start, i))); start = i + 1; }
  }
  if (quoted || escaped) fail();
  parts.push(trimOws(value.slice(start))); return parts;
}
function parameterValue(value) {
  if (token.test(value)) return value;
  if (!/^"(?:[^"\\]|\\[\t\x20-\xff])*"$/.test(value)) fail();
  return value.slice(1, -1).replace(/\\(.)/g, "$1");
}
function member(value) {
  const pieces = split(value, ";"), params = new Map(); let q = 1000;
  if (pieces.length > 33) fail();
  for (const piece of pieces.slice(1)) {
    const eq = piece.indexOf("="), key = trimOws(piece.slice(0, eq)).toLowerCase(), raw = trimOws(piece.slice(eq + 1));
    if (eq < 1 || !token.test(key) || params.has(key)) fail();
    if (key === "q") {
      if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw)) fail();
      q = Math.round(Number(raw) * 1000);
    }
    params.set(key, parameterValue(raw));
  }
  return { base: pieces[0].toLowerCase(), params, q };
}
function media(base, parameters, wild) {
  const parts = base.split("/");
  if (parts.length !== 2 || !parts.every(p => token.test(p)) || (!wild && parts.includes("*")) || (parts[0] === "*" && parts[1] !== "*")) fail();
  parameters.delete("q"); return { type: parts[0], subtype: parts[1], parameters };
}
function actualMedia(value) {
  safeHeader(value); const m = member(value);
  if (m.params.has("q")) fail();
  return media(m.base, m.params, false);
}
function ranges(value, kind) {
  if (value === null) return null;
  safeHeader(value); const parts = split(value, ",").filter(Boolean);
  if (parts.length > 64) fail();
  return parts.map(value => {
    const m = member(value);
    if (kind === "accept") return { value, q: m.q, media: media(m.base, m.params, true) };
    if ([...m.params.keys()].some(p => p !== "q") || !(kind === "language" ? m.base === "*" || languagePattern.test(m.base) : token.test(m.base))) fail();
    return { value: m.base, q: m.q };
  });
}
const quality = (q, range = null, specificity = -1) => ({ q, range, specificity });
function best(list) {
  list.sort((a,b) => b.specificity - a.specificity || b.r.q - a.r.q);
  return list.length ? quality(list[0].r.q, list[0].r.value, list[0].specificity) : quality(0);
}
function mediaQuality(type, accepted) {
  if (accepted === null) return quality(1000);
  const actual = actualMedia(type);
  return best(accepted.flatMap(r => {
    const m = r.media;
    if ((m.type !== "*" && m.type !== actual.type) || (m.subtype !== "*" && m.subtype !== actual.subtype)) return [];
    for (const [k,v] of m.parameters) {
      const a = actual.parameters.get(k);
      if (a === undefined || (k === "charset" ? a.toLowerCase() !== v.toLowerCase() : a !== v)) return [];
    }
    return [{ r, specificity: (m.type === "*" ? 0 : m.subtype === "*" ? 100 : 200) + m.parameters.size }];
  }));
}
function languageQuality(tag, accepted) {
  if (tag === null || accepted === null) return quality(1000);
  const lower = tag.toLowerCase();
  return best(accepted.flatMap(r => r.value === "*" || lower === r.value || lower.startsWith(r.value + "-") ? [{r, specificity: r.value === "*" ? 0 : r.value.split("-").length }] : []));
}
function encodingQuality(coding, accepted) {
  if (accepted === null) return quality(1000);
  const exact = accepted.filter(r => r.value === coding);
  if (exact.length) return best(exact.map(r => ({r, specificity:1})));
  const wildcard = best(accepted.filter(r => r.value === "*").map(r => ({r, specificity:0})));
  if (coding === "identity") return wildcard.range !== null && wildcard.q === 0 ? wildcard : quality(1000);
  return wildcard;
}
export function selectRepresentation(request) {
  const vary = ["Accept", "Accept-Encoding", ...(policy.language === "filter" ? ["Accept-Language"] : [])];
  const response = { status:406, variantId:null, vary, headers:{Vary:vary.join(", ")}, candidates:[], error:null };
  let accept, language, encoding;
  for (const field of ["accept", "language", "encoding"]) {
    try {
      if (field === "accept") accept = ranges(request.accept, field);
      else if (field === "language") language = policy.language === "ignore" ? null : ranges(request.language, field);
      else encoding = ranges(request.encoding, field);
    } catch { response.status = 400; response.error = field; return response; }
  }
  response.candidates = policy.variants.map(v => {
    const m = mediaQuality(v.mediaType, accept), l = languageQuality(v.language, language), e = encodingQuality(v.encoding, encoding);
    return { variantId:v.id, media:m, language:l, encoding:e, score:m.q*l.q*e.q*v.weight, excluded:!v.enabled?"disabled":!m.q?"media":!l.q?"language":!e.q?"encoding":null };
  });
  const order = new Map(policy.variants.map((v,i) => [v.id,i]));
  const eligible = response.candidates.filter(c => !c.excluded).sort((a,b) => (policy.ranking === "media-first" ? b.media.q-a.media.q : 0) || b.score-a.score || order.get(a.variantId)-order.get(b.variantId));
  if (!eligible.length) return response;
  const selected = policy.variants.find(v => v.id === eligible[0].variantId);
  response.status = 200; response.variantId = selected.id; response.headers["Content-Type"] = selected.mediaType;
  if (selected.language !== null) response.headers["Content-Language"] = selected.language;
  if (selected.encoding !== "identity") response.headers["Content-Encoding"] = selected.encoding;
  return response;
}
export function selectRequest(request) {
  return selectRepresentation({accept:request.headers.get("Accept"), language:request.headers.get("Accept-Language"), encoding:request.headers.get("Accept-Encoding")});
}
export function describeVariant(id) {
  const v = policy.variants.find(v => v.id === id);
  return v ? {...v} : null;
}
// Merge negotiation Vary fields into an application's existing response headers.
// This does not set representation metadata or alter a response body.
export function mergeNegotiationVary(existing, decision) {
  const headers = new Headers(existing), values = (headers.get("Vary") || "").split(",").map(v => v.trim()).filter(Boolean);
  if (!values.includes("*")) {
    const seen = new Set(values.map(v => v.toLowerCase()));
    for (const field of decision.vary) if (!seen.has(field.toLowerCase())) { values.push(field); seen.add(field.toLowerCase()); }
    headers.set("Vary", values.join(", "));
  }
  return headers;
}
`;
