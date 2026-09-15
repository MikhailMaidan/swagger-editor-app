import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createExampleValidationReport } from "@/lib/example-validation";
import { ExampleValidationPanel } from "./example-validation-panel";

const report = createExampleValidationReport({
  components: {
    schemas: {
      Pet: {
        properties: {
          id: { example: 7, type: "integer" },
          name: { example: 42, type: "string" },
        },
        type: "object",
      },
    },
  },
  openapi: "3.0.3",
  paths: {
    "/pets": {
      get: {
        parameters: [
          {
            example: "ten",
            in: "query",
            name: "limit",
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                examples: {
                  remote: { externalValue: "https://example.com/pets.json" },
                  serialized: { value: '[{"id":1}]' },
                },
                schema: { items: { type: "object" }, type: "array" },
              },
            },
            description: "OK",
          },
        },
      },
    },
  },
});

function renderPanel({
  onRevealExample = vi.fn().mockReturnValue(true),
  onSelectEndpoint = vi.fn(),
} = {}) {
  render(
    <ExampleValidationPanel
      onRevealExample={onRevealExample}
      onSelectEndpoint={onSelectEndpoint}
      report={report}
      schema={{ title: "Pets API", version: "1.0.0" }}
    />,
  );

  return { onRevealExample, onSelectEndpoint };
}

describe("ExampleValidationPanel", () => {
  it("summarizes results and lists mismatches before other examples", () => {
    renderPanel();

    const panel = screen.getByRole("region", { name: "Example validator" });

    expect(within(panel).getByText("50% conform")).toBeVisible();
    expect(
      within(panel).getByText(
        "5 examples · 2 mismatched · 1 with warnings · 1 skipped",
      ),
    ).toBeVisible();
    expect(
      within(panel).getByRole("img", {
        name: "Example results: 1 matching, 1 with warnings, 2 mismatched, 1 not checked",
      }),
    ).toBeInTheDocument();

    const rows = within(panel)
      .getAllByRole("listitem")
      .filter((item) => item.parentElement?.parentElement === panel);

    expect(
      rows.map((row) => within(row).getAllByText(/./)[0].textContent),
    ).toEqual([
      "Mismatch",
      "Mismatch",
      "Needs review",
      "Not checked",
      "Matches",
    ]);
    expect(
      within(rows[0]).getByText("Expected integer, but found string."),
    ).toBeVisible();
    expect(
      within(rows[2]).getByText(
        "Example is a JSON string; use a structured value instead.",
      ),
    ).toBeVisible();
    expect(
      within(rows[3]).getByText(
        "Uses externalValue, which is not downloaded for validation.",
      ),
    ).toBeVisible();
  });

  it("filters by result, location, and search text", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Warnings (1)" }));
    expect(screen.getByText("serialized")).toBeVisible();
    expect(screen.queryByText("query · limit")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Mismatches\s*2$/ }));
    expect(screen.getByText("query · limit")).toBeVisible();
    expect(screen.getByText("Pet.name")).toBeVisible();

    await user.selectOptions(
      screen.getByLabelText("Example location"),
      "schema",
    );
    expect(screen.queryByText("query · limit")).not.toBeInTheDocument();
    expect(screen.getByText("Pet.name")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "All (5)" }));
    await user.selectOptions(screen.getByLabelText("Example location"), "all");

    const search = screen.getByRole("searchbox", { name: "Search examples" });

    await user.type(search, "pets remote");
    expect(screen.getByText("remote")).toBeVisible();
    expect(screen.queryByText("serialized")).not.toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(screen.getByText("serialized")).toBeVisible();

    await user.type(search, "no such example");
    expect(screen.getByRole("status")).toHaveTextContent(
      "No examples match these filters.",
    );
  });

  it("reveals examples in the editor and opens their endpoints", async () => {
    const user = userEvent.setup();
    const onRevealExample = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const { onSelectEndpoint } = renderPanel({ onRevealExample });

    await user.click(
      screen.getByRole("button", {
        name: "Show example for query · limit in the editor",
      }),
    );
    expect(onRevealExample).toHaveBeenLastCalledWith(
      "/paths/~1pets/get/parameters/0/example",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Show example for Pet.name in the editor",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not find this example in the editor.",
    );

    await user.click(
      screen.getAllByRole("button", { name: "Open endpoint GET /pets" })[0],
    );
    expect(onSelectEndpoint).toHaveBeenCalledWith("GET", "/pets");
    expect(
      within(
        screen.getByText("Pet.name").closest("li") as HTMLElement,
      ).queryByRole("button", { name: /Open endpoint/ }),
    ).not.toBeInTheDocument();
  });

  it("copies a Markdown report and exports JSON", async () => {
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
    URL.createObjectURL = vi.fn().mockReturnValue("blob:examples");
    URL.revokeObjectURL = vi.fn();

    try {
      renderPanel();
      await user.click(
        screen.getByRole("button", { name: "Copy example report" }),
      );
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("# Example validation: Pets API"),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Example report copied.",
      );

      await user.click(
        screen.getByRole("button", { name: "Export example report" }),
      );
      expect(click).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent(
        "Example report export started.",
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
