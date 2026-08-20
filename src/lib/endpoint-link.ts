function hashEndpointKey(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function getEndpointAnchor(method: string, path: string) {
  const normalizedMethod = method.trim().toLowerCase() || "unknown";
  const normalizedPath = path.trim() || "/";
  const readablePath = normalizedPath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const hash = hashEndpointKey(
    `${normalizedMethod.toUpperCase()} ${normalizedPath}`,
  );

  return `endpoint-${normalizedMethod}-${readablePath || "root"}-${hash}`;
}

export function getEndpointEditorHref(method: string, path: string) {
  return `/#${getEndpointAnchor(method, path)}`;
}

export function createEndpointPermalink(
  currentUrl: string,
  method: string,
  path: string,
) {
  const url = new URL(currentUrl);

  url.hash = getEndpointAnchor(method, path);

  return url.toString();
}
