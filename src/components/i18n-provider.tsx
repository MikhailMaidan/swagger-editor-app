"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import {
  isLanguage,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  translate,
} from "@/lib/translations";
import type { Language, TranslationKey } from "@/lib/translations";

const LANGUAGE_CHANGE_EVENT = "rsswagger-language-change";
const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Defaults to "en" so components rendered outside a real I18nProvider (e.g.
// in isolated tests) keep working; RootLayout supplies the real value.
const InitialLanguageContext = createContext<Language>("en");

function readLanguage(): Language {
  if (typeof window === "undefined") {
    return "en";
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

  return isLanguage(storedLanguage) ? storedLanguage : "en";
}

function subscribeToLanguageChange(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function setAppLanguage(language: Language) {
  if (typeof window === "undefined") {
    return;
  }

  // A server-readable cookie lets the next page load render the right
  // language from the start, the same way auth state avoids its own flash -
  // without it, the server always renders "en" and the client swaps to the
  // real language only after hydration, flashing English text on every load
  // for a Russian-preferring visitor. Written before the guarded localStorage
  // call (and the change is announced unconditionally after it) so a
  // blocked/full store doesn't stop the language switch from taking effect.
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax`;

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The cookie remains the primary source when storage is blocked.
  }

  window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
}

export function useI18n() {
  const initialLanguage = useContext(InitialLanguageContext);
  const language = useSyncExternalStore<Language>(
    subscribeToLanguageChange,
    readLanguage,
    () => initialLanguage,
  );

  return {
    language,
    setLanguage: setAppLanguage,
    t: (key: TranslationKey, params?: Record<string, string>) =>
      translate(language, key, params),
  };
}

function DocumentLanguageSync() {
  const { language } = useI18n();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}

export function I18nProvider({
  children,
  initialLanguage = "en",
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  return (
    <InitialLanguageContext.Provider value={initialLanguage}>
      <DocumentLanguageSync />
      {children}
    </InitialLanguageContext.Provider>
  );
}
