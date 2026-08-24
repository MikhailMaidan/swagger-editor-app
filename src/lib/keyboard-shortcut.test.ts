import { describe, expect, it } from "vitest";
import {
  isCancelRequestShortcut,
  isEditableShortcutTarget,
  isEndpointSearchShortcut,
  isFormatSchemaShortcut,
  isGoToLineShortcut,
  isRunRequestShortcut,
  isSaveSchemaShortcut,
  isToggleWordWrapShortcut,
  type KeyboardShortcutEvent,
} from "./keyboard-shortcut";

function createKeyboardEvent(
  overrides: Partial<KeyboardShortcutEvent> = {},
): KeyboardShortcutEvent {
  return {
    altKey: false,
    ctrlKey: false,
    key: "Enter",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("keyboard shortcut helpers", () => {
  it("recognizes primary-modifier Enter on every platform", () => {
    expect(isRunRequestShortcut(createKeyboardEvent({ ctrlKey: true }))).toBe(
      true,
    );
    expect(isRunRequestShortcut(createKeyboardEvent({ metaKey: true }))).toBe(
      true,
    );
  });

  it("ignores unrelated or additionally modified key presses", () => {
    expect(isRunRequestShortcut(createKeyboardEvent())).toBe(false);
    expect(
      isRunRequestShortcut(createKeyboardEvent({ ctrlKey: true, key: "S" })),
    ).toBe(false);
    expect(
      isRunRequestShortcut(
        createKeyboardEvent({ ctrlKey: true, shiftKey: true }),
      ),
    ).toBe(false);
    expect(
      isRunRequestShortcut(
        createKeyboardEvent({ altKey: true, metaKey: true }),
      ),
    ).toBe(false);
  });

  it("recognizes an unmodified Escape cancellation shortcut", () => {
    expect(
      isCancelRequestShortcut(createKeyboardEvent({ key: "Escape" })),
    ).toBe(true);
    expect(isCancelRequestShortcut(createKeyboardEvent())).toBe(false);
    expect(
      isCancelRequestShortcut(
        createKeyboardEvent({ key: "Escape", metaKey: true }),
      ),
    ).toBe(false);
  });

  it("recognizes only an unmodified endpoint-search shortcut", () => {
    expect(isEndpointSearchShortcut(createKeyboardEvent({ key: "/" }))).toBe(
      true,
    );
    expect(
      isEndpointSearchShortcut(
        createKeyboardEvent({ ctrlKey: true, key: "/" }),
      ),
    ).toBe(false);
    expect(isEndpointSearchShortcut(createKeyboardEvent())).toBe(false);
  });

  it("recognizes cross-platform schema save and format shortcuts", () => {
    expect(
      isSaveSchemaShortcut(createKeyboardEvent({ ctrlKey: true, key: "s" })),
    ).toBe(true);
    expect(
      isSaveSchemaShortcut(createKeyboardEvent({ key: "S", metaKey: true })),
    ).toBe(true);
    expect(
      isFormatSchemaShortcut(
        createKeyboardEvent({ ctrlKey: true, key: "f", shiftKey: true }),
      ),
    ).toBe(true);
    expect(
      isFormatSchemaShortcut(
        createKeyboardEvent({ key: "F", metaKey: true, shiftKey: true }),
      ),
    ).toBe(true);
    expect(
      isFormatSchemaShortcut(createKeyboardEvent({ ctrlKey: true, key: "f" })),
    ).toBe(false);
    expect(
      isSaveSchemaShortcut(
        createKeyboardEvent({ ctrlKey: true, key: "s", shiftKey: true }),
      ),
    ).toBe(false);
  });

  it("recognizes the cross-platform go-to-line shortcut", () => {
    expect(
      isGoToLineShortcut(createKeyboardEvent({ ctrlKey: true, key: "g" })),
    ).toBe(true);
    expect(
      isGoToLineShortcut(createKeyboardEvent({ key: "G", metaKey: true })),
    ).toBe(true);
    expect(
      isGoToLineShortcut(
        createKeyboardEvent({ ctrlKey: true, key: "g", shiftKey: true }),
      ),
    ).toBe(false);
    expect(isGoToLineShortcut(createKeyboardEvent({ key: "g" }))).toBe(false);
  });

  it("recognizes only Alt+Z as the word wrap shortcut", () => {
    expect(
      isToggleWordWrapShortcut(createKeyboardEvent({ altKey: true, key: "z" })),
    ).toBe(true);
    expect(
      isToggleWordWrapShortcut(createKeyboardEvent({ altKey: true, key: "Z" })),
    ).toBe(true);
    expect(
      isToggleWordWrapShortcut(
        createKeyboardEvent({ altKey: true, ctrlKey: true, key: "z" }),
      ),
    ).toBe(false);
    expect(isToggleWordWrapShortcut(createKeyboardEvent({ key: "z" }))).toBe(
      false,
    );
  });

  it("recognizes controls and editable content as typing targets", () => {
    const editable = document.createElement("div");

    editable.contentEditable = "true";

    expect(isEditableShortcutTarget(document.createElement("input"))).toBe(
      true,
    );
    expect(isEditableShortcutTarget(document.createElement("select"))).toBe(
      true,
    );
    expect(isEditableShortcutTarget(document.createElement("textarea"))).toBe(
      true,
    );
    expect(isEditableShortcutTarget(editable)).toBe(true);
    expect(isEditableShortcutTarget(document.createElement("button"))).toBe(
      false,
    );
    expect(isEditableShortcutTarget(null)).toBe(false);
  });
});
