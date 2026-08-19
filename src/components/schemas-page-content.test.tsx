import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SCHEMA_EDITOR_HANDOFF_STORAGE_KEY } from "@/lib/schema-storage";
import { SchemasPageContent } from "./schemas-page-content";

const savedSchema = {
  createdAt: "2026-07-10T10:00:00.000Z",
  format: "yaml",
  id: "saved-schema",
  schemaText: "openapi: 3.0.0",
  title: "Saved API",
  updatedAt: "2026-07-10T10:00:00.000Z",
  version: "1.0.0",
};

describe("SchemasPageContent", () => {
  it("shows an empty state with an editor link", () => {
    render(<SchemasPageContent initialSchemas={[]} />);

    expect(screen.getByText(/not saved any schemas yet/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Editor" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("renders saved schema details", () => {
    render(<SchemasPageContent initialSchemas={[savedSchema]} />);

    expect(screen.getByRole("heading", { name: "Saved API" })).toBeVisible();
    expect(screen.getByText("Version 1.0.0")).toBeVisible();
    expect(screen.getAllByText("yaml")).toHaveLength(2);
    expect(screen.getByText("14 B")).toBeVisible();
  });

  it("stages a saved schema and opens it in the editor", async () => {
    const user = userEvent.setup();

    render(<SchemasPageContent initialSchemas={[savedSchema]} />);

    await user.click(
      screen.getByRole("button", { name: "Open Saved API in editor" }),
    );

    expect(
      JSON.parse(
        window.sessionStorage.getItem(SCHEMA_EDITOR_HANDOFF_STORAGE_KEY) ||
          "null",
      ),
    ).toEqual(savedSchema);
    expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).toHaveBeenCalledWith("/");
  });

  it("keeps the user on the schemas page when editor handoff storage fails", async () => {
    const user = userEvent.setup();
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage full", "QuotaExceededError");
      });

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(
        screen.getByRole("button", { name: "Open Saved API in editor" }),
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not open this schema in the editor.",
      );
      expect(globalThis.__NEXT_NAVIGATION_MOCK__.push).not.toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("downloads a saved schema using its title and format", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:saved-schema");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

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
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(
        screen.getByRole("button", { name: "Download Saved API" }),
      );

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe(
        "application/yaml",
      );
      expect(anchors[0]?.download).toBe("saved-api.yaml");
      expect(anchors[0]?.click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:saved-schema");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      createElementSpy.mockRestore();
    }
  });

  it("toggles an accessible inline preview for a saved schema", async () => {
    const user = userEvent.setup();

    render(<SchemasPageContent initialSchemas={[savedSchema]} />);

    const previewButton = screen.getByRole("button", {
      name: "Preview Saved API",
    });

    expect(previewButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByLabelText("Schema preview for Saved API"),
    ).not.toBeInTheDocument();

    await user.click(previewButton);

    const preview = screen.getByLabelText("Schema preview for Saved API");

    expect(preview).toBeVisible();
    expect(preview).toHaveTextContent(savedSchema.schemaText);
    expect(
      screen.getByRole("button", { name: "Hide preview for Saved API" }),
    ).toHaveAttribute("aria-expanded", "true");

    await user.click(
      screen.getByRole("button", { name: "Hide preview for Saved API" }),
    );

    expect(
      screen.queryByLabelText("Schema preview for Saved API"),
    ).not.toBeInTheDocument();
  });

  it("filters saved schemas by title, version, and format", async () => {
    const user = userEvent.setup();
    const otherSchema = {
      createdAt: "2026-07-09T10:00:00.000Z",
      format: "json",
      id: "other-schema",
      schemaText: '{"openapi":"3.0.0"}',
      title: "Other API",
      updatedAt: "2026-07-09T10:00:00.000Z",
      version: "2.0.0",
    };

    render(<SchemasPageContent initialSchemas={[savedSchema, otherSchema]} />);

    const filter = screen.getByLabelText("Filter saved schemas");

    expect(screen.getByText("Showing 2 of 2 schemas")).toBeVisible();

    await user.type(filter, "JSON");

    expect(screen.getByRole("heading", { name: "Other API" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Saved API" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 2 schemas")).toBeVisible();

    await user.clear(filter);
    await user.type(filter, "missing");

    expect(
      screen.getByText("No saved schemas match your search."),
    ).toBeVisible();
    expect(screen.getByText("Showing 0 of 2 schemas")).toBeVisible();
  });

  it("sorts saved schemas without changing their records", async () => {
    const user = userEvent.setup();
    const olderSchema = {
      createdAt: "2026-07-09T10:00:00.000Z",
      format: "json",
      id: "older-schema",
      schemaText: '{"openapi":"3.0.0"}',
      title: "Other API",
      updatedAt: "2026-07-09T10:00:00.000Z",
      version: "2.0.0",
    };

    render(<SchemasPageContent initialSchemas={[olderSchema, savedSchema]} />);

    const visibleTitles = () =>
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
    const sort = screen.getByLabelText("Sort saved schemas");

    expect(visibleTitles()).toEqual(["Saved API", "Other API"]);

    await user.selectOptions(sort, "title");
    expect(visibleTitles()).toEqual(["Other API", "Saved API"]);

    await user.selectOptions(sort, "largest");
    expect(visibleTitles()).toEqual(["Other API", "Saved API"]);

    await user.selectOptions(sort, "newest");
    expect(visibleTitles()).toEqual(["Saved API", "Other API"]);
  });

  it("does not re-encode every schema's byte size on unrelated re-renders", async () => {
    const user = userEvent.setup();
    const encodeSpy = vi.spyOn(TextEncoder.prototype, "encode");

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);
      encodeSpy.mockClear();

      await user.click(
        screen.getByRole("button", { name: "Rename Saved API" }),
      );
      await user.type(screen.getByLabelText("New title"), "x");

      expect(encodeSpy).not.toHaveBeenCalled();
    } finally {
      encodeSpy.mockRestore();
    }
  });

  it("gives each row's delete button a distinguishing accessible name", () => {
    render(
      <SchemasPageContent
        initialSchemas={[
          savedSchema,
          {
            createdAt: "2026-07-09T10:00:00.000Z",
            format: "json",
            id: "other-schema",
            schemaText: '{"openapi":"3.0.0"}',
            title: "Other API",
            updatedAt: "2026-07-09T10:00:00.000Z",
            version: "2.0.0",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Delete Saved API" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete Other API" }),
    ).toBeVisible();
  });

  it("removes a schema from the list after a confirmed, successful delete", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(
        screen.getByRole("button", { name: "Delete Saved API" }),
      );

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete "Saved API"? This cannot be undone.',
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/schemas/saved-schema",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(
        screen.queryByRole("heading", { name: "Saved API" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/not saved any schemas yet/i)).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("does not call the delete endpoint when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(
        screen.getByRole("button", { name: "Delete Saved API" }),
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Saved API" })).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("shows an error and keeps the schema when the delete request fails", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(
        screen.getByRole("button", { name: "Delete Saved API" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not delete this schema. Try again.",
      );
      expect(screen.getByRole("heading", { name: "Saved API" })).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("clears every schema at once after a confirmed, successful clear-all", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const otherSchema = {
      createdAt: "2026-07-09T10:00:00.000Z",
      format: "json",
      id: "other-schema",
      schemaText: '{"openapi":"3.0.0"}',
      title: "Other API",
      updatedAt: "2026-07-09T10:00:00.000Z",
      version: "2.0.0",
    };

    try {
      render(
        <SchemasPageContent initialSchemas={[savedSchema, otherSchema]} />,
      );

      await user.click(screen.getByRole("button", { name: "Clear all" }));

      expect(confirmSpy).toHaveBeenCalledWith(
        "Delete all 2 saved schemas? This cannot be undone.",
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/schemas",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.getByText(/not saved any schemas yet/i)).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("does not clear anything when the clear-all confirmation is dismissed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(screen.getByRole("button", { name: "Clear all" }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Saved API" })).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("shows an error and keeps the schemas when the clear-all request fails", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(screen.getByRole("button", { name: "Clear all" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not clear saved schemas. Try again.",
      );
      expect(screen.getByRole("heading", { name: "Saved API" })).toBeVisible();
    } finally {
      confirmSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("renames a schema after a successful save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        schemas: [{ ...savedSchema, title: "Renamed API" }],
      }),
    );

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(
        screen.getByRole("button", { name: "Rename Saved API" }),
      );

      const input = screen.getByLabelText("New title");

      expect(input).toHaveValue("Saved API");

      await user.clear(input);
      await user.type(input, "Renamed API");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/schemas/saved-schema",
        expect.objectContaining({ method: "PATCH" }),
      );
      const requestBody = JSON.parse(
        String((fetchMock.mock.calls[0][1] as RequestInit).body),
      );
      expect(requestBody).toEqual({ title: "Renamed API" });
      expect(
        await screen.findByRole("heading", { name: "Renamed API" }),
      ).toBeVisible();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("discards the edit without saving when rename is cancelled", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(
        screen.getByRole("button", { name: "Rename Saved API" }),
      );
      await user.clear(screen.getByLabelText("New title"));
      await user.type(screen.getByLabelText("New title"), "Discarded Title");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Saved API" })).toBeVisible();
      expect(screen.queryByLabelText("New title")).not.toBeInTheDocument();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects an empty title without calling the server", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(
        screen.getByRole("button", { name: "Rename Saved API" }),
      );
      await user.clear(screen.getByLabelText("New title"));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a title.");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("shows an error and keeps editing when the rename request fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));

    try {
      render(<SchemasPageContent initialSchemas={[savedSchema]} />);

      await user.click(
        screen.getByRole("button", { name: "Rename Saved API" }),
      );
      await user.clear(screen.getByLabelText("New title"));
      await user.type(screen.getByLabelText("New title"), "Renamed API");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not rename this schema. Try again.",
      );
      expect(screen.getByLabelText("New title")).toBeVisible();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
