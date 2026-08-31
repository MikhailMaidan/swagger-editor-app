import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { extractSchemaModels } from "@/lib/schema-models";
import { DataModelExplorer } from "./data-model-explorer";

const models = extractSchemaModels({
  components: {
    schemas: {
      Address: {
        properties: {
          street: { description: "Street name", type: "string" },
        },
        required: ["street"],
        type: "object",
      },
      Orphan: {
        description: "Not used by an operation",
        type: "boolean",
      },
      User: {
        description: "A catalog user",
        properties: {
          address: { $ref: "#/components/schemas/Address" },
          email: { format: "email", nullable: true, type: "string" },
          role: { enum: ["admin", "viewer"], readOnly: true, type: "string" },
        },
        required: ["address", "email"],
        type: "object",
      },
    },
  },
  paths: {
    "/users": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/User" },
            },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
        },
      },
    },
  },
});

function renderExplorer(onSelectEndpoint = vi.fn()) {
  return {
    onSelectEndpoint,
    ...render(
      <DataModelExplorer
        models={models}
        onSelectEndpoint={onSelectEndpoint}
        schema={{ title: "Catalog API", version: "2.0.0" }}
      />,
    ),
  };
}

describe("DataModelExplorer", () => {
  it("filters models, expands details, and opens operations that use a model", async () => {
    const user = userEvent.setup();
    const { onSelectEndpoint } = renderExplorer();

    expect(screen.getByText("2/3 used by API operations")).toBeVisible();
    expect(screen.getByRole("button", { name: "Used (2)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Unused (1)" })).toBeVisible();

    const userRow = screen
      .getByRole("heading", { name: "User" })
      .closest("li") as HTMLElement;

    await user.click(
      within(userRow).getByRole("button", { name: "Show details" }),
    );

    expect(within(userRow).getByText("A catalog user")).toBeVisible();
    expect(within(userRow).getByText("address")).toBeVisible();
    expect(within(userRow).getAllByText("Address")).toHaveLength(2);
    expect(within(userRow).getByText("Format: email")).toBeVisible();
    expect(within(userRow).getByText("Nullable")).toBeVisible();
    expect(within(userRow).getByText("Enum: admin, viewer")).toBeVisible();

    await user.click(
      within(userRow).getByRole("button", {
        name: "Request: POST /users",
      }),
    );
    expect(onSelectEndpoint).toHaveBeenCalledWith("POST", "/users");

    await user.click(screen.getByRole("button", { name: "Unused (1)" }));

    expect(screen.getByRole("heading", { name: "Orphan" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "User" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All (3)" }));
    await user.type(screen.getByLabelText("Search data models"), "street");

    expect(screen.getByRole("heading", { name: "Address" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "User" }),
    ).not.toBeInTheDocument();
  });

  it("copies generated examples and TypeScript with localized feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Clipboard blocked"));
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      renderExplorer();
      const userRow = screen
        .getByRole("heading", { name: "User" })
        .closest("li") as HTMLElement;

      await user.click(
        within(userRow).getByRole("button", { name: "Show details" }),
      );
      await user.click(
        within(userRow).getByRole("button", { name: "Copy example" }),
      );

      expect(writeText).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('"email": "user@example.com"'),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "User example copied.",
      );

      await user.click(
        within(userRow).getByRole("button", { name: "Copy TypeScript" }),
      );

      expect(writeText).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("export interface User"),
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not copy the User TypeScript declaration.",
      );
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  });

  it("exports the complete TypeScript model catalog and reports blocked downloads", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const createObjectURL = vi.fn().mockReturnValue("blob:model-catalog");
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      renderExplorer();
      const exportButton = screen.getByRole("button", {
        name: "Export TypeScript",
      });

      await user.click(exportButton);

      expect(screen.getByRole("status")).toHaveTextContent(
        "TypeScript model export started.",
      );
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:model-catalog");

      createObjectURL.mockImplementationOnce(() => {
        throw new DOMException("Downloads blocked", "SecurityError");
      });
      await user.click(exportButton);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not export the data models.",
      );
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });
});
