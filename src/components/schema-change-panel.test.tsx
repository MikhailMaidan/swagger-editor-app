import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SchemaChangeReport } from "@/lib/schema-change";
import type { SchemaComparisonBaseline } from "@/lib/schema-comparison-baseline";
import { SchemaChangePanel } from "./schema-change-panel";

const baseline: SchemaComparisonBaseline = {
  capturedAt: "2026-08-27T08:30:00.000Z",
  endpoints: [],
  title: "Catalog API",
  version: "1.0.0",
};

const report: SchemaChangeReport = {
  addedCount: 1,
  breakingCount: 2,
  changes: [
    {
      details: [],
      impact: "breaking",
      kind: "removed",
      method: "DELETE",
      path: "/users/{id}",
      summary: "Delete user",
    },
    {
      details: [
        {
          code: "required-parameter-added",
          impact: "breaking",
          location: "header",
          name: "X-Revision",
        },
      ],
      impact: "breaking",
      kind: "modified",
      method: "PUT",
      path: "/users/{id}",
      summary: "Update user",
    },
    {
      details: [],
      impact: "non-breaking",
      kind: "added",
      method: "GET",
      path: "/health",
      summary: "Health check",
    },
  ],
  modifiedCount: 1,
  removedCount: 1,
  unchangedCount: 4,
};

describe("SchemaChangePanel", () => {
  it("captures the current schema when no baseline exists", async () => {
    const user = userEvent.setup();
    const onSetBaseline = vi.fn();

    render(
      <SchemaChangePanel
        baseline={null}
        captureError={false}
        current={{ title: "Catalog API", version: "2.0.0" }}
        onClearBaseline={vi.fn()}
        onSetBaseline={onSetBaseline}
        report={null}
        storageError={false}
      />,
    );

    expect(screen.getByText("No comparison baseline")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Export change report" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Set current as baseline" }),
    );

    expect(onSetBaseline).toHaveBeenCalledTimes(1);
  });

  it("filters contract changes and exposes baseline actions", async () => {
    const user = userEvent.setup();
    const onClearBaseline = vi.fn();
    const onSetBaseline = vi.fn();

    render(
      <SchemaChangePanel
        baseline={baseline}
        captureError={false}
        current={{ title: "Catalog API", version: "2.0.0" }}
        onClearBaseline={onClearBaseline}
        onSetBaseline={onSetBaseline}
        report={report}
        storageError={false}
      />,
    );

    expect(
      screen.getByText("Baseline: Catalog API v1.0.0 | 27/08/2026, 08:30:00"),
    ).toBeVisible();
    expect(
      screen.getByText("Required header parameter X-Revision added."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Breaking (2)" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Added (1)" }));

    expect(screen.getByText("GET /health")).toBeVisible();
    expect(screen.queryByText("DELETE /users/{id}")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update baseline" }));
    await user.click(screen.getByRole("button", { name: "Clear baseline" }));

    expect(onSetBaseline).toHaveBeenCalledTimes(1);
    expect(onClearBaseline).toHaveBeenCalledTimes(1);
  });

  it("reports successful and blocked change report exports", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const createObjectURL = vi.fn().mockReturnValue("blob:changes");
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      render(
        <SchemaChangePanel
          baseline={baseline}
          captureError={false}
          current={{ title: "Catalog API", version: "2.0.0" }}
          onClearBaseline={vi.fn()}
          onSetBaseline={vi.fn()}
          report={report}
          storageError={false}
        />,
      );

      const panel = screen
        .getByRole("heading", { name: "API change review" })
        .closest("section") as HTMLElement;
      const exportButton = within(panel).getByRole("button", {
        name: "Export change report",
      });

      await user.click(exportButton);

      expect(within(panel).getByRole("status")).toHaveTextContent(
        "Change report export started.",
      );
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:changes");

      await user.click(
        within(panel).getByRole("button", { name: "Clear baseline" }),
      );
      expect(
        within(panel).queryByText("Change report export started."),
      ).not.toBeInTheDocument();

      createObjectURL.mockImplementationOnce(() => {
        throw new DOMException("Downloads blocked", "SecurityError");
      });
      await user.click(exportButton);

      expect(within(panel).getByRole("alert")).toHaveTextContent(
        "Could not export the change report.",
      );
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });
});
