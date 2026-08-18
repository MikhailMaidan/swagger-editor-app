export function isErrorStatus(status: number | string) {
  // Covers both the numeric 0 stored in history records and the literal
  // string "0" the try-it-out execution flow uses as its network-failure
  // sentinel before that value is converted to a number for storage.
  const numericStatus = Number(status);

  return (
    !Number.isFinite(numericStatus) ||
    numericStatus >= 400 ||
    numericStatus === 0
  );
}

export function getStatusColorClasses(status: number | string) {
  return isErrorStatus(status)
    ? "bg-red-100 text-red-700"
    : "bg-emerald-100 text-emerald-700";
}
