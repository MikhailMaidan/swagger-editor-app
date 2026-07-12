import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SchemasPageContent } from "./schemas-page-content";

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
    render(
      <SchemasPageContent
        initialSchemas={[
          {
            createdAt: "2026-07-10T10:00:00.000Z",
            format: "yaml",
            id: "saved-schema",
            schemaText: "openapi: 3.0.0",
            title: "Saved API",
            updatedAt: "2026-07-10T10:00:00.000Z",
            version: "1.0.0",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Saved API" })).toBeVisible();
    expect(screen.getByText("Version 1.0.0")).toBeVisible();
    expect(screen.getAllByText("yaml")).toHaveLength(2);
    expect(screen.getByText("14 B")).toBeVisible();
  });
});
