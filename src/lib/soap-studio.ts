import { parseTransformValue } from "./api-transform";
import { getByteSize } from "./text-encoding";
import {
  evaluateSoapRules,
  inspectSoapEnvelope,
  normalizeSoapRules,
  SoapError,
  soapError,
  soapNamespace,
  wrapSoapBody,
  type SoapIssue,
  type SoapRule,
  type SoapVersion,
} from "./soap-xml";
import {
  DEMO_SOAP_WSDL,
  generateSoapExample,
  readSoapWsdl,
  type SoapContract,
  type SoapOperation,
} from "./soap-wsdl";

export const MAX_SOAP_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_SOAP_CASES = 20;
export type SoapCase = {
  id: string;
  name: string;
  operationId: string;
  response: string;
  status: number;
  expected: "success" | "fault" | "invalid";
  rules: SoapRule[];
};
export type SoapRequest = {
  operationId: string;
  url: string;
  action: string;
  xml: string;
  timeoutMs: number;
};
export type SoapProject = {
  kind: "rsswag-soap-project";
  version: 1;
  name: string;
  wsdl: string;
  namespaces: Record<string, string>;
  request: SoapRequest | null;
  cases: SoapCase[];
};
export type SoapCaseResult = {
  id: string;
  name: string;
  operationId: string;
  version: SoapVersion;
  passed: boolean;
  outcome: "success" | "fault" | "invalid";
  status: number;
  outcomeMatched: boolean;
  contractMatched: boolean;
  httpMatched: boolean;
  issue?: SoapIssue;
  rules: { index: number; passed: boolean; matched: number }[];
};
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 120): v is string =>
  typeof v === "string" && v.length <= max;
