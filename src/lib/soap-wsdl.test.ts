import { describe, expect, it } from "vitest";
import { DEMO_SOAP_WSDL, generateSoapExample, readSoapWsdl } from "./soap-wsdl";
import { inspectSoapEnvelope, XSD } from "./soap-xml";

const contract = () => readSoapWsdl(DEMO_SOAP_WSDL);
const generate = (
  source: string,
  direction: "input" | "output" = "input",
  optional = false,
) => {
  const c = readSoapWsdl(source);
  return generateSoapExample(c, c.operations[0], direction, optional);
};
describe("WSDL 1.1 contract discovery", () => {
  it("flags a required SOAP 1.2 action when its value is absent", () => {
    const missing = readSoapWsdl(
      DEMO_SOAP_WSDL.replace(
        '<soap12:operation soapAction="urn:rsswag:GetCustomer"/>',
        "<soap12:operation/>",
      ),
    );
    expect(missing.operations[1]).toMatchObject({
      actionRequired: true,
      issues: ["unsupported"],
    });
    const optional = readSoapWsdl(
      DEMO_SOAP_WSDL.replace(
        '<soap12:operation soapAction="urn:rsswag:GetCustomer"/>',
        '<soap12:operation soapActionRequired="false"/>',
      ),
    );
    expect(optional.operations[1]).toMatchObject({
      actionRequired: false,
      issues: [],
    });
    const c = readSoapWsdl(
      DEMO_SOAP_WSDL.replace(
        '<soap12:operation soapAction="urn:rsswag:GetCustomer"/>',
        '<soap12:operation soapActionRequired="true"/>',
      ),
    );
    expect(c.operations[1].issues).toContain("unsupported");
  });
  it("discovers SOAP 1.1/1.2 service ports, actions, messages, and inline schema elements", () => {
    const c = contract();
    expect(c.name).toBe("CustomerService");
    expect(c.operations).toHaveLength(2);
    expect(c.elements).toHaveLength(2);
    expect(c.diagnostics).toEqual([]);
    expect(c.operations.map((o) => o.version)).toEqual(["1.1", "1.2"]);
    expect(c.operations[0]).toMatchObject({
      name: "GetCustomer",
      action: "urn:rsswag:GetCustomer",
      input: "{urn:rsswag:customers}GetCustomer",
      output: "{urn:rsswag:customers}GetCustomerResponse",
      url: "https://soap.example/customers",
      issues: [],
    });
  });
  it("resolves QName namespaces rather than relying on WSDL prefix spelling", () => {
    const renamed = DEMO_SOAP_WSDL.replaceAll("wsdl:", "w:")
      .replaceAll("xmlns:wsdl=", "xmlns:w=")
      .replaceAll("tns:", "service:")
      .replaceAll("xmlns:tns=", "xmlns:service=");
    expect(readSoapWsdl(renamed).operations).toEqual(contract().operations);
  });
  it("records external imports without fetching definitions", () => {
    const source = DEMO_SOAP_WSDL.replace(
      "<wsdl:types>",
      '<wsdl:import namespace="urn:remote" location="https://unavailable.example/wsdl"/><wsdl:types>',
    ).replace(
      '<xs:schema targetNamespace="urn:rsswag:customers" elementFormDefault="qualified">',
      '<xs:schema targetNamespace="urn:rsswag:customers" elementFormDefault="qualified"><xs:include schemaLocation="https://unavailable.example/types"/>',
    );
    expect(readSoapWsdl(source).diagnostics).toContainEqual({
      code: "external",
      count: 2,
    });
  });
  it.each([
    DEMO_SOAP_WSDL.replaceAll('style="document"', 'style="rpc"'),
    DEMO_SOAP_WSDL.replaceAll('use="literal"', 'use="encoded"'),
    DEMO_SOAP_WSDL.replaceAll(
      '<soap:body use="literal"/>',
      '<soap:body use="literal"/><soap:header message="tns:GetCustomerRequest" part="parameters" use="literal"/>',
    ),
  ])(
    "retains unsupported operations for inspection but blocks template generation",
    (source) => {
      const c = readSoapWsdl(source);
      expect(c.operations[0].issues).toContain("unsupported");
      expect(() =>
        generateSoapExample(c, c.operations[0], "input"),
      ).toThrowError("unsupported");
    },
  );
  it("retains unresolved operations with explicit diagnostics", () => {
    const c = readSoapWsdl(
      DEMO_SOAP_WSDL.replace(
        'message="tns:GetCustomerRequest"',
        'message="tns:Missing"',
      ),
    );
    expect(c.operations[0].issues).toContain("reference");
    expect(c.diagnostics).toContainEqual({ code: "unsupported", count: 2 });
  });
  it("rejects duplicate global definitions and WSDL 2 documents", () => {
    expect(() =>
      readSoapWsdl(
        DEMO_SOAP_WSDL.replace(
          "</wsdl:definitions>",
          '<wsdl:message name="GetCustomerRequest"/></wsdl:definitions>',
        ),
      ),
    ).toThrowError("wsdl");
    expect(() =>
      readSoapWsdl('<description xmlns="http://www.w3.org/ns/wsdl"/>'),
    ).toThrowError("wsdl");
  });
  it("supports bindings without published addresses for local exploration", () => {
    const source = DEMO_SOAP_WSDL.replace(
      /<wsdl:service[\s\S]*<\/wsdl:service>/,
      "",
    );
    const c = readSoapWsdl(source);
    expect(c.operations).toHaveLength(2);
    expect(c.operations[0].url).toBe("");
    expect(c.operations[0].issues).toEqual([]);
  });
});
describe("bounded XML Schema example generation", () => {
  it("generates namespace-correct inputs, named types, enums, required attributes and optional fields", () => {
    const c = contract();
    for (const op of c.operations) {
      expect(
        inspectSoapEnvelope(generateSoapExample(c, op, "input"), op.version)
          .tree.name,
      ).toBe(op.input);
      const xml = generateSoapExample(c, op, "output");
      expect(xml).toContain('active="false"');
      expect(xml).toContain(">standard</tier>");
      expect(xml).not.toContain("<email");
      expect(generateSoapExample(c, op, "output", true)).toContain("<email");
    }
  });
  it("handles unqualified local elements and fixed/default values safely", () => {
    const source = DEMO_SOAP_WSDL.replace(
      'elementFormDefault="qualified"',
      'elementFormDefault="unqualified"',
    ).replaceAll(
      'name="id" type="xs:integer"',
      'name="id" type="xs:integer" fixed="7"',
    );
    const inspected = inspectSoapEnvelope(generate(source));
    expect(inspected.tree.name).toBe("{urn:rsswag:customers}GetCustomer");
    expect(inspected.tree.children[0]).toMatchObject({
      name: "{}id",
      text: "7",
    });
    expect(
      generate(
        DEMO_SOAP_WSDL.replaceAll(
          'name="id" type="xs:integer"',
          'name="id" type="xs:string" default="a&amp;&lt;b"',
        ),
      ),
    ).toContain("a&amp;&lt;b");
  });
  it("generates local element references and bounded minimum array occurrences", () => {
    const source = DEMO_SOAP_WSDL.replace(
      '<xs:element name="id" type="xs:integer"/></xs:sequence></xs:complexType></xs:element>',
      '<xs:element ref="tns:Shared" minOccurs="2"/></xs:sequence></xs:complexType></xs:element>',
    ).replace(
      "</xs:schema>",
      '<xs:element name="Shared" type="xs:string"/></xs:schema>',
    );
    expect(
      inspectSoapEnvelope(generate(source)).tree.children.map((e) => e.name),
    ).toEqual(["{urn:rsswag:customers}Shared", "{urn:rsswag:customers}Shared"]);
  });
  it("supports complex type extension and simple content with attributes", () => {
    const source = DEMO_SOAP_WSDL.replace(
      '<xs:element name="id" type="xs:integer"/></xs:sequence></xs:complexType></xs:element>',
      '<xs:element name="data" type="tns:Derived"/><xs:element name="label" type="tns:Label"/></xs:sequence></xs:complexType></xs:element>',
    ).replace(
      "</xs:schema>",
      '<xs:complexType name="Base"><xs:sequence><xs:element name="first" type="xs:string"/></xs:sequence></xs:complexType><xs:complexType name="Derived"><xs:complexContent><xs:extension base="tns:Base"><xs:sequence><xs:element name="second" type="xs:int"/></xs:sequence></xs:extension></xs:complexContent></xs:complexType><xs:complexType name="Label"><xs:simpleContent><xs:extension base="xs:string"><xs:attribute name="lang" type="xs:string" use="required" fixed="en"/></xs:extension></xs:simpleContent></xs:complexType></xs:schema>',
    );
    const xml = generate(source);
    expect(xml).toContain("<first");
    expect(xml).toContain("<second");
    expect(xml).toContain('lang="en">example</label>');
  });
  it("stops required recursion and skips optional recursive branches", () => {
    const recursive = DEMO_SOAP_WSDL.replace(
      '<xs:element name="id" type="xs:integer"/></xs:sequence></xs:complexType></xs:element>',
      '<xs:element name="next" type="tns:Recursive"/></xs:sequence></xs:complexType></xs:element>',
    ).replace(
      "</xs:schema>",
      '<xs:complexType name="Recursive"><xs:sequence><xs:element name="child" type="tns:Recursive" minOccurs="0"/></xs:sequence></xs:complexType></xs:schema>',
    );
    expect(generate(recursive)).not.toContain("<child");
    expect(() => generate(recursive, "input", true)).toThrowError("recursive");
  });
  it("refuses unsupported choice groups and excessive multiplicities rather than producing a misleading template", () => {
    expect(() =>
      generate(DEMO_SOAP_WSDL.replaceAll("xs:sequence", "xs:choice")),
    ).toThrowError("schema");
    expect(() =>
      generate(
        DEMO_SOAP_WSDL.replace(
          'name="id" type="xs:integer"/></xs:sequence></xs:complexType></xs:element>',
          'name="id" type="xs:integer" minOccurs="100"/></xs:sequence></xs:complexType></xs:element>',
        ),
      ),
    ).toThrowError("limit");
  });
  it("does not silently invent values for unresolved types", () => {
    expect(() =>
      generate(
        DEMO_SOAP_WSDL.replaceAll('type="xs:integer"', 'type="tns:Unknown"'),
      ),
    ).toThrowError("schema");
    expect(contract().typeIndex.has(`{${XSD}}string`)).toBe(false);
  });
});
