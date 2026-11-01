import {
  encodeTransferBytes,
  emptyTransferProject,
  newTransferResource,
  newTransferScenario,
  normalizeTransferProject,
  type TransferProject,
} from "./transfer-project";
export function demoTransferProject(): TransferProject {
  const p = emptyTransferProject();
  p.name = "Version-safe interrupted downloads";
  const original = Uint8Array.from({ length: 1024 }, (_, i) => i % 256),
    replacement = Uint8Array.from(
      { length: 1200 },
      (_, i) => (i * 7 + 13) % 256,
    );
  p.resources = [
    {
      ...newTransferResource("original"),
      name: "Binary revision 1",
      base64: encodeTransferBytes(original),
    },
    {
      ...newTransferResource("replacement"),
      name: "Binary revision 2",
      base64: encodeTransferBytes(replacement),
    },
    {
      ...newTransferResource("empty"),
      name: "Empty representation",
      base64: "",
    },
  ];
  const normal = newTransferScenario("original", "normal");
  normal.name = "Uninterrupted download";
  normal.expect = { outcome: "complete", maxRejected: 0, maxRestarts: 0 };
  p.scenarios = [
    normal,
    {
      ...structuredClone(normal),
      id: "recovery",
      name: "Dropped and truncated chunks",
      faults: [
        { at: 2, kind: "drop" },
        { at: 3, kind: "truncate" },
      ],
      expect: { outcome: "complete", maxRejected: 2, maxRestarts: 0 },
    },
    {
      ...structuredClone(normal),
      id: "revision",
      name: "Resource changes while resuming",
      replacementId: "replacement",
      switchAt: 3,
      expect: { outcome: "complete", maxRejected: 0, maxRestarts: 1 },
    },
    {
      ...structuredClone(normal),
      id: "corruption",
      name: "Corruption detected by final SHA-256",
      faults: [{ at: 2, kind: "corrupt" }],
      expect: { outcome: "integrity-failed", maxRejected: 0, maxRestarts: 0 },
    },
    {
      ...structuredClone(normal),
      id: "budget",
      name: "Attempt budget leaves a checkpoint",
      maxAttempts: 3,
      expect: { outcome: "exhausted", maxRejected: 0, maxRestarts: 0 },
    },
    {
      ...structuredClone(normal),
      id: "ignored",
      name: "Server sends a full representation",
      faults: [{ at: 2, kind: "ignore-range" }],
      expect: { outcome: "complete", maxRejected: 0, maxRestarts: 0 },
    },
    {
      ...structuredClone(normal),
      id: "mismatch",
      name: "Wrong range and validator rejected",
      faults: [
        { at: 2, kind: "wrong-range" },
        { at: 3, kind: "wrong-validator" },
      ],
      expect: { outcome: "complete", maxRejected: 2, maxRestarts: 0 },
    },
    {
      ...structuredClone(normal),
      id: "empty-case",
      name: "Zero-byte download",
      resourceId: "empty",
      expect: { outcome: "complete", maxRejected: 0, maxRestarts: 0 },
    },
  ];
  return normalizeTransferProject(p);
}
