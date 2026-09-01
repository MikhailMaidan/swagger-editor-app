import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiWorkflowReport } from "@/lib/openapi-workflows";
import { ApiWorkflowExplorer } from "./api-workflow-explorer";

const source = {
  key: "GET /orders/{id}",
  method: "GET",
  operationId: "getOrder",
  path: "/orders/{id}",
  summary: "Get order",
};
const target = {
  key: "GET /users/{id}",
  method: "GET",
  operationId: "getUser",
  path: "/users/{id}",
  summary: "Get user",
};
const report: ApiWorkflowReport = {
  ambiguousCount: 0,
  connectedOperationCount: 2,
  cycleCount: 0,
  cycles: [],
  externalCount: 1,
  links: [
    {
      description: "Read the owner",
      definitionReference: "",
      inCycle: false,
      issueCodes: [],
      key: "owner",
      name: "owner",
      operationId: "getUser",
      operationRef: "",
      parameters: [{ expression: "$response.body#/ownerId", name: "userId" }],
      requestBodyExpression: "",
      resolution: "resolved",
      serverUrl: "",
      source,
      status: "200",
      target,
      targetLabel: target.key,
    },
    {
      description: "",
      definitionReference: "",
      inCycle: false,
      issueCodes: ["external-operation-ref"],
      key: "audit",
      name: "audit",
      operationId: "",
      operationRef: "https://example.com/audit.yaml",
      parameters: [],
      requestBodyExpression: "",
      resolution: "external",
      serverUrl: "",
      source,
      status: "default",
      target: null,
      targetLabel: "https://example.com/audit.yaml",
    },
  ],
  nodes: [
    { ...source, inCycle: false, inboundCount: 0, outboundCount: 2 },
    { ...target, inCycle: false, inboundCount: 1, outboundCount: 0 },
  ],
  problemCount: 1,
  resolvedCount: 1,
  totalLinkCount: 2,
  unresolvedCount: 0,
};

describe("ApiWorkflowExplorer", () => {
  it("filters workflow links and exposes parameter handoffs", async () => {
    const user = userEvent.setup();

    render(
      <ApiWorkflowExplorer
        onSelectEndpoint={vi.fn()}
        report={report}
        schema={{ title: "Orders API", version: "1.0.0" }}
      />,
    );

    expect(screen.getByText("API workflows")).toBeVisible();
    expect(screen.getByText("$response.body#/ownerId")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Needs review (1)" }));

    expect(screen.getByText("https://example.com/audit.yaml")).toBeVisible();
    expect(
      screen.queryByText("$response.body#/ownerId"),
    ).not.toBeInTheDocument();
  });

  it("navigates to both source and resolved target operations", async () => {
    const user = userEvent.setup();
    const onSelectEndpoint = vi.fn();

    render(
      <ApiWorkflowExplorer
        onSelectEndpoint={onSelectEndpoint}
        report={report}
        schema={{ title: "Orders API", version: "1.0.0" }}
      />,
    );

    const sourceButtons = screen.getAllByRole("button", {
      name: "GET /orders/{id}",
    });
    await user.click(sourceButtons[0]);
    await user.click(screen.getByRole("button", { name: "GET /users/{id}" }));

    expect(onSelectEndpoint).toHaveBeenNthCalledWith(1, "GET", "/orders/{id}");
    expect(onSelectEndpoint).toHaveBeenNthCalledWith(2, "GET", "/users/{id}");
  });

  it("downloads the JSON workflow report and shows feedback", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    URL.createObjectURL = vi.fn().mockReturnValue("blob:workflow");
    URL.revokeObjectURL = vi.fn();

    try {
      render(
        <ApiWorkflowExplorer
          onSelectEndpoint={vi.fn()}
          report={report}
          schema={{ title: "Orders API", version: "1.0.0" }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Export report" }));

      expect(screen.getByRole("status")).toHaveTextContent(
        "Workflow report export started.",
      );
      expect(click).toHaveBeenCalledOnce();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });
});
