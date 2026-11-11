import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { parseOpenApiSchema } from "@/lib/openapi";
import {
  createRequestPreset,
  readRequestPresets,
  saveRequestPresets,
} from "@/lib/request-presets";
import { EndpointCard } from "./endpoint-card";

it("applies saved values to query parameters with distinct trailing whitespace", async () => {
  const parsed = parseOpenApiSchema(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Preset parameters", version: "1" },
      servers: [{ url: "https://example.test" }],
      paths: {
        "/items": {
          get: {
            parameters: ["search", "search "].map((name) => ({
              name,
              in: "query",
              schema: { type: "string" },
            })),
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }),
  );
  if (!parsed.ok) throw new Error(parsed.error);

  const preset = createRequestPreset({
    method: "GET",
    name: "Distinct searches",
    parameterValues: { "query:search": "plain", "query:search ": "spaced" },
    path: "/items",
    requestBodies: {},
    requestContentType: "",
    responseContentType: "",
    responseStatus: "200",
    timeoutMs: 10_000,
  });
  expect(saveRequestPresets([preset])).toBe(true);
  render(
    <EndpointCard
      endpoint={parsed.value.endpoints[0]}
      canSaveHistory={false}
      executionMode="mock"
      mockResponseDelayMs={0}
      requestPresets={readRequestPresets()}
      onSaveRequestPreset={() => true}
      onDeleteRequestPreset={() => true}
    />,
  );

  await userEvent
    .setup()
    .selectOptions(screen.getByLabelText("Request preset"), preset.id);

  expect(screen.getByLabelText("cURL GET /items")).toHaveTextContent(
    "https://example.test/items?search=plain&search%20=spaced",
  );
});

it("previews and runs imported examples with unmatched Unicode surrogates", async () => {
  const value = "a\uD800b";
  const parsed = parseOpenApiSchema(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Unicode parameters", version: "1" },
      servers: [{ url: "https://example.test" }],
      paths: {
        "/items/{id}": {
          get: {
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string", example: value },
              },
              {
                name: "q",
                in: "query",
                schema: { type: "string", example: "\uDC00" },
              },
              {
                name: "session",
                in: "cookie",
                schema: { type: "string", example: "\uD800" },
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }),
  );
  if (!parsed.ok) throw new Error(parsed.error);

  render(
    <EndpointCard
      endpoint={parsed.value.endpoints[0]}
      canSaveHistory={false}
      executionMode="mock"
      mockResponseDelayMs={0}
    />,
  );
  const url = "https://example.test/items/a%EF%BF%BDb?q=%EF%BF%BD";
  const preview = screen.getByLabelText("cURL GET /items/{id}");
  expect(preview).toHaveTextContent(url);
  expect(preview).toHaveTextContent("session=%EF%BF%BD");
  expect(screen.getByLabelText("Path parameter id")).toHaveValue(value);

  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Generate Mock" }));
  expect(await screen.findByText(url)).toBeVisible();
});
