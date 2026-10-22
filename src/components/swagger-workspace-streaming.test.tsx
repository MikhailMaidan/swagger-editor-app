import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";

afterEach(() => vi.unstubAllGlobals());
describe("workspace streaming HTTP studio", () => {
  it("adds offline stream tests without changing REST tools and retains work through invalid editor input", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-streaming")!),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "Streaming HTTP studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByText("Streaming HTTP studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load streaming framing demo" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Run saved stream replay cases" }),
    );
    await panel.findByText("Completed 5/5 variants: 5 passed, 0 failed.");
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.getByText("WebSocket session studio", { selector: "summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("API resilience lab", { selector: "summary" }),
    ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(
      panel.getByText("Completed 5/5 variants: 5 passed, 0 failed."),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "Streaming HTTP studio" }),
    ).toBeInTheDocument();
    expect(editor).toHaveValue("openapi: [");
  });
  it("keeps a live stream connected through editor changes and disposes it on unmount", async () => {
    const user = userEvent.setup(),
      cancel = vi.fn();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            controller = c;
          },
          cancel,
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = render(<SwaggerWorkspace />),
      panel = within(document.getElementById("workspace-tool-streaming")!);
    await user.click(
      panel.getByText("Streaming HTTP studio", { selector: "summary" }),
    );
    fireEvent.change(panel.getByLabelText("Streaming HTTP URL"), {
      target: { value: "https://stream.example/events" },
    });
    await user.click(
      panel.getByRole("button", { name: "Save streaming connection settings" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Connect HTTP stream" }),
    );
    await panel.findByText(/State: streaming/);
    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: "openapi: [" },
    });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    await act(async () =>
      controller.enqueue(new TextEncoder().encode("data: still connected\n\n")),
    );
    expect(
      panel.getByLabelText(
        "Selected stream record data (first 16000 characters)",
      ),
    ).toHaveValue("still connected");
    expect(cancel).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
