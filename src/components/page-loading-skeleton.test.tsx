import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageLoadingSkeleton } from "./page-loading-skeleton";

describe("PageLoadingSkeleton", () => {
  it("announces itself as a status region for assistive tech", () => {
    render(<PageLoadingSkeleton />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeVisible();
  });

  it("renders the requested number of placeholder rows", () => {
    const { container } = render(<PageLoadingSkeleton rows={3} />);
    const rows = container.querySelectorAll(".h-14");

    expect(rows).toHaveLength(3);
  });

  it("defaults to 4 rows when none are specified", () => {
    const { container } = render(<PageLoadingSkeleton />);
    const rows = container.querySelectorAll(".h-14");

    expect(rows).toHaveLength(4);
  });

  it("disables the pulse animation under reduced motion", () => {
    render(<PageLoadingSkeleton />);

    expect(screen.getByRole("status")).toHaveClass("motion-reduce:animate-none");
  });
});
