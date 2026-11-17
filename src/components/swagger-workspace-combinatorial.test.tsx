import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";

it("keeps the combinatorial studio reachable with valid and invalid OpenAPI without replacing editor text", async () => {
  render(<SwaggerWorkspace />);
  const container = document.getElementById("workspace-tool-combinatorial")!;
  expect(container).toBeInTheDocument();
  expect(
    document.querySelector(
      'button[aria-controls="workspace-tool-combinatorial"]',
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
      'button[aria-controls="workspace-tool-combinatorial"]',
    ),
  ).toBeInTheDocument();
  fireEvent.click(container.querySelector("summary")!);
  const demo = await screen.findByRole("button", {
    name: "Load combinatorial demo",
  });
  fireEvent.click(demo);
  fireEvent.click(
    screen.getByRole("button", { name: "Generate compact suite" }),
  );
  await waitFor(() =>
    expect(screen.getByTestId("ct-coverage-summary")).toHaveTextContent(
      "(100%)",
    ),
  );
  expect(editor.value).toBe("openapi: [");
});
