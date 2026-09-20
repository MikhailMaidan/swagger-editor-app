import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("workspace performance lab", () => {
  it("uses visible read endpoints, navigates, and preserves the plan and report across invalid editor changes", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-benchmark")!);
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "API performance lab" }),
    ).toBeInTheDocument();
    await user.click(panel.getByText("API performance lab"));
    await user.click(
      await panel.findByRole("button", {
        name: "Add visible benchmark endpoints",
      }),
    );
    expect(panel.getByText("Benchmark cases: 1/10")).toBeInTheDocument();
    fireEvent.change(panel.getByLabelText("Measured requests"), {
      target: { value: "1" },
    });
    fireEvent.change(panel.getByLabelText("Warm-up requests"), {
      target: { value: "0" },
    });
    await user.click(
      panel.getByRole("button", { name: "View benchmark endpoint" }),
    );
    expect(
      screen.getByRole("searchbox", { name: /Filter endpoints by method/ }),
    ).toHaveValue("/users/{id}");
    await user.click(panel.getByRole("button", { name: "Run Mock benchmark" }));
    await panel.findByRole("region", { name: "Benchmark results" });
    const editor = screen.getByLabelText("OpenAPI schema editor");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          panel.getByRole("button", { name: "Run Mock benchmark" }),
        ).toBeDisabled(),
      { timeout: 5000 },
    );
    expect(
      panel.getByRole("region", { name: "Benchmark results" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "API performance lab" }),
    ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: DEFAULT_OPENAPI_SCHEMA } });
    await waitFor(
      () =>
        expect(
          panel.getByRole("button", { name: "Run Mock benchmark" }),
        ).toBeEnabled(),
      { timeout: 5000 },
    );
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
  });
});
