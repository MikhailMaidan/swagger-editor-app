import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readSchemaCheckpoints,
  SCHEMA_CHECKPOINTS_STORAGE_KEY,
} from "@/lib/schema-checkpoints";
import { OpenApiUpgradePanel } from "./openapi-upgrade-panel";

const swaggerSchema = {
  basePath: "/v1",
  definitions: {
    Pet: { properties: { name: { type: "string" } }, type: "object" },
  },
  host: "pets.example.com",
  info: { title: "Pets", version: "1.0.0" },
  paths: {
    "/pets": {
      get: {
        parameters: [
          {
            collectionFormat: "tsv",
            in: "query",
            items: { type: "string" },
            name: "ids",
            type: "array",
          },
        ],
        responses: {
          "200": { description: "OK", schema: { $ref: "#/definitions/Pet" } },
        },
      },
    },
  },
  swagger: "2.0",
};
const swaggerText = "swagger: '2.0'\n";

function renderPanel(
  overrides: Partial<Parameters<typeof OpenApiUpgradePanel>[0]> = {},
) {
  const props = {
    getSchemaText: vi.fn(() => swaggerText),
    onApply: vi.fn(),
    onRevealLocation: vi.fn(() => true),
    rootSchema: swaggerSchema,
    schemaFormat: "yaml" as const,
    schemaTitle: "Pets",
    schemaVersion: "1.0.0",
    source: "swagger-2.0" as const,
    ...overrides,
  };

  render(<OpenApiUpgradePanel {...props} />);

  return {
    ...props,
    panel: within(
      screen.getByRole("region", { name: "OpenAPI upgrade assistant" }),
    ),
  };
}

