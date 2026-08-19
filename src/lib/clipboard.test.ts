import { describe, expect, it, vi } from "vitest";
import { writeTextToClipboard } from "./clipboard";

describe("clipboard helpers", () => {
  it("writes the exact text when clipboard access is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(
      writeTextToClipboard("openapi: 3.0.0", { writeText }),
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("openapi: 3.0.0");
  });

  it("reports unavailable or rejected clipboard writes", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Not allowed"));

    await expect(writeTextToClipboard("schema", undefined)).resolves.toBe(
      false,
    );
    await expect(writeTextToClipboard("schema", { writeText })).resolves.toBe(
      false,
    );
  });
});
