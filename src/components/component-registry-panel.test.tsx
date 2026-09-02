import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToClipboard } from "@/lib/clipboard";
import { createComponentRegistryReport } from "@/lib/component-registry";
import { ComponentRegistryPanel } from "./component-registry-panel";

vi.mock("@/lib/clipboard", () => ({
  writeTextToClipboard: vi.fn(),
}));

const report = createComponentRegistryReport({
  openapi: "3.1.0",
  paths: {
    "/users": {
      get: {
        parameters: [{ $ref: "#/components/parameters/Limit" }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
            description: "OK",
          },
          "404": { $ref: "#/components/responses/Missing" },
        },
      },
    },
  },
  components: {
    parameters: {
      Limit: { description: "Page size", in: "query", name: "limit" },
    },
    responses: {
      Remote: { $ref: "https://example.com/responses.yaml#/Error" },
    },
    schemas: {
      Address: { type: "object" },
      Orphan: { type: "string" },
      User: {
        description: "A user record",
        properties: {
          address: { $ref: "#/components/schemas/Address" },
        },
      },
    },
  },
});

function renderPanel() {
  return render(
    <ComponentRegistryPanel
      report={report}
      schema={{ title: "People API", version: "1.0.0" }}
    />,
  );
}

describe("ComponentRegistryPanel", () => {
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset();
    vi.mocked(writeTextToClipboard).mockResolvedValue(true);
  });

  it("shows reachability, component kinds, and reference findings", () => {
    renderPanel();

    expect(screen.getByText("Reusable component registry")).toBeVisible();
    expect(screen.getByText("3/5 reachable")).toBeVisible();
    expect(screen.getByText("A user record")).toBeVisible();
    expect(screen.getAllByText("Unused")).toHaveLength(3);
    expect(
      screen.getByText(
        "Local reference cannot be resolved: #/components/responses/Missing.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "External reference is outside this document: https://example.com/responses.yaml#/Error.",
      ),
    ).toBeVisible();
  });

  it("filters, searches, expands relationships, and copies a reference", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.selectOptions(
      screen.getByLabelText("Filter components by kind"),
      "schema",
    );
    expect(screen.queryByText("Page size")).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Search reusable components"),
      "User",
    );
    const userRow = screen.getByText("A user record").closest("li");

    await user.click(
      within(userRow as HTMLElement).getByRole("button", {
        name: "Show details",
      }),
    );
    expect(within(userRow as HTMLElement).getByText("Address")).toBeVisible();
    expect(
      screen.getByText(/#\/paths\/~1users\/get\/responses\/200/),
    ).toBeVisible();

    await user.click(
      within(userRow as HTMLElement).getByRole("button", {
        name: "Copy reference",
      }),
    );
    expect(writeTextToClipboard).toHaveBeenCalledWith(
      "#/components/schemas/User",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "User reference copied.",
    );
  });

  it("copies Mermaid and exports the JSON report", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    URL.createObjectURL = vi.fn().mockReturnValue("blob:components");
    URL.revokeObjectURL = vi.fn();

    try {
      renderPanel();
      await user.click(screen.getByRole("button", { name: "Copy Mermaid" }));
      expect(writeTextToClipboard).toHaveBeenCalledWith(
        expect.stringContaining("flowchart LR"),
      );

      await user.click(screen.getByRole("button", { name: "Export report" }));
      expect(screen.getByRole("status")).toHaveTextContent(
        "Component registry export started.",
      );
      expect(click).toHaveBeenCalledOnce();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });
});
