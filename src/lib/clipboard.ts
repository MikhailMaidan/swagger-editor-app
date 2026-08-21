export type ClipboardWriter = {
  writeText(value: string): Promise<void>;
};

function writeTextWithLegacyClipboard(value: string) {
  if (
    typeof document === "undefined" ||
    !document.body ||
    typeof document.execCommand !== "function"
  ) {
    return false;
  }

  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const activeInput =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement
      ? activeElement
      : null;
  const selectionStart = activeInput?.selectionStart ?? null;
  const selectionEnd = activeInput?.selectionEnd ?? null;
  const textarea = document.createElement("textarea");
  let copied = false;

  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.setAttribute("data-clipboard-fallback", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "-9999px auto auto -9999px";
  document.body.appendChild(textarea);

  try {
    textarea.select();
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    activeElement?.focus();

    if (activeInput && selectionStart !== null && selectionEnd !== null) {
      activeInput.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  return copied;
}

export async function writeTextToClipboard(
  value: string,
  clipboard: ClipboardWriter | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.clipboard,
) {
  if (clipboard) {
    try {
      await clipboard.writeText(value);
      return true;
    } catch {
      // Older or restricted contexts may still support the legacy copy path.
    }
  }

  return writeTextWithLegacyClipboard(value);
}
