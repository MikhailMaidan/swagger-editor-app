export type KeyboardShortcutEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

export function isRunRequestShortcut(event: KeyboardShortcutEvent) {
  return (
    event.key === "Enter" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isCancelRequestShortcut(event: KeyboardShortcutEvent) {
  return (
    event.key === "Escape" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function isEndpointSearchShortcut(event: KeyboardShortcutEvent) {
  return (
    event.key === "/" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function isSaveSchemaShortcut(event: KeyboardShortcutEvent) {
  return (
    event.key.toLowerCase() === "s" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isFormatSchemaShortcut(event: KeyboardShortcutEvent) {
  return (
    event.key.toLowerCase() === "f" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    event.shiftKey
  );
}

export function isFindInSchemaShortcut(event: KeyboardShortcutEvent) {
  return (
    event.key.toLowerCase() === "f" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isImportSchemaShortcut(event: KeyboardShortcutEvent) {
  return (
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

  if (!isNavigationKey || event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  return event.shiftKey ? "previous" : "next";
}

export function isGoToLineShortcut(event: KeyboardShortcutEvent) {
  return (
    event.key.toLowerCase() === "g" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

export function isToggleWordWrapShortcut(event: KeyboardShortcutEvent) {
  return (
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
