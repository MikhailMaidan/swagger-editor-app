export function isErrorStatus(status: number | string) {
  // Imported history can contain invalid codes. Only whole HTTP status
  // codes can count as successful; this also treats the numeric or string
  // network-failure sentinel 0 as an error.
  const numericStatus = Number(status);

  return (
    !Number.isInteger(numericStatus) ||
    numericStatus < 100 ||
    numericStatus >= 400
  );
}

export function getStatusColorClasses(status: number | string) {
  return isErrorStatus(status)
    ? "bg-red-100 text-red-700"
    : "bg-emerald-100 text-emerald-700";
}
