import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RequestExecutionModeControl } from "./request-execution-mode-control";

describe("RequestExecutionModeControl", () => {
  it("shows the selected mode and reports changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <RequestExecutionModeControl
        mode="live"
        storageError={false}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Live" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Mock" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Mock" }));
    expect(onChange).toHaveBeenCalledWith("mock");

    rerender(
      <RequestExecutionModeControl
        mode="mock"
        storageError
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Mock" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mode changed for this session but could not be saved.",
    );
  });
});
