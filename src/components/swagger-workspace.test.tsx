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
import { REQUEST_HISTORY_STORAGE_KEY } from "@/lib/request-history";
import { SAVED_SCHEMA_STORAGE_KEY } from "@/lib/schema-storage";
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
      expect(editor.className).toContain("block");
      expect(editor.className).toContain("overflow-y-hidden");
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
    expect(screen.getByText("200 - Successful response")).toBeVisible();
    expect(screen.getByText("404 - User not found")).toBeVisible();
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

  it("filters the endpoint list by method, path, summary, and method tab", () => {
    render(<SwaggerWorkspace />);

    const filterInput = screen.getByLabelText(
      "Filter endpoints by method, path, summary, tag, or auth",
    );
    const methodFilters = screen.getByRole("group", {
      name: "Filter endpoints by HTTP method",
    });

    fireEvent.change(filterInput, { target: { value: "update" } });

    expect(
      screen.getByLabelText("cURL POST /users/{id}"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("cURL GET /users/{id}"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No endpoints match your search."),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(methodFilters).getByRole("button", { name: "GET (1)" }),
    );

    expect(
      screen.getByText("No endpoints match your search."),
    ).toBeVisible();

    fireEvent.click(
      within(methodFilters).getByRole("button", { name: "All methods" }),
    );

    fireEvent.change(filterInput, { target: { value: "does-not-exist" } });

    expect(
      screen.getByText("No endpoints match your search."),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("cURL POST /users/{id}"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(
      screen.getByLabelText("cURL GET /users/{id}"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("cURL POST /users/{id}"),
    ).toBeInTheDocument();
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
      security: []
      responses:
        '200':
          description: OK`,
      },
    });

    expect(await screen.findByText("reports")).toBeVisible();
    expect(screen.getByText("admin")).toBeVisible();
    expect(screen.getAllByText("Deprecated")).toHaveLength(2);
    expect(screen.getByText("Auth: bearerAuth")).toBeVisible();

    const stats = screen.getByLabelText("Endpoint statistics");

    expect(stats).toHaveTextContent("Endpoints2");
    expect(stats).toHaveTextContent("Deprecated1");
    expect(stats).toHaveTextContent("Secured1");

    fireEvent.change(
      screen.getByLabelText(
        "Filter endpoints by method, path, summary, tag, or auth",
      ),
      { target: { value: "bearer" } },
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
    const curlPreview = screen.getByLabelText("cURL GET /users/{id}");

    expect(curlPreview).toHaveTextContent("curl -X GET");
    expect(curlPreview.textContent).toContain(
      '"https://api.example.com/users/42?search=Alex"',
    );
    expect(curlPreview.textContent).toContain('-H "X-Trace-Id: trace-1"');
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
    await waitFor(() => expect(screen.getByText("JSON")).toBeVisible());

    await user.click(
      await screen.findByRole("button", { name: "Convert to YAML" }),
    );

    expect(editor.value).toContain("title: RSSwag Demo API");
    await waitFor(() => expect(screen.getByText("YAML")).toBeVisible());
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

  it("shows an error instead of silently failing when the imported file can't be read", async () => {
    const user = userEvent.setup();
    const readAsTextSpy = vi
      .spyOn(FileReader.prototype, "readAsText")
      .mockImplementation(function (this: FileReader) {
        this.onerror?.(new ProgressEvent("error") as unknown as ProgressEvent<FileReader>);
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

  it("downloads the current schema with a filename derived from its title", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => "blob:mock-url");
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

      await user.click(screen.getByRole("button", { name: "Download" }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blobArg = createObjectURL.mock.calls[0][0] as Blob;
      expect(blobArg.type).toBe("application/yaml");
      const downloadAnchor = anchors[0];
      expect(downloadAnchor?.download).toBe("rsswag-demo-api.yaml");
      expect(downloadAnchor?.getAttribute("href")).toBe("blob:mock-url");
      expect(downloadAnchor?.click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
    }
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

    await user.type(screen.getAllByLabelText("Path parameter id")[0], "42");
    await user.type(screen.getByLabelText("Query parameter search"), "Alex");
    await user.type(
      screen.getByLabelText("Header parameter X-Trace-Id"),
      "trace-1",
    );
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

    await user.type(screen.getByLabelText("Query parameter search"), " Smith");

    expect(screen.queryByText("cURL copied.")).not.toBeInTheDocument();
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
    await user.click(screen.getAllByRole("button", { name: "Try It Out" })[1]);

    expect(screen.getByRole("status")).toHaveTextContent("Request preview");
    expect(screen.getByRole("status")).toHaveTextContent("Mikhail");
  });

  it("keeps a newly added parameter input controlled and usable after a live schema edit", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

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
        (
          screen.getByLabelText(
            "OpenAPI schema editor",
          ) as HTMLTextAreaElement
        ).value,
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
        requestParameters: [],
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
});
