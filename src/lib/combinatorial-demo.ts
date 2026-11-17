import { normalizeCTProject, type CTProject } from "./combinatorial-model";

export function demoCTProject(): CTProject {
  return normalizeCTProject({
    version: 1,
    name: "Search API compatibility",
    strength: 2,
    seed: 2026,
    variables: [
      {
        id: "region",
        name: "Region",
        location: "query",
        choices: ["us", "eu"].map((value) => ({
          id: value,
          label: value.toUpperCase(),
          kind: "value",
          value,
        })),
      },
      {
        id: "plan",
        name: "Plan",
        location: "query",
        choices: ["free", "team", "enterprise"].map((value) => ({
          id: value,
          label: value,
          kind: "value",
          value,
        })),
      },
      {
        id: "auth",
        name: "Authentication",
        location: "custom",
        choices: ["anonymous", "token"].map((value) => ({
          id: value,
          label: value,
          kind: "value",
          value,
        })),
      },
      {
        id: "format",
        name: "Format",
        location: "query",
        choices: ["json", "csv"].map((value) => ({
          id: value,
          label: value.toUpperCase(),
          kind: "value",
          value,
        })),
      },
      {
        id: "compression",
        name: "Accept-Encoding",
        location: "header",
        choices: ["identity", "gzip"].map((value) => ({
          id: value,
          label: value,
          kind: "value",
          value,
        })),
      },
      {
        id: "trace",
        name: "X-Trace",
        location: "header",
        choices: [
          { id: "absent", label: "Omitted", kind: "omit" },
          {
            id: "present",
            label: "Present (empty string)",
            kind: "value",
            value: "",
          },
        ],
      },
    ],
    constraints: [
      {
        id: "anonymous-free",
        name: "Anonymous requests require the free plan",
        condition: {
          op: "implies",
          if: { op: "is", variable: "auth", choice: "anonymous" },
          then: { op: "is", variable: "plan", choice: "free" },
        },
      },
      {
        id: "csv-paid",
        name: "CSV requires a paid plan",
        condition: {
          op: "implies",
          if: { op: "is", variable: "format", choice: "csv" },
          then: {
            op: "not",
            arg: { op: "is", variable: "plan", choice: "free" },
          },
        },
      },
      {
        id: "eu-enterprise-gzip",
        name: "European enterprise exports use gzip",
        condition: {
          op: "implies",
          if: {
            op: "all",
            args: [
              { op: "is", variable: "region", choice: "eu" },
              { op: "is", variable: "plan", choice: "enterprise" },
            ],
          },
          then: { op: "is", variable: "compression", choice: "gzip" },
        },
      },
    ],
    rows: [
      {
        id: "smoke",
        name: "Existing anonymous smoke test",
        pinned: true,
        choices: {
          region: "us",
          plan: "free",
          auth: "anonymous",
          format: "json",
          compression: "identity",
          trace: "absent",
        },
      },
    ],
  });
}
