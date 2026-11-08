export type KeyboardShortcutEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
  nativeEvent?: { isComposing?: boolean };
  shiftKey: boolean;
};

export function isComposingKeyboardEvent(event: KeyboardShortcutEvent) {
  return Boolean(event.isComposing || event.nativeEvent?.isComposing);
}

export function isRunRequestShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key === "Enter" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isCancelRequestShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key === "Escape" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function isEndpointSearchShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key === "/" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function isSaveSchemaShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key.toLowerCase() === "s" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isDownloadSchemaShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key.toLowerCase() === "s" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    event.shiftKey
  );
}

export function isFormatSchemaShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key.toLowerCase() === "f" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    event.shiftKey
  );
}

export function isFindInSchemaShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key.toLowerCase() === "f" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isImportSchemaShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key.toLowerCase() === "o" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function getSchemaSearchNavigationDirection(
  event: KeyboardShortcutEvent,
): "next" | "previous" | null {
  const isNavigationKey = event.key === "Enter" || event.key === "F3";

  if (
    isComposingKeyboardEvent(event) ||
    !isNavigationKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return null;
  }

  return event.shiftKey ? "previous" : "next";
}

export function isGoToLineShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key.toLowerCase() === "g" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isToggleWordWrapShortcut(event: KeyboardShortcutEvent) {
  return (
    !isComposingKeyboardEvent(event) &&
    event.key.toLowerCase() === "z" &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const editableContainer = target.closest<HTMLElement>("[contenteditable]");
  const hasEditableContainer =
    editableContainer !== null &&
    editableContainer.getAttribute("contenteditable") !== "false";

  return (
    target.isContentEditable ||
    target.contentEditable === "true" ||
    target.contentEditable === "plaintext-only" ||
    hasEditableContainer ||
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.tagName === "TEXTAREA"
  );
}
