import { getByteSize } from "./text-encoding";
import {
  MAX_SYNC_PROJECT,
  SyncError,
  newSyncDefinition,
  normalizeSyncDefinition,
  normalizeSyncStep,
  syncInt,
  syncJson,
  syncList,
  syncName,
  syncId,
  syncObject,
  type SyncDefinition,
  type SyncStep,
} from "./sync-model";
export type SyncExpectation = {
  converged: boolean;
  maxRejected: number;
  maxConflicts: number;
};
export type SyncScenario = {
  id: string;
  name: string;
  steps: SyncStep[];
  expect: SyncExpectation | null;
};
export type SyncProject = {
  kind: "rsswag-sync-project";
  version: 1;
  name: string;
  definition: SyncDefinition;
  playground: SyncStep[];
  scenarios: SyncScenario[];
};
export function normalizeSyncProject(v: unknown): SyncProject {
  if (
    !syncObject(v) ||
    v.kind !== "rsswag-sync-project" ||
    v.version !== 1 ||
    !syncName(v.name)
  )
    throw new SyncError("definition");
  const definition = normalizeSyncDefinition(v.definition),
    playground = syncList(v.playground, 0, 300).map((s) =>
      normalizeSyncStep(definition, s),
    );
  const scenarios = syncList(v.scenarios, 0, 12).map((s): SyncScenario => {
    if (!syncObject(s) || !syncId(s.id) || !syncName(s.name))
      throw new SyncError("definition");
    const e = s.expect;
    if (!(
      e === null ||
      (syncObject(e) &&
        typeof e.converged === "boolean" &&
        syncInt(e.maxRejected, 0, 300) &&
        syncInt(e.maxConflicts, 0, 96))
    ))
      throw new SyncError("definition");
    return {
      id: s.id,
      name: s.name,
      steps: syncList(s.steps, 0, 300).map((step) =>
        normalizeSyncStep(definition, step),
      ),
      expect:
        e === null
          ? null
          : {
              converged: e.converged as boolean,
              maxRejected: e.maxRejected as number,
              maxConflicts: e.maxConflicts as number,
            },
    };
  });
  if (new Set(scenarios.map((s) => s.id)).size !== scenarios.length)
    throw new SyncError("definition");
  const p: SyncProject = {
    kind: "rsswag-sync-project",
    version: 1,
    name: v.name,
    definition,
    playground,
    scenarios,
  };
  if (getByteSize(JSON.stringify(p)) > MAX_SYNC_PROJECT)
    throw new SyncError("limit");
  return p;
}
export const parseSyncProject = (source: string) =>
  normalizeSyncProject(syncJson(source));
export function serializeSyncProject(value: SyncProject): string {
  const p = normalizeSyncProject(value),
    s = JSON.stringify(p, null, 2);
  return getByteSize(s) <= MAX_SYNC_PROJECT ? s : JSON.stringify(p);
}
export function newSyncScenario(id = "scenario-1"): SyncScenario {
  return { id, name: id, steps: [], expect: null };
}
export function emptySyncProject(): SyncProject {
  return {
    kind: "rsswag-sync-project",
    version: 1,
    name: "Local-first API synchronization",
    definition: newSyncDefinition(),
    playground: [],
    scenarios: [newSyncScenario()],
  };
}
