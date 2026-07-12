import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppFooter } from "./app-footer";

describe("AppFooter", () => {
  it("renders footer navigation with an About link", () => {
    render(<AppFooter />);

    expect(screen.getByText("RSSwag OpenAPI workspace")).toBeVisible();
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });
});
