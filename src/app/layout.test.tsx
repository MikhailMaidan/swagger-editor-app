import { describe, expect, it, vi } from "vitest";
import {
  AUTH_TOKEN_COOKIE,
  AUTH_USER_COOKIE,
  createDemoToken,
} from "@/lib/auth";
import { LANGUAGE_COOKIE } from "@/lib/translations";
import RootLayout, { metadata } from "./layout";

describe("RootLayout", () => {
  it("sets application metadata", () => {
    expect(metadata).toMatchObject({
      description: "OpenAPI editor and viewer workspace",
      title: "RSSwag",
    });
  });

  it("passes authenticated cookie state into the header", async () => {
    const token = createDemoToken("mikhail.maidan@example.com");

    globalThis.__COOKIE_MOCK__.mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === AUTH_TOKEN_COOKIE) {
          return { value: token };
        }

        if (name === AUTH_USER_COOKIE) {
          return { value: "Mikhail Maidan" };
        }

        return undefined;
      }),
    });

    const tree = await RootLayout({
      children: <p>Page content</p>,
    });
    const body = tree.props.children;
    const provider = body.props.children;
    const [header, main, footer] = provider.props.children;

    expect(tree.type).toBe("html");
    expect(header.props.initialIsAuthenticated).toBe(true);
    expect(header.props.initialUserName).toBe("Mikhail Maidan");
    expect(main.props.children.props.children).toBe("Page content");
    expect(footer.type.name).toBe("AppFooter");
  });

  it("renders the html tag and I18nProvider in the visitor's saved language, avoiding an English flash", async () => {
    globalThis.__COOKIE_MOCK__.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === LANGUAGE_COOKIE ? { value: "ru" } : undefined,
      ),
    });

    const tree = await RootLayout({
      children: <p>Page content</p>,
    });
    const body = tree.props.children;
    const provider = body.props.children;

    expect(tree.props.lang).toBe("ru");
    expect(provider.props.initialLanguage).toBe("ru");
  });

  it("defaults to English when no language cookie is present", async () => {
    const tree = await RootLayout({
      children: <p>Page content</p>,
    });
    const body = tree.props.children;
    const provider = body.props.children;

    expect(tree.props.lang).toBe("en");
    expect(provider.props.initialLanguage).toBe("en");
  });
});
