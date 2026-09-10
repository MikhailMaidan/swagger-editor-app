import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { getEndpointAnchor } from "@/lib/endpoint-link";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("workspace HAR inspection", () => {
  it("matches against the current document, follows visible endpoint scope, and navigates without modifying the schema", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(
      screen.getByRole("region", { name: "HAR traffic inspector" }),
    );
    await user.click(panel.getByText("Paste HAR JSON"));
    fireEvent.change(panel.getByLabelText("HAR JSON"), {
      target: {
        value: JSON.stringify({
          log: {
            entries: [
              {
                request: {
                  method: "GET",
                  url: "https://capture.test/users/42",
                },
                response: { status: 200 },
                time: 25,
              },
            ],
          },
        }),
      },
    });
    await user.click(panel.getByRole("button", { name: "Inspect pasted HAR" }));
    expect(panel.getByText(/1 requests · 1 matched/)).toBeInTheDocument();
    const search = screen.getByRole("searchbox", {
      name: /Filter endpoints by method/,
    });
    fireEvent.change(search, { target: { value: "not-in-this-api" } });
    await user.selectOptions(
      panel.getByLabelText("Match against endpoints"),
      "visible",
    );
    expect(panel.getByText(/1 requests · 0 matched/)).toBeInTheDocument();
    await user.selectOptions(
      panel.getByLabelText("Match against endpoints"),
      "all",
    );
    await user.click(
      panel.getByText("Operation traffic coverage", { selector: "summary" }),
    );
    await user.click(panel.getByRole("button", { name: "GET /users/{id}" }));
    expect(search).toHaveValue("/users/{id}");
    expect(window.location.hash).toBe(
      `#${getEndpointAnchor("GET", "/users/{id}")}`,
    );
    expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
      DEFAULT_OPENAPI_SCHEMA,
    );
    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: "openapi: [" },
    });
    await waitFor(
      () =>
        expect(panel.getByText(/1 requests · 0 matched/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(
      panel.getByRole("table", { name: "Captured traffic" }),
    ).toHaveTextContent("GET /users/42");
    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: DEFAULT_OPENAPI_SCHEMA },
    });
    await waitFor(
      () =>
        expect(panel.getByText(/1 requests · 1 matched/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });
});
