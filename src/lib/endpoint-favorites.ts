export const ENDPOINT_FAVORITES_STORAGE_KEY = "rsswag-endpoint-favorites-v1";

const MAX_FAVORITE_ENDPOINTS = 500;
const MAX_FAVORITE_KEY_LENGTH = 1024;

export function getEndpointFavoriteKey(method: string, path: string) {
  return `${method.trim().toUpperCase()} ${path.trim()}`.trim();
}

function sanitizeEndpointFavorites(value: unknown) {
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
            item.length <= MAX_FAVORITE_KEY_LENGTH &&
            /^[A-Z]+\s+\S/.test(item),
        ),
    ),
  ).slice(-MAX_FAVORITE_ENDPOINTS);
}

export function readEndpointFavorites() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedFavorites = window.localStorage.getItem(
      ENDPOINT_FAVORITES_STORAGE_KEY,
    );

    return storedFavorites
      ? sanitizeEndpointFavorites(JSON.parse(storedFavorites))
      : [];
  } catch {
    return [];
  }
}

export function saveEndpointFavorites(favorites: string[]) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const sanitizedFavorites = sanitizeEndpointFavorites(favorites);

    if (sanitizedFavorites.length === 0) {
      window.localStorage.removeItem(ENDPOINT_FAVORITES_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        ENDPOINT_FAVORITES_STORAGE_KEY,
        JSON.stringify(sanitizedFavorites),
      );
    }

    return true;
  } catch {
    return false;
  }
}

export function isEndpointFavorite(
  favorites: string[],
  method: string,
  path: string,
) {
  return favorites.includes(getEndpointFavoriteKey(method, path));
}

export function toggleEndpointFavorite(
  favorites: string[],
  method: string,
  path: string,
) {
  const key = getEndpointFavoriteKey(method, path);
  const sanitizedFavorites = sanitizeEndpointFavorites(favorites);

  if (sanitizedFavorites.includes(key)) {
    return sanitizedFavorites.filter((favorite) => favorite !== key);
  }

  return sanitizeEndpointFavorites([...sanitizedFavorites, key]);
}
