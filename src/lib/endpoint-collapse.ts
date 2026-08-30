import { getEndpointFavoriteKey } from "./endpoint-favorites";

export const ENDPOINT_COLLAPSE_STORAGE_KEY = "rsswag-collapsed-endpoints-v1";

const MAX_COLLAPSED_ENDPOINTS = 500;
const MAX_ENDPOINT_KEY_LENGTH = 1024;

function sanitizeCollapsedEndpointKeys(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(
          (item) =>
            item.length > 0 &&
            item.length <= MAX_ENDPOINT_KEY_LENGTH &&
            /^[A-Z]+\s+\S/.test(item),
        ),
    ),
  ).slice(-MAX_COLLAPSED_ENDPOINTS);
}

export function readCollapsedEndpointKeys() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedKeys = window.localStorage.getItem(
      ENDPOINT_COLLAPSE_STORAGE_KEY,
    );

    return storedKeys
      ? sanitizeCollapsedEndpointKeys(JSON.parse(storedKeys))
      : [];
  } catch {
    return [];
  }
}

export function saveCollapsedEndpointKeys(keys: string[]) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const sanitizedKeys = sanitizeCollapsedEndpointKeys(keys);

    if (sanitizedKeys.length === 0) {
      window.localStorage.removeItem(ENDPOINT_COLLAPSE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        ENDPOINT_COLLAPSE_STORAGE_KEY,
        JSON.stringify(sanitizedKeys),
      );
    }

    return true;
  } catch {
    return false;
  }
}

export function toggleCollapsedEndpointKey(
  keys: string[],
  method: string,
  path: string,
) {
  const endpointKey = getEndpointFavoriteKey(method, path);
  const sanitizedKeys = sanitizeCollapsedEndpointKeys(keys);

  return sanitizedKeys.includes(endpointKey)
    ? sanitizedKeys.filter((key) => key !== endpointKey)
    : sanitizeCollapsedEndpointKeys([...sanitizedKeys, endpointKey]);
}

export function setEndpointKeysCollapsed(
  keys: string[],
  endpointKeys: string[],
  collapsed: boolean,
) {
  const sanitizedKeys = sanitizeCollapsedEndpointKeys(keys);
  const sanitizedEndpointKeys = sanitizeCollapsedEndpointKeys(endpointKeys);

  if (collapsed) {
    return sanitizeCollapsedEndpointKeys([
      ...sanitizedKeys,
      ...sanitizedEndpointKeys,
    ]);
  }

  const endpointKeySet = new Set(sanitizedEndpointKeys);

  return sanitizedKeys.filter((key) => !endpointKeySet.has(key));
}
