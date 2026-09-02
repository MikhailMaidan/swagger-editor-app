import { describe, expect, it } from "vitest";
import type { ApiEventReport } from "./api-events";
import {
  createApiEventExport,
  createApiEventMarkdown,
} from "./api-event-export";

const report: ApiEventReport = {
  brokenReferenceCount: 1,
  callbackOperationCount: 1,
  channelCount: 2,
  documentedOperationCount: 1,
  findings: [
    {
      code: "external-reference",
      expression: "",
      kind: "webhook",
      name: "externalAudit",
      reference: "https://example.com/events.yaml#/audit",
      source: null,
    },
  ],
  issueOperationCount: 0,
  operations: [
    {
      deprecated: false,
      description: "Receives the event",
      expression: "{$request.body#/callbackUrl}",
      issueCodes: [],
      key: "callback-event",
      kind: "callback",
      method: "POST",
      name: "onEvent",
      operationId: "receiveEvent",
      payloads: [
        {
          contentType: "application/json",
          description: "Event payload",
          example: '{"id":42}',
          required: true,
          schemaName: "Event",
          schemaType: "object",
        },
      ],
      referenceIssues: [],
      responses: [{ contentTypes: [], description: "Accepted", status: "202" }],
      securityRequirements: ["callbackKey"],
      source: {
        method: "POST",
        operationId: "subscribe",
        path: "/subscriptions",
        summary: "Subscribe",
      },
      summary: "Receive event",
      tags: ["Events"],
    },
  ],
  payloadOperationCount: 1,
  totalOperationCount: 1,
  webhookOperationCount: 0,
};

describe("API event contract exports", () => {
  it("creates a readable Markdown inventory", () => {
    const markdown = createApiEventMarkdown(report, {
      title: "Events API",
      version: "2.0.0",
    });

    expect(markdown).toContain("# Events API event contracts");
    expect(markdown).toContain("### Callback: Receive event");
    expect(markdown).toContain("`POST {$request.body#/callbackUrl}`");
    expect(markdown).toContain("Source operation: `POST /subscriptions`");
    expect(markdown).toContain("Payloads: application/json / Event");
    expect(markdown).toContain(
      "External reference for externalAudit cannot be resolved",
    );
  });

  it("localizes Markdown headings and operation kinds", () => {
    const markdown = createApiEventMarkdown(
      report,
      { title: "Events API", version: "2.0.0" },
      "ru",
    );

    expect(markdown).toContain("Контракты событий Events API");
    expect(markdown).toContain("### Callback: Receive event");
    expect(markdown).toContain("## Операции событий");
  });

  it("creates a dated, versioned JSON report with a safe file name", () => {
    const eventExport = createApiEventExport(
      report,
      { title: "Events & Callbacks API", version: "2.0.0" },
      new Date("2026-09-02T08:30:00.000Z"),
    );

    expect(eventExport.fileName).toBe(
      "rsswag-events-callbacks-api-events-2026-09-02.json",
    );
    expect(JSON.parse(eventExport.content)).toMatchObject({
      eventContracts: { totalOperationCount: 1 },
      exportedAt: "2026-09-02T08:30:00.000Z",
      schema: { title: "Events & Callbacks API", version: "2.0.0" },
      version: 1,
    });
  });

  it("uses a stable epoch for invalid export dates", () => {
    const eventExport = createApiEventExport(
      report,
      { title: "", version: "" },
      new Date("invalid"),
    );

    expect(eventExport.fileName).toBe(
      "rsswag-openapi-schema-events-1970-01-01.json",
    );
  });
});
