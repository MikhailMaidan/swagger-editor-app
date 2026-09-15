import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";

describe("workspace request code languages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("switches an endpoint preview to another language, copies it, and returns to cURL", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      render(<SwaggerWorkspace />);

      fireEvent.change(screen.getAllByLabelText("Path parameter id")[0], {
        target: { value: "42" },
      });
      const languageMenuTrigger = screen.getByRole("button", {
        name: "More code languages for GET /users/{id}",
      });

      await user.click(languageMenuTrigger);
      await user.click(
        within(
          screen.getByRole("group", {
            name: "Code languages for GET /users/{id}",
          }),
        ).getByRole("button", { name: "Python (requests)" }),
      );
      expect(
        screen.queryByRole("group", {
          name: "Code languages for GET /users/{id}",
        }),
      ).not.toBeInTheDocument();
      expect(languageMenuTrigger).toHaveTextContent("Python (requests)");

      const pythonPreview = screen.getByLabelText(
        "Python (requests) GET /users/{id}",
      );

      expect(pythonPreview).toHaveTextContent(
        'url = "https://jsonplaceholder.typicode.com/users/42"',
      );
      expect(pythonPreview).toHaveTextContent(
        'response = requests.request("GET", url)',
      );

      const codeFormat = screen.getAllByRole("group", {
        name: "Request code format",
      })[0];

      expect(
        within(codeFormat).getByRole("button", { name: "cURL" }),
      ).toHaveAttribute("aria-pressed", "false");

      await user.click(screen.getAllByRole("button", { name: "Copy code" })[0]);
      expect(writeText).toHaveBeenCalledWith(pythonPreview.textContent);
      expect(screen.getByRole("status")).toHaveTextContent(
        "Code snippet copied.",
      );

      await user.click(
        within(codeFormat).getByRole("button", { name: "cURL" }),
      );
      expect(screen.getByLabelText("cURL GET /users/{id}")).toBeVisible();
      expect(languageMenuTrigger).toHaveTextContent("More languages");
      expect(
        within(
          screen.getByRole("navigation", { name: "Workspace tools" }),
        ).getByRole("button", { name: "Code samples" }),
      ).toHaveAttribute("aria-controls", "workspace-tool-code-samples");
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
    // Renders the complete workspace, which can exceed the default timeout
    // when the whole suite runs in parallel.
  }, 10_000);
});
