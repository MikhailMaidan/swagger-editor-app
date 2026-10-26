import {
  parseSoapXml,
  resolveXmlQName,
  SoapError,
  WSDL,
  XSD,
  SOAP_BINDING11,
  SOAP_BINDING12,
  xmlChildren,
  xmlEscape,
  wrapSoapBody,
  type SoapVersion,
  type SoapIssue,
} from "./soap-xml";

export type SoapOperation = {
  id: string;
  service: string;
  port: string;
  binding: string;
  name: string;
  version: SoapVersion;
  url: string;
  action: string;
  actionRequired: boolean;
  input: string;
  output: string;
  issues: SoapIssue[];
};
export type SoapContract = {
  name: string;
  namespace: string;
  operations: SoapOperation[];
  elements: string[];
  diagnostics: { code: "external" | "unsupported"; count: number }[];
  document: Document;
  schemas: Element[];
  elementIndex: Map<string, Element>;
  typeIndex: Map<string, Element>;
};
const attr = (e: Element, name: string) => e.getAttribute(name) ?? "";
const first = (e: Element, ns: string, local: string) =>
  xmlChildren(e, ns, local)[0];
const key = (ns: string, name: string) => `{${ns}}${name}`;
function index(elements: Element[], namespace: string): Map<string, Element> {
  const result = new Map<string, Element>();
  for (const e of elements) {
    const name = attr(e, "name");
    if (!/^[A-Za-z_][\w.-]*$/.test(name) || result.has(key(namespace, name)))
      throw new SoapError("wsdl");
    result.set(key(namespace, name), e);
  }
  return result;
}
export function readSoapWsdl(source: string): SoapContract {
  const document = parseSoapXml(source),
    root = document.documentElement;
  if (root.namespaceURI !== WSDL || root.localName !== "definitions")
    throw new SoapError("wsdl");
  const namespace = attr(root, "targetNamespace"),
    schemas = xmlChildren(root, WSDL, "types").flatMap((e) =>
      xmlChildren(e, XSD, "schema"),
    );
  const elementIndex = new Map<string, Element>(),
    typeIndex = new Map<string, Element>();
  for (const schema of schemas) {
    const ns = attr(schema, "targetNamespace");
    for (const [k, v] of index(xmlChildren(schema, XSD, "element"), ns)) {
      if (elementIndex.has(k)) throw new SoapError("wsdl");
      elementIndex.set(k, v);
    }
    for (const [k, v] of index(
      [
        ...xmlChildren(schema, XSD, "complexType"),
        ...xmlChildren(schema, XSD, "simpleType"),
      ],
      ns,
    )) {
      if (typeIndex.has(k)) throw new SoapError("wsdl");
      typeIndex.set(k, v);
    }
  }
  const messages = index(xmlChildren(root, WSDL, "message"), namespace),
    portTypes = index(xmlChildren(root, WSDL, "portType"), namespace),
    bindings = index(xmlChildren(root, WSDL, "binding"), namespace);
  const services = xmlChildren(root, WSDL, "service");
  index(services, namespace);
  const operations: SoapOperation[] = [];
  const published = new Map<
    string,
    { service: string; name: string; address: Element | undefined }[]
  >();
  for (const service of services) {
    const ports = xmlChildren(service, WSDL, "port");
    index(ports, namespace);
    for (const port of ports) {
      const bindingKey = resolveXmlQName(attr(port, "binding"), port),
        list = published.get(bindingKey) ?? [];
      list.push({
        service: attr(service, "name"),
        name: attr(port, "name"),
        address:
          first(port, SOAP_BINDING11, "address") ??
          first(port, SOAP_BINDING12, "address"),
      });
      published.set(bindingKey, list);
    }
  }
  const messageElement = (
    operation: Element | undefined,
    direction: "input" | "output",
    body: Element | undefined,
  ): string => {
    if (!operation || !body || attr(body, "use") !== "literal")
      throw new SoapError("unsupported");
    const io = first(operation, WSDL, direction);
    if (!io) throw new SoapError("unsupported");
    const message = messages.get(resolveXmlQName(attr(io, "message"), io));
    if (!message) throw new SoapError("reference");
    const parts = xmlChildren(message, WSDL, "part");
    const selected = attr(body, "parts").trim().split(/\s+/).filter(Boolean);
    const selectedParts = selected.length
      ? parts.filter((p) => selected.includes(attr(p, "name")))
      : parts;
    if (
      selectedParts.length !== 1 ||
      selected.length > 1 ||
      !attr(selectedParts[0], "element")
    )
      throw new SoapError("unsupported");
    const element = resolveXmlQName(
      attr(selectedParts[0], "element"),
      selectedParts[0],
    );
    if (!elementIndex.has(element)) throw new SoapError("reference");
    return element;
  };
  for (const [bindingKey, binding] of bindings) {
    const soap =
      first(binding, SOAP_BINDING11, "binding") ??
      first(binding, SOAP_BINDING12, "binding");
    if (!soap) continue;
    const ns = soap.namespaceURI!,
      version: SoapVersion = ns === SOAP_BINDING11 ? "1.1" : "1.2";
    let portType: Element | undefined;
    try {
      portType = portTypes.get(resolveXmlQName(attr(binding, "type"), binding));
    } catch {}
    const portOperations = portType
      ? xmlChildren(portType, WSDL, "operation")
      : [];
    const bindingOperations = xmlChildren(binding, WSDL, "operation");
    index(bindingOperations, namespace);
    for (const bound of bindingOperations) {
      const name = attr(bound, "name"),
        matched = portOperations.filter((e) => attr(e, "name") === name),
        operation = matched.length === 1 ? matched[0] : undefined;
      const soapOperation = first(bound, ns, "operation"),
        issues: SoapIssue[] = [];
      const actionRequired =
        version === "1.2" &&
        (!soapOperation ||
          !["false", "0"].includes(attr(soapOperation, "soapActionRequired")));
      const style =
        (soapOperation && attr(soapOperation, "style")) ||
        attr(soap, "style") ||
        "document";
      if (
        style !== "document" ||
        !soapOperation ||
        (actionRequired && !attr(soapOperation, "soapAction")) ||
        attr(soap, "transport") !== "http://schemas.xmlsoap.org/soap/http" ||
        xmlChildren(bound, WSDL, "input").some(
          (io) => xmlChildren(io, ns, "header").length,
        )
      )
        issues.push("unsupported");
      let input = "",
        output = "";
      try {
        input = messageElement(
          operation,
          "input",
          first(first(bound, WSDL, "input") ?? bound, ns, "body"),
        );
        output = messageElement(
          operation,
          "output",
          first(first(bound, WSDL, "output") ?? bound, ns, "body"),
        );
      } catch (e) {
        issues.push(e instanceof SoapError ? e.code : "reference");
      }
      for (const port of published.get(bindingKey) ?? [
        { service: "", name: "", address: undefined },
      ]) {
        if (operations.length >= 100) throw new SoapError("limit");
        const addressMatches =
          !port.address || port.address.namespaceURI === ns;
        operations.push({
          id: `${bindingKey}/${port.service}/${port.name}/${name}`,
          service: port.service,
          port: port.name,
          binding: attr(binding, "name"),
          name,
          version,
          url: port.address ? attr(port.address, "location") : "",
          action: soapOperation ? attr(soapOperation, "soapAction") : "",
          actionRequired,
          input,
          output,
          issues: Array.from(
            new Set([
              ...issues,
              ...(!addressMatches ? ["unsupported" as const] : []),
            ]),
          ),
        });
      }
    }
  }
  if (!operations.length) throw new SoapError("unsupported");
  const external =
    document.getElementsByTagNameNS(WSDL, "import").length +
    ["import", "include", "redefine"].reduce(
      (n, local) => n + document.getElementsByTagNameNS(XSD, local).length,
      0,
    );
  const unsupported = operations.filter((o) => o.issues.length).length;
  return {
    name: attr(root, "name") || "SOAP service",
    namespace,
    document,
    schemas,
    elementIndex,
    typeIndex,
    elements: Array.from(elementIndex.keys()),
    operations,
    diagnostics: [
      ...(external ? [{ code: "external" as const, count: external }] : []),
      ...(unsupported
        ? [{ code: "unsupported" as const, count: unsupported }]
        : []),
    ],
  };
}
const lexical = (type: string) => {
  const name = type.slice(type.indexOf("}") + 1);
  if (!type.startsWith(`{${XSD}}`)) throw new SoapError("schema");
  if (
    [
      "int",
      "integer",
      "long",
      "short",
      "byte",
      "unsignedLong",
      "unsignedInt",
      "unsignedShort",
      "unsignedByte",
      "nonNegativeInteger",
      "nonPositiveInteger",
      "decimal",
      "float",
      "double",
    ].includes(name)
  )
    return "0";
  if (name === "positiveInteger") return "1";
  if (name === "negativeInteger") return "-1";
  if (name === "boolean") return "false";
  if (name === "date") return "2026-01-01";
  if (name === "dateTime") return "2026-01-01T00:00:00Z";
  if (name === "time") return "00:00:00Z";
  if (name === "base64Binary") return "AA==";
  if (name === "hexBinary") return "00";
  if (name === "anyURI") return "https://example.com";
  if (
    [
      "string",
      "normalizedString",
      "token",
      "language",
      "Name",
      "NCName",
      "NMTOKEN",
      "ID",
      "IDREF",
      "ENTITY",
      "QName",
    ].includes(name)
  )
    return "example";
  throw new SoapError("schema");
};
export function generateSoapExample(
  contract: SoapContract,
  operation: SoapOperation,
  direction: "input" | "output",
  includeOptional = false,
): string {
  if (operation.issues.length) throw new SoapError(operation.issues[0]);
  const declaration = contract.elementIndex.get(operation[direction]);
  if (!declaration) throw new SoapError("reference");
  const active = new Set<Element>();
  let count = 0;
  function guard<T>(element: Element, work: () => T): T {
    if (active.has(element)) throw new SoapError("recursive");
    if (active.size > 24 || ++count > 500) throw new SoapError("limit");
    active.add(element);
    try {
      return work();
    } finally {
      active.delete(element);
    }
  }
  function schemaOf(element: Element): Element {
    let schema: Element | null = element;
    while (
      schema &&
      !(schema.namespaceURI === XSD && schema.localName === "schema")
    )
      schema = schema.parentElement;
    if (!schema) throw new SoapError("schema");
    return schema;
  }
  function typeValue(
    type: string,
    context: Element,
  ): { text: string; children: string; attributes: string } {
    const resolved = resolveXmlQName(type, context),
      definition = contract.typeIndex.get(resolved);
    return definition
      ? definitionValue(definition)
      : { text: lexical(resolved), children: "", attributes: "" };
  }
  function definitionValue(definition: Element): {
    text: string;
    children: string;
    attributes: string;
  } {
    return guard(definition, () => {
      if (
        attr(definition, "mixed") === "true" ||
        attr(definition, "abstract") === "true"
      )
        throw new SoapError("schema");
      const restriction = first(definition, XSD, "restriction");
      if (definition.localName === "simpleType") {
        if (!restriction) throw new SoapError("schema");
        const enumeration = first(restriction, XSD, "enumeration");
        return {
          text: enumeration
            ? attr(enumeration, "value")
            : typeValue(attr(restriction, "base"), restriction).text,
          children: "",
          attributes: "",
        };
      }
      const content =
        first(definition, XSD, "complexContent") ??
        first(definition, XSD, "simpleContent");
      let inherited = { text: "", children: "", attributes: "" },
        container = definition;
      if (content) {
        const extension = first(content, XSD, "extension");
        if (!extension) throw new SoapError("schema");
        inherited = typeValue(attr(extension, "base"), extension);
        container = extension;
      }
      let children = inherited.children,
        attributes = inherited.attributes;
      for (const child of xmlChildren(container, XSD)) {
        if (
          ["annotation", "simpleContent", "complexContent"].includes(
            child.localName,
          )
        )
          continue;
        if (["sequence", "all"].includes(child.localName)) {
          if (
            xmlChildren(child, XSD).some(
              (e) => !["element", "annotation"].includes(e.localName),
            )
          )
            throw new SoapError("schema");
          children += xmlChildren(child, XSD, "element")
            .map((e) => emitElement(e, false))
            .join("\n");
        } else if (child.localName === "attribute") {
          if (
            attr(child, "use") === "prohibited" ||
            (attr(child, "use") !== "required" && !includeOptional)
          )
            continue;
          if (
            attr(child, "ref") ||
            attr(child, "form") === "qualified" ||
            attr(schemaOf(child), "attributeFormDefault") === "qualified"
          )
            throw new SoapError("schema");
          const name = attr(child, "name");
          if (!/^[A-Za-z_][\w.-]*$/.test(name)) throw new SoapError("schema");
          const inline = first(child, XSD, "simpleType");
          const value = child.hasAttribute("fixed")
            ? attr(child, "fixed")
            : child.hasAttribute("default")
              ? attr(child, "default")
              : inline
                ? definitionValue(inline).text
                : typeValue(attr(child, "type") || "", child).text;
          attributes += ` ${name}="${xmlEscape(value)}"`;
        } else throw new SoapError("schema");
      }
      return { text: inherited.text, children, attributes };
    });
  }
  function emitElement(element: Element, global: boolean): string {
    const minimum = element.hasAttribute("minOccurs")
      ? Number(attr(element, "minOccurs"))
      : 1;
    if (!Number.isInteger(minimum) || minimum < 0 || minimum > 3)
      throw new SoapError("limit");
    if ((!minimum && !includeOptional) || attr(element, "maxOccurs") === "0")
      return "";
    return guard(element, () => {
      if (attr(element, "ref")) {
        const target = contract.elementIndex.get(
          resolveXmlQName(attr(element, "ref"), element),
        );
        if (!target) throw new SoapError("reference");
        return Array.from({ length: Math.max(1, minimum) }, () =>
          emitElement(target, true),
        ).join("\n");
      }
      if (
        attr(element, "abstract") === "true" ||
        attr(element, "substitutionGroup")
      )
        throw new SoapError("schema");
      const schema = schemaOf(element),
        name = attr(element, "name");
      if (!/^[A-Za-z_][\w.-]*$/.test(name)) throw new SoapError("schema");
      const namespace =
        global ||
        attr(element, "form") === "qualified" ||
        (!attr(element, "form") &&
          attr(schema, "elementFormDefault") === "qualified")
          ? attr(schema, "targetNamespace")
          : "";
      const inline =
        first(element, XSD, "complexType") ?? first(element, XSD, "simpleType");
      const value = inline
        ? definitionValue(inline)
        : attr(element, "type")
          ? typeValue(attr(element, "type"), element)
          : { text: "example", children: "", attributes: "" };
      if (element.hasAttribute("fixed")) value.text = attr(element, "fixed");
      else if (element.hasAttribute("default"))
        value.text = attr(element, "default");
      const xml = `<${name} xmlns="${xmlEscape(namespace)}"${value.attributes}>${xmlEscape(value.text)}${value.children ? `\n${value.children}\n` : ""}</${name}>`;
      return Array.from({ length: Math.max(1, minimum) }, () => xml).join("\n");
    });
  }
  return wrapSoapBody(emitElement(declaration, true), operation.version);
}

