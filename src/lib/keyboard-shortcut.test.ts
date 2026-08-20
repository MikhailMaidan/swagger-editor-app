import { describe, expect, it } from "vitest";
import { isRunRequestShortcut } from "./keyboard-shortcut";

function createKeyboardEvent(
  overrides: Partial<Parameters<typeof isRunRequestShortcut>[0]> = {},
) {
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
});
