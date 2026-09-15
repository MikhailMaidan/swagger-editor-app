import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SnippetLanguageMenu } from "./snippet-language-menu";

function renderMenu(activeLanguage: "go" | null = null) {
  const onSelect = vi.fn();

  render(
    <div>
      <p>Outside</p>
      <SnippetLanguageMenu
        activeLanguage={activeLanguage}
        label="More code languages for GET /pets"
        menuLabel="Code languages for GET /pets"
        placeholder="More languages…"
        onSelect={onSelect}
      />
    </div>,
  );

  return {
    onSelect,
    trigger: screen.getByRole("button", {
      name: "More code languages for GET /pets",
    }),
  };
}

describe("SnippetLanguageMenu", () => {
  it("lists every language only while open and reports the selection", async () => {
    const user = userEvent.setup();
    const { onSelect, trigger } = renderMenu();

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("More languages…");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();

    await user.click(trigger);

    const menu = screen.getByRole("group", {
      name: "Code languages for GET /pets",
    });

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getAllByRole("button")).toHaveLength(12);

    await user.click(
      within(menu).getByRole("button", { name: "Rust (reqwest)" }),
    );

    expect(onSelect).toHaveBeenCalledWith("rust");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("marks the active language and closes on Escape or an outside click", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu("go");

    expect(trigger).toHaveTextContent("Go (net/http)");

    await user.click(trigger);
    expect(
      screen.getByRole("button", { name: "Go (net/http)", pressed: true }),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    fireEvent.mouseDown(screen.getByText("Outside"));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