export const DEMO_SOAP_WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:tns="urn:rsswag:customers" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/" targetNamespace="urn:rsswag:customers" name="CustomerService">
  <wsdl:types><xs:schema targetNamespace="urn:rsswag:customers" elementFormDefault="qualified">
    <xs:simpleType name="CustomerTier"><xs:restriction base="xs:string"><xs:enumeration value="standard"/><xs:enumeration value="premium"/></xs:restriction></xs:simpleType>
    <xs:complexType name="Customer"><xs:sequence><xs:element name="id" type="xs:integer"/><xs:element name="name" type="xs:string"/><xs:element name="tier" type="tns:CustomerTier"/><xs:element name="email" type="xs:string" minOccurs="0"/></xs:sequence><xs:attribute name="active" type="xs:boolean" use="required"/></xs:complexType>
    <xs:element name="GetCustomer"><xs:complexType><xs:sequence><xs:element name="id" type="xs:integer"/></xs:sequence></xs:complexType></xs:element>
    <xs:element name="GetCustomerResponse"><xs:complexType><xs:sequence><xs:element name="customer" type="tns:Customer"/></xs:sequence></xs:complexType></xs:element>
  </xs:schema></wsdl:types>
  <wsdl:message name="GetCustomerRequest"><wsdl:part name="parameters" element="tns:GetCustomer"/></wsdl:message>
  <wsdl:message name="GetCustomerResponse"><wsdl:part name="parameters" element="tns:GetCustomerResponse"/></wsdl:message>
  <wsdl:portType name="CustomerPortType"><wsdl:operation name="GetCustomer"><wsdl:input message="tns:GetCustomerRequest"/><wsdl:output message="tns:GetCustomerResponse"/></wsdl:operation></wsdl:portType>
  <wsdl:binding name="CustomerSoap11" type="tns:CustomerPortType"><soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/><wsdl:operation name="GetCustomer"><soap:operation soapAction="urn:rsswag:GetCustomer"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation></wsdl:binding>
  <wsdl:binding name="CustomerSoap12" type="tns:CustomerPortType"><soap12:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/><wsdl:operation name="GetCustomer"><soap12:operation soapAction="urn:rsswag:GetCustomer"/><wsdl:input><soap12:body use="literal"/></wsdl:input><wsdl:output><soap12:body use="literal"/></wsdl:output></wsdl:operation></wsdl:binding>
  <wsdl:service name="Customers"><wsdl:port name="Soap11" binding="tns:CustomerSoap11"><soap:address location="https://soap.example/customers"/></wsdl:port><wsdl:port name="Soap12" binding="tns:CustomerSoap12"><soap12:address location="https://soap.example/customers"/></wsdl:port></wsdl:service>
</wsdl:definitions>`;
