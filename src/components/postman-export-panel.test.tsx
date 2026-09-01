import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EndpointSummary, SecuritySchemeSummary } from "@/lib/openapi";
import { PostmanExportPanel } from "./postman-export-panel";

function endpoint(method: string, path: string, tag: string): EndpointSummary {
  return {
    deprecated: false,
    description: "",
    method,
    operationId: "",
    parameters: [],
    path,
    requestBodies: [],
    responses: [
      {
        contentTypes: [],
        description: "OK",
        schema: null,
        status: "200",
      },
    ],
    secured: true,
    securityRequirementGroups: [["bearerAuth"]],
    securityRequirements: ["bearerAuth"],
    serverUrl: "https://api.example.com",
    summary: `${method} ${path}`,
    tags: [tag],
  };
}

const allEndpoints = [
  endpoint("GET", "/users", "Users"),
  endpoint("POST", "/reports", "Reports"),
];
const schemes: SecuritySchemeSummary[] = [
  {
    bearerFormat: "JWT",
    description: "",
    location: "",
    name: "bearerAuth",
    parameterName: "",
    scheme: "bearer",
    type: "http",
  },
];

function renderPanel(visibleEndpoints = [allEndpoints[0]]) {
  return render(
    <PostmanExportPanel
      allEndpoints={allEndpoints}
      schema={{
        serverUrl: "https://api.example.com",
        title: "Catalog API",
        version: "2.0.0",
      }}
      securitySchemes={schemes}
      visibleEndpoints={visibleEndpoints}
    />,
  );
}

describe("PostmanExportPanel", () => {
  it("updates the export preview for scope and content controls", async () => {
    const user = userEvent.setup();

    renderPanel();

    expect(screen.getByText("Collection 2.1")).toBeVisible();
    expect(screen.getByText("Requests").nextElementSibling).toHaveTextContent(
      "2",
    );
    expect(screen.getByText("Folders").nextElementSibling).toHaveTextContent(
      "2",
    );
    expect(
      screen.getByText("Saved responses").nextElementSibling,
    ).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: "Current view (1)" }));
    expect(screen.getByText("Requests").nextElementSibling).toHaveTextContent(
      "1",
    );

    await user.click(screen.getByLabelText("Include response examples"));
    expect(
      screen.getByText("Saved responses").nextElementSibling,
    ).toHaveTextContent("0");

    await user.click(screen.getByLabelText("Group requests by tags"));
    expect(screen.getByText("Folders").nextElementSibling).toHaveTextContent(
      "0",
    );
  });

  it("downloads collection and environment files with action feedback", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:environment")
      .mockReturnValueOnce("blob:collection");
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      renderPanel();

      await user.click(
        screen.getByRole("button", { name: "Export environment" }),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Postman environment export started.",
      );

      await user.click(
        screen.getByRole("button", { name: "Export collection" }),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Postman collection export started.",
      );
      expect(click).toHaveBeenCalledTimes(2);
      expect(revokeObjectURL).toHaveBeenNthCalledWith(1, "blob:environment");
      expect(revokeObjectURL).toHaveBeenNthCalledWith(2, "blob:collection");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });

  it("disables exports when the selected endpoint view is empty", async () => {
    const user = userEvent.setup();

    renderPanel([]);
    await user.click(screen.getByRole("button", { name: "Current view (0)" }));

    expect(
      screen.getByRole("button", { name: "Export collection" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Export environment" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No endpoints are available in this export scope.",
    );
  });
});
