import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";

it("keeps architecture reliability analysis available with invalid OpenAPI without replacing editor text", async () => {
  render(<SwaggerWorkspace />);
  expect(
    document.querySelector(
      'button[aria-controls="workspace-tool-reliability"]',
    ),
  ).toBeInTheDocument();
  const editor = screen.getByLabelText(
    "OpenAPI schema editor",
  ) as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: "openapi: [" } });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Format schema" }),
    ).toBeDisabled(),
  );
  expect(
    document.querySelector(
      'button[aria-controls="workspace-tool-reliability"]',
    ),
  ).toBeInTheDocument();
  fireEvent.click(
    document
      .getElementById("workspace-tool-reliability")!
      .querySelector("summary")!,
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Analyze selected availability scenario",
    }),
  );
  await screen.findByTestId("rl-scenario-summary");
  expect(editor.value).toBe("openapi: [");
});
