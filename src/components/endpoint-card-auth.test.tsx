import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { parseOpenApiSchema } from "@/lib/openapi";
import { readRequestHistory } from "@/lib/request-history";
import { EndpointCard } from "./endpoint-card";

it("redacts relative fallback URLs before displaying them or saving request history", async () => {
  const parsed = parseOpenApiSchema(`openapi: 3.0.0
info: { title: Relative server, version: '1' }
servers: [{ url: /api }]
components:
  securitySchemes:
    queryKey:
      type: apiKey
      in: query
      name: api_key
security:
  - queryKey: []
paths:
  /private:
    get:
      responses:
        '200': { description: OK }
`);
  if (!parsed.ok) throw new Error(parsed.error);

  const user = userEvent.setup();
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 400 }));

  try {
    render(
      <EndpointCard
        authValues={{
          queryKey: {
            enabled: true,
            password: "",
            token: "top-secret",
            username: "",
          },
        }}
        canSaveHistory
        endpoint={parsed.value.endpoints[0]}
        executionMode="live"
        mockResponseDelayMs={0}
        securitySchemes={parsed.value.securitySchemes}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Try It Out" }));

    const redactedUrl = "/api/private?api_key=%5Bconfigured%5D";
    expect(await screen.findByText(redactedUrl)).toBeVisible();
    expect(readRequestHistory()).toMatchObject([{ url: redactedUrl }]);

    const request = fetchMock.mock.calls.find(
      ([url]) => url === "/api/try-it-out",
    );
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      serverUrl: "/api",
      requestParameters: [
        { location: "query", name: "api_key", value: "top-secret" },
      ],
    });
    const historyRequest = fetchMock.mock.calls.find(
      ([url]) => url === "/api/history",
    );
    expect(JSON.parse(String(historyRequest?.[1]?.body))).toMatchObject({
      url: redactedUrl,
    });
    expect(screen.getByLabelText("cURL GET /private")).toHaveTextContent(
      "api_key=top-secret",
    );
  } finally {
    fetchMock.mockRestore();
  }
});
