import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createEmptyRequestEnvironmentSettings,
  type RequestEnvironmentSettings,
} from "@/lib/request-environments";
import { RequestEnvironmentManager } from "./request-environment-manager";

function EnvironmentHarness({
  hasCustomServerOverride = false,
  initialSettings = createEmptyRequestEnvironmentSettings(),
}: {
  hasCustomServerOverride?: boolean;
  initialSettings?: RequestEnvironmentSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);

  return (
    <RequestEnvironmentManager
      hasCustomServerOverride={hasCustomServerOverride}
      settings={settings}
      storageError={false}
      onSettingsChange={setSettings}
    />
  );
}

describe("RequestEnvironmentManager", () => {
  it("creates and activates a reusable base URL and shared header", async () => {
    const user = userEvent.setup();

    render(<EnvironmentHarness />);

    await user.click(screen.getByRole("button", { name: "New environment" }));
    await user.type(screen.getByLabelText("Profile name"), "Staging");
    await user.type(
      screen.getByLabelText("Base URL (optional)"),
      "https://staging.example.com/v2",
    );
    await user.type(screen.getByLabelText("Header 1 name"), "Authorization");
    await user.type(
      screen.getByLabelText("Header 1 value"),
      "Bearer staging-token",
    );
    await user.click(screen.getByRole("button", { name: "Save environment" }));

    expect(
      (screen.getByLabelText("Active request environment") as HTMLSelectElement)
        .value,
    ).toMatch(/^environment-/);
    expect(
      screen.getByText("Base URL: https://staging.example.com/v2"),
    ).toBeVisible();
    expect(screen.getByText("Shared headers: 1")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Request environments saved locally.",
    );
  });

  it("validates profile names, public URLs, and HTTP headers", async () => {
    const user = userEvent.setup();

    render(<EnvironmentHarness />);

    await user.click(screen.getByRole("button", { name: "New environment" }));
    await user.click(screen.getByRole("button", { name: "Save environment" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a profile name.",
    );

    await user.type(screen.getByLabelText("Profile name"), "Local");
    await user.type(
      screen.getByLabelText("Base URL (optional)"),
      "http://localhost:4000",
    );
    await user.click(screen.getByRole("button", { name: "Save environment" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a public HTTP or HTTPS base URL, or leave it empty.",
    );

    await user.clear(screen.getByLabelText("Base URL (optional)"));
    await user.type(screen.getByLabelText("Header 1 name"), "Bad Header");
    await user.type(screen.getByLabelText("Header 1 value"), "value");
    await user.click(screen.getByRole("button", { name: "Save environment" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Each populated header needs a valid HTTP name and a single-line value.",
    );
  });

  it("edits and removes the active profile with confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const initialSettings: RequestEnvironmentSettings = {
      activeEnvironmentId: "staging",
      environments: [
        {
          headers: [],
          id: "staging",
          name: "Staging",
          serverUrl: "https://staging.example.com",
        },
      ],
    };

    try {
      render(
        <EnvironmentHarness
          hasCustomServerOverride
          initialSettings={initialSettings}
        />,
      );

      expect(
        screen.getByText(
          "The one-off custom server URL currently takes priority.",
        ),
      ).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Edit" }));
      await user.clear(screen.getByLabelText("Profile name"));
      await user.type(screen.getByLabelText("Profile name"), "QA");
      await user.click(
        screen.getByRole("button", { name: "Save environment" }),
      );

      expect(screen.getByRole("option", { name: "QA" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(confirm).toHaveBeenCalledWith(
        'Delete the "QA" request environment?',
      );
      expect(screen.getByLabelText("Active request environment")).toHaveValue(
        "",
      );
      expect(
        screen.queryByRole("option", { name: "QA" }),
      ).not.toBeInTheDocument();
    } finally {
      confirm.mockRestore();
    }
  });
});
