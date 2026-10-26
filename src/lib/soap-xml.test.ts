import { describe, expect, it } from "vitest";
import {
  evaluateSoapRules,
  inspectSoapEnvelope,
  normalizeSoapRules,
  parseSoapXml,
  resolveXmlQName,
  SOAP11,
  SOAP12,
  soapXmlTree,
  wrapSoapBody,
} from "./soap-xml";
import { soapFaultExample } from "./soap-studio";

describe("bounded namespace-aware SOAP XML", () => {
  it("keeps literal declaration text in CDATA/comments without enabling DTD processing", () => {
    const doc = parseSoapXml(
      "<r><!-- <!DOCTYPE fake> --><![CDATA[<!DOCTYPE text>]]></r>",
    );
    expect(doc.documentElement.textContent).toBe("<!DOCTYPE text>");
  });
  it.each(["1.1", "1.2"] as const)(
    "wraps and reads SOAP %s independently of prefixes",
    (version) => {
      const xml = wrapSoapBody(
        '<u:Result xmlns:u="urn:users" id="1"><u:name>Привет 🌍 &amp; friends</u:name></u:Result>',
        version,
      );
      const inspected = inspectSoapEnvelope(
        xml
          .replace(/<(\/?)s:/g, "<$1envelope:")
          .replace("xmlns:s=", "xmlns:envelope="),
        version,
      );
      expect(inspected.version).toBe(version);
      expect(inspected.tree.name).toBe("{urn:users}Result");
      expect(inspected.tree.attributes).toEqual({ "{}id": "1" });
      expect(inspected.tree.children[0].text).toBe("Привет 🌍 & friends");
      expect(inspected.fault).toBeNull();
    },
  );
  it("decodes SOAP 1.1 and nested SOAP 1.2 faults including translated reasons", () => {
    expect(() =>
      inspectSoapEnvelope(
        soapFaultExample("1.2").replace(
          "<s:Subcode><s:Value>UnknownCustomer</s:Value></s:Subcode>",
          "<s:Subcode/>",
        ),
      ),
    ).toThrowError("body");
    expect(inspectSoapEnvelope(soapFaultExample("1.1")).fault).toMatchObject({
      code: "s:Client",
      reasons: ["Customer not found"],
      detail: "404",
    });
    expect(inspectSoapEnvelope(soapFaultExample("1.2")).fault).toMatchObject({
      code: "s:Sender / UnknownCustomer",
      reasons: ["Customer not found", "Клиент не найден"],
    });
    expect(
      inspectSoapEnvelope(
        wrapSoapBody('<Fault xmlns="urn:app">Business value</Fault>', "1.1"),
      ).fault,
    ).toBeNull();
  });
  it.each([
    '<!DOCTYPE r [<!ENTITY secret SYSTEM "file:///private">]><r>&secret;</r>',
    '<!DOCTYPE r SYSTEM "https://external.example/dtd"><r/>',
    '<!ENTITY a "b"><r/>',
  ])("rejects DTD/entity declarations before XML parsing", (source) =>
    expect(() => parseSoapXml(source)).toThrowError("doctype"),
  );
  it.each([
    "<r>",
    "<r/><second/>",
    '<?xml-stylesheet href="https://external.example/a"?><r/>',
    "<r><?process data?></r>",
    "<u:r/>",
  ])("rejects malformed XML and processing instructions", (source) =>
    expect(() => parseSoapXml(source)).toThrowError("xml"),
  );
  it("bounds bytes, node counts, attributes and nesting", () => {
    expect(() => parseSoapXml(`<r>${"я".repeat(300000)}</r>`)).toThrowError(
      "limit",
    );
    expect(() => parseSoapXml(`<r>${"<a/>".repeat(10001)}</r>`)).toThrowError(
      "limit",
    );
    expect(() =>
      parseSoapXml("<r>".repeat(50) + "</r>".repeat(50)),
    ).toThrowError("limit");
    expect(() =>
      parseSoapXml(
        `<r ${Array.from({ length: 101 }, (_, i) => `a${i}="x"`).join(" ")}/>`,
      ),
    ).toThrowError("limit");
  });
  it.each([
    `<s:Envelope xmlns:s="${SOAP11}"><s:Body/><s:Body/></s:Envelope>`,
    `<s:Envelope xmlns:s="${SOAP11}"><s:Body><a/><b/></s:Body></s:Envelope>`,
    `<s:Envelope xmlns:s="${SOAP11}"><s:Body><a/></s:Body><s:Header/></s:Envelope>`,
    `<s:Envelope xmlns:s="${SOAP11}"><s:Body>text<a/></s:Body></s:Envelope>`,
    `<s:Envelope xmlns:s="${SOAP11}">unexpected<s:Body><a/></s:Body></s:Envelope>`,
    `<s:Envelope xmlns:s="${SOAP11}"><s:Body><s:Fault><faultcode>s:Client</faultcode></s:Fault></s:Body></s:Envelope>`,
  ])("rejects invalid document/literal envelope shapes", (source) =>
    expect(() => inspectSoapEnvelope(source)).toThrowError("body"),
  );
  it("rejects a wrong version/namespace and resolves qualified names in local namespace scope", () => {
    expect(() =>
      inspectSoapEnvelope(wrapSoapBody("<r/>", "1.2"), "1.1"),
    ).toThrowError("version");
    expect(() =>
      inspectSoapEnvelope(
        '<Envelope xmlns="urn:wrong"><Body><r/></Body></Envelope>',
      ),
    ).toThrowError("envelope");
    const root = parseSoapXml(
      '<r xmlns:p="urn:root"><c xmlns:p="urn:local"/></r>',
    ).documentElement;
    expect(resolveXmlQName("p:Message", root.firstElementChild!)).toBe(
      "{urn:local}Message",
    );
    expect(() => resolveXmlQName("unknown:X", root)).toThrowError("reference");
  });
  it("preserves namespace identities, CDATA, and prototype-like names as inert tree data", () => {
    const applicationError = inspectSoapEnvelope(
      wrapSoapBody(
        '<parsererror xmlns="urn:application"><parsererror>Ordinary application data</parsererror></parsererror>',
        "1.1",
      ),
    );
    expect(applicationError.tree.name).toBe("{urn:application}parsererror");
    expect(applicationError.tree.children[0].text).toBe(
      "Ordinary application data",
    );
    const tree = soapXmlTree(
      parseSoapXml(
        '<r xmlns:a="urn:a" xmlns:b="urn:b" __proto__="safe"><a:id>1</a:id><b:id><![CDATA[<2>]]></b:id></r>',
      ).documentElement,
    );
    expect(tree.children.map((n) => n.name)).toEqual([
      "{urn:a}id",
      "{urn:b}id",
    ]);
    expect(tree.children[1].text).toBe("<2>");
    expect(tree.attributes["{}__proto__"]).toBe("safe");
  });
});
describe("SOAP path assertions", () => {
  const namespaces = { u: "urn:users" },
    payload = parseSoapXml(
      '<v:Result xmlns:v="urn:users"><v:item id="a"> first </v:item><v:item id="b">second</v:item><item>unqualified</item></v:Result>',
    ).documentElement;
  const rule = {
    name: "item",
    path: "/u:Result/u:item",
    operator: "exists" as const,
    expected: "",
    trim: true,
  };
  it("matches namespace URIs rather than response prefixes, with per-parent indexes and attributes", () => {
    const rules = normalizeSoapRules(
      [
        { ...rule, operator: "count", expected: "2" },
        {
          ...rule,
          path: "/u:Result/u:item[2]/@id",
          operator: "equals",
          expected: "b",
        },
        {
          ...rule,
          path: "/u:Result/u:item[1]",
          operator: "equals",
          expected: "first",
        },
        {
          ...rule,
          path: "/u:Result/item",
          operator: "contains",
          expected: "qualified",
        },
      ],
      namespaces,
    );
    expect(
      evaluateSoapRules(payload, rules, namespaces).every((r) => r.passed),
    ).toBe(true);
  });
  it("checks every matched value and does not pass equality on empty selection", () => {
    const rules = normalizeSoapRules(
      [
        { ...rule, operator: "equals", expected: "first" },
        {
          ...rule,
          path: "/u:Result/u:missing",
          operator: "equals",
          expected: "",
        },
        { ...rule, path: "/u:Result/u:missing", operator: "absent" },
        {
          ...rule,
          operator: "equals",
          expected: " first ",
          path: "/u:Result/u:item[1]",
          trim: false,
        },
      ],
      namespaces,
    );
    expect(
      evaluateSoapRules(payload, rules, namespaces).map((r) => r.passed),
    ).toEqual([false, false, true, true]);
  });
  it.each([
    "//u:item",
    "/u:Result/*",
    "/u:Result/../x",
    "/u:Result/u:item[0]",
    "/u:Result/u:item[@id='a']",
    "/missing:Result",
    "/u:Result/@id/child",
  ])("rejects unsupported path grammar %s", (path) =>
    expect(() =>
      normalizeSoapRules([{ ...rule, path }], namespaces),
    ).toThrowError("path"),
  );
  it("rejects malformed rules and keeps only canonical fields", () => {
    expect(() =>
      normalizeSoapRules(
        [{ ...rule, operator: "count", expected: "-1" }],
        namespaces,
      ),
    ).toThrowError("rule");
    expect(
      normalizeSoapRules([{ ...rule, secret: "drop" }], namespaces),
    ).toEqual([rule]);
    expect(() =>
      normalizeSoapRules(
        Array.from({ length: 21 }, () => rule),
        namespaces,
      ),
    ).toThrowError("rule");
    expect(
      inspectSoapEnvelope(wrapSoapBody("<r/>", "1.2")).payload.namespaceURI,
    ).not.toBe(SOAP12);
  });
});
