import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadTransferBytes } from "./transfer-download";

describe("binary transfer download availability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns failure when the URL API is unavailable", () => {
    vi.stubGlobal("URL", undefined);

    expect(downloadTransferBytes(new Uint8Array([0, 255]), "payload.bin")).toBe(
      false,
    );
  });

  it("returns failure when checking object URL support throws", () => {
    vi.stubGlobal("URL", {
      get createObjectURL() {
        throw new DOMException("Download access blocked", "SecurityError");
      },
    });

    expect(downloadTransferBytes(new Uint8Array([0, 255]), "payload.bin")).toBe(
      false,
    );
  });
});
