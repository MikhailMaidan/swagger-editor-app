import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RequestPreset } from "@/lib/request-presets";
import { RequestPresetControls } from "./request-preset-controls";

const preset: RequestPreset = {
  createdAt: "2026-08-28T08:00:00.000Z",
  id: "happy-path",
  method: "GET",
  name: "Happy path",
  parameterValues: { "path:id": "42" },
  path: "/users/{id}",
  requestBodies: {},
  requestContentType: "",
  responseContentType: "application/json",
  responseStatus: "200",
  timeoutMs: 10_000,
  updatedAt: "2026-08-28T08:00:00.000Z",
};

function renderControls({
  onApply = vi.fn(),
  onCreate = vi.fn(() => true),
  onDelete = vi.fn(() => true),
  onUpdate = vi.fn(() => true),
  presets = [preset],
  selectedPresetId = "",
}: Partial<React.ComponentProps<typeof RequestPresetControls>> = {}) {
  render(
    <RequestPresetControls
      disabled={false}
      presets={presets}
      selectedPresetId={selectedPresetId}
      onApply={onApply}
      onCreate={onCreate}
      onDelete={onDelete}
      onUpdate={onUpdate}
    />,
  );

  return { onApply, onCreate, onDelete, onUpdate };
}

describe("RequestPresetControls", () => {
  it("validates and submits a new preset name", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderControls();

    await user.click(screen.getByRole("button", { name: "Save as preset" }));
    await user.click(screen.getByRole("button", { name: "Save preset" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a preset name.");
    expect(onCreate).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Preset name"), "Error response");
    await user.click(screen.getByRole("button", { name: "Save preset" }));

    expect(onCreate).toHaveBeenCalledWith("Error response");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Request preset saved locally.",
    );
  });

  it("applies the selected preset", async () => {
    const user = userEvent.setup();
    const { onApply } = renderControls();

    await user.selectOptions(
      screen.getByLabelText("Request preset"),
      preset.id,
    );

    expect(onApply).toHaveBeenCalledWith(preset.id);
  });

  it("updates and confirms deletion of the active preset", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onDelete, onUpdate } = renderControls({
      selectedPresetId: preset.id,
    });

    try {
      await user.click(screen.getByRole("button", { name: "Update preset" }));
      expect(onUpdate).toHaveBeenCalledWith(preset.id);

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(confirm).toHaveBeenCalledWith(
        'Delete the "Happy path" request preset?',
      );
      expect(onDelete).not.toHaveBeenCalled();

      confirm.mockReturnValue(true);
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(onDelete).toHaveBeenCalledWith(preset.id);
      expect(screen.getByRole("status")).toHaveTextContent(
        "Request preset deleted.",
      );
    } finally {
      confirm.mockRestore();
    }
  });
});
