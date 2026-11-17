import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";

it("keeps response mutation testing available with invalid OpenAPI and preserves editor text", async () => {
  render(<SwaggerWorkspace />);
  expect(
    document.querySelector('button[aria-controls="workspace-tool-mutations"]'),
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
    document.querySelector('button[aria-controls="workspace-tool-mutations"]'),
  ).toBeInTheDocument();
  fireEvent.click(
    document
      .getElementById("workspace-tool-mutations")!
      .querySelector("summary")!,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Load mutation-testing demo" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Test all response assertions" }),
  );
  await screen.findByTestId("mt-score-summary");
  expect(editor.value).toBe("openapi: [");
});
