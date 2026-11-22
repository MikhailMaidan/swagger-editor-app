import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuid } from "./random-id";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("randomUuid", () => {
  it("uses crypto.randomUUID when it is available", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "11111111-2222-4333-8444-555555555555",
    );

    expect(randomUuid()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("builds a valid v4 UUID from getRandomValues outside secure contexts", () => {
    // Insecure (plain-HTTP LAN) contexts expose getRandomValues but not
    // randomUUID, so calling randomUUID directly would throw a TypeError.
    const getRandomValues = vi.fn(<T extends ArrayBufferView>(array: T) => {
      new Uint8Array(array.buffer).fill(0xff);
      return array;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    const uuid = randomUuid();

    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(uuid).toMatch(UUID_V4);
    expect(uuid).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("still returns a valid v4 UUID when Web Crypto is missing entirely", () => {
    vi.stubGlobal("crypto", undefined);

    const ids = new Set(Array.from({ length: 50 }, () => randomUuid()));

    expect(ids.size).toBe(50);
    ids.forEach((id) => expect(id).toMatch(UUID_V4));
  });

  it("falls back when randomUUID itself throws", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => array.fill(0),
      randomUUID: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    });

    expect(randomUuid()).toBe("00000000-0000-4000-8000-000000000000");
  });
});
