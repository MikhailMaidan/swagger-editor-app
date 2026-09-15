import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STYLE_GUIDE_CONFIG_STORAGE_KEY } from "@/lib/api-style-guide-config";
import { ApiStyleGuidePanel } from "./api-style-guide-panel";

const rootSchema = {
  info: {
    contact: { name: "API team" },
    description: "Orders",
    license: { name: "MIT" },
    title: "Orders",
    version: "1.0.0",
  },
  openapi: "3.0.3",
  paths: {
    "/order_items": {
      get: {
        parameters: [
          { description: "Page size", in: "query", name: "page_size" },
        ],
        responses: {},
      },
    },
    "/order_items/{id}": {
      get: { responses: {} },
    },
  },
  servers: [{ url: "http://api.example.com" }],
};

function renderPanel({
  onRevealLocation = vi.fn().mockReturnValue(true),
  onSelectEndpoint = vi.fn(),
} = {}) {
  render(
    <ApiStyleGuidePanel
      onRevealLocation={onRevealLocation}
      onSelectEndpoint={onSelectEndpoint}
      rootSchema={rootSchema}
      schemaTitle="Orders"
      schemaVersion="1.0.0"
    />,
  );

  return {
    onRevealLocation,
    onSelectEndpoint,
    panel: within(screen.getByRole("region", { name: "API style guide" })),
  };
}

function findingRules(panel: ReturnType<typeof renderPanel>["panel"]) {
  return panel
    .queryAllByRole("button", { name: /^Show .* finding at/ })
    .map((button) => button.getAttribute("aria-label"));
}

