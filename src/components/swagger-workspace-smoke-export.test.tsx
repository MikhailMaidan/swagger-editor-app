import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";

it("keeps smoke-test export aligned with workspace filtering while retaining existing exporters", async () => {
  const user = userEvent.setup();
  render(<SwaggerWorkspace />);
  const panel = within(
    screen.getByRole("region", { name: "CI smoke-test exporter" }),
  );
  expect(
    panel.getByText("1 smoke tests · 1 excluded operations"),
  ).toBeVisible();
  fireEvent.change(
    screen.getByRole("searchbox", { name: /Filter endpoints by method/ }),
    {
      target: { value: "no-such-endpoint" },
    },
  );
  await waitFor(() =>
    expect(
      panel.getByRole("button", { name: "Download smoke-test runner" }),
    ).toBeDisabled(),
  );
  await user.selectOptions(panel.getByLabelText("Smoke-test scope"), "all");
  expect(
    panel.getByRole("button", { name: "Download smoke-test runner" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("heading", { name: "Node mock server" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "API slice exporter" }),
  ).toBeVisible();
});
