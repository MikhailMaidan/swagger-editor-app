export function formatResponseHeaders(headers: Record<string, string>) {
  return Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([header, value]) => `${header}: ${value}`)
    .join("\n");
}
