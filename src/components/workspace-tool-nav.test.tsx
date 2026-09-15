import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceToolNav } from "./workspace-tool-nav";

describe("WorkspaceToolNav", () => {
  it("groups tools, flags findings, and jumps without changing the URL hash", async () => {
    const user = userEvent.setup();

    window.history.replaceState(null, "", "/#endpoint-get-users");
    render(
      <>
        <WorkspaceToolNav
          endpointListId="endpoint-list"
          tools={[
            {
              group: "export",
              id: "tool-postman",
              label: "workspace.toolNavPostman",
            },
            {
              alertCount: 3,
              group: "quality",
              id: "tool-examples",
              label: "workspace.toolNavExamples",
            },
          ]}
        />
        <div id="tool-examples" tabIndex={-1} />
        <div id="endpoint-list" tabIndex={-1} />
      </>,
    );

    const nav = screen.getByRole("navigation", { name: "Workspace tools" });
    const groups = within(nav)
      .getAllByRole("list")
      .map((list) => list.previousElementSibling?.textContent);

    expect(groups).toEqual(["Quality", "Export"]);
    expect(within(nav).getByText("2 tools")).toBeVisible();

    const examplesButton = within(nav).getByRole("button", {
      name: "Examples 3",
    });
    const target = document.getElementById("tool-examples") as HTMLElement;
    const scrollIntoView = vi.fn();

    target.scrollIntoView = scrollIntoView;
    await user.click(examplesButton);

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    expect(target).toHaveFocus();
    expect(examplesButton).toHaveAttribute("aria-current", "location");
    expect(window.location.hash).toBe("#endpoint-get-users");

    await user.click(
      within(nav).getByRole("button", { name: /Endpoint list/ }),
    );
    expect(document.getElementById("endpoint-list")).toHaveFocus();
  });

  it("renders nothing without tools", () => {
    const { container } = render(<WorkspaceToolNav tools={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
