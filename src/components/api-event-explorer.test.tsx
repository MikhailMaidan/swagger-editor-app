import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiEventReport } from "@/lib/api-events";
import { ApiEventExplorer } from "./api-event-explorer";

const source = {
  method: "POST",
  operationId: "subscribe",
  path: "/subscriptions",
  summary: "Subscribe",
};
const report: ApiEventReport = {
  brokenReferenceCount: 1,
  callbackOperationCount: 1,
  channelCount: 3,
  documentedOperationCount: 2,
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
  issueOperationCount: 1,
  operations: [
    {
      deprecated: false,
      description: "Receives a subscription event",
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
          description: "Event body",
          example: '{\n  "id": 42\n}',
          required: true,
          schemaName: "Event",
          schemaType: "object",
        },
      ],
      referenceIssues: [],
      responses: [{ contentTypes: [], description: "Accepted", status: "202" }],
      securityRequirements: ["callbackKey"],
      source,
      summary: "Receive event",
      tags: ["Events"],
    },
    {
      deprecated: false,
      description: "Order update",
      expression: "",
      issueCodes: ["missing-operation-id"],
      key: "webhook-order",
      kind: "webhook",
      method: "POST",
      name: "orderChanged",
      operationId: "",
      payloads: [],
      referenceIssues: [],
      responses: [
        { contentTypes: [], description: "Processed", status: "200" },
      ],
      securityRequirements: [],
      source: null,
      summary: "Order changed",
      tags: [],
    },
  ],
  payloadOperationCount: 1,
  totalOperationCount: 2,
  webhookOperationCount: 1,
};

function renderExplorer(onSelectEndpoint = vi.fn()) {
  return render(
    <ApiEventExplorer
      onSelectEndpoint={onSelectEndpoint}
      report={report}
      schema={{ title: "Events API", version: "1.0.0" }}
    />,
  );
}

describe("ApiEventExplorer", () => {
  it("shows event contracts, payload details, and definition findings", async () => {
    const user = userEvent.setup();

    renderExplorer();

    expect(screen.getByText("Events & callbacks")).toBeVisible();
    expect(screen.getByText("2/2 documented")).toBeVisible();
    expect(screen.getByText("{$request.body#/callbackUrl}")).toBeVisible();
    expect(screen.getByText("application/json")).toBeVisible();
    expect(screen.getByText("callbackKey")).toBeVisible();
    expect(
      screen.getByText(
        "External reference for externalAudit cannot be resolved: https://example.com/events.yaml#/audit.",
      ),
    ).toBeVisible();

    await user.click(screen.getByText("Payload example"));
    expect(screen.getByText(/"id": 42/)).toBeVisible();
  });

  it("filters by kind and review state", async () => {
    const user = userEvent.setup();

    renderExplorer();

    await user.click(screen.getByRole("button", { name: "Webhooks (1)" }));
    expect(screen.getByText("Order changed")).toBeVisible();
    expect(screen.queryByText("Receive event")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Needs review (1)" }));
    expect(
      screen.getByText(
        "Add an operationId for stable code generation and tooling.",
      ),
    ).toBeVisible();
  });

  it("navigates from a callback to its source operation", async () => {
    const user = userEvent.setup();
    const onSelectEndpoint = vi.fn();

    renderExplorer(onSelectEndpoint);

    const callbackRow = screen.getByText("Receive event").closest("li");
    await user.click(
      within(callbackRow as HTMLElement).getByRole("button", {
        name: "POST /subscriptions",
      }),
    );

    expect(onSelectEndpoint).toHaveBeenCalledWith("POST", "/subscriptions");
  });

  it("downloads a JSON event report and shows feedback", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    URL.createObjectURL = vi.fn().mockReturnValue("blob:events");
    URL.revokeObjectURL = vi.fn();

    try {
      renderExplorer();
      await user.click(screen.getByRole("button", { name: "Export report" }));

      expect(screen.getByRole("status")).toHaveTextContent(
        "Event contract report export started.",
      );
      expect(click).toHaveBeenCalledOnce();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });
});
