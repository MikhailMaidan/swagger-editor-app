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

  it.each([
    { editable: true, backward: true, copied: true },
    { editable: true, backward: true, copied: false },
    { editable: false, backward: false, copied: true },
  ])(
    "restores page selection (editable=$editable, backward=$backward, copied=$copied)",
    async ({ editable, backward, copied }) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        document,
        "execCommand",
      );
      const editor = document.createElement("div");
      editor.contentEditable = String(editable);
      editor.tabIndex = 0;
      editor.textContent = "selected content";
      document.body.appendChild(editor);
      editor.focus();
      const selection = document.getSelection()!;
      const text = editor.firstChild!;
      selection.setBaseAndExtent(
        text,
        backward ? 8 : 2,
        text,
        backward ? 2 : 8,
      );

      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: vi.fn(() => {
          const fallback = document.querySelector<HTMLTextAreaElement>(
            "[data-clipboard-fallback]",
          )!;
          fallback.focus();
          selection.selectAllChildren(fallback);
          return copied;
        }),
      });

      try {
        await expect(
          writeTextToClipboard("copied text", undefined),
        ).resolves.toBe(copied);
        expect(document.activeElement).toBe(editor);
        expect(selection.toString()).toBe("lected");
        expect(selection.anchorNode).toBe(text);
        expect(selection.anchorOffset).toBe(backward ? 8 : 2);
        expect(selection.focusNode).toBe(text);
        expect(selection.focusOffset).toBe(backward ? 2 : 8);
        expect(
          document.querySelector("[data-clipboard-fallback]"),
        ).not.toBeInTheDocument();
      } finally {
        selection.removeAllRanges();
        editor.remove();
        if (descriptor)
          Object.defineProperty(document, "execCommand", descriptor);
        else Reflect.deleteProperty(document, "execCommand");
      }
    },
  );

  it.each([
    ["input", "forward"],
    ["input", "backward"],
    ["textarea", "forward"],
    ["textarea", "backward"],
  ] as const)(
    "restores %s focus and %s selection after fallback copying",
    async (tag, direction) => {
      const execCommandDescriptor = Object.getOwnPropertyDescriptor(
        document,
        "execCommand",
      );
      const execCommand = vi.fn().mockReturnValue(true);
      const input = document.createElement(tag);

      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: execCommand,
      });
      document.body.appendChild(input);
      input.value = "focused value";
      input.focus();
      input.setSelectionRange(2, 7, direction);

      try {
        await expect(
          writeTextToClipboard("fallback text", undefined),
        ).resolves.toBe(true);

        expect(execCommand).toHaveBeenCalledWith("copy");
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(2);
        expect(input.selectionEnd).toBe(7);
        expect(input.selectionDirection).toBe(direction);
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
    },
  );
});
