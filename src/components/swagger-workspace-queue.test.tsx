import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SwaggerWorkspace } from "./swagger-workspace";
import { DEFAULT_OPENAPI_SCHEMA } from "@/lib/openapi";
import { queueTranslations } from "@/lib/queue-translations";
describe("workspace background-job queue integration", () => {
  it("preserves REST and existing studios, including queue results when OpenAPI becomes invalid", async () => {
    render(<SwaggerWorkspace />);
    const en = queueTranslations.en,
      panel = within(document.getElementById("workspace-tool-queue")!),
      nav = within(screen.getByRole("navigation", { name: "Workspace tools" })),
      editor = screen.getByLabelText("OpenAPI schema editor");
    expect(
      nav.getByRole("button", { name: en["queue.title"] }),
    ).toBeInTheDocument();
    fireEvent.click(
      panel.getByText(en["queue.title"], { selector: "summary" }),
    );
    await panel.findByRole("button", { name: en["queue.demo"] });
    fireEvent.click(panel.getByRole("button", { name: en["queue.demo"] }));
    fireEvent.click(panel.getByRole("button", { name: en["queue.runAll"] }));
    await waitFor(
      () =>
        expect(panel.getByRole("status")).toHaveTextContent(
          "10/10 expectations passed",
        ),
      { timeout: 7000 },
    );
    expect(editor).toHaveValue(DEFAULT_OPENAPI_SCHEMA);
    expect(screen.getByLabelText("cURL GET /users/{id}")).toBeInTheDocument();
    expect(screen.getByLabelText("cURL POST /users/{id}")).toBeInTheDocument();
    for (const id of [
      "slo",
      "sync",
      "transfers",
      "negotiation",
      "journeys",
      "idempotency",
      "authorization",
      "rate-limits",
      "traces",
      "webhook",
      "json-rpc",
      "cors",
      "cache",
    ])
      expect(
        document.getElementById(`workspace-tool-${id}`),
      ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "openapi: [" } });
    await waitFor(
      () =>
        expect(
          screen.queryByLabelText("cURL GET /users/{id}"),
        ).not.toBeInTheDocument(),
      { timeout: 7000 },
    );
    expect(panel.getByRole("status")).toHaveTextContent(
      "10/10 expectations passed",
    );
    expect(
      nav.getByRole("button", { name: en["queue.title"] }),
    ).toBeInTheDocument();
  });
});
