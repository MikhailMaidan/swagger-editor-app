import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { MockWebSocket } from "@/test/websocket-mock";

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe("workspace WebSocket studio", () => {
  it("adds offline conversations alongside REST tools and preserves both the editor and studio through invalid OpenAPI edits", async () => {
    const user = userEvent.setup();
    render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-websocket")!);
    const editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "WebSocket session studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByText("WebSocket session studio", { selector: "summary" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Load realtime conversation demo" }),
    );
    await user.click(
      panel.getByRole("button", { name: "Replay conversation offline" }),
    );
    await waitFor(() =>
      expect(panel.getByText(/Offline replay: passed/)).toBeInTheDocument(),
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    expect(
      screen.getByText("API design studio", { selector: "summary" }),
    ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(panel.getByText(/Offline replay: passed/)).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "Workspace tools" }),
      ).getByRole("button", { name: "WebSocket session studio" }),
    ).toBeInTheDocument();
    await user.click(
      panel.getByRole("button", { name: "Replay conversation offline" }),
    );
    await waitFor(() =>
      expect(panel.getByText(/Offline replay: passed/)).toBeInTheDocument(),
    );
    expect(editor).toHaveValue("openapi: [");
    expect(MockWebSocket.instances).toHaveLength(0);
  });
  it("keeps an interactive WebSocket alive while REST text changes, and disposes it on workspace unmount", async () => {
    const user = userEvent.setup(),
      { unmount } = render(<SwaggerWorkspace />);
    const panel = within(document.getElementById("workspace-tool-websocket")!);
    await user.click(
      panel.getByText("WebSocket session studio", { selector: "summary" }),
    );
    await user.click(panel.getByRole("button", { name: "Connect WebSocket" }));
    const socket = MockWebSocket.instances[0];
    await act(async () => socket.open());
    fireEvent.change(screen.getByLabelText("OpenAPI schema editor"), {
      target: { value: "invalid: [" },
    });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    act(() => socket.message("still connected"));
    expect(
      panel.getByLabelText(
        "Selected message preview (first 16,000 characters)",
      ),
    ).toHaveValue("still connected");
    expect(socket.close).not.toHaveBeenCalled();
    unmount();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
