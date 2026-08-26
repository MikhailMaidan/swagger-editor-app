import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EndpointSummary } from "@/lib/openapi";
import { createSchemaAuditReport } from "@/lib/schema-audit";
import { SchemaAuditPanel } from "./schema-audit-panel";

const endpoint: EndpointSummary = {
  deprecated: false,
  description: "",
  method: "GET",
  operationId: "",
  parameters: [],
  path: "/users/{id}",
  requestBodies: [],
  responses: [
    {
      contentTypes: ["application/json"],
      description: "User",
      schema: null,
      status: "200",
    },
  ],
  secured: false,
  securityRequirements: [],
  serverUrl: "https://api.example.com",
  summary: "Untitled endpoint",
  tags: [],
};

describe("SchemaAuditPanel", () => {
  it("filters findings and opens the affected endpoint", async () => {
    const user = userEvent.setup();
    const onSelectEndpoint = vi.fn();

    render(
      <SchemaAuditPanel
        onSelectEndpoint={onSelectEndpoint}
        report={createSchemaAuditReport([endpoint])}
        schema={{ title: "Users API", version: "1.0.0" }}
      />,
    );

    expect(screen.getByText("17% quality score")).toBeVisible();
    expect(screen.getByRole("group", { name: "Audit findings" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Errors (1)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Warnings (2)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Info (2)" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Errors (1)" }));

    expect(screen.getByText('Define path parameter "id".')).toBeVisible();
    expect(
      screen.queryByText("Add a summary or description."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View endpoint" }));

    expect(onSelectEndpoint).toHaveBeenCalledWith("GET", "/users/{id}");
  });

  it("reports successful and blocked audit exports", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const createObjectURL = vi.fn().mockReturnValue("blob:audit");
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      render(
        <SchemaAuditPanel
          onSelectEndpoint={vi.fn()}
          report={createSchemaAuditReport([endpoint])}
          schema={{ title: "Users API", version: "1.0.0" }}
        />,
      );

      const exportButton = screen.getByRole("button", {
        name: "Export audit JSON",
      });

      await user.click(exportButton);

      expect(screen.getByRole("status")).toHaveTextContent(
        "Audit export started.",
      );
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit");

      createObjectURL.mockImplementationOnce(() => {
        throw new DOMException("Downloads blocked", "SecurityError");
      });
      await user.click(exportButton);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not export the audit report.",
      );
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });
});
