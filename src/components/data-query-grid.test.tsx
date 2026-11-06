import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataQueryGrid } from "./data-query-grid";
describe("data query result grid", () => {
  it("pages and searches while preserving original row indices and lineage", () => {
    const rows = Array.from({ length: 60 }, (_, id) => ({
      id,
      name: `record-${id}`,
    }));
    render(
      <DataQueryGrid
        rows={rows}
        lineage={rows.map((_, i) => ({
          sources: [{ datasetId: "source", row: i }],
          truncated: i === 53,
        }))}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Inspect row 25" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next rows" }));
    expect(
      screen.getByRole("button", { name: "Inspect row 25" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search displayed rows"), {
      target: { value: "record-53" },
    });
    expect(
      screen.getByText("Page 1 of 1; 1 matching rows."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect row 53" }));
    expect(screen.getByText("source[53]")).toBeInTheDocument();
    expect(
      screen.getByText(/additional fields or source references/),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search displayed rows"), {
      key: "Escape",
    });
    expect(
      screen.getByText("Page 1 of 3; 60 matching rows."),
    ).toBeInTheDocument();
    expect(screen.getByText("source[53]")).toBeInTheDocument();
    fireEvent.click(
      screen.getByText("Visible columns", { selector: "summary" }),
    );
    fireEvent.click(screen.getByLabelText("name"));
    expect(
      screen.queryByRole("columnheader", { name: "name" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "id" }),
    ).toBeInTheDocument();
  });
});
