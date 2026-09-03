import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextToClipboard } from "@/lib/clipboard";
import { downloadNodeMockServerFile } from "@/lib/node-mock-server-export";
import { parseOpenApiSchema } from "@/lib/openapi";
import { NodeMockServerPanel } from "./node-mock-server-panel";

vi.mock("@/lib/clipboard", () => ({
  writeTextToClipboard: vi.fn(),
}));

vi.mock("@/lib/node-mock-server-export", () => ({
  downloadNodeMockServerFile: vi.fn(),
}));

const parsed = parseOpenApiSchema(`openapi: 3.1.0
info:
  title: Catalog API
  version: 1.0.0
paths:
  /items/{id}:
    get:
      operationId: getItem
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Item
          content:
            application/json:
              schema: { type: object }
              example: { id: item-1 }
        '404':
          description: Missing
  /items:
    post:
      deprecated: true
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { type: object }
              example: { created: true }`);

if (!parsed.ok) {
  throw new Error(parsed.error);
}

const schema = parsed.value;

function renderPanel() {
  return render(
    <NodeMockServerPanel
      allEndpoints={schema.endpoints}
      schema={{ title: schema.title, version: schema.version }}
      visibleEndpoints={[schema.endpoints[0]]}
    />,
  );
}

describe("NodeMockServerPanel", () => {
  beforeEach(() => {
    vi.mocked(writeTextToClipboard).mockReset();
    vi.mocked(writeTextToClipboard).mockResolvedValue(true);
    vi.mocked(downloadNodeMockServerFile).mockReset();
    vi.mocked(downloadNodeMockServerFile).mockReturnValue(true);
  });

  it("summarizes generated routes and follows the filtered endpoint scope", async () => {
    const user = userEvent.setup();
    renderPanel();

    const panel = screen
      .getByRole("heading", { name: "Node mock server" })
      .closest("section") as HTMLElement;

    expect(
      within(panel).getByText("2 routes with 3 documented response variants."),
    ).toBeVisible();
    expect(
      within(panel).getByText("Mock routes").nextElementSibling,
    ).toHaveTextContent("2");
    expect(
      within(panel).getByText("Status variants").nextElementSibling,
    ).toHaveTextContent("3");
    expect(
      within(panel).getByText("Response bodies").nextElementSibling,
    ).toHaveTextContent("2");

    await user.click(
      within(panel).getByRole("button", { name: "Current view (1)" }),
    );
    expect(
      within(panel).getByText("1 routes with 2 documented response variants."),
    ).toBeVisible();
  });

  it("configures runtime defaults and deprecated-route filtering", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText("Include deprecated routes"));
    expect(
      screen.getByText("Excluded deprecated").nextElementSibling,
    ).toHaveTextContent("1");

    const portInput = screen.getByLabelText("Default port");
    const delayInput = screen.getByLabelText("Default delay (ms)");
    await user.clear(portInput);
    await user.type(portInput, "5055");
    await user.clear(delayInput);
    await user.type(delayInput, "250");

    expect(screen.getByText("http://localhost:5055")).toBeVisible();
    await user.click(screen.getByLabelText("Enable CORS"));
    await user.click(screen.getByLabelText("Validate required inputs"));
    await user.click(screen.getByRole("button", { name: "Copy server" }));

    expect(writeTextToClipboard).toHaveBeenCalledWith(
      expect.stringMatching(
        /"cors": false[\s\S]*"defaultDelayMs": 250[\s\S]*"defaultPort": 5055[\s\S]*"validateRequiredInputs": false/,
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Mock server source copied.",
    );
  });

  it("downloads the generated module and reports blocked actions", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Download .mjs" }));
    expect(downloadNodeMockServerFile).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.stringContaining(
          'import { createServer } from "node:http";',
        ),
      }),
      { title: "Catalog API" },
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Mock server download started.",
    );

    vi.mocked(writeTextToClipboard).mockResolvedValue(false);
    await user.click(screen.getByRole("button", { name: "Copy server" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not copy the mock server source.",
    );
  });
});
