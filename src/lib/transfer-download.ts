export function downloadTransferBytes(
  bytes: Uint8Array,
  fileName: string,
): boolean {
  if (
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function"
  )
    return false;
  let url = "";
  try {
    url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes).buffer], {
        type: "application/octet-stream",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    return true;
  } catch {
    return false;
  } finally {
    if (url)
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* Cleanup cannot reverse a started download. */
      }
  }
}
