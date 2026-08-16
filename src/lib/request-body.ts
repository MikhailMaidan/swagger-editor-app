export function isJsonMediaType(contentType: string) {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();

  return mediaType === "application/json" || mediaType.endsWith("+json");
}

export function hasInvalidJsonBody(contentType: string, body: string) {
  if (!body.trim() || !isJsonMediaType(contentType)) {
    return false;
  }

  try {
    JSON.parse(body);
    return false;
  } catch {
    return true;
  }
}
