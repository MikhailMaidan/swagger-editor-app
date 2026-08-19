export type ClipboardWriter = {
  writeText(value: string): Promise<void>;
};

export async function writeTextToClipboard(
  value: string,
  clipboard: ClipboardWriter | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.clipboard,
) {
  if (!clipboard) {
    return false;
  }

  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
