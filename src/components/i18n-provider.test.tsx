import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "@/lib/translations";
import { AppHeader } from "./app-header";
import { AuthForm } from "./auth-form";
import { I18nProvider, setAppLanguage } from "./i18n-provider";

describe("i18n", () => {
  it("switches the header language and stores the selection", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <AppHeader initialIsAuthenticated={false} initialUserName="User" />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en");
    });

    await user.click(screen.getByRole("button", { name: "Russian" }));

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ru");
    expect(await screen.findByRole("link", { name: "Главная" })).toBeVisible();
    expect(screen.getByRole("link", { name: "О проекте" })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(screen.getByRole("link", { name: "Войти" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(
      screen.getByRole("link", { name: "Зарегистрироваться" }),
    ).toHaveAttribute("href", "/sign-up");
    expect(
      screen.getByRole("button", { name: "Английский" }),
    ).toHaveTextContent("АНГЛ");
    expect(screen.getByRole("button", { name: "Русский" })).toHaveTextContent(
      "РУС",
    );
    expect(document.documentElement.lang).toBe("ru");
    // A server-readable cookie (not just localStorage) is required so the
    // next page load's server render can pick the right language from the
    // start instead of always rendering English and flashing to Russian
    // after hydration.
    expect(document.cookie).toContain("rsswagger-language=ru");
  });

  it("falls back to English instead of crashing the app when reading the stored language throws", async () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });

    try {
      expect(() =>
        render(
          <I18nProvider>
            <AppHeader initialIsAuthenticated={false} initialUserName="User" />
          </I18nProvider>,
        ),
      ).not.toThrow();

      await waitFor(() => {
        expect(document.documentElement.lang).toBe("en");
      });
      expect(screen.getByRole("link", { name: "About" })).toBeVisible();
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it("still writes the language cookie and announces the change when localStorage is blocked", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    try {
      expect(() => setAppLanguage("ru")).not.toThrow();
      expect(document.cookie).toContain("rsswagger-language=ru");
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "rsswagger-language-change" }),
      );
    } finally {
      setItemSpy.mockRestore();
      dispatchSpy.mockRestore();
    }
  });

  it("renders auth form text and validation messages in Russian", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "ru");

    render(
      <I18nProvider>
        <AuthForm mode="sign-up" />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Зарегистрироваться" })).toBeVisible();

    await user.type(screen.getByLabelText("Email"), "wrong-email");
    await user.type(screen.getByLabelText("Пароль"), "password");
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));

    expect(screen.getByText("Введите корректный email.")).toBeVisible();
    expect(
      screen.getByText("Пароль должен содержать хотя бы одну цифру."),
    ).toBeVisible();
  });
});
