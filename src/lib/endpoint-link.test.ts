import { describe, expect, it } from "vitest";
import { createEndpointPermalink, getEndpointAnchor } from "./endpoint-link";

describe("endpoint links", () => {
  it("creates stable, URL-safe, distinct endpoint anchors", () => {
    const anchor = getEndpointAnchor("GET", "/users/{id}");

    expect(anchor).toMatch(/^endpoint-get-users-id-[a-z0-9]+$/);
    expect(getEndpointAnchor("GET", "/users/{id}")).toBe(anchor);
    expect(getEndpointAnchor("POST", "/users/{id}")).not.toBe(anchor);
    expect(getEndpointAnchor("GET", "/users-id")).not.toBe(anchor);
  });

  it("preserves the current page and query while replacing its hash", () => {
    const permalink = createEndpointPermalink(
      "https://docs.example.com/editor?schema=users#old-section",
      "GET",
      "/users/{id}",
    );

    expect(permalink).toBe(
      `https://docs.example.com/editor?schema=users#${getEndpointAnchor("GET", "/users/{id}")}`,
    );
  });
});
