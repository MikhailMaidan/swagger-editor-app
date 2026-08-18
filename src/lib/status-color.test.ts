import { describe, expect, it } from "vitest";
import { getStatusColorClasses, isErrorStatus } from "./status-color";

describe("getStatusColorClasses", () => {
  it("marks successful and redirect statuses green", () => {
    expect(getStatusColorClasses(200)).toBe("bg-emerald-100 text-emerald-700");
    expect(getStatusColorClasses("201")).toBe(
      "bg-emerald-100 text-emerald-700",
    );
    expect(getStatusColorClasses(304)).toBe("bg-emerald-100 text-emerald-700");
  });

  it("marks client and server error statuses red", () => {
    expect(getStatusColorClasses(404)).toBe("bg-red-100 text-red-700");
    expect(getStatusColorClasses("500")).toBe("bg-red-100 text-red-700");
  });

  it("marks the network-failure sentinel status red", () => {
    expect(getStatusColorClasses("0")).toBe("bg-red-100 text-red-700");
    expect(getStatusColorClasses(0)).toBe("bg-red-100 text-red-700");
  });

  it("treats invalid status values as errors", () => {
    expect(isErrorStatus("unknown")).toBe(true);
    expect(getStatusColorClasses("unknown")).toBe("bg-red-100 text-red-700");
  });
});
