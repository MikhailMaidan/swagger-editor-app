import { describe, expect, it } from "vitest";
import {
  createEndpointPermalink,
  getEndpointAnchor,
  getEndpointEditorHref,
} from "./endpoint-link";

describe("endpoint links", () => {
  it("creates stable, URL-safe, distinct endpoint anchors", () => {
    const anchor = getEndpointAnchor("GET", "/users/{id}");

    expect(anchor).toBe("endpoint-get-users-id-clnt28");
    expect(getEndpointAnchor("GET", "/users/{id}")).toBe(anchor);
    expect(getEndpointAnchor("POST", "/users/{id}")).not.toBe(anchor);
    expect(getEndpointAnchor("GET", "/users-id")).not.toBe(anchor);
    expect(getEndpointAnchor(" get ", " /users/{id} ")).toBe(anchor);
  });

  it("creates an editor-relative link for endpoint navigation", () => {
    expect(getEndpointEditorHref("GET", "/users/{id}")).toBe(
      `/#${getEndpointAnchor("GET", "/users/{id}")}`,
    );
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
