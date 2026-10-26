import { getByteSize } from "./text-encoding";

export const SOAP11 = "http://schemas.xmlsoap.org/soap/envelope/";
export const SOAP12 = "http://www.w3.org/2003/05/soap-envelope";
export const WSDL = "http://schemas.xmlsoap.org/wsdl/";
export const XSD = "http://www.w3.org/2001/XMLSchema";
export const SOAP_BINDING11 = "http://schemas.xmlsoap.org/wsdl/soap/";
export const SOAP_BINDING12 = "http://schemas.xmlsoap.org/wsdl/soap12/";
export const MAX_SOAP_XML_BYTES = 512 * 1024;
export type SoapVersion = "1.1" | "1.2";
export type SoapIssue =
  | "xml"
  | "limit"
  | "doctype"
  | "wsdl"
  | "reference"
  | "unsupported"
  | "schema"
  | "recursive"
  | "envelope"
  | "version"
  | "body"
  | "path"
  | "rule"
  | "project"
  | "case"
  | "url"
  | "headers"
  | "timeout"
  | "cancelled"
  | "network"
  | "mime";
export class SoapError extends Error {
  constructor(public code: SoapIssue) {
    super(code);
  }
}
export const soapError = (e: unknown) =>
  e instanceof SoapError ? e : new SoapError("network");
export const soapNamespace = (version: SoapVersion) =>
  version === "1.1" ? SOAP11 : SOAP12;
export const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export const xmlKey = (e: Element) => `{${e.namespaceURI ?? ""}}${e.localName}`;
export const xmlChildren = (
  e: Element,
  ns?: string,
  local?: string,
): Element[] =>
  Array.from(e.children).filter(
    (c) =>
      (ns === undefined ||
        c.namespaceURI === ns ||
        (ns === "" && c.namespaceURI === null)) &&
      (local === undefined || c.localName === local),
  );
