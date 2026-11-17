import { normalizeMTProject, type MTProject } from "./mutation-model";
import { MUTATION_RUNTIME_SOURCE } from "./mutation-runtime-source";
const embed = (value: unknown) =>
  JSON.stringify(JSON.stringify(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

export function generateMTToolkit(input: MTProject) {
  const project = normalizeMTProject(input);
  return `// RSSwag offline response mutation toolkit. Contains private response fixtures and checks.\n${MUTATION_RUNTIME_SOURCE}\nexport const definition = JSON.parse(${embed(project)});\nexport async function testAssertions(project = definition, fixtureIds, options = {}) { return runMTProject(project, fixtureIds, options); }\n`;
}
export function generateMTRunner(input: MTProject) {
  const project = normalizeMTProject(input);
  return `// RSSwag offline mutation regression runner. Node.js 20+, no dependencies.\n// Contains response bodies, headers, expected values and waiver reasons.\n// node mutation-tests.mjs [project.json]\n${MUTATION_RUNTIME_SOURCE}\nimport { readFileSync, statSync } from "node:fs";\ntry {\n  let project = normalizeMTProject(JSON.parse(${embed(project)}));\n  if (process.argv[2]) {\n    if (statSync(process.argv[2]).size > 2097152) throw new Error("Project exceeds 2 MiB.");\n    project = parseMTProject(readFileSync(process.argv[2], "utf8"));\n  }\n  const runs = await runMTProject(project);\n  process.stdout.write(JSON.stringify(mtReport(runs), null, 2) + "\\n");\n  process.exitCode = runs.some((run) => run.matched === null) ? 2 : runs.every((run) => run.matched === true) ? 0 : 1;\n} catch (error) {\n  process.stderr.write(String(error.message ?? error) + "\\n");\n  process.exitCode = 2;\n}\n`;
}
