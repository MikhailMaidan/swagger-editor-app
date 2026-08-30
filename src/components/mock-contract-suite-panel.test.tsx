import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  EndpointSummary,
  ResponseSummary,
  SchemaDetails,
} from "@/lib/openapi";
import { MockContractSuitePanel } from "./mock-contract-suite-panel";

function createEndpoint(
  method: string,
  path: string,
  responses: ResponseSummary[],
): EndpointSummary {
  return {
    deprecated: false,
    description: "",
    method,
    operationId: "",
    parameters: [],
    path,
    requestBodies: [],
    responses,
    secured: false,
    securityRequirements: [],
    serverUrl: "https://api.example.com",
    summary: `${method} ${path}`,
    tags: [],
  };
}

const userSchema: SchemaDetails = {
  example: '{"id":7}',
  exampleName: "",
  hasExplicitExample: true,
  properties: ["id"],
  propertyTypes: { id: "integer" },
  requiredProperties: ["id"],
  type: "object",
};

const passingEndpoint = createEndpoint("GET", "/users/7", [
  {
    contentTypes: ["application/json"],
    description: "User",
    schema: userSchema,
    schemasByContentType: { "application/json": userSchema },
    status: "200",
  },
]);
const partialEndpoint = createEndpoint("DELETE", "/jobs/7", [
  {
    contentTypes: [],
    description: "Deleted",
    schema: null,
    status: "204",
  },
]);
const failingEndpoint = createEndpoint("GET", "/missing", []);

describe("MockContractSuitePanel", () => {
  it("runs scoped suites, filters results, opens endpoints, and exports JSON", async () => {
    const user = userEvent.setup();
    const onSelectEndpoint = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-suite");
    URL.revokeObjectURL = revokeObjectURL;

    try {
      render(
        <MockContractSuitePanel
          allEndpoints={[passingEndpoint, partialEndpoint, failingEndpoint]}
          onSelectEndpoint={onSelectEndpoint}
          schema={{ title: "Users API", version: "1.0.0" }}
          visibleEndpoints={[passingEndpoint]}
        />,
      );

      expect(screen.getByText("No suite results yet.")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Export suite JSON" }),
      ).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Run mock suite" }));

      let results = screen.getByLabelText("Mock contract suite results");
      expect(results).toHaveTextContent("Cases1");
      expect(results).toHaveTextContent("Passed1");
      expect(results).toHaveTextContent("Partial0");
      expect(results).toHaveTextContent("Failed0");

      await user.selectOptions(screen.getByLabelText("Suite scope"), "all");
      await user.click(screen.getByRole("button", { name: "Run mock suite" }));

      results = screen.getByLabelText("Mock contract suite results");
      expect(results).toHaveTextContent("Cases3");
      expect(results).toHaveTextContent("Passed1");
      expect(results).toHaveTextContent("Partial1");
      expect(results).toHaveTextContent("Failed1");

      await user.click(screen.getByRole("button", { name: "Failed (1)" }));
      expect(screen.getByText("GET /missing")).toBeVisible();
      expect(screen.queryByText("GET /users/7")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "View endpoint" }));
      expect(onSelectEndpoint).toHaveBeenCalledWith("GET", "/missing");

      await user.click(
        screen.getByRole("button", { name: "Export suite JSON" }),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Suite export started.",
      );
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-suite");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });

  it("disables visible-scope runs when filters hide every endpoint", async () => {
    const user = userEvent.setup();

    render(
      <MockContractSuitePanel
        allEndpoints={[passingEndpoint]}
        onSelectEndpoint={vi.fn()}
        schema={{ title: "Users API", version: "1.0.0" }}
        visibleEndpoints={[]}
      />,
    );

    const runButton = screen.getByRole("button", { name: "Run mock suite" });

    expect(screen.getByText("No endpoints in this scope.")).toBeVisible();
    expect(runButton).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Suite scope"), "all");
    expect(runButton).toBeEnabled();
    await user.click(runButton);
    expect(
      screen.getByLabelText("Mock contract suite results"),
    ).toHaveTextContent("Cases1Passed1Partial0Failed0");
  });
});
