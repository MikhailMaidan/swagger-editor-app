"use client";

import { ReactNode, useEffect, useSyncExternalStore } from "react";
import {
  isLanguage,
  LANGUAGE_STORAGE_KEY,
  translate,
} from "@/lib/translations";
import type { Language, TranslationKey } from "@/lib/translations";

const LANGUAGE_CHANGE_EVENT = "rsswagger-language-change";

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

  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
}

export function useI18n() {
  const language = useSyncExternalStore<Language>(
    subscribeToLanguageChange,
    readLanguage,
    () => "en",
  );

  return {
    language,
    setLanguage: setAppLanguage,
    t: (key: TranslationKey, params?: Record<string, string>) =>
      translate(language, key, params),
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { language } = useI18n();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <>{children}</>;
}
