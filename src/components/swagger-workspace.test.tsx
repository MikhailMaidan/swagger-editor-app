import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("SwaggerWorkspace", () => {
  it("renders the default schema and dynamically populated endpoints", () => {
    render(<SwaggerWorkspace />);

    expect(screen.getByText("Valid")).toBeVisible();
    expect(screen.getByText("YAML")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "RSSwag Demo API" }),
    ).toBeVisible();
    expect(screen.getAllByText("/users/{id}")).toHaveLength(2);
    expect(screen.getAllByText("Path parameters")).toHaveLength(2);
    expect(screen.getAllByText("id")).toHaveLength(2);
    expect(screen.getByText("search")).toBeVisible();
    expect(screen.getByText("X-Trace-Id")).toBeVisible();
    expect(screen.getByText("sessionId")).toBeVisible();
    expect(screen.getByText("200, 404")).toBeVisible();
  });

  it("shows validation errors and disables conversion for invalid schemas", () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: "openapi: 3.0.0" },
    });

    expect(screen.getByText("Invalid")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Schema info.title is required.",
    );
    expect(screen.getByRole("button", { name: /convert/i })).toBeDisabled();
    expect(
      screen.getByText("Add a valid OpenAPI schema to populate the viewer."),
    ).toBeVisible();
  });

  it("converts between YAML and JSON without losing schema data", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    await user.click(screen.getByRole("button", { name: "Convert to JSON" }));

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    expect(editor.value.trim().startsWith("{")).toBe(true);
    expect(editor.value).toContain('"title": "RSSwag Demo API"');
    expect(screen.getByText("JSON")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Convert to YAML" }));

    expect(editor.value).toContain("title: RSSwag Demo API");
    expect(screen.getByText("YAML")).toBeVisible();
  });

  it("updates the viewer when a JSON schema is entered", () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: JSON.stringify({
          info: {
            title: "Pets API",
            version: "2.0.0",
          },
          openapi: "3.0.0",
          paths: {
            "/pets": {
              get: {
                responses: {
                  "200": {
                    description: "OK",
                  },
                },
                summary: "List pets",
              },
            },
          },
        }),
      },
    });

    expect(screen.getByRole("heading", { name: "Pets API" })).toBeVisible();
    expect(screen.getByText("Version 2.0.0")).toBeVisible();
    expect(screen.getByText("/pets")).toBeVisible();
    expect(screen.getByText("List pets")).toBeVisible();
  });
});
