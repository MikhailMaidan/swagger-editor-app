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
