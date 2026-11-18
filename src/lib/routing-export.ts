import { normalizeRTProject, type RTProject } from "./routing-model";
import { ROUTING_RUNTIME_SOURCE } from "./routing-runtime-source";
const embed = (value: unknown) =>
  JSON.stringify(JSON.stringify(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function generateRTToolkit(input: RTProject) {
  return `// RSSwag routing planner. Contains authored policy and traffic fixtures.\n// It does not send HTTP requests; callers own transport and completions.\n${ROUTING_RUNTIME_SOURCE}\nexport const definition=JSON.parse(${embed(normalizeRTProject(input))});\n`;
}
export function generateRTRunner(input: RTProject) {
  return `// RSSwag offline routing regression runner. Node.js 20+, no dependencies.\n// Contains request URLs, headers and backend configuration.\n${ROUTING_RUNTIME_SOURCE}\nimport {readFileSync,statSync} from "node:fs";\ntry {\n let project=normalizeRTProject(JSON.parse(${embed(normalizeRTProject(input))}));\n if(process.argv[2]) { if(statSync(process.argv[2]).size>2097152) throw new Error("Project exceeds 2 MiB."); project=parseRTProject(readFileSync(process.argv[2],"utf8")); }\n const runs=await runRTProject(project);\n process.stdout.write(JSON.stringify(rtReport(runs),null,2)+"\\n");\n process.exitCode=runs.some(run=>run.matched===null)?2:runs.every(run=>run.matched)?0:1;\n} catch(error) {process.stderr.write(String(error.message??error)+"\\n");process.exitCode=2;}\n`;
}
