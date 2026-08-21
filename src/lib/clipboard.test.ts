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

  it("falls back to a temporary textarea and restores input focus", async () => {
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "execCommand",
    );
    const execCommand = vi.fn().mockReturnValue(true);
    const input = document.createElement("input");

    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    document.body.appendChild(input);
    input.value = "focused value";
    input.focus();
    input.setSelectionRange(2, 7);

    try {
      await expect(
        writeTextToClipboard("fallback text", undefined),
      ).resolves.toBe(true);

      expect(execCommand).toHaveBeenCalledWith("copy");
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(2);
      expect(input.selectionEnd).toBe(7);
      expect(
        document.querySelector("[data-clipboard-fallback]"),
      ).not.toBeInTheDocument();
    } finally {
      input.remove();

      if (execCommandDescriptor) {
        Object.defineProperty(document, "execCommand", execCommandDescriptor);
      } else {
        Reflect.deleteProperty(document, "execCommand");
      }
    }
  });
});
