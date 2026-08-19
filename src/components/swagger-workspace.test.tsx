import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AUTH_TOKEN_COOKIE, createDemoToken } from "@/lib/auth";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { REQUEST_HISTORY_STORAGE_KEY } from "@/lib/request-history";
import { SCHEMA_DRAFT_STORAGE_KEY } from "@/lib/schema-draft";
import {
  SAVED_SCHEMA_STORAGE_KEY,
  SCHEMA_EDITOR_HANDOFF_STORAGE_KEY,
  stageSavedSchemaForEditor,
} from "@/lib/schema-storage";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("SwaggerWorkspace", () => {
  it("expands the schema editor instead of showing a vertical scrollbar", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "scrollHeight",
    );

    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 780,
    });

    try {
      render(<SwaggerWorkspace />);

      const editor = screen.getByLabelText("OpenAPI schema editor");

      expect(editor).toHaveStyle({ height: "780px" });
      expect(editor).toHaveAttribute("wrap", "off");
      expect(editor).toHaveAttribute("spellcheck", "false");
      expect(editor.className).toContain("block");
      expect(editor.className).toContain("overflow-y-hidden");
      expect(screen.getByText("Line 1, column 1")).toBeVisible();

      const titleOffset =
        (editor as HTMLTextAreaElement).value.indexOf("title") + 2;
      (editor as HTMLTextAreaElement).setSelectionRange(
        titleOffset,
        titleOffset,
      );
      fireEvent.select(editor);

      expect(screen.getByText("Line 3, column 5")).toBeVisible();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(
          HTMLTextAreaElement.prototype,
          "scrollHeight",
          originalDescriptor,
        );
      } else {
        delete (HTMLTextAreaElement.prototype as { scrollHeight?: number })
          .scrollHeight;
      }
    }
  });

  it("supports Tab and Shift+Tab indentation in the schema editor", () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    editor.setSelectionRange(0, 0);
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(editor.value).toBe(`  ${DEFAULT_OPENAPI_SCHEMA}`);
    expect(editor.selectionStart).toBe(2);
    expect(editor.selectionEnd).toBe(2);
    expect(screen.getByText("Line 1, column 3")).toBeVisible();

    fireEvent.keyDown(editor, { key: "Tab", shiftKey: true });

    expect(editor.value).toBe(DEFAULT_OPENAPI_SCHEMA);
    expect(editor.selectionStart).toBe(0);
    expect(editor.selectionEnd).toBe(0);
    expect(screen.getByText("Line 1, column 1")).toBeVisible();
  });

  it("updates schema line and UTF-8 byte statistics", () => {
    render(<SwaggerWorkspace />);

    const schemaText = "openapi: 3.0.0\r\ninfo: {title: Café}";
    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    fireEvent.change(editor, {
      target: { value: schemaText },
    });

    expect(
      screen.getByLabelText("Schema document statistics"),
    ).toHaveTextContent(
      `Lines 2, ${new TextEncoder().encode(editor.value).length} B`,
    );
  });

  it("renders the default schema and dynamically populated endpoints", () => {
    render(<SwaggerWorkspace />);

    expect(screen.getByText("Valid")).toBeVisible();
    expect(screen.getByText("YAML")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "RSSwag Demo API" }),
    ).toBeVisible();
    expect(document.getElementById("api-viewer")).toBeVisible();
    const stats = screen.getByLabelText("Endpoint statistics");

    expect(stats).toHaveTextContent("Endpoints2");
    expect(stats).toHaveTextContent("Methods2");
    expect(stats).toHaveTextContent("With bodies1");
    expect(stats).toHaveTextContent("Deprecated0");
    expect(stats).toHaveTextContent("Secured0");
    expect(screen.getAllByText("/users/{id}")).toHaveLength(2);
    expect(screen.getAllByText("Path parameters")).toHaveLength(2);
    expect(screen.getAllByText("id (Required)")).toHaveLength(2);
    expect(screen.getByText("search")).toBeVisible();
    expect(screen.getByText("X-Trace-Id")).toBeVisible();
    expect(screen.getByText("sessionId")).toBeVisible();
    expect(
      screen.getByText("200 - Successful response", { selector: "p" }),
    ).toBeVisible();
    expect(
      screen.getByText("404 - User not found", { selector: "p" }),
    ).toBeVisible();
    expect(screen.getAllByText("Content: application/json")).toHaveLength(2);
    expect(screen.getAllByText("Properties: id, name")).toHaveLength(2);
    expect(screen.getByText("Properties: name")).toBeVisible();
    expect(screen.getByLabelText("cURL GET /users/{id}")).toHaveTextContent(
      "curl -X GET",
    );
    expect(screen.getByLabelText("cURL POST /users/{id}")).toHaveTextContent(
      "Alex Smith",
    );
  });

  it("resolves server variables for the viewer and generated cURL", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Variable Server API
  version: 1.0.0
servers:
  - url: https://{environment}.example.com/{version}
    variables:
      environment:
        default: api
      version:
        default: v2
  - url: https://staging.example.com/v2
paths:
  /users:
    get:
      responses:
        '200':
          description: OK`,
      },
    });

    expect(await screen.findByText("https://api.example.com/v2")).toBeVisible();
    expect(screen.getByLabelText("cURL GET /users")).toHaveTextContent(
      "https://api.example.com/v2/users",
    );

    await user.selectOptions(
      screen.getByLabelText("Select API server"),
      "https://staging.example.com/v2",
    );

    expect(screen.getByLabelText("cURL GET /users")).toHaveTextContent(
      "https://staging.example.com/v2/users",
    );

    await user.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "https://staging.example.com/v2/users",
    );
  });

  it("filters the endpoint list by method, path, summary, and method tab", () => {
    render(<SwaggerWorkspace />);

    const filterInput = screen.getByLabelText(
      "Filter endpoints by method, path, summary, operation ID, tag, parameter, or auth",
    );
    const methodFilters = screen.getByRole("group", {
      name: "Filter endpoints by HTTP method",
    });

    expect(screen.getByText("Showing 2 of 2 endpoints")).toBeVisible();

    fireEvent.change(filterInput, { target: { value: "update" } });

    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("cURL GET /users/{id}"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No endpoints match your search."),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(methodFilters).getByRole("button", { name: "GET (1)" }),
    );

    expect(screen.getByText("No endpoints match your search.")).toBeVisible();

    expect(screen.getByText("Showing 0 of 2 endpoints")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(filterInput).toHaveValue("");
    expect(
      within(methodFilters).getByRole("button", { name: "All methods" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Showing 2 of 2 endpoints")).toBeVisible();
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();

    fireEvent.change(filterInput, { target: { value: "does-not-exist" } });

    expect(screen.getByText("No endpoints match your search.")).toBeVisible();
    expect(
      screen.queryByLabelText("cURL POST /users/{id}"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
  });

  it("sorts visible endpoints without changing the default schema order", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Sorted API
  version: 1.0.0
paths:
  /zeta:
    delete:
      responses: {}
  /alpha:
    post:
      responses: {}
  /beta:
    get:
      responses: {}`,
      },
    });

    const endpointOrder = () =>
      screen
        .getAllByLabelText(/^cURL /)
        .map((preview) => preview.getAttribute("aria-label"));

    await waitFor(() =>
      expect(endpointOrder()).toEqual([
        "cURL DELETE /zeta",
        "cURL POST /alpha",
        "cURL GET /beta",
      ]),
    );

    const sort = screen.getByLabelText("Sort endpoints");

    await user.selectOptions(sort, "path");
    expect(endpointOrder()).toEqual([
      "cURL POST /alpha",
      "cURL GET /beta",
      "cURL DELETE /zeta",
    ]);

    await user.selectOptions(sort, "method");
    expect(endpointOrder()).toEqual([
      "cURL GET /beta",
      "cURL POST /alpha",
      "cURL DELETE /zeta",
    ]);

    await user.selectOptions(sort, "schema");
    expect(endpointOrder()).toEqual([
      "cURL DELETE /zeta",
      "cURL POST /alpha",
      "cURL GET /beta",
    ]);
  });

  it("shows endpoint tags, security badges, deprecated badges, and metadata stats", async () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Reports API
  version: 1.0.0
security:
  - bearerAuth: []
paths:
  /reports:
    get:
      summary: List reports
      operationId: listReports
      deprecated: true
      tags:
        - reports
        - admin
      responses:
        '200':
          description: OK
  /status:
    get:
      summary: Health check
      operationId: getStatus
      security: []
      responses:
        '200':
          description: OK`,
      },
    });

    expect(await screen.findByText("reports")).toBeVisible();
    expect(screen.getByText("admin")).toBeVisible();
    expect(screen.getByText("Operation ID: listReports")).toBeVisible();
    expect(screen.getAllByText("Deprecated")).toHaveLength(2);
    expect(screen.getByText("Auth: bearerAuth")).toBeVisible();

    const stats = screen.getByLabelText("Endpoint statistics");

    expect(stats).toHaveTextContent("Endpoints2");
    expect(stats).toHaveTextContent("Deprecated1");
    expect(stats).toHaveTextContent("Secured1");

    const tagFilters = screen.getByRole("group", {
      name: "Filter endpoints by tag",
    });

    fireEvent.click(
      within(tagFilters).getByRole("button", { name: "admin (1)" }),
    );

    expect(screen.getByLabelText("cURL GET /reports")).toBeInTheDocument();
    expect(screen.queryByLabelText("cURL GET /status")).not.toBeInTheDocument();

    fireEvent.click(
      within(tagFilters).getByRole("button", { name: "All tags" }),
    );

    expect(screen.getByLabelText("cURL GET /status")).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText(
        "Filter endpoints by method, path, summary, operation ID, tag, parameter, or auth",
      ),
      { target: { value: "listReports" } },
    );

    expect(screen.getByLabelText("cURL GET /reports")).toBeInTheDocument();
    expect(screen.queryByLabelText("cURL GET /status")).not.toBeInTheDocument();
  });

  it("prefills try-it-out parameter inputs from schema examples and defaults", async () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Example Params API
  version: 1.0.0
paths:
  /users/{id}:
    get:
      summary: Get user
      parameters:
        - name: id
          in: path
          description: Unique user identifier
          schema:
            type: integer
            example: 42
        - name: search
          in: query
          example: Alex
          schema:
            type: string
        - name: X-Trace-Id
          in: header
          required: true
          schema:
            type: string
            default: trace-1
      responses:
        '200':
          description: OK`,
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Path parameter id")).toHaveValue("42"),
    );
    expect(screen.getByLabelText("Query parameter search")).toHaveValue("Alex");
    expect(screen.getByLabelText("Header parameter X-Trace-Id")).toHaveValue(
      "trace-1",
    );
    expect(screen.getAllByText("Required")).toHaveLength(2);
    expect(screen.getByText("id (Required)")).toBeVisible();
    expect(screen.getByText("X-Trace-Id (Required)")).toBeVisible();
    expect(screen.getByText("Unique user identifier")).toBeVisible();
    const curlPreview = screen.getByLabelText("cURL GET /users/{id}");

    expect(curlPreview).toHaveTextContent("curl -X GET");
    expect(curlPreview.textContent).toContain(
      '"https://api.example.com/users/42?search=Alex"',
    );
    expect(curlPreview.textContent).toContain('-H "X-Trace-Id: trace-1"');

    fireEvent.change(screen.getByLabelText("Header parameter X-Trace-Id"), {
      target: { value: " " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(screen.getByText("X-Trace-Id is required.")).toBeVisible();
    expect(
      screen.getByLabelText("Header parameter X-Trace-Id"),
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Try It Out" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Header parameter X-Trace-Id"), {
      target: { value: "trace-2" },
    });

    expect(
      screen.queryByText("X-Trace-Id is required."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try It Out" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Reset values" }));
    expect(screen.getByLabelText("Header parameter X-Trace-Id")).toHaveValue(
      "trace-1",
    );

    fireEvent.change(
      screen.getByLabelText(
        "Filter endpoints by method, path, summary, operation ID, tag, parameter, or auth",
      ),
      { target: { value: "unique user" } },
    );

    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
  });

  it("uses named media type examples in the viewer and Try It Out", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Named Examples API
  version: 1.0.0
paths:
  /users:
    post:
      summary: Create user
      requestBody:
        content:
          application/json:
            schema:
              type: object
            examples:
              createUser:
                value:
                  name: Ada
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                type: object
              examples:
                createdUser:
                  value:
                    id: 7
                    name: Ada`,
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "name": "Ada"\n}',
      ),
    );
    expect(screen.getByLabelText("Example: createUser")).toHaveTextContent(
      '"name": "Ada"',
    );
    expect(screen.getByLabelText("Example: createdUser")).toHaveTextContent(
      '"id": 7',
    );
    expect(screen.getByLabelText("cURL POST /users")).toHaveTextContent(
      '"name": "Ada"',
    );

    await user.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(await screen.findByLabelText("Response body")).toHaveTextContent(
      '"id": 7',
    );
  });

  it("switches request body content types in cURL and Try It Out", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Use the local fallback"));

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: {
          value: `openapi: 3.0.0
info:
  title: Documents API
  version: 1.0.0
paths:
  /documents:
    post:
      requestBody:
        description: Document payload
        required: true
        content:
          application/json:
            schema:
              type: object
            example:
              title: Guide
          application/xml:
            schema:
              type: string
            example: <document><title>Guide</title></document>
      responses:
        '201':
          description: Created`,
        },
      });

      const contentTypeSelect = await screen.findByLabelText(
        "Request content type",
      );

      expect(contentTypeSelect).toHaveValue("application/json");
      expect(screen.getByText("Document payload")).toBeVisible();
      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "title": "Guide"\n}',
      );

      fireEvent.change(screen.getByLabelText("Editable request body"), {
        target: { value: '{"title":' },
      });

      expect(
        screen.getByText("Enter valid JSON before executing."),
      ).toBeVisible();
      expect(screen.getByLabelText("Editable request body")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByRole("button", { name: "Try It Out" })).toBeDisabled();
      expect(fetchMock).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Editable request body"), {
        target: { value: '{"title":"Custom JSON"}' },
      });

      expect(
        screen.queryByText("Enter valid JSON before executing."),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try It Out" })).toBeEnabled();

      await user.click(screen.getByRole("button", { name: "Format JSON" }));

      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "title": "Custom JSON"\n}',
      );

      await user.selectOptions(contentTypeSelect, "application/xml");

      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        "<document><title>Guide</title></document>",
      );
      expect(
        screen.queryByRole("button", { name: "Format JSON" }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("cURL POST /documents")).toHaveTextContent(
        "Content-Type: application/xml",
      );

      await user.click(screen.getByRole("button", { name: "Try It Out" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
      const payload = JSON.parse(String(requestInit.body));

      expect(payload).toMatchObject({
        contentType: "application/xml",
        requestBody: "<document><title>Guide</title></document>",
      });

      await user.selectOptions(contentTypeSelect, "application/json");

      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "title": "Custom JSON"\n}',
      );

      await user.selectOptions(contentTypeSelect, "application/xml");

      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        "<document><title>Guide</title></document>",
      );

      await user.clear(screen.getByLabelText("Editable request body"));

      expect(screen.getByLabelText("Editable request body")).toBeRequired();
      expect(screen.getByLabelText("Editable request body")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByText("Request body is required.")).toBeVisible();
      expect(screen.getByRole("button", { name: "Try It Out" })).toBeDisabled();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "Reset values" }));

      expect(contentTypeSelect).toHaveValue("application/json");
      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "title": "Guide"\n}',
      );
      expect(
        screen.queryByText("Request body is required."),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try It Out" })).toBeEnabled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("previews selected response statuses and prefers successful responses", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: Response Preview API
  version: 1.0.0
paths:
  /items:
    post:
      responses:
        '400':
          description: Invalid item
          content:
            application/json:
              example:
                error: Invalid item
        '201':
          description: Created
          content:
            application/json:
              example:
                id: 42`,
      },
    });

    await screen.findByLabelText("cURL POST /items");
    const responseStatus = screen.getByLabelText("Mock response status");

    expect(responseStatus).toHaveValue("201");

    await user.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(await screen.findByLabelText("Response body")).toHaveTextContent(
      '"id": 42',
    );

    await user.selectOptions(responseStatus, "400");

    expect(screen.queryByLabelText("Response body")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try It Out" }));

    expect(await screen.findByLabelText("Response body")).toHaveTextContent(
      '"error": "Invalid item"',
    );
    expect(screen.getByRole("status")).toHaveTextContent("400");

    await user.click(screen.getByRole("button", { name: "Reset values" }));

    expect(responseStatus).toHaveValue("201");
    expect(screen.queryByLabelText("Response body")).not.toBeInTheDocument();
  });

  it("shows validation errors and disables conversion for invalid schemas", async () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: "openapi: 3.0.0" },
    });

    await waitFor(() => expect(screen.getByText("Invalid")).toBeVisible());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Schema info.title is required.",
    );
    expect(
      screen.getByRole("button", { name: "Format schema" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /convert/i })).toBeDisabled();
    expect(
      screen.getByText("Add a valid OpenAPI schema to populate the viewer."),
    ).toBeVisible();
  });

  it("shows parser locations and moves the editor caret to an error", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: "openapi: [" } });

    expect(await screen.findByText("Error at line 1, column 11")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Go to error" }));

    expect(editor).toHaveFocus();
    expect(editor.selectionStart).toBe(10);
    expect(editor.selectionEnd).toBe(10);
    expect(screen.getByText("Line 1, column 11")).toBeVisible();
  });

  it("converts between YAML and JSON without losing schema data", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const latestSchema = DEFAULT_OPENAPI_SCHEMA.replace(
      "RSSwag Demo API",
      "Recently Edited API",
    );

    fireEvent.change(editor, { target: { value: latestSchema } });
    fireEvent.click(screen.getByRole("button", { name: "Convert to JSON" }));

    expect(editor.value.trim().startsWith("{")).toBe(true);
    expect(editor.value).toContain('"title": "Recently Edited API"');
    expect(editor.value).not.toContain('"title": "RSSwag Demo API"');
    await waitFor(() => expect(screen.getByText("JSON")).toBeVisible());

    await user.click(
      await screen.findByRole("button", { name: "Convert to YAML" }),
    );

    expect(editor.value).toContain("title: Recently Edited API");
    await waitFor(() => expect(screen.getByText("YAML")).toBeVisible());
  });

  it("formats the current schema without changing its format", () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText(
      "OpenAPI schema editor",
    ) as HTMLTextAreaElement;
    const compactSchema =
      '{"openapi":"3.0.0","info":{"title":"Compact API","version":"1.0.0"},"paths":{}}';

    fireEvent.change(editor, { target: { value: compactSchema } });
    fireEvent.click(screen.getByRole("button", { name: "Format schema" }));

    expect(editor.value).toBe(
      JSON.stringify(JSON.parse(compactSchema), null, 2),
    );
    expect(editor.value.trim().startsWith("{")).toBe(true);
    expect(editor.selectionStart).toBe(0);
    expect(editor.selectionEnd).toBe(0);
    expect(screen.getByText("Line 1, column 1")).toBeVisible();
  });

  it("imports a schema from a local file", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    const file = new File(
      [
        `openapi: 3.0.0
info:
  title: Imported API
  version: 3.0.0
paths:
  /imported:
    get:
      summary: Imported endpoint
      responses:
        '200':
          description: OK`,
      ],
      "schema.yaml",
      { type: "application/yaml" },
    );

    await user.upload(
      screen.getByLabelText("Import OpenAPI schema file"),
      file,
    );

    expect(
      await screen.findByRole("heading", { name: "Imported API" }),
    ).toBeVisible();
    expect(screen.getByText("/imported")).toBeVisible();
  });

  it("imports a schema file dropped onto the editor", async () => {
    render(<SwaggerWorkspace />);

    const editor = screen.getByLabelText("OpenAPI schema editor");
    const file = new File(
      [
        `openapi: 3.0.0
info:
  title: Dropped API
  version: 1.0.0
paths: {}`,
      ],
      "dropped.yaml",
      { type: "application/yaml" },
    );
    const dataTransfer = { files: [file], types: ["Files"] };

    fireEvent.dragEnter(editor, { dataTransfer });
    expect(editor.className).toContain("ring-2");

    fireEvent.drop(editor, { dataTransfer });

    expect(editor.className).not.toContain("ring-2");
    expect(
      await screen.findByRole("heading", { name: "Dropped API" }),
    ).toBeVisible();
    expect((editor as HTMLTextAreaElement).value).toContain(
      "title: Dropped API",
    );
  });

  it("shows an error instead of silently failing when the imported file can't be read", async () => {
    const user = userEvent.setup();
    const readAsTextSpy = vi
      .spyOn(FileReader.prototype, "readAsText")
      .mockImplementation(function (this: FileReader) {
        this.onerror?.(
          new ProgressEvent("error") as unknown as ProgressEvent<FileReader>,
        );
      });

    render(<SwaggerWorkspace />);

    const file = new File(["openapi: 3.0.0"], "schema.yaml", {
      type: "application/yaml",
    });

    await user.upload(
      screen.getByLabelText("Import OpenAPI schema file"),
      file,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not read that file.",
    );

    readAsTextSpy.mockRestore();
  });

  it("keeps the current schema when a file reader returns no text", async () => {
    const user = userEvent.setup();
    const readAsTextSpy = vi
      .spyOn(FileReader.prototype, "readAsText")
      .mockImplementation(function (this: FileReader) {
        this.onload?.(
          new ProgressEvent("load") as unknown as ProgressEvent<FileReader>,
        );
      });

    try {
      render(<SwaggerWorkspace />);

      await user.upload(
        screen.getByLabelText("Import OpenAPI schema file"),
        new File(["ignored"], "schema.yaml", {
          type: "application/yaml",
        }),
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not read that file.",
      );
      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
        DEFAULT_OPENAPI_SCHEMA,
      );
    } finally {
      readAsTextSpy.mockRestore();
    }
  });

  it("downloads the latest schema with current format and title metadata", () => {
    const createObjectURL = vi.fn((object: Blob | MediaSource) => {
      void object;
      return "blob:mock-url";
    });
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const anchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);

        if (tagName === "a") {
          element.click = vi.fn();
          anchors.push(element as HTMLAnchorElement);
        }

        return element;
      });

    try {
      render(<SwaggerWorkspace />);

      const latestSchema = JSON.stringify({
        info: { title: "Fresh Download API", version: "2.0.0" },
        openapi: "3.0.0",
        paths: {},
      });

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: { value: latestSchema },
      });
      fireEvent.click(screen.getByRole("button", { name: "Download" }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blobArg = createObjectURL.mock.calls[0][0] as Blob;
      expect(blobArg.type).toBe("application/json");
      const downloadAnchor = anchors[0];
      expect(downloadAnchor?.download).toBe("fresh-download-api.json");
      expect(downloadAnchor?.getAttribute("href")).toBe("blob:mock-url");
      expect(downloadAnchor?.click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
    }
  });

  it("copies the exact schema text and clears stale copy feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<SwaggerWorkspace />);

    await user.click(screen.getByRole("button", { name: "Copy schema" }));

    expect(writeText).toHaveBeenCalledWith(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByRole("status")).toHaveTextContent("Schema copied.");

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: DEFAULT_OPENAPI_SCHEMA.replace("1.0.0", "1.0.1"),
      },
    });

    expect(screen.queryByText("Schema copied.")).not.toBeInTheDocument();
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

    expect(
      screen.getAllByRole("button", { name: "Copy request URL" })[0],
    ).toBeDisabled();
    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.type(screen.getByLabelText("Query parameter search"), "Alex");
    await user.type(
      screen.getByLabelText("Header parameter X-Trace-Id"),
      "trace-1",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Copy request URL" })[0],
    );

    expect(writeText).toHaveBeenLastCalledWith(
      "https://jsonplaceholder.typicode.com/users/42?search=Alex",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Request URL copied.");

    await user.click(screen.getAllByRole("button", { name: "Copy cURL" })[0]);

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        'curl -X GET \\\n  "https://jsonplaceholder.typicode.com/users/42?search=Alex" \\\n  -H "X-Trace-Id: trace-1"',
      ),
    );
    expect(screen.getByLabelText("cURL GET /users/{id}")).toHaveTextContent(
      "/users/42?search=Alex",
    );
    expect(screen.getByRole("status")).toHaveTextContent("cURL copied.");
    expect(screen.queryByText("Request URL copied.")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Query parameter search"), " Smith");

    expect(screen.queryByText("cURL copied.")).not.toBeInTheDocument();
  });

  it("previews and copies JavaScript fetch snippets", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<SwaggerWorkspace />);

    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.type(screen.getByLabelText("Query parameter search"), "Alex");
    await user.type(
      screen.getByLabelText("Header parameter X-Trace-Id"),
      "trace-1",
    );

    const codeFormat = screen.getAllByRole("group", {
      name: "Request code format",
    })[0];

    await user.click(within(codeFormat).getByRole("button", { name: "Fetch" }));

    const fetchPreview = screen.getByLabelText("Fetch GET /users/{id}");

    expect(fetchPreview).toHaveTextContent(
      "https://jsonplaceholder.typicode.com/users/42?search=Alex",
    );
    expect(fetchPreview).toHaveTextContent('"method": "GET"');
    expect(fetchPreview).toHaveTextContent('"X-Trace-Id": "trace-1"');

    await user.click(screen.getAllByRole("button", { name: "Copy fetch" })[0]);

    expect(writeText).toHaveBeenCalledWith(fetchPreview.textContent);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Fetch snippet copied.",
    );

    await user.type(screen.getByLabelText("Query parameter search"), " Smith");

    expect(screen.queryByText("Fetch snippet copied.")).not.toBeInTheDocument();
  });

  it("omits the request body and Content-Type from the cURL preview once the body textarea is cleared", () => {
    render(<SwaggerWorkspace />);

    expect(screen.getByLabelText("cURL POST /users/{id}")).toHaveTextContent(
      "Content-Type",
    );

    fireEvent.change(screen.getByLabelText("Editable request body"), {
      target: { value: "" },
    });

    const curlPreview = screen.getByLabelText("cURL POST /users/{id}");

    expect(curlPreview).not.toHaveTextContent("Content-Type");
    expect(curlPreview.textContent).not.toContain("-d ");
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
    await user.type(screen.getAllByLabelText("Path parameter id")[1], "42");
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[1]);

    expect(screen.getByRole("status")).toHaveTextContent("Request preview");
    expect(screen.getByRole("status")).toHaveTextContent("Mikhail");
  });

  it("keeps a newly added parameter input controlled and usable after a live schema edit", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: RSSwag Demo API
  version: 1.0.0
servers:
  - url: https://jsonplaceholder.typicode.com
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    get:
      summary: Get user by id
      parameters:
        - name: search
          in: query
          schema:
            type: string
        - name: sort
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Successful response`,
      },
    });

    const sortInput = await screen.findByLabelText("Query parameter sort");

    await user.type(sortInput, "asc");

    const loggedControlledInputWarning = consoleError.mock.calls.some(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("changing an uncontrolled input"),
    );

    expect(loggedControlledInputWarning).toBe(false);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toHaveTextContent(
      "sort=asc",
    );

    consoleError.mockRestore();
  });

  it("syncs an untouched request body to a live schema edit that keeps the same endpoint", async () => {
    render(<SwaggerWorkspace />);

    expect(screen.getByLabelText("Editable request body")).toHaveValue(
      '{\n  "name": "Alex Smith"\n}',
    );

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: RSSwag Demo API
  version: 1.0.0
servers:
  - url: https://jsonplaceholder.typicode.com
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    post:
      summary: Update user
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
            example:
              name: "Jordan Lee"
      responses:
        '200':
          description: Updated user`,
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Editable request body")).toHaveValue(
        '{\n  "name": "Jordan Lee"\n}',
      ),
    );
  });

  it("syncs untouched parameter examples and resets edits to the latest value", async () => {
    const user = userEvent.setup();
    const schemaWithExample = (example: number) => `openapi: 3.0.0
info:
  title: Parameter Sync API
  version: 1.0.0
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        schema:
          type: integer
          example: ${example}
    get:
      responses:
        '200':
          description: OK`;
    render(<SwaggerWorkspace />);
    const editor = screen.getByLabelText("OpenAPI schema editor");

    fireEvent.change(editor, { target: { value: schemaWithExample(41) } });

    await waitFor(() => {
      const inputs = screen.getAllByLabelText("Path parameter id");

      expect(inputs).toHaveLength(1);
      expect(inputs[0]).toHaveValue("41");
    });
    const parameterInput = screen.getByLabelText("Path parameter id");

    fireEvent.change(editor, { target: { value: schemaWithExample(42) } });

    await waitFor(() => expect(parameterInput).toHaveValue("42"));

    await user.clear(parameterInput);
    await user.type(parameterInput, "custom");
    fireEvent.change(editor, { target: { value: schemaWithExample(43) } });

    await waitFor(() =>
      expect(parameterInput).toHaveAttribute("placeholder", "Example: 43"),
    );
    expect(parameterInput).toHaveValue("custom");

    await user.click(screen.getByRole("button", { name: "Reset values" }));

    expect(parameterInput).toHaveValue("43");
  });

  it("keeps a user's own request body edit instead of overwriting it after a live schema edit", async () => {
    render(<SwaggerWorkspace />);

    fireEvent.change(screen.getByLabelText("Editable request body"), {
      target: { value: '{"name":"Custom Edit"}' },
    });

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: {
        value: `openapi: 3.0.0
info:
  title: RSSwag Demo API
  version: 1.0.0
servers:
  - url: https://jsonplaceholder.typicode.com
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    post:
      summary: Update user
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
            example:
              name: "Jordan Lee"
      responses:
        '200':
          description: Updated user`,
      },
    });

    await waitFor(() =>
      expect(
        screen.queryByLabelText("cURL GET /users/{id}"),
      ).not.toBeInTheDocument(),
    );

    expect(screen.getByLabelText("Editable request body")).toHaveValue(
      '{"name":"Custom Edit"}',
    );
  });

  it("updates the viewer when a JSON schema is entered", async () => {
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

    expect(
      await screen.findByRole("heading", { name: "Pets API" }),
    ).toBeVisible();
    expect(screen.getByText("Version 2.0.0")).toBeVisible();
    expect(screen.getByText("/pets")).toBeVisible();
    expect(screen.getByText("List pets")).toBeVisible();
  });

  it("debounces re-parsing the schema instead of reparsing on every keystroke", () => {
    vi.useFakeTimers();

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: { value: "openapi: 3.0.0" },
      });

      // The textarea updates instantly (typing must never feel blocked)...
      expect(
        (screen.getByLabelText("OpenAPI schema editor") as HTMLTextAreaElement)
          .value,
      ).toBe("openapi: 3.0.0");
      // ...but the expensive re-parse and its "Invalid" feedback shouldn't
      // have landed yet.
      expect(screen.queryByText("Invalid")).not.toBeInTheDocument();
      expect(screen.getByText("Valid")).toBeVisible();

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(screen.getByText("Invalid")).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables schema saving for guests", () => {
    render(<SwaggerWorkspace />);

    expect(
      screen.getByText("Sign in to save and restore schemas."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save schema" })).toBeDisabled();
  });

  it("restores and updates a debounced guest schema draft", async () => {
    const restoredDraft = `openapi: 3.0.0
info:
  title: Guest Draft API
  version: 1.0.0
paths: {}`;
    const editedDraft = restoredDraft.replace("1.0.0", "2.0.0");
    window.localStorage.setItem(SCHEMA_DRAFT_STORAGE_KEY, restoredDraft);

    render(<SwaggerWorkspace />);

    expect(
      await screen.findByRole("heading", { name: "Guest Draft API" }),
    ).toBeVisible();
    expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
      restoredDraft,
    );

    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: editedDraft },
    });

    expect(screen.getByText("Saving draft...")).toBeVisible();

    await waitFor(() =>
      expect(window.localStorage.getItem(SCHEMA_DRAFT_STORAGE_KEY)).toBe(
        editedDraft,
      ),
    );
    expect(screen.getByText("Draft saved locally.")).toBeVisible();
  });

  it("reports a failed guest draft save without disrupting editing", async () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage full", "QuotaExceededError");
      });

    try {
      render(<SwaggerWorkspace />);

      const editor = screen.getByLabelText("OpenAPI schema editor");
      const editedSchema = DEFAULT_OPENAPI_SCHEMA.replace("1.0.0", "1.0.1");

      fireEvent.change(editor, { target: { value: editedSchema } });

      expect(screen.getByText("Saving draft...")).toBeVisible();
      expect(
        await screen.findByText("Draft could not be saved."),
      ).toBeVisible();
      expect(editor).toHaveValue(editedSchema);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("resets a guest draft to the default schema only after confirmation", async () => {
    const user = userEvent.setup();
    const draft = `openapi: 3.0.0
info:
  title: Resettable Draft API
  version: 1.0.0
paths: {}`;
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    window.localStorage.setItem(SCHEMA_DRAFT_STORAGE_KEY, draft);

    try {
      render(<SwaggerWorkspace />);

      expect(
        await screen.findByRole("heading", { name: "Resettable Draft API" }),
      ).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Reset editor" }));
      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(draft);
      expect(window.localStorage.getItem(SCHEMA_DRAFT_STORAGE_KEY)).toBe(draft);

      await user.click(screen.getByRole("button", { name: "Reset editor" }));

      expect(screen.getByLabelText("OpenAPI schema editor")).toHaveValue(
        DEFAULT_OPENAPI_SCHEMA,
      );
      expect(window.localStorage.getItem(SCHEMA_DRAFT_STORAGE_KEY)).toBeNull();
      expect(
        await screen.findByRole("heading", { name: "RSSwag Demo API" }),
      ).toBeVisible();
      expect(confirmSpy).toHaveBeenCalledTimes(2);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("saves a valid schema for authenticated users", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
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
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/schemas",
        expect.objectContaining({
          method: "POST",
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("opens a selected saved schema and preserves its identity when resaving", async () => {
    const user = userEvent.setup();
    const selectedSchema = {
      createdAt: "2026-07-10T10:00:00.000Z",
      format: "yaml",
      id: "selected-schema",
      schemaText: `openapi: 3.0.0
info:
  title: Selected API
  version: 2.0.0
paths:
  /selected:
    get:
      summary: Selected endpoint
      responses:
        '200':
          description: OK`,
      title: "Selected API",
      updatedAt: "2026-07-10T11:00:00.000Z",
      version: "2.0.0",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );
    stageSavedSchemaForEditor(selectedSchema);

    try {
      render(<SwaggerWorkspace />);

      expect(
        await screen.findByRole("heading", { name: "Selected API" }),
      ).toBeVisible();
      expect(screen.getByText("/selected")).toBeVisible();
      expect(
        window.sessionStorage.getItem(SCHEMA_EDITOR_HANDOFF_STORAGE_KEY),
      ).toBeNull();

      await user.click(screen.getByRole("button", { name: "Save schema" }));

      const postCall = fetchMock.mock.calls.find(
        ([url, options]) =>
          url === "/api/schemas" &&
          (options as RequestInit | undefined)?.method === "POST",
      );
      const savedRecord = JSON.parse(
        String((postCall?.[1] as RequestInit | undefined)?.body),
      );

      expect(savedRecord).toMatchObject({
        createdAt: selectedSchema.createdAt,
        id: selectedSchema.id,
        title: selectedSchema.title,
      });
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) => url === "/api/schemas" && options === undefined,
        ),
      ).toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reports an authenticated local save failure without syncing stale data", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      const setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new DOMException("Storage full", "QuotaExceededError");
        });

      try {
        await user.click(screen.getByRole("button", { name: "Save schema" }));

        expect(screen.getByRole("status")).toHaveTextContent(
          "Schema could not be saved locally.",
        );
        expect(
          fetchMock.mock.calls.some(
            ([url, options]) =>
              url === "/api/schemas" &&
              (options as RequestInit | undefined)?.method === "POST",
          ),
        ).toBe(false);
      } finally {
        setItemSpy.mockRestore();
      }
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("saves the latest schema metadata with the editor keyboard shortcut", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      const editor = screen.getByLabelText("OpenAPI schema editor");
      const latestSchema = DEFAULT_OPENAPI_SCHEMA.replace(
        "RSSwag Demo API",
        "Shortcut Saved API",
      ).replace("version: 1.0.0", "version: 2.1.0");

      fireEvent.change(editor, { target: { value: latestSchema } });
      fireEvent.keyDown(editor, { ctrlKey: true, key: "s" });

      expect(screen.getByRole("status")).toHaveTextContent("Schema saved.");
      expect(window.localStorage.getItem(SAVED_SCHEMA_STORAGE_KEY)).toBe(
        latestSchema,
      );

      const postCall = fetchMock.mock.calls.find(
        ([url, options]) =>
          url === "/api/schemas" &&
          (options as RequestInit | undefined)?.method === "POST",
      );
      const savedRecord = JSON.parse(
        String((postCall?.[1] as RequestInit | undefined)?.body),
      );

      expect(savedRecord).toMatchObject({
        format: "yaml",
        schemaText: latestSchema,
        title: "Shortcut Saved API",
        version: "2.1.0",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reuses the same saved-schema id across repeated saves instead of creating duplicates", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ schemas: [] }), {
        status: 200,
      }),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      await user.click(screen.getByRole("button", { name: "Save schema" }));
      await user.click(screen.getByRole("button", { name: "Save schema" }));

      const postCalls = fetchMock.mock.calls.filter(
        ([url, options]) =>
          url === "/api/schemas" &&
          (options as RequestInit | undefined)?.method === "POST",
      );

      expect(postCalls).toHaveLength(2);

      const firstBody = JSON.parse(
        String((postCalls[0][1] as RequestInit).body),
      );
      const secondBody = JSON.parse(
        String((postCalls[1][1] as RequestInit).body),
      );

      expect(secondBody.id).toBe(firstBody.id);
      expect(secondBody.createdAt).toBe(firstBody.createdAt);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("keeps in-progress edits instead of overwriting them once a slower saved-schema fetch resolves", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(fetchPromise);
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      expect(fetchMock).toHaveBeenCalledWith("/api/schemas");

      fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
        target: { value: "openapi: 3.0.0" },
      });

      await act(async () => {
        resolveFetch(
          Response.json({
            schemas: [
              {
                createdAt: "2026-01-01T00:00:00.000Z",
                format: "yaml",
                id: "server-1",
                schemaText:
                  "openapi: 3.0.0\ninfo:\n  title: Server Saved API\n  version: 1.0.0\npaths: {}",
                title: "Server Saved API",
                updatedAt: "2026-01-01T00:00:00.000Z",
                version: "1.0.0",
              },
            ],
          }),
        );
        // Gives the response.json() + .then() microtask chain room to settle
        // so a still-present bug would have had its chance to overwrite the
        // edit before this assertion runs.
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(
        (screen.getByLabelText("OpenAPI schema editor") as HTMLTextAreaElement)
          .value,
      ).toBe("openapi: 3.0.0");
      expect(screen.queryByText("Server Saved API")).not.toBeInTheDocument();
    } finally {
      fetchMock.mockRestore();
    }
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
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
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

    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[0]);

    expect(screen.getByRole("status")).toHaveTextContent("Response");
    expect(screen.getByRole("status")).toHaveTextContent("200");
    expect(screen.getByRole("status")).toHaveTextContent("Alex Smith");
    expect(screen.getByRole("status")).toHaveTextContent("Saved to history");
    expect(window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)).toContain(
      "Get user by id",
    );

    await user.click(
      screen.getByRole("button", { name: "Copy response headers" }),
    );

    expect(writeText).toHaveBeenLastCalledWith(
      "content-type: application/json",
    );
    expect(screen.getByText("Response headers copied.")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Copy response body" }),
    );

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('"name": "Alex Smith"'),
    );
    expect(screen.getByText("Response copied.")).toBeVisible();
    expect(
      screen.queryByText("Response headers copied."),
    ).not.toBeInTheDocument();

    const savedHistory = window.localStorage.getItem(
      REQUEST_HISTORY_STORAGE_KEY,
    );
    await user.click(screen.getByRole("button", { name: "Clear response" }));

    expect(screen.queryByLabelText("Response body")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy response body" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Path parameter id")[0]).toHaveValue("42");
    expect(window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)).toBe(
      savedHistory,
    );
  });

  it("downloads the original response body with content-type metadata", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((object: Blob | MediaSource) => {
      void object;
      return "blob:response-url";
    });
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const anchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);

        if (tagName === "a") {
          element.click = vi.fn();
          anchors.push(element as HTMLAnchorElement);
        }

        return element;
      });

    try {
      render(<SwaggerWorkspace />);

      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );
      await user.click(
        screen.getByRole("button", { name: "Download response" }),
      );

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const responseBlob = createObjectURL.mock.calls[0][0] as Blob;
      expect(responseBlob.type).toBe("application/json");
      expect(responseBlob.size).toBeGreaterThan(0);
      expect(anchors[0]?.download).toBe("rsswag-response-200.json");
      expect(anchors[0]?.getAttribute("href")).toBe("blob:response-url");
      expect(anchors[0]?.click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:response-url");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
    }
  });

  it("records a failed request in history with its real status instead of a fake 200", async () => {
    const user = userEvent.setup();
    // Mirrors what the /api/try-it-out route itself returns (status 200,
    // its own fetch succeeded) when ITS upstream call to the real target
    // API fails: a "0" status sentinel inside the JSON body.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            body: JSON.stringify({ error: "network error" }),
            durationMs: 12,
            errorDetails: "network error",
            headers: {},
            requestSize: 10,
            responseSize: 20,
            status: "0",
            url: "https://jsonplaceholder.typicode.com/users/42",
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
    );
    window.localStorage.setItem(
      AUTH_TOKEN_COOKIE,
      createDemoToken("mikhail@example.com"),
    );

    try {
      render(<SwaggerWorkspace />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save schema" }),
        ).not.toBeDisabled();
      });

      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );

      const savedHistory = JSON.parse(
        window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY) || "[]",
      );

      expect(savedHistory).toMatchObject([{ status: 0 }]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses server execution analytics when the try-it-out route responds", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          body: JSON.stringify({ ok: true }),
          durationMs: 88,
          headers: {
            "content-type": "application/json",
            "x-demo": "server",
          },
          requestSize: 123,
          responseSize: 11,
          status: "200",
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    try {
      render(<SwaggerWorkspace />);

      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/try-it-out",
        expect.objectContaining({
          method: "POST",
        }),
      );
      const requestBody = JSON.parse(
        String((fetchMock.mock.calls[0][1] as RequestInit).body),
      );

      expect(requestBody).toMatchObject({
        method: "GET",
        path: "/users/{id}",
        requestParameters: [{ location: "path", name: "id", value: "42" }],
        serverUrl: "https://jsonplaceholder.typicode.com",
      });
      expect(screen.getByRole("status")).toHaveTextContent("88 ms");
      expect(screen.getByRole("status")).toHaveTextContent("Request 123 B");
      expect(screen.getByRole("status")).toHaveTextContent("Response 11 B");
      expect(screen.getByRole("status")).toHaveTextContent("Response headers");
      expect(screen.getByRole("status")).toHaveTextContent("x-demo: server");
      expect(screen.getByLabelText("Response body").textContent).toBe(
        '{\n  "ok": true\n}',
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows the substituted target url when the try-it-out request itself fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network error"));

    try {
      render(<SwaggerWorkspace />);

      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        "https://jsonplaceholder.typicode.com/users/42",
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows guest mock execution without saving history", async () => {
    const user = userEvent.setup();

    render(<SwaggerWorkspace />);

    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[0]);

    expect(screen.getByRole("status")).toHaveTextContent("Guest run");
    expect(window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)).toBeNull();
  });

  it("prevents duplicate requests while an endpoint is executing", async () => {
    let finishRequest: (response: Response) => void = () => {};
    const requestPromise = new Promise<Response>((resolve) => {
      finishRequest = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(requestPromise);

    try {
      render(<SwaggerWorkspace />);
      fireEvent.change(screen.getAllByLabelText("Path parameter id")[0], {
        target: { value: "42" },
      });

      const executeButton = screen.getAllByRole("button", {
        name: "Try It Out",
      })[0];

      fireEvent.click(executeButton);
      fireEvent.click(executeButton);

      expect(executeButton).toBeDisabled();
      expect(executeButton).toHaveTextContent("Executing...");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      finishRequest(
        Response.json({
          body: "{}",
          durationMs: 10,
          errorDetails: null,
          headers: {},
          requestSize: 10,
          responseSize: 2,
          status: "200",
          url: "https://example.com/users/42",
        }),
      );

      await waitFor(() => expect(executeButton).not.toBeDisabled());
      expect(executeButton).toHaveTextContent("Try It Out");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("cancels an in-flight request without showing or saving a fallback response", async () => {
    const user = userEvent.setup();
    let requestSignal: AbortSignal | null = null;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, init) => {
        const signal = init?.signal as AbortSignal | undefined;
        requestSignal = signal || null;

        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      });

    try {
      render(<SwaggerWorkspace />);
      await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
      await user.click(
        screen.getAllByRole("button", { name: "Try It Out" })[0],
      );

      expect((requestSignal as AbortSignal | null)?.aborted).toBe(false);
      await user.click(screen.getByRole("button", { name: "Cancel request" }));

      await waitFor(() =>
        expect(
          screen.getAllByRole("button", { name: "Try It Out" })[0],
        ).toBeEnabled(),
      );
      expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
      expect(screen.getByText("Request cancelled.")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Download response" }),
      ).not.toBeInTheDocument();
      expect(
        window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY),
      ).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
