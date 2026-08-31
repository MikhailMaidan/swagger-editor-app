import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  readSchemaCheckpoints,
  SCHEMA_CHECKPOINTS_STORAGE_KEY,
} from "@/lib/schema-checkpoints";
import { SchemaCheckpointPanel } from "./schema-checkpoint-panel";

const validSchema = `openapi: 3.0.0
info:
  title: Catalog API
  version: 1.2.0
paths:
  /products:
    get:
      responses:
        '200':
          description: Products`;

describe("SchemaCheckpointPanel", () => {
  it("creates, restores, and deletes a named local checkpoint", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    try {
      render(
        <SchemaCheckpointPanel
          onRestore={onRestore}
          schemaText={validSchema}
        />,
      );

      await user.type(screen.getByLabelText("Checkpoint name"), "Pre-release");
      await user.click(
        screen.getByRole("button", { name: "Create checkpoint" }),
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        'Checkpoint "Pre-release" created.',
      );
      expect(
        screen.getByText("Catalog API v1.2.0", { exact: false }),
      ).toBeVisible();
      expect(screen.getByText("Valid schema")).toBeVisible();
      expect(screen.getByText("Endpoints: 1")).toBeVisible();
      expect(readSchemaCheckpoints()).toHaveLength(1);

      await user.click(
        screen.getByRole("button", {
          name: "Restore checkpoint Pre-release",
        }),
      );

      expect(confirm).toHaveBeenCalledWith(
        'Restore "Pre-release" in the editor? Current editor changes will be replaced.',
      );
      expect(onRestore).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Pre-release",
          schemaText: validSchema,
        }),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        'Checkpoint "Pre-release" restored in the editor.',
      );

      await user.click(
        screen.getByRole("button", { name: "Delete checkpoint Pre-release" }),
      );

      expect(screen.getByText("No checkpoints yet.")).toBeVisible();
      expect(
        window.localStorage.getItem(SCHEMA_CHECKPOINTS_STORAGE_KEY),
      ).toBeNull();
    } finally {
      confirm.mockRestore();
    }
  });

  it("captures invalid drafts and downloads their exact text", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const createObjectURL = vi.fn().mockReturnValue("blob:checkpoint");
    const revokeObjectURL = vi.fn();

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    try {
      render(
        <SchemaCheckpointPanel
          onRestore={vi.fn()}
          schemaText="openapi: [broken"
        />,
      );

      await user.type(screen.getByLabelText("Checkpoint name"), "Broken draft");
      await user.click(
        screen.getByRole("button", { name: "Create checkpoint" }),
      );

      expect(screen.getByText("Invalid draft")).toBeVisible();
      expect(readSchemaCheckpoints()[0].schemaText).toBe("openapi: [broken");

      await user.click(
        screen.getByRole("button", {
          name: "Download checkpoint Broken draft",
        }),
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        "Checkpoint download started.",
      );
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:checkpoint");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });

  it("keeps a checkpoint available for the session when storage is blocked", async () => {
    const user = userEvent.setup();
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });

    try {
      render(
        <SchemaCheckpointPanel onRestore={vi.fn()} schemaText={validSchema} />,
      );

      await user.type(screen.getByLabelText("Checkpoint name"), "Session only");
      await user.click(
        screen.getByRole("button", { name: "Create checkpoint" }),
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Checkpoint changed for this session",
      );
      const panel = screen
        .getByRole("heading", { name: "Schema checkpoints" })
        .closest("section") as HTMLElement;

      await waitFor(() =>
        expect(within(panel).getByText("Session only")).toBeVisible(),
      );
    } finally {
      setItem.mockRestore();
    }
  });
});
