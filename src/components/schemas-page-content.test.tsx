import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
      expect(
        screen.queryByLabelText("New title"),
      ).not.toBeInTheDocument();
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
