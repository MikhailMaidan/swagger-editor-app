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
