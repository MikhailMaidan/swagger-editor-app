import { describe, expect, it } from "vitest";
import { isPrivateOrLocalHostname, isPublicHttpServerUrl } from "./server-url";

describe("server URL validation", () => {
  it("accepts public HTTP and HTTPS server URLs", () => {
    expect(isPublicHttpServerUrl("https://staging.example.com/v2")).toBe(true);
    expect(isPublicHttpServerUrl("http://api.example.org")).toBe(true);
  });

  it("rejects unsupported, relative, local, and private server URLs", () => {
    for (const serverUrl of [
      "/api",
      "ftp://example.com",
      "http://localhost:8080",
      "http://127.0.0.1",
      "http://10.0.0.5",
      "http://172.16.0.1",
      "http://192.168.1.1",
      "http://[::1]",
      "http://[fd00::1]",
    ]) {
      expect(isPublicHttpServerUrl(serverUrl)).toBe(false);
    }
  });

  it("does not mistake public domain names for private IPv6 addresses", () => {
    expect(isPrivateOrLocalHostname("fca.example.com")).toBe(false);
    expect(isPrivateOrLocalHostname("fdnews.example.com")).toBe(false);
    expect(isPublicHttpServerUrl("https://fca.example.com")).toBe(true);
  });
});
