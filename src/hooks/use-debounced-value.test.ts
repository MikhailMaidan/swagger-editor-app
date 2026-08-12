import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("first", 200));

    expect(result.current).toBe("first");
  });

  it("does not update until the delay has fully elapsed", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "first" } },
    );

    rerender({ value: "second" });
    act(() => {
      vi.advanceTimersByTime(199);
    });

    expect(result.current).toBe("first");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe("second");
  });

  it("restarts the timer on every change, only settling on the last value", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    rerender({ value: "c" });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Neither intermediate value should have won: the second rerender reset
    // the timer before the first one's 200ms window ever completed.
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(result.current).toBe("c");
  });
});
