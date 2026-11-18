import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";

it("keeps routing replay reachable with invalid OpenAPI without changing editor text", async () => {
  render(<SwaggerWorkspace />);
  expect(
    document.querySelector('button[aria-controls="workspace-tool-routing"]'),
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
    document.querySelector('button[aria-controls="workspace-tool-routing"]'),
  ).toBeInTheDocument();
  fireEvent.click(
    document
      .getElementById("workspace-tool-routing")!
      .querySelector("summary")!,
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Replay selected routing traffic",
    }),
  );
  await screen.findByTestId("rt-replay-summary");
  expect(editor.value).toBe("openapi: [");
});