const name = (v: unknown): v is string => text(v) && !!v.trim();
export function normalizeSoapNamespaces(
  value: unknown,
): Record<string, string> {
  if (!object(value) || Object.keys(value).length > 30)
    throw new SoapError("path");
  return Object.fromEntries(
    Object.entries(value).map(([prefix, uri]) => {
      if (
        !/^[A-Za-z_][\w.-]*$/.test(prefix) ||
        ["xml", "xmlns"].includes(prefix) ||
        !text(uri, 2048) ||
        !uri ||
        /[\x00-\x20]/.test(uri)
      )
        throw new SoapError("path");
      return [prefix, uri];
    }),
  );
}
export function soapUrl(source: string): string {
  try {
    const url = new URL(source);
    if (
      !text(source, 8192) ||
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw 0;
    return url.href;
  } catch {
    throw new SoapError("url");
  }
}
export function normalizeSoapRequest(
  v: unknown,
  contract: SoapContract,
): SoapRequest {
  if (
    !object(v) ||
    !text(v.operationId, 1024) ||
    !text(v.url, 8192) ||
    !text(v.action, 2048) ||
    /[\x00-\x1f\x7f]/.test(v.action) ||
    !text(v.xml, 512 * 1024) ||
    getByteSize(v.xml) > 512 * 1024 ||
    typeof v.timeoutMs !== "number" ||
    !Number.isInteger(v.timeoutMs) ||
    v.timeoutMs < 100 ||
    v.timeoutMs > 30000
  )
    throw new SoapError("project");
  const operation = contract.operations.find((o) => o.id === v.operationId);
  if (!operation) throw new SoapError("reference");
  if (v.url) soapUrl(v.url);
  // XML drafts may intentionally be invalid; execution validates them separately.
  return {
    operationId: v.operationId,
    url: v.url,
    action: v.action,
    xml: v.xml,
    timeoutMs: v.timeoutMs,
  };
}
export function validateSoapRequest(
  request: SoapRequest,
  operation: SoapOperation,
) {
  if (operation.issues.length) throw new SoapError(operation.issues[0]);
  if (operation.actionRequired && !request.action.trim())
    throw new SoapError("headers");
  if (request.operationId !== operation.id) throw new SoapError("reference");
  const inspected = inspectSoapEnvelope(request.xml, operation.version);
  if (inspected.fault || inspected.tree.name !== operation.input)
    throw new SoapError("body");
  return inspected;
}
export function normalizeSoapCase(
  v: unknown,
  contract: SoapContract,
  namespaces: Record<string, string>,
): SoapCase {
  if (
    !object(v) ||
    !name(v.id) ||
    !name(v.name) ||
    !text(v.operationId, 1024) ||
    !contract.operations.some((o) => o.id === v.operationId) ||
    !text(v.response, 512 * 1024) ||
    getByteSize(v.response) > 512 * 1024 ||
    typeof v.status !== "number" ||
    !Number.isInteger(v.status) ||
    v.status < 100 ||
    v.status > 599 ||
    !["success", "fault", "invalid"].includes(v.expected as string)
  )
    throw new SoapError("case");
  const rules = normalizeSoapRules(v.rules, namespaces);
  if (v.expected === "invalid" && rules.length) throw new SoapError("case");
  return {
    id: v.id,
    name: v.name,
    operationId: v.operationId,
    response: v.response,
    status: v.status,
    expected: v.expected as SoapCase["expected"],
    rules,
  };
}
export function normalizeSoapProject(value: unknown): SoapProject {
  if (
    !object(value) ||
    value.kind !== "rsswag-soap-project" ||
    value.version !== 1 ||
    !name(value.name) ||
    !text(value.wsdl, 512 * 1024) ||
    !Array.isArray(value.cases) ||
    value.cases.length > MAX_SOAP_CASES
  )
    throw new SoapError("project");
  const contract = readSoapWsdl(value.wsdl),
    namespaces = normalizeSoapNamespaces(value.namespaces);
  const cases = value.cases.map((c) =>
    normalizeSoapCase(c, contract, namespaces),
  );
  if (new Set(cases.map((c) => c.id)).size !== cases.length)
    throw new SoapError("project");
  const request =
    value.request === null
      ? null
      : normalizeSoapRequest(value.request, contract);
  return {
    kind: "rsswag-soap-project",
    version: 1,
    name: value.name,
    wsdl: value.wsdl,
    namespaces,
    request,
    cases,
  };
}
export function parseSoapProject(source: string): SoapProject {
  if (getByteSize(source) > MAX_SOAP_PROJECT_BYTES)
    throw new SoapError("limit");
  let value: unknown;
  try {
    value = parseTransformValue(source);
  } catch {
    throw new SoapError("project");
  }
  return normalizeSoapProject(value);
}
export function serializeSoapProject(project: SoapProject): string {
  const source = JSON.stringify(normalizeSoapProject(project), null, 2) + "\n";
  if (getByteSize(source) > MAX_SOAP_PROJECT_BYTES)
    throw new SoapError("limit");
  return source;
}
export function evaluateSoapCase(
  value: SoapCase,
  contract: SoapContract,
  namespaces: Record<string, string>,
): SoapCaseResult {
  const c = normalizeSoapCase(value, contract, namespaces),
    operation = contract.operations.find((o) => o.id === c.operationId)!;
  let outcome: SoapCaseResult["outcome"] = "invalid",
    contractMatched = false,
    issue: SoapIssue | undefined,
    rules: SoapCaseResult["rules"] = [];
  try {
    const inspected = inspectSoapEnvelope(c.response, operation.version);
    outcome = inspected.fault ? "fault" : "success";
    contractMatched =
      !!inspected.fault || inspected.tree.name === operation.output;
    rules = evaluateSoapRules(inspected.payload, c.rules, namespaces);
  } catch (e) {
    issue = soapError(e).code;
  }
  const outcomeMatched = outcome === c.expected;
  const httpMatched =
    outcome === "invalid" || outcome === "fault"
      ? true
      : c.status >= 200 && c.status < 300;
  const passed =
    outcomeMatched &&
    httpMatched &&
    (outcome === "invalid" || contractMatched) &&
    rules.every((r) => r.passed);
  return {
    id: c.id,
    name: c.name,
    operationId: c.operationId,
    version: operation.version,
    passed,
    outcome,
    status: c.status,
    outcomeMatched,
    contractMatched,
    httpMatched,
    ...(issue ? { issue } : {}),
    rules,
  };
}
export async function runSoapCases(
  project: SoapProject,
  options: {
    signal?: AbortSignal;
    onResult?: (r: SoapCaseResult) => void;
  } = {},
) {
  const contract = readSoapWsdl(project.wsdl),
    results: SoapCaseResult[] = [];
  for (const c of project.cases) {
    if (options.signal?.aborted) break;
    const result = evaluateSoapCase(c, contract, project.namespaces);
    results.push(result);
    options.onResult?.(result);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return soapCasesReport(results, project.cases.length);
}
export function soapCasesReport(
  results: SoapCaseResult[],
  total = results.length,
) {
  return {
    kind: "rsswag-soap-report",
    version: 1,
    complete: results.length === total,
    total,
    completed: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results: results.map((r) => ({
      ...r,
      rules: r.rules.map((rule) => ({ ...rule })),
    })),
  };
}
export function soapRequestForOperation(
  contract: SoapContract,
  operation: SoapOperation,
): SoapRequest {
  return {
    operationId: operation.id,
    url: operation.url,
    action: operation.action,
    xml: generateSoapExample(contract, operation, "input"),
    timeoutMs: 10000,
  };
}
export function soapFaultExample(version: SoapVersion): string {
  const ns = soapNamespace(version);
  return wrapSoapBody(
    version === "1.1"
      ? `<s:Fault xmlns:s="${ns}"><faultcode>s:Client</faultcode><faultstring>Customer not found</faultstring><detail><id>404</id></detail></s:Fault>`
      : `<s:Fault xmlns:s="${ns}"><s:Code><s:Value>s:Sender</s:Value><s:Subcode><s:Value>UnknownCustomer</s:Value></s:Subcode></s:Code><s:Reason><s:Text xml:lang="en">Customer not found</s:Text><s:Text xml:lang="ru">Клиент не найден</s:Text></s:Reason><s:Detail><id>404</id></s:Detail></s:Fault>`,
    version,
  );
}
export function demoSoapProject(): SoapProject {
  const contract = readSoapWsdl(DEMO_SOAP_WSDL),
    first = contract.operations[0];
  const cases: SoapCase[] = contract.operations.flatMap((op, i) => [
    {
      id: `success-${i}`,
      name: `SOAP ${op.version} customer response`,
      operationId: op.id,
      response: generateSoapExample(contract, op, "output"),
      status: 200,
      expected: "success",
      rules: [
        {
          name: "Customer identifier",
          path: "/c:GetCustomerResponse/c:customer/c:id",
          operator: "equals",
          expected: "0",
          trim: true,
        },
      ],
    },
    {
      id: `fault-${i}`,
      name: `SOAP ${op.version} fault`,
      operationId: op.id,
      response: soapFaultExample(op.version),
      status: 500,
      expected: "fault",
      rules: [],
    },
  ]);
  cases.push({
    id: "malformed",
    name: "Malformed XML rejection",
    operationId: first.id,
    response: "<broken>",
    status: 200,
    expected: "invalid",
    rules: [],
  });
  return {
    kind: "rsswag-soap-project",
    version: 1,
    name: "Customer SOAP regression",
    wsdl: DEMO_SOAP_WSDL,
    namespaces: {
      c: "urn:rsswag:customers",
      s11: soapNamespace("1.1"),
      s12: soapNamespace("1.2"),
    },
    request: soapRequestForOperation(contract, first),
    cases,
  };
}
