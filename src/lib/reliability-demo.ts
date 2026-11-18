import {
  normalizeRLProject,
  type RLProject,
  type RLNode,
} from "./reliability-model";

export function demoRLProject(): RLProject {
  const event = (id: string, name: string, probability: number): RLNode => ({
    id,
    name,
    kind: "event",
    probability,
  });
  return normalizeRLProject({
    version: 1,
    name: "Two-zone API architecture",
    windowHours: 720,
    nodes: [
      event("edge", "API gateway", 0.9995),
      event("zone-a", "Zone A shared domain", 0.99),
      event("zone-b", "Zone B shared domain", 0.99),
      event("app-a", "Application A", 0.995),
      event("app-b", "Application B", 0.995),
      event("db-a", "Database A", 0.995),
      event("db-b", "Database B", 0.995),
      event("auth", "Identity service", 0.999),
      event("payments", "Payment provider", 0.998),
      event("voter-a", "Replica A", 0.99),
      event("voter-b", "Replica B", 0.99),
      event("voter-c", "Replica C", 0.99),
      {
        id: "app-zone-a",
        name: "Application in zone A",
        kind: "all",
        inputs: ["zone-a", "app-a"],
      },
      {
        id: "app-zone-b",
        name: "Application in zone B",
        kind: "all",
        inputs: ["zone-b", "app-b"],
      },
      {
        id: "db-zone-a",
        name: "Database in zone A",
        kind: "all",
        inputs: ["zone-a", "db-a"],
      },
      {
        id: "db-zone-b",
        name: "Database in zone B",
        kind: "all",
        inputs: ["zone-b", "db-b"],
      },
      {
        id: "applications",
        name: "Application redundancy",
        kind: "any",
        inputs: ["app-zone-a", "app-zone-b"],
      },
      {
        id: "databases",
        name: "Database redundancy",
        kind: "any",
        inputs: ["db-zone-a", "db-zone-b"],
      },
      {
        id: "service",
        name: "User API",
        kind: "all",
        inputs: ["edge", "applications", "databases", "auth"],
      },
      {
        id: "checkout",
        name: "Checkout API",
        kind: "all",
        inputs: ["service", "payments"],
      },
      {
        id: "quorum",
        name: "Two-of-three replicas",
        kind: "at-least",
        inputs: ["voter-a", "voter-b", "voter-c"],
        threshold: 2,
      },
    ],
    roots: [
      { node: "service", minAvailability: 0.999, operation: "GET /users" },
      { node: "checkout", minAvailability: 0.995, operation: "POST /checkout" },
      { node: "quorum", minAvailability: 0.999, operation: "" },
    ],
    cases: [
      { id: "baseline", name: "Baseline", overrides: {}, expected: null },
      {
        id: "zone-outage",
        name: "Zone A unavailable",
        overrides: { "zone-a": 0 },
        expected: null,
      },
      {
        id: "regional-outage",
        name: "Both zones unavailable",
        overrides: { "zone-a": 0, "zone-b": 0 },
        expected: null,
      },
      {
        id: "identity-outage",
        name: "Identity service unavailable",
        overrides: { auth: 0 },
        expected: null,
      },
      {
        id: "ideal-edge-auth",
        name: "Perfect edge and identity (what-if)",
        overrides: { edge: 1, auth: 1 },
        expected: null,
      },
    ],
  });
}
