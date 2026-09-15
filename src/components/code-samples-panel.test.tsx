import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EndpointSummary, SecuritySchemeSummary } from "@/lib/openapi";
import { CodeSamplesPanel } from "./code-samples-panel";

function endpoint(
  method: string,
  path: string,
  overrides: Partial<EndpointSummary> = {},
): EndpointSummary {
  return {
    deprecated: false,
    description: "",
    method,
    operationId: "",
    parameters: [],
    path,
    requestBodies: [],
    responses: [],
    secured: false,
    securityRequirements: [],
    serverUrl: "https://api.example.com",
    summary: `${method} ${path}`,
    tags: [],
    ...overrides,
  };
}

const schemes: SecuritySchemeSummary[] = [
  {
    bearerFormat: "JWT",
    description: "",
    location: "",
    name: "bearerAuth",
    parameterName: "",
    scheme: "bearer",
    type: "http",
  },
];
const listPets = endpoint("GET", "/pets", {
  securityRequirements: ["bearerAuth"],
});
const createPet = endpoint("POST", "/pets", {
  requestBodies: [
    {
      contentType: "application/json",
      description: "",
      required: true,
      schema: {
        example: '{"name":"Rex"}',
        exampleName: "",
        properties: ["name"],
        type: "object",
      },
    },
  ],
});
const rootSchema = {
  info: { title: "Pets", version: "1.0.0" },
  openapi: "3.0.3",
  paths: {
    "/pets": {
      get: { responses: {} },
      post: { responses: {} },
    },
  },
};

function renderPanel() {
  render(
    <CodeSamplesPanel
      allEndpoints={[listPets, createPet]}
      rootSchema={rootSchema}
      schemaFormat="yaml"
      schemaTitle="Pet Store"
      schemaVersion="1.0.0"
      securitySchemes={schemes}
      visibleEndpoints={[createPet]}
    />,
  );

  return within(screen.getByRole("region", { name: "Code samples" }));
}

describe("CodeSamplesPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("previews samples per endpoint and language with auth placeholders", async () => {
    const user = userEvent.setup();
    const panel = renderPanel();

    expect(
      panel.getByText("2 endpoints × 3 languages = 6 samples"),
    ).toBeVisible();
    expect(
      panel.getByText("cURL, Python (requests), JavaScript (axios)"),
    ).toBeVisible();
    expect(panel.queryByRole("group", { name: "Languages" })).toBeNull();

    await user.click(
      panel.getByRole("button", { name: "Choose languages and preview" }),
    );

    const languages = panel.getByRole("group", { name: "Languages" });

    expect(
      within(languages)
        .getAllByRole("button", { pressed: true })
        .map((button) => button.textContent),
    ).toEqual(["cURL", "Python (requests)", "JavaScript (axios)"]);
    expect(
      panel.getByLabelText("Code sample preview for GET /pets in cURL"),
    ).toHaveTextContent('-H "Authorization: Bearer YOUR_TOKEN"');

    await user.click(
      within(panel.getByRole("group", { name: "Preview language" })).getByRole(
        "button",
        { name: "Python (requests)" },
      ),
    );
    expect(
      panel.getByLabelText(
        "Code sample preview for GET /pets in Python (requests)",
      ),
    ).toHaveTextContent('"Authorization": "Bearer YOUR_TOKEN"');

    await user.click(
      panel.getByRole("checkbox", {
        name: "Include authentication placeholders",
      }),
    );
    expect(
      panel.getByLabelText(
        "Code sample preview for GET /pets in Python (requests)",
      ),
    ).not.toHaveTextContent("YOUR_TOKEN");

    await user.selectOptions(
      panel.getByLabelText("Preview endpoint"),
      "POST /pets",
    );
    expect(
      panel.getByLabelText(
        "Code sample preview for POST /pets in Python (requests)",
      ),
    ).toHaveTextContent('"name": "Rex"');

    await user.click(
      within(languages).getByRole("button", { name: "Go (net/http)" }),
    );
    await user.click(
      within(panel.getByRole("group", { name: "Preview language" })).getByRole(
        "button",
        { name: "Go (net/http)" },
      ),
    );
    expect(
      panel.getByLabelText(
        "Code sample preview for POST /pets in Go (net/http)",
      ),
    ).toHaveTextContent('http.NewRequest("POST"');

    await user.selectOptions(panel.getByLabelText("Endpoints"), "visible");
    expect(
      panel.getByText("1 endpoints × 4 languages = 4 samples"),
    ).toBeVisible();

    await user.click(panel.getByRole("button", { name: "Clear" }));
    expect(panel.getByRole("status")).toHaveTextContent(
      "Select at least one language to generate samples.",
    );
    expect(
      panel.getByRole("button", { name: "Download Markdown guide" }),
    ).toBeDisabled();

    await user.click(panel.getByRole("button", { name: "Select all" }));
    expect(
      panel.getByText("1 endpoints × 15 languages = 15 samples"),
    ).toBeVisible();
  });

  it("copies and downloads Markdown guides and specs with x-codeSamples", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const blobs: Blob[] = [];
    const downloads: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      blobs.push(blob as Blob);
      return "blob:samples";
    });
    URL.revokeObjectURL = vi.fn();

    try {
      const panel = renderPanel();

      await user.click(
        panel.getByRole("button", { name: "Choose languages and preview" }),
      );
      await user.click(panel.getByRole("button", { name: "Copy sample" }));
      expect(writeText).toHaveBeenLastCalledWith(
        expect.stringContaining("curl -X GET"),
      );
      expect(panel.getByRole("status")).toHaveTextContent("Sample copied.");

      await user.click(
        panel.getByRole("button", { name: "Copy Markdown guide" }),
      );
      expect(writeText).toHaveBeenLastCalledWith(
        expect.stringContaining("# Pet Store code samples"),
      );
      expect(writeText.mock.lastCall?.[0]).toContain("## POST /pets");

      await user.click(
        panel.getByRole("button", { name: "Download Markdown guide" }),
      );
      expect(panel.getByRole("status")).toHaveTextContent(
        "Markdown guide download started.",
      );

      await user.click(
        panel.getByRole("button", { name: "Download spec with x-codeSamples" }),
      );
      expect(panel.getByRole("status")).toHaveTextContent(
        "Spec download started with code samples on 2 operations.",
      );
      expect(downloads).toEqual([
        "pet-store-code-samples.md",
        "pet-store-with-code-samples.yaml",
      ]);

      const spec = YAML.parse(await blobs[1].text());

      expect(
        spec.paths["/pets"].post["x-codeSamples"].map(
          (sample: { label: string; lang: string }) =>
            `${sample.lang}:${sample.label}`,
        ),
      ).toEqual([
        "Shell:cURL",
        "Python:Python (requests)",
        "JavaScript:JavaScript (axios)",
      ]);
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
  });
});