describe("OpenApiUpgradePanel", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("previews the upgrade with parity, changes, review items, and output", async () => {
    const user = userEvent.setup();
    const { onRevealLocation, panel } = renderPanel();

    expect(panel.getByText("Swagger 2.0 → OpenAPI 3.0.3")).toBeVisible();
    expect(panel.queryByLabelText("Upgraded document")).not.toBeInTheDocument();

    await user.click(panel.getByRole("button", { name: "Preview upgrade" }));

    expect(panel.getByText("All 1 endpoints are preserved.")).toBeVisible();
    expect(
      panel.getByText("Moves 1 definitions to components/schemas"),
    ).toBeVisible();
    expect(
      panel.getByText(
        'Collection format "tsv" of "ids" has no OpenAPI 3 equivalent.',
      ),
    ).toBeVisible();

    const output = panel.getByLabelText(
      "Upgraded document",
    ) as HTMLTextAreaElement;

    expect(output.value).toContain("openapi: 3.0.3");
    expect(output.value).toContain("url: https://pets.example.com/v1");

    await user.selectOptions(panel.getByLabelText("Target version"), "3.1.0");
    await user.selectOptions(panel.getByLabelText("Output format"), "json");
    expect(JSON.parse(output.value)).toMatchObject({ openapi: "3.1.0" });
    expect(panel.getByText("Swagger 2.0 → OpenAPI 3.1.0")).toBeVisible();

    await user.click(
      panel.getByRole("button", {
        name: "Show upgrade note at /paths/~1pets/get/parameters/0 in the editor",
      }),
    );
    expect(onRevealLocation).toHaveBeenCalledWith(
      "/paths/~1pets/get/parameters/0",
      "key",
    );

    await user.click(panel.getByRole("button", { name: "Hide preview" }));
    expect(panel.queryByLabelText("Upgraded document")).not.toBeInTheDocument();
  });

  it("saves a checkpoint, notifies listeners, and applies the upgraded document", async () => {
    const user = userEvent.setup();
    const storageListener = vi.fn();
    const { onApply, panel } = renderPanel();

    window.addEventListener("storage", storageListener);

    try {
      await user.click(panel.getByRole("button", { name: "Preview upgrade" }));
      await user.click(panel.getByRole("button", { name: "Apply to editor" }));
    } finally {
      window.removeEventListener("storage", storageListener);
    }

    expect(onApply).toHaveBeenCalledWith(
      expect.stringContaining("openapi: 3.0.3"),
      "3.0.3",
      true,
    );
    expect(readSchemaCheckpoints()).toMatchObject([
      {
        endpointCount: 1,
        name: "Before upgrade to OpenAPI 3.0.3",
        schemaText: swaggerText,
        schemaTitle: "Pets",
      },
    ]);
    expect(storageListener).toHaveBeenCalledWith(
      expect.objectContaining({ key: SCHEMA_CHECKPOINTS_STORAGE_KEY }),
    );
    expect(panel.queryByLabelText("Upgraded document")).not.toBeInTheDocument();
  });

  it("does not change the editor when the checkpoint cannot be saved, unless the checkpoint is skipped", async () => {
    const user = userEvent.setup();
    const { onApply, panel } = renderPanel();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    await user.click(panel.getByRole("button", { name: "Preview upgrade" }));
    await user.click(panel.getByRole("button", { name: "Apply to editor" }));

    expect(panel.getByRole("alert")).toHaveTextContent(
      "Could not save a checkpoint, so the editor was not changed.",
    );
    expect(onApply).not.toHaveBeenCalled();

    await user.click(
      panel.getByRole("checkbox", {
        name: "Save the current document as a checkpoint first",
      }),
    );
    await user.click(panel.getByRole("button", { name: "Apply to editor" }));
    expect(onApply).toHaveBeenCalledWith(expect.any(String), "3.0.3", false);
  });

  it("copies the upgraded document and migration notes and downloads the result", async () => {
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

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    URL.createObjectURL = vi.fn().mockReturnValue("blob:upgrade");
    URL.revokeObjectURL = vi.fn();

    try {
      const { panel } = renderPanel({
        rootSchema: {
          info: { title: "Refs", version: "1" },
          paths: { "/remote": { $ref: "other.yaml#/paths/remote" } },
          swagger: "2.0",
        },
        source: "swagger-2.0",
      });

      await user.click(panel.getByRole("button", { name: "Preview upgrade" }));
      await user.click(
        panel.getByRole("button", { name: "Copy upgraded document" }),
      );
      expect(writeText).toHaveBeenLastCalledWith(
        expect.stringContaining("openapi: 3.0.3"),
      );
      expect(panel.getByRole("status")).toHaveTextContent(
        "Upgraded document copied.",
      );

      await user.click(
        panel.getByRole("button", { name: "Copy migration notes" }),
      );
      expect(writeText).toHaveBeenLastCalledWith(
        expect.stringContaining("# OpenAPI upgrade notes: Pets"),
      );

      await user.click(
        panel.getByRole("button", { name: "Download upgraded document" }),
      );
      expect(click).toHaveBeenCalledTimes(1);
      expect(panel.getByRole("status")).toHaveTextContent(
        "Upgraded document download started.",
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

  it("offers only OpenAPI 3.1 for OpenAPI 3.0 documents", async () => {
    const user = userEvent.setup();
    const { panel } = renderPanel({
      rootSchema: {
        info: { title: "Shop", version: "1" },
        openapi: "3.0.3",
        paths: {},
      },
      schemaFormat: "json",
      source: "openapi-3.0",
    });

    expect(panel.getByText("OpenAPI 3.0 → OpenAPI 3.1.0")).toBeVisible();
    expect(panel.queryByLabelText("Target version")).not.toBeInTheDocument();

    await user.click(panel.getByRole("button", { name: "Preview upgrade" }));
    expect(
      JSON.parse(
        (panel.getByLabelText("Upgraded document") as HTMLTextAreaElement)
          .value,
      ),
    ).toEqual({
      info: { title: "Shop", version: "1" },
      openapi: "3.1.0",
      paths: {},
    });
    expect(panel.getByText("Nothing needs manual review.")).toBeVisible();
  });
});