describe("ApiStyleGuidePanel", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("scores the API, orders findings by severity, and filters them", async () => {
    const user = userEvent.setup();
    const { panel } = renderPanel();

    expect(
      panel.getByRole("img", { name: /^Style score \d+ out of 100$/ }),
    ).toBeInTheDocument();
    expect(
      panel.getByText("4 findings · 1 must fix · 3 should fix · 0 to consider"),
    ).toBeVisible();
    expect(findingRules(panel)).toEqual([
      "Show HTTPS servers finding at /servers/0/url in the editor",
      "Show Path segment casing finding at /paths/~1order_items in the editor",
      "Show Path segment casing finding at /paths/~1order_items~1{id} in the editor",
      "Show Parameter casing finding at /paths/~1order_items/get/parameters/0/name in the editor",
    ]);
    expect(panel.getAllByText("Suggested:")).toHaveLength(3);
    expect(panel.getByText("/order-items")).toBeVisible();

    await user.click(panel.getByRole("button", { name: "Must fix (1)" }));
    expect(findingRules(panel)).toHaveLength(1);

    await user.click(panel.getByRole("button", { name: "All findings (4)" }));
    await user.click(
      panel.getByRole("button", {
        name: "Show findings for Parameters & pagination",
      }),
    );
    expect(findingRules(panel)).toEqual([
      "Show Parameter casing finding at /paths/~1order_items/get/parameters/0/name in the editor",
    ]);
    await user.selectOptions(panel.getByLabelText("Rule category"), "all");

    const search = panel.getByRole("searchbox", {
      name: "Search style findings",
    });

    fireEvent.change(search, { target: { value: "{id}" } });
    expect(findingRules(panel)).toEqual([
      "Show Path segment casing finding at /paths/~1order_items~1{id} in the editor",
    ]);
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(findingRules(panel)).toHaveLength(4);
  });

  it("applies conventions and rule toggles immediately and remembers them", async () => {
    const user = userEvent.setup();
    const { panel } = renderPanel();

    await user.click(
      panel.getByRole("button", { name: "Conventions and rules" }),
    );
    await user.selectOptions(
      panel.getByLabelText("Path segments"),
      "snake_case",
    );
    await user.selectOptions(
      panel.getByLabelText("Query and path parameters"),
      "snake_case",
    );
    expect(findingRules(panel)).toEqual([
      "Show HTTPS servers finding at /servers/0/url in the editor",
    ]);

    await user.click(
      panel.getByRole("checkbox", { name: "Enable rule: HTTPS servers" }),
    );
    expect(panel.getByRole("status")).toHaveTextContent(
      "No style findings. The API follows every enabled rule.",
    );
    expect(panel.getByText("22/22 rules passing")).toBeVisible();
    expect(
      JSON.parse(
        window.localStorage.getItem(STYLE_GUIDE_CONFIG_STORAGE_KEY) ?? "{}",
      ),
    ).toMatchObject({
      disabledRules: ["server-https"],
      parameterCase: "snake_case",
      pathCase: "snake_case",
    });

    await user.click(panel.getByRole("button", { name: "Reset to defaults" }));
    expect(findingRules(panel)).toHaveLength(4);
    expect(
      window.localStorage.getItem(STYLE_GUIDE_CONFIG_STORAGE_KEY),
    ).toBeNull();
  });

  it("restores a stored ruleset after mounting", async () => {
    window.localStorage.setItem(
      STYLE_GUIDE_CONFIG_STORAGE_KEY,
      JSON.stringify({ disabledRules: ["path-casing", "server-https"] }),
    );

    const { panel } = renderPanel();

    await waitFor(() =>
      expect(findingRules(panel)).toEqual([
        "Show Parameter casing finding at /paths/~1order_items/get/parameters/0/name in the editor",
      ]),
    );
  });

  it("reveals findings in the editor and opens endpoints", async () => {
    const user = userEvent.setup();
    const onRevealLocation = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const { onSelectEndpoint, panel } = renderPanel({ onRevealLocation });

    await user.click(
      panel.getByRole("button", {
        name: "Show Path segment casing finding at /paths/~1order_items in the editor",
      }),
    );
    expect(onRevealLocation).toHaveBeenLastCalledWith(
      "/paths/~1order_items",
      "key",
    );
    expect(panel.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(
      panel.getByRole("button", {
        name: "Show HTTPS servers finding at /servers/0/url in the editor",
      }),
    );
    expect(onRevealLocation).toHaveBeenLastCalledWith(
      "/servers/0/url",
      "value",
    );
    expect(panel.getByRole("alert")).toHaveTextContent(
      "Could not find this location in the editor.",
    );

    await user.click(
      panel.getByRole("button", {
        name: "Open GET /order_items/{id} from the style guide",
      }),
    );
    expect(onSelectEndpoint).toHaveBeenCalledWith("GET", "/order_items/{id}");
  });

  it("imports and exports rulesets and reports", async () => {
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
    URL.createObjectURL = vi.fn().mockReturnValue("blob:style");
    URL.revokeObjectURL = vi.fn();

    try {
      const { panel } = renderPanel();

      await user.click(
        panel.getByRole("button", { name: "Conventions and rules" }),
      );

      const fileInput = panel.getByLabelText("Style guide ruleset file");

      await user.upload(
        fileInput,
        new File(["not a ruleset"], "rules.json", { type: "application/json" }),
      );
      expect(await panel.findByRole("alert")).toHaveTextContent(
        "This file is not a valid RSSwag style guide ruleset.",
      );

      await user.upload(
        fileInput,
        new File(
          [
            JSON.stringify({
              conventions: {
                pathCase: "snake_case",
                parameterCase: "snake_case",
              },
              disabledRules: ["server-https"],
              kind: "rsswag-style-guide",
              version: 1,
            }),
          ],
          "rules.json",
          { type: "application/json" },
        ),
      );
      expect(
        await panel.findByText("Ruleset imported and applied."),
      ).toBeVisible();
      expect(findingRules(panel)).toEqual([]);

      await user.click(panel.getByRole("button", { name: "Export ruleset" }));
      expect(panel.getByText("Ruleset export started.")).toBeVisible();

      await user.click(
        panel.getByRole("button", { name: "Copy style report" }),
      );
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("- Path segments: `snake_case`"),
      );
      expect(panel.getByText("Style report copied.")).toBeVisible();

      await user.click(
        panel.getByRole("button", { name: "Export style report" }),
      );
      expect(click).toHaveBeenCalledTimes(2);
      expect(panel.getByText("Style report export started.")).toBeVisible();
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
