const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isPrivateOrLocalHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv4MappedAddress = normalizedHostname.match(
    /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/,
  )?.[1];
  const ipv4MappedHexAddress = normalizedHostname.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i,
  );

  if (ipv4MappedAddress) {
    return isPrivateOrLocalHostname(ipv4MappedAddress);
  }

  if (ipv4MappedHexAddress) {
    const high = Number.parseInt(ipv4MappedHexAddress[1], 16);
    const low = Number.parseInt(ipv4MappedHexAddress[2], 16);

    return isPrivateOrLocalHostname(
      `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
    );
  }

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname === "::" ||
    normalizedHostname === "::1" ||
    normalizedHostname === "0.0.0.0"
  ) {
    return true;
  }

  if (
    normalizedHostname.includes(":") &&
    (/^fe[89ab][0-9a-f]:/i.test(normalizedHostname) ||
      /^f[cd][0-9a-f]{2}:/i.test(normalizedHostname))
  ) {
    return true;
  }

  const ipv4Match = normalizedHostname.match(IPV4_PATTERN);

  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map(Number);

  if (octets.some((octet) => octet > 255)) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 127 ||
    first === 10 ||
    first === 0 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function isPublicHttpServerUrl(serverUrl: string) {
  try {
    const parsedUrl = new URL(serverUrl);

    return (
      (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
      !isPrivateOrLocalHostname(parsedUrl.hostname)
    );
  } catch {
    return false;
  }
}
