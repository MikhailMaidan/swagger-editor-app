import {
  emptyMTProject,
  normalizeMTProject,
  type MTCheck,
  type MTProject,
} from "./mutation-model";

export function demoMTProject(): MTProject {
  const project = emptyMTProject(),
    response = {
      status: "200",
      headers: { "content-type": "application/json", "x-api-version": "v1" },
      durationMs: 40,
      source: "mock",
      body: '{"id":7,"name":"Ada","active":true,"balance":12.5,"roles":["reader","writer"],"profile":{"region":"eu"}}',
    };
  const checks: MTCheck[] = [
    {
      id: "status",
      enabled: true,
      pinned: true,
      rule: {
        name: "Successful response",
        target: "status",
        path: "",
        operator: "equals",
        expected: "200",
      },
    },
    {
      id: "content-type",
      enabled: true,
      pinned: false,
      rule: {
        name: "JSON content",
        target: "header",
        path: "content-type",
        operator: "equals",
        expected: "application/json",
      },
    },
    {
      id: "version",
      enabled: true,
      pinned: false,
      rule: {
        name: "API version",
        target: "header",
        path: "x-api-version",
        operator: "equals",
        expected: "v1",
      },
    },
  ];
  return normalizeMTProject({
    ...project,
    name: "Assertion quality: weak versus strict",
    fixtures: [
      {
        id: "weak",
        name: "Weak checks: protocol only",
        response,
        scope: "",
        expectation: null,
        checks,
      },
      {
        id: "strict",
        name: "Strict checks: exact fixture",
        response,
        scope: "",
        expectation: null,
        checks: [
          ...checks,
          {
            id: "body",
            enabled: true,
            pinned: false,
            rule: {
              name: "Exact fixture JSON",
              target: "body",
              path: "",
              operator: "equals",
              expected: response.body,
            },
          },
          {
            id: "latency-upper",
            enabled: true,
            pinned: false,
            rule: {
              name: "Latency ceiling",
              target: "duration",
              path: "",
              operator: "lte",
              expected: "40",
            },
          },
          {
            id: "latency-lower",
            enabled: true,
            pinned: false,
            rule: {
              name: "Latency floor",
              target: "duration",
              path: "",
              operator: "gte",
              expected: "40",
            },
          },
        ],
      },
    ],
  });
}