export function parseSoapXml(source: string): Document {
  if (getByteSize(source) > MAX_SOAP_XML_BYTES) throw new SoapError("limit");
  // Reject declarations before parsing: neither entities nor external resources are loaded.
  const declarations = source.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g,
    "",
  );
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(declarations))
    throw new SoapError("doctype");
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source, "application/xml");
  } catch {
    throw new SoapError("xml");
  }
  if (
    !doc.documentElement ||
    (doc.documentElement.localName === "parsererror" &&
      doc.documentElement.namespaceURI ===
        "http://www.mozilla.org/newlayout/xml/parsererror.xml") ||
    doc.doctype
  )
    throw new SoapError("xml");
  if (Array.from(doc.childNodes).some((n) => n.nodeType === 7))
    throw new SoapError("xml");
  const pending: { element: Element; depth: number }[] = [
    { element: doc.documentElement, depth: 0 },
  ];
  let count = 0;
  while (pending.length) {
    const { element, depth } = pending.pop()!;
    if (++count > 10000 || depth > 48 || element.attributes.length > 100)
      throw new SoapError("limit");
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 7) throw new SoapError("xml");
      if (child.nodeType === 1)
        pending.push({ element: child as Element, depth: depth + 1 });
    }
  }
  return doc;
}
export function resolveXmlQName(value: string, context: Element): string {
  const match = /^(?:([A-Za-z_][\w.-]*):)?([A-Za-z_][\w.-]*)$/.exec(value);
  if (!match) throw new SoapError("reference");
  const ns = context.lookupNamespaceURI(match[1] ?? null);
  if (match[1] && !ns) throw new SoapError("reference");
  return `{${ns ?? ""}}${match[2]}`;
}
export type SoapXmlTree = {
  name: string;
  attributes: Record<string, string>;
  text: string;
  children: SoapXmlTree[];
};
export function soapXmlTree(element: Element): SoapXmlTree {
  return {
    name: xmlKey(element),
    attributes: Object.fromEntries(
      Array.from(element.attributes)
        .filter((a) => a.namespaceURI !== "http://www.w3.org/2000/xmlns/")
        .map((a) => [`{${a.namespaceURI ?? ""}}${a.localName}`, a.value]),
    ),
    text: Array.from(element.childNodes)
      .filter((n) => n.nodeType === 3 || n.nodeType === 4)
      .map((n) => n.textContent ?? "")
      .join(""),
    children: xmlChildren(element).map(soapXmlTree),
  };
}
export type SoapInspection = {
  version: SoapVersion;
  payload: Element;
  tree: SoapXmlTree;
  fault: null | {
    code: string;
    reasons: string[];
    actor: string;
    detail: string;
  };
};
export function inspectSoapEnvelope(
  source: string,
  expected?: SoapVersion,
): SoapInspection {
  const root = parseSoapXml(source).documentElement,
    ns = root.namespaceURI;
  if (root.localName !== "Envelope" || (ns !== SOAP11 && ns !== SOAP12))
    throw new SoapError("envelope");
  const version = ns === SOAP11 ? "1.1" : "1.2";
  if (expected && version !== expected) throw new SoapError("version");
  const children = xmlChildren(root),
    bodies = xmlChildren(root, ns, "Body"),
    headers = xmlChildren(root, ns, "Header");
  if (
    bodies.length !== 1 ||
    headers.length > 1 ||
    Array.from(root.childNodes).some(
      (n) => (n.nodeType === 3 || n.nodeType === 4) && !!n.textContent?.trim(),
    ) ||
    children.some(
      (e) => e.namespaceURI !== ns || !["Header", "Body"].includes(e.localName),
    ) ||
    (headers.length && children[0] !== headers[0])
  )
    throw new SoapError("body");
  const payloads = xmlChildren(bodies[0]);
  if (
    payloads.length !== 1 ||
    (bodies[0].childNodes.length &&
      Array.from(bodies[0].childNodes).some(
        (n) =>
          (n.nodeType === 3 || n.nodeType === 4) && !!n.textContent?.trim(),
      ))
  )
    throw new SoapError("body");
  const payload = payloads[0];
  let fault: SoapInspection["fault"] = null;
  if (payload.namespaceURI === ns && payload.localName === "Fault") {
    const one = (parent: Element, local: string, namespace = ns) =>
      xmlChildren(parent, namespace ?? "", local)[0];
    const text = (e?: Element) => e?.textContent?.trim() ?? "";
    if (version === "1.1") {
      const code = one(payload, "faultcode", ""),
        reason = one(payload, "faultstring", "");
      if (!code || !reason) throw new SoapError("body");
      fault = {
        code: text(code),
        reasons: [text(reason)],
        actor: text(one(payload, "faultactor", "")),
        detail: text(one(payload, "detail", "")),
      };
    } else {
      const code = one(payload, "Code"),
        reason = one(payload, "Reason");
      if (
        !code ||
        !one(code, "Value") ||
        !reason ||
        !xmlChildren(reason, ns, "Text").length
      )
        throw new SoapError("body");
      const codes: string[] = [];
      let current: Element | undefined = code;
      while (current) {
        if (!one(current, "Value")) throw new SoapError("body");
        codes.push(text(one(current, "Value")));
        current = one(current, "Subcode");
      }
      fault = {
        code: codes.join(" / "),
        reasons: xmlChildren(reason, ns, "Text").map((e) => text(e)),
        actor: text(one(payload, "Role")),
        detail: text(one(payload, "Detail")),
      };
    }
  }
  return { version, payload, tree: soapXmlTree(payload), fault };
}
export function wrapSoapBody(
  body: string,
  version: SoapVersion,
  header = "",
): string {
  parseSoapXml(body);
  if (header.trim()) parseSoapXml(`<headers>${header}</headers>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<s:Envelope xmlns:s="${soapNamespace(version)}">\n${header.trim() ? `  <s:Header>${header}</s:Header>\n` : ""}  <s:Body>\n${body}\n  </s:Body>\n</s:Envelope>`;
  inspectSoapEnvelope(xml, version);
  return xml;
}

export type SoapRule = {
  name: string;
  path: string;
  operator: "exists" | "absent" | "equals" | "contains" | "count";
  expected: string;
  trim: boolean;
};
export type SoapRuleResult = {
  index: number;
  passed: boolean;
  matched: number;
};
type PathStep = {
  ns: string;
  local: string;
  index?: number;
  attribute: boolean;
};
export function parseSoapPath(
  path: string,
  namespaces: Record<string, string>,
): PathStep[] {
  if (!path.startsWith("/") || path.length > 1024) throw new SoapError("path");
  const parts = path.slice(1).split("/");
  if (parts.length > 32) throw new SoapError("path");
  return parts.map((part, i) => {
    const m =
      /^(@)?(?:([A-Za-z_][\w.-]*):)?([A-Za-z_][\w.-]*)(?:\[([1-9]\d{0,3})\])?$/.exec(
        part,
      );
    if (
      !m ||
      (m[1] && (i !== parts.length - 1 || i === 0 || m[4])) ||
      (m[2] && !Object.hasOwn(namespaces, m[2]))
    )
      throw new SoapError("path");
    return {
      attribute: !!m[1],
      ns: m[2] ? namespaces[m[2]] : "",
      local: m[3],
      ...(m[4] ? { index: Number(m[4]) } : {}),
    };
  });
}
export function normalizeSoapRules(
  value: unknown,
  namespaces: Record<string, string>,
): SoapRule[] {
  if (!Array.isArray(value) || value.length > 20) throw new SoapError("rule");
  return value.map((r) => {
    if (
      !r ||
      typeof r !== "object" ||
      typeof r.name !== "string" ||
      r.name.length > 120 ||
      typeof r.path !== "string" ||
      !["exists", "absent", "equals", "contains", "count"].includes(
        r.operator,
      ) ||
      typeof r.expected !== "string" ||
      r.expected.length > 4096 ||
      typeof r.trim !== "boolean" ||
      (r.operator === "count" && !/^(0|[1-9]\d{0,4})$/.test(r.expected))
    )
      throw new SoapError("rule");
    parseSoapPath(r.path, namespaces);
    return {
      name: r.name,
      path: r.path,
      operator: r.operator,
      expected: r.expected,
      trim: r.trim,
    };
  });
}
export function evaluateSoapRules(
  payload: Element,
  rules: SoapRule[],
  namespaces: Record<string, string>,
): SoapRuleResult[] {
  return rules.map((rule, index) => {
    const steps = parseSoapPath(rule.path, namespaces);
    let nodes: (Element | Attr)[] = [];
    for (const [i, step] of steps.entries()) {
      const parents = i === 0 ? [payload] : nodes;
      nodes = parents.flatMap<Element | Attr>((parent) => {
        if (parent.nodeType !== 1) return [];
        const element = parent as Element;
        if (step.attribute)
          return Array.from(element.attributes).filter(
            (a) =>
              (a.namespaceURI ?? "") === step.ns && a.localName === step.local,
          );
        const matches = (i === 0 ? [element] : xmlChildren(element)).filter(
          (e) =>
            (e.namespaceURI ?? "") === step.ns && e.localName === step.local,
        );
        return step.index === undefined
          ? matches
          : matches[step.index - 1]
            ? [matches[step.index - 1]]
            : [];
      });
    }
    const values = nodes.map((n) =>
      rule.trim ? (n.textContent ?? "").trim() : (n.textContent ?? ""),
    );
    const passed =
      rule.operator === "exists"
        ? nodes.length > 0
        : rule.operator === "absent"
          ? !nodes.length
          : rule.operator === "count"
            ? nodes.length === Number(rule.expected)
            : values.length > 0 &&
              values.every((v) =>
                rule.operator === "equals"
                  ? v === rule.expected
                  : v.includes(rule.expected),
              );
    return { index, passed, matched: nodes.length };
  });
}
