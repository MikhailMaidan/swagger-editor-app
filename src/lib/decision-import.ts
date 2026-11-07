import { getByteSize } from "./text-encoding";
import {
  DecisionError,
  MAX_DT_PROJECT,
  dtList,
  parseDtJson,
  normalizeDtProject,
  type DTProject,
} from "./decision-model";
export function importDecisionContexts(
  source: DTProject,
  rootId: string,
  text: string,
): DTProject {
  if (getByteSize(text) > MAX_DT_PROJECT) throw new DecisionError("limit");
  const project = normalizeDtProject(source),
    array = text.trim().startsWith("[");
  const lines = array
    ? []
    : text.split(/\r\n|\r|\n/).filter((line) => line.trim());
  if (lines.length > 24) throw new DecisionError("limit");
  const contexts = array
    ? dtList(parseDtJson(text), 24)
    : lines.map((line) => parseDtJson(line));
  const used = new Set(project.cases.map((c) => c.id));
  let next = 1;
  const cases = contexts.map((context) => {
    while (used.has(`case-${next}`)) next++;
    const id = `case-${next++}`;
    used.add(id);
    return { id, name: id, decisionId: rootId, context, expect: null };
  });
  return normalizeDtProject({
    ...project,
    cases: [...project.cases, ...cases],
  });
}
