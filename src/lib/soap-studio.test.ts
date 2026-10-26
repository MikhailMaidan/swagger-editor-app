import { describe, expect, it, vi } from "vitest";
import {
  demoSoapProject,
  evaluateSoapCase,
  normalizeSoapNamespaces,
  parseSoapProject,
  runSoapCases,
  serializeSoapProject,
  soapCasesReport,
  soapUrl,
  validateSoapRequest,
} from "./soap-studio";
import { readSoapWsdl } from "./soap-wsdl";
import { wrapSoapBody } from "./soap-xml";

describe("portable SOAP workspaces and regressions", () => {
  it("round-trips a demo and passes all success, fault and malformed-envelope fixtures", async () => {
    const p = demoSoapProject();
    expect(parseSoapProject(serializeSoapProject(p))).toEqual(p);
    const report = await runSoapCases(p);
    expect(report).toMatchObject({
      total: 5,
      completed: 5,
      passed: 5,
      failed: 0,
      complete: true,
    });
  });
  it("strips imported credentials, results, and unknown metadata", () => {
    const p = demoSoapProject(),
      source = JSON.stringify({
        ...p,
        headers: { Authorization: "secret" },
        results: ["secret"],
        request: { ...p.request, token: "secret" },
        cases: p.cases.map((c) => ({ ...c, private: "secret" })),
      });
    expect(serializeSoapProject(parseSoapProject(source))).not.toContain(
      "secret",
    );
  });
  it("rejects duplicate cases, dangling operation references and oversized projects", () => {
    const p = demoSoapProject();
    expect(() =>
      parseSoapProject(
        JSON.stringify({ ...p, cases: [p.cases[0], p.cases[0]] }),
      ),
    ).toThrowError("project");
    expect(() =>
      parseSoapProject(
        JSON.stringify({
          ...p,
          cases: [{ ...p.cases[0], operationId: "missing" }],
        }),
      ),
    ).toThrowError("case");
    expect(() =>
      parseSoapProject(" ".repeat(2 * 1024 * 1024 + 1)),
    ).toThrowError("limit");
    expect(() =>
      parseSoapProject(JSON.stringify({ ...p, version: 2 })),
    ).toThrowError("project");
  });
  it("validates namespace maps and avoids inherited-key prefix resolution", () => {
    expect(
      normalizeSoapNamespaces(JSON.parse('{"__proto__":"urn:safe"}')),
    ).toEqual(JSON.parse('{"__proto__":"urn:safe"}'));
    expect(() => normalizeSoapNamespaces({ xml: "urn:wrong" })).toThrowError(
      "path",
    );
    expect(() => normalizeSoapNamespaces({ c: "" })).toThrowError("path");
  });
  it("validates request version/wrapper without claiming full schema validation", () => {
    const p = demoSoapProject(),
      c = readSoapWsdl(p.wsdl),
      operation = c.operations[0];
    expect(validateSoapRequest(p.request!, operation).tree.name).toBe(
      operation.input,
    );
    expect(() =>
      validateSoapRequest(
        { ...p.request!, operationId: c.operations[1].id, action: "" },
        c.operations[1],
      ),
    ).toThrowError("headers");
    expect(() =>
      validateSoapRequest(
        {
          ...p.request!,
          xml: wrapSoapBody('<Wrong xmlns="urn:rsswag:customers"/>', "1.1"),
        },
        operation,
      ),
    ).toThrowError("body");
    expect(() =>
      validateSoapRequest(
        {
          ...p.request!,
          xml: wrapSoapBody(
            '<GetCustomer xmlns="urn:rsswag:customers"/>',
            "1.2",
          ),
        },
        operation,
      ),
    ).toThrowError("version");
  });
  it("fails wrong wrappers, unexpected faults, non-2xx successes, and mismatching values", () => {
    const p = demoSoapProject(),
      c = readSoapWsdl(p.wsdl),
      first = p.cases[0];
    const wrong = evaluateSoapCase(
      {
        ...first,
        response: wrapSoapBody('<Wrong xmlns="urn:rsswag:customers"/>', "1.1"),
        rules: [],
      },
      c,
      p.namespaces,
    );
    expect(wrong).toMatchObject({
      passed: false,
      contractMatched: false,
      outcome: "success",
    });
    expect(
      evaluateSoapCase({ ...first, status: 500 }, c, p.namespaces).httpMatched,
    ).toBe(false);
    expect(
      evaluateSoapCase(
        { ...first, response: p.cases[1].response },
        c,
        p.namespaces,
      ).outcomeMatched,
    ).toBe(false);
    expect(
      evaluateSoapCase(
        { ...first, rules: [{ ...first.rules[0], expected: "7" }] },
        c,
        p.namespaces,
      ).passed,
    ).toBe(false);
  });
  it("allows intended invalid cases but rejects path checks on them", () => {
    const p = demoSoapProject(),
      c = readSoapWsdl(p.wsdl);
    expect(evaluateSoapCase(p.cases.at(-1)!, c, p.namespaces)).toMatchObject({
      passed: true,
      outcome: "invalid",
      issue: "xml",
    });
    expect(() =>
      evaluateSoapCase(
        { ...p.cases.at(-1)!, rules: p.cases[0].rules },
        c,
        p.namespaces,
      ),
    ).toThrowError("case");
  });
  it("cancels a regression suite between cases with truthful partial coverage", async () => {
    const p = demoSoapProject(),
      abort = new AbortController(),
      onResult = vi.fn(() => abort.abort());
    const report = await runSoapCases(p, { signal: abort.signal, onResult });
    expect(report).toMatchObject({ complete: false, total: 5, completed: 1 });
    expect(onResult).toHaveBeenCalledOnce();
  });
  it("exports reports without XML, fault details, URLs, namespace bindings or assertion literals", async () => {
    const p = demoSoapProject();
    p.cases[0].rules[0].expected = "private-expected";
    p.cases[0].response = p.cases[0].response.replace(
      ">0</id>",
      ">private-payload</id>",
    );
    const report = await runSoapCases(p),
      source = JSON.stringify(report);
    for (const hidden of [
      "private-expected",
      "private-payload",
      "soap.example",
      "Customer not found",
      "<Envelope",
      "rulesHelp",
    ])
      expect(source).not.toContain(hidden);
    expect(soapCasesReport(report.results, 10).complete).toBe(false);
  });
  it.each([
    "file:///private",
    "https://user:password@example.com",
    "https://api.example/#fragment",
    "/relative",
  ])("rejects unsafe or ambiguous endpoint %s", (url) =>
    expect(() => soapUrl(url)).toThrowError("url"),
  );
});
