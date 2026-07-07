import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { REQUEST_HISTORY_STORAGE_KEY } from "@/lib/request-history";
import { SAVED_SCHEMA_STORAGE_KEY } from "@/lib/schema-storage";
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
    expect(screen.getByText("200 - Successful response")).toBeVisible();
    expect(screen.getByText("404 - User not found")).toBeVisible();
    expect(screen.getAllByText("Content: application/json")).toHaveLength(2);
    expect(screen.getAllByText("Properties: id, name")).toHaveLength(2);
    expect(screen.getByText("Properties: name")).toBeVisible();
    expect(screen.getByLabelText("cURL GET /users/{id}")).toHaveTextContent(
      "curl -X GET",
    );
    expect(screen.getByLabelText("cURL POST /users/{id}")).toHaveTextContent(
      "-d '{...}'",
    );
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

  it("copies generated cURL commands", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    render(<SwaggerWorkspace />);

    await user.click(screen.getAllByRole("button", { name: "Copy cURL" })[0]);

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("curl -X GET"),
    );
    expect(screen.getByRole("status")).toHaveTextContent("cURL copied.");
  });

  it("shows filled parameter values in the mock request preview", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.type(
      screen.getByLabelText("Header parameter X-Trace-Id"),
      "trace-1",
    );
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[0]);

    expect(screen.getByRole("status")).toHaveTextContent("Request preview");
    expect(screen.getByRole("status")).toHaveTextContent("Path: id: 42");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Header: X-Trace-Id: trace-1",
    );
  });

  it("shows edited request body values in the mock request preview", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("Editable request body"), {
      target: {
        value: JSON.stringify({ name: "Mikhail" }, null, 2),
      },
    });
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[1]);

    expect(screen.getByRole("status")).toHaveTextContent("Request preview");
    expect(screen.getByRole("status")).toHaveTextContent("Mikhail");
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

  it("disables schema saving for guests", () => {
    render(<SwaggerWorkspace />);

    expect(
      screen.getByText("Sign in to save and restore schemas."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save schema" })).toBeDisabled();
  });

  it("saves a valid schema for authenticated users", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    render(<SwaggerWorkspace />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save schema" }),
      ).not.toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: "Save schema" }));

    expect(screen.getByRole("status")).toHaveTextContent("Schema saved.");
    expect(window.localStorage.getItem(SAVED_SCHEMA_STORAGE_KEY)).toContain(
      "RSSwag Demo API",
    );
  });

  it("restores a saved schema for authenticated users", async () => {
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );
    window.localStorage.setItem(
      SAVED_SCHEMA_STORAGE_KEY,
      `openapi: 3.0.0
info:
  title: Saved API
  version: 9.0.0
paths:
  /saved:
    get:
      summary: Saved endpoint
      responses:
        '200':
          description: OK`,
    );

    render(<SwaggerWorkspace />);

    expect(
      await screen.findByRole("heading", { name: "Saved API" }),
    ).toBeVisible();
    expect(screen.getByText("/saved")).toBeVisible();
  });

  it("executes a mock response and saves history for authenticated users", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    render(<SwaggerWorkspace />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save schema" }),
      ).not.toBeDisabled();
    });

    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[0]);

    expect(screen.getByRole("status")).toHaveTextContent("Response");
    expect(screen.getByRole("status")).toHaveTextContent("200");
    expect(screen.getByRole("status")).toHaveTextContent("Alex Smith");
    expect(screen.getByRole("status")).toHaveTextContent("Saved to history");
    expect(window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)).toContain(
      "Get user by id",
    );
  });

  it("shows guest mock execution without saving history", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[0]);

    expect(screen.getByRole("status")).toHaveTextContent("Guest run");
    expect(window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)).toBeNull();
  });
});
