import { normalizeRLProject, type RLProject } from "./reliability-model";
import { RELIABILITY_RUNTIME_SOURCE } from "./reliability-runtime-source";
const embed = (value: unknown) =>
  JSON.stringify(JSON.stringify(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function generateRLToolkit(input: RLProject) {
  const project = normalizeRLProject(input);
  return `// RSSwag service reliability toolkit. Contains authored architecture/probabilities.\n${RELIABILITY_RUNTIME_SOURCE}\nexport const definition = JSON.parse(${embed(project)});\nexport async function analyzeArchitecture(project = definition, caseIds, options = {}) { return analyzeRLProject(project, caseIds, options); }\n`;
}
export function generateRLRunner(input: RLProject) {
  const project = normalizeRLProject(input);
  return `// RSSwag offline reliability regression runner. Node.js 20+, no dependencies.\n// node reliability-tests.mjs [project.json]\n${RELIABILITY_RUNTIME_SOURCE}\nimport { readFileSync, statSync } from "node:fs";\ntry {\n  let project = normalizeRLProject(JSON.parse(${embed(project)}));\n  if (process.argv[2]) {\n    if (statSync(process.argv[2]).size > 524288) throw new Error("Project exceeds 512 KiB.");\n    project = parseRLProject(readFileSync(process.argv[2], "utf8"));\n  }\n  const run = await analyzeRLProject(project);\n  process.stdout.write(JSON.stringify(rlReport(run), null, 2) + "\\n");\n  process.exitCode = run.cases.some((scenario) => scenario.matched === null) ? 2 : run.cases.every((scenario) => scenario.matched) ? 0 : 1;\n} catch (error) {\n  process.stderr.write(String(error.message ?? error) + "\\n");\n  process.exitCode = 2;\n}\n`;
}
