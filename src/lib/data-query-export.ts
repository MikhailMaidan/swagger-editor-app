import { normalizeDqProject, type DQProject } from "./data-query-model";
import { DATA_QUERY_RUNTIME_SOURCE } from "./data-query-runtime-source";
const dqEmbed = (v: unknown) =>
  JSON.stringify(JSON.stringify(v))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function generateDqToolkit(value: DQProject) {
  const p = normalizeDqProject(value),
    definition = {
      ...p,
      datasets: p.datasets.map((d) => ({ ...d, rows: [] })),
      scenarios: [],
    };
  return `// RSSwag local query toolkit. No network, credentials, or persistent storage.\n// Dataset rows and saved cases are omitted; query literals/default parameters remain.\n${DATA_QUERY_RUNTIME_SOURCE}\nexport const definition = JSON.parse(${dqEmbed(definition)});
export async function queryData(datasets, queryId, parameters = {}, options = {}) {
  if (!dqObject(datasets) || Object.keys(datasets).some((id) => !definition.datasets.some((d) => d.id === id))) throw new DataQueryError("reference");
  const required = dqDependencies(definition, queryId).datasets;
  if (required.some((id) => !Object.hasOwn(datasets, id))) throw new DataQueryError("reference");
  const project = { ...definition, datasets: definition.datasets.map((d) => ({ ...d, rows: Object.hasOwn(datasets, d.id) ? datasets[d.id] : [] })) };
  return runDataQuery(project, queryId, parameters, [], options);
}
`;
}
export function generateDqRunner(value: DQProject) {
  const p = normalizeDqProject(value);
  return `// RSSwag standalone Node query regression runner. Contains private source datasets/cases.\n${DATA_QUERY_RUNTIME_SOURCE}\nconst project = normalizeDqProject(JSON.parse(${dqEmbed(p)}));
const runs = await runDqScenarios(project);
console.log(dqReport(runs));
if (!runs.length) console.error("No data query scenarios to run.");
if (typeof process !== "undefined") process.exitCode = runs.length > 0 && runs.every((r) => r.checked && r.passed) ? 0 : 1;
`;
}
