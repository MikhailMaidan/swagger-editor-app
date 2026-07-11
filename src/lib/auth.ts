export const AUTH_TOKEN_COOKIE = "rsswagger-token";
export const AUTH_USER_COOKIE = "rsswagger-user";
export const AUTH_CHANGE_EVENT = "rsswagger-auth-change";

export type AuthTokenPayload = {
  sub?: string;
  email?: string;
  name?: string;
  iat?: number;
  exp?: number;
};

const DEFAULT_TOKEN_LIFETIME = 60 * 60 * 24 * 7;

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binaryValue = "";

  bytes.forEach((byte) => {
    binaryValue += String.fromCharCode(byte);
  });

  return btoa(binaryValue)
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function decodeBase64Url(value: string) {
  const normalizedValue = value.replaceAll("-", "+").replaceAll("_", "/");
  const paddingLength = (4 - (normalizedValue.length % 4)) % 4;
  const paddedValue = normalizedValue + "=".repeat(paddingLength);
  const binaryValue = atob(paddedValue);
  const bytes = Uint8Array.from(binaryValue, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function getDisplayName(email: string) {
  const localPart = email.split("@")[0] || "user";
  const words = localPart.split(/[._-]+/).filter(Boolean);

  if (words.length === 0) {
    return "User";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getTokenPayload(
  token?: string | null,
): AuthTokenPayload | null {
  if (!token) {
    return null;
  }

  const tokenParts = token.split(".");

  if (tokenParts.length !== 3) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(tokenParts[1])) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function isTokenValid(token?: string | null) {
  const tokenParts = token?.split(".");

  if (!tokenParts || tokenParts.length !== 3 || tokenParts[2] !== "demo") {
    return false;
  }

  const payload = getTokenPayload(token);

  if (
    !payload ||
    typeof payload.exp !== "number" ||
    (typeof payload.sub !== "string" && typeof payload.email !== "string")
  ) {
    return false;
  }

  return payload.exp * 1000 > Date.now();
}

export function getUserNameFromToken(token?: string | null) {
  const payload = getTokenPayload(token);

  if (payload?.name) {
    return payload.name;
  }

  if (payload?.email) {
    return getDisplayName(payload.email);
  }

  return "User";
}

export function createDemoToken(
  email: string,
  lifetimeInSeconds = DEFAULT_TOKEN_LIFETIME,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    sub: email,
    email,
    name: getDisplayName(email),
    iat: issuedAt,
    exp: issuedAt + lifetimeInSeconds,
  };

  const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));

  return `${header}.${body}.demo`;
}
