import { describe, expect, it } from "vitest";
import {
  createEndpointFilterViewLink,
  readEndpointFilterView,
  type EndpointFilterView,
} from "./endpoint-filter-link";

const defaultView = {
  favoritesOnly: false,
  method: "all",
  response: "all",
  search: "",
  sort: "schema",
  tag: "all",
  trait: "all",
} satisfies EndpointFilterView;

describe("endpoint filter links", () => {
  it("serializes active filters while preserving unrelated parameters", () => {
    const link = createEndpointFilterViewLink(
      "https://rsswag.test/?schema=demo#endpoint-get-users",
      {
        favoritesOnly: true,
        method: "post",
        response: "success",
        search: " update user ",
        sort: "path",
        tag: "customer support",
        trait: "with-request-body",
      },
    );
    const url = new URL(link);

    expect(url.searchParams.get("schema")).toBe("demo");
    expect(url.searchParams.get("endpoint-search")).toBe("update user");
    expect(url.searchParams.get("endpoint-method")).toBe("POST");
    expect(url.searchParams.get("endpoint-tag")).toBe("customer support");
    expect(url.searchParams.get("endpoint-trait")).toBe("with-request-body");
    expect(url.searchParams.get("endpoint-response")).toBe("success");
    expect(url.searchParams.get("endpoint-sort")).toBe("path");
    expect(url.searchParams.get("endpoint-favorites")).toBe("1");
    expect(url.hash).toBe("");
  });

  it("removes stale endpoint parameters when the default view is copied", () => {
    const link = createEndpointFilterViewLink(
      "https://rsswag.test/?endpoint-search=old&endpoint-sort=method&keep=1",
      defaultView,
    );
    const url = new URL(link);

    expect(url.searchParams.get("keep")).toBe("1");
    expect(url.searchParams.has("endpoint-search")).toBe(false);
    expect(url.searchParams.has("endpoint-sort")).toBe(false);
  });

  it("restores supported filter values", () => {
    expect(
      readEndpointFilterView(
        "https://rsswag.test/?endpoint-search=users&endpoint-method=post&endpoint-tag=core&endpoint-trait=secured&endpoint-response=client-error&endpoint-sort=method&endpoint-favorites=1",
      ),
    ).toEqual({
      favoritesOnly: true,
      method: "POST",
      response: "client-error",
      search: "users",
      sort: "method",
      tag: "core",
      trait: "secured",
    });
  });

  it("ignores unsupported, empty, and oversized values", () => {
    const oversizedSearch = "x".repeat(501);

    expect(
      readEndpointFilterView(
        `https://rsswag.test/?endpoint-search=${oversizedSearch}&endpoint-method=G3T&endpoint-trait=unknown&endpoint-response=redirect&endpoint-sort=newest&endpoint-favorites=yes`,
      ),
    ).toEqual({});
  });

  it("fails safely for malformed URLs", () => {
    expect(readEndpointFilterView("not a URL")).toEqual({});
    expect(createEndpointFilterViewLink("not a URL", defaultView)).toBe(
      "not a URL",
    );
  });
});
