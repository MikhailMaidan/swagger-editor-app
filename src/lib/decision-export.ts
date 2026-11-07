import {
  normalizeDtProject,
  dtDependencies,
  type DTProject,
} from "./decision-model";
import { DECISION_RUNTIME_SOURCE } from "./decision-runtime-source";
const dtEmbed = (value: unknown) =>
  JSON.stringify(JSON.stringify(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function generateDecisionSdk() {
  return `// RSSwag standalone decision engine. No project fixtures, network or persistent storage.\n${DECISION_RUNTIME_SOURCE}\n`;
}
export function generateDecisionService(source: DTProject) {
  const p = normalizeDtProject(source);
  return `// Contains private rule definitions, literals and input catalogs; cases are omitted.\n${DECISION_RUNTIME_SOURCE}\nconst project = JSON.parse(${dtEmbed({ ...p, cases: [] })});\nexport const handler = createDecisionHandler(project);\nexport default handler;\n`;
}
export function generateDecisionRunner(source: DTProject) {
  const p = normalizeDtProject(source);
  return `// Contains private rule definitions and regression contexts.\n${DECISION_RUNTIME_SOURCE}\nconst project = normalizeDtProject(JSON.parse(${dtEmbed(p)}));\nconst runs = await runDecisionSuite(project);\nconsole.log(decisionReport(runs));\nif (!runs.length) console.error("No decision cases to run.");\nif (typeof process !== "undefined") process.exitCode = runs.length > 0 && runs.every(run => run.checked && run.passed) ? 0 : 1;\n`;
}
export function generateDecisionContract(source: DTProject) {
  const p = normalizeDtProject(source),
    properties = Object.fromEntries(
      p.inputs.map((input) => [
        input.id,
        {
          type: input.nullable ? [input.type, "null"] : input.type,
          description:
            input.name +
            (input.type === "string" ? " (at most 256 UTF-8 bytes)" : ""),
          ...(input.type === "string" ? { maxLength: 256 } : {}),
        },
      ]),
    );
  const request = p.decisions.map((decision) => {
    const used = dtDependencies(p, decision.id).inputs;
    return {
      type: "object",
      additionalProperties: false,
      required: ["decisionId", "context"],
      properties: {
        decisionId: { type: "string", const: decision.id },
        context: {
          type: "object",
          additionalProperties: false,
          properties,
          required: p.inputs
            .filter((input) => input.required && used.includes(input.id))
            .map((input) => input.id),
        },
      },
    };
  });
  return JSON.stringify(
    {
      openapi: "3.1.0",
      info: { title: p.name, version: "1.0.0" },
      paths: {
        "/decide": {
          post: {
            operationId: "evaluateDecision",
            summary: "Evaluate a named decision table",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: request.length ? { oneOf: request } : false,
                },
              },
            },
            responses: Object.fromEntries(
              [200, 400, 404, 405, 408, 413, 415, 500].map((status) => [
                String(status),
                {
                  description:
                    status === 200
                      ? "Decision outcome; includes no-match, conflict, blocked and error statuses"
                      : "Request rejected",
                  content: {
                    "application/json": {
                      schema:
                        status === 200
                          ? {
                              type: "object",
                              required: [
                                "decisionId",
                                "status",
                                "output",
                                "matched",
                                "selected",
                              ],
                              properties: {
                                decisionId: { type: "string" },
                                status: {
                                  type: "string",
                                  enum: [
                                    "matched",
                                    "default",
                                    "no-match",
                                    "conflict",
                                    "blocked",
                                    "error",
                                  ],
                                },
                                output: {},
                                matched: {
                                  type: "array",
                                  items: { type: "string" },
                                },
                                selected: {
                                  type: "array",
                                  items: { type: "string" },
                                },
                              },
                            }
                          : {
                              type: "object",
                              required: ["error"],
                              properties: { error: { type: "string" } },
                            },
                    },
                  },
                },
              ]),
            ),
          },
        },
      },
    },
    null,
    2,
  );
}
