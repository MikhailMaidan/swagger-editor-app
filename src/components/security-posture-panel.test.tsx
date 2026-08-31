import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EndpointSummary, SecuritySchemeSummary } from "@/lib/openapi";
import { createSecurityPostureReport } from "@/lib/security-posture";
import { SecurityPosturePanel } from "./security-posture-panel";

function endpoint(
  method: string,
  path: string,
  groups: string[][],
): EndpointSummary {
  const requirements = Array.from(new Set(groups.flat()));

  return {
    deprecated: false,
    description: "",
    method,
    operationId: "",
    parameters: [],
    path,
    requestBodies: [],
    responses: [],
    secured: requirements.length > 0,
    securityRequirementGroups: groups,
    securityRequirements: requirements,
    serverUrl: "https://api.example.com",
    summary: `${method} ${path} summary`,
    tags: [],
  };
}

const schemes: SecuritySchemeSummary[] = [
  {
    bearerFormat: "JWT",
    description: "Short-lived token",
    location: "",
    name: "bearerAuth",
    parameterName: "",
    scheme: "bearer",
    type: "http",
  },
  {
    bearerFormat: "",
    description: "",
    location: "header",
    name: "unusedKey",
    parameterName: "X-API-Key",
    scheme: "",
    type: "apiKey",
  },
];

const report = createSecurityPostureReport(
  [
    endpoint("GET", "/private", [["bearerAuth"]]),
    endpoint("POST", "/optional", [[], ["bearerAuth"]]),
    endpoint("GET", "/public", []),
    endpoint("DELETE", "/broken", [["missingAuth"]]),
  ],
  schemes,
);

function renderPanel(onSelectEndpoint = vi.fn()) {
  return {
    onSelectEndpoint,
    ...render(
      <SecurityPosturePanel
        onSelectEndpoint={onSelectEndpoint}
        report={report}
        schema={{ title: "Catalog API", version: "2.0.0" }}
      />,
    ),
  };
}

describe("SecurityPosturePanel", () => {
  it("shows scheme usage, filters operations, and opens an endpoint", async () => {
    const user = userEvent.setup();
    const { onSelectEndpoint } = renderPanel();

    expect(screen.getByText("50% strict coverage")).toBeVisible();
    expect(screen.getByText("1/2 used")).toBeVisible();
    expect(screen.getByText("bearer · JWT · Short-lived token")).toBeVisible();
    expect(
      screen.getByText("unusedKey is declared but no operation uses it."),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Public (1)" }));
    expect(screen.getByText("GET /public summary")).toBeVisible();
    expect(screen.queryByText("GET /private summary")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Needs review (2)" }));
    expect(screen.getByText("POST /optional summary")).toBeVisible();
    expect(screen.getByText("DELETE /broken summary")).toBeVisible();

    await user.selectOptions(
      screen.getByLabelText("Filter by security scheme"),
      "missingAuth",
    );
    const brokenRow = screen
      .getByText("DELETE /broken summary")
      .closest("li") as HTMLElement;

    expect(
      within(brokenRow).getByText(
        "The requirement references undefined scheme missingAuth.",
      ),
    ).toBeVisible();
    await user.click(
      within(brokenRow).getByRole("button", { name: "View endpoint" }),
    );
    expect(onSelectEndpoint).toHaveBeenCalledWith("DELETE", "/broken");
  });

  it("copies a Markdown summary and exports the complete report", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const createObjectURL = vi.fn().mockReturnValue("blob:security-report");
    const revokeObjectURL = vi.fn();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      renderPanel();
      await user.click(screen.getByRole("button", { name: "Copy summary" }));

      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("# Security posture: Catalog API"),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Security summary copied.",
      );

      await user.click(screen.getByRole("button", { name: "Export report" }));

      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:security-report");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Security report export started.",
      );
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });
});
