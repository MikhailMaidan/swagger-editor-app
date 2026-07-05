import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

describe("ErrorPage", () => {
  it("renders a friendly error message and home link", () => {
    render(<ErrorPage error={new Error("Broken")} reset={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeVisible();
    expect(screen.getByText(/could not finish this action/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Go Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows an error digest and calls reset", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const error = Object.assign(new Error("Broken"), {
      digest: "abc123",
    });

    render(<ErrorPage error={error} reset={reset} />);

    expect(screen.getByText("Error ID: abc123")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Try Again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
