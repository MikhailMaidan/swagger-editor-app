import {
  normalizeSagaDefinition,
  normalizeSagaProject,
  type SagaDefinition,
  type SagaProject,
} from "./saga-model";
import { SAGA_RUNTIME_SOURCE } from "./saga-runtime-source";
const embedded = (v: unknown) =>
  JSON.stringify(JSON.stringify(v))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function generateSagaToolkit(value: SagaDefinition) {
  const d = normalizeSagaDefinition(value);
  return `// RSSwag deterministic saga simulator. No timers, HTTP calls, or durable storage.\n// All operation names label fixtures. Use this to rehearse recovery before deploying an orchestrator.\n${SAGA_RUNTIME_SOURCE}\nexport const definition = JSON.parse(${embedded(d)});\nexport const createConfiguredSaga = (input, fixtures) => createSaga(definition, input, fixtures);\n`;
}
export function generateSagaRunner(value: SagaProject) {
  const p = normalizeSagaProject(value);
  return `${generateSagaToolkit(p.definition)}\nconst project = normalizeSagaProject(JSON.parse(${embedded(p)}));
const runs = project.scenarios.map((scenario) => {
  const machine = createSaga(project.definition, scenario.input, scenario.fixtures);
  let error = null;
  try { for (const command of scenario.commands) machine.apply(command); } catch (e) { error = e instanceof SagaError ? e.code : "command"; }
  const snapshot = machine.snapshot(), summary = machine.summary(), e = scenario.expect;
  const checked = e !== null;
  const passed = !error && checked && summary.status === e.status && summary.clock <= e.maxTimeMs && summary.metrics.retries <= e.maxRetries && summary.uncertain <= e.maxUncertain && summary.uncompensated <= e.maxUncompensated
    && e.steps.every((e) => { const s = snapshot.steps.find((s) => s.id === e.stepId); return s.forward === e.forward && s.compensation === e.compensation; })
    && e.outputs.every((e) => { const s = snapshot.steps.find((s) => s.id === e.stepId); const result = s.forward === "succeeded" ? sagaResolve(s.output, e.pointer) : { found: false }; return e.missing ? !result.found : result.found && JSON.stringify(result.value) === JSON.stringify(e.value); });
  return { scenarioId: scenario.id, checked, passed, error, summary };
});
console.log(JSON.stringify({ kind: "rsswag-saga-report", version: 1, runs }, null, 2));
if (runs.length === 0) console.error("No saga scenarios to run.");
if (typeof process !== "undefined") process.exitCode = runs.length > 0 && runs.every((r) => r.passed) ? 0 : 1;
`;
}
