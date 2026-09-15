"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  REQUEST_CODE_FORMATS,
  SNIPPET_LANGUAGES,
  type SnippetLanguage,
} from "@/lib/request-snippets";

// A disclosure instead of a native select keeps each endpoint card light:
// the twelve language options only exist in the DOM while the menu is open.
export function SnippetLanguageMenu({
  activeLanguage,
  label,
  menuLabel,
  onSelect,
  placeholder,
}: {
  activeLanguage: SnippetLanguage | null;
  label: string;
  menuLabel: string;
  onSelect: (language: SnippetLanguage) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent | MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div
      className="relative"
      ref={containerRef}
      onKeyDown={(event) => {
        if (isOpen && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-label={label}
        className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold transition ${
          activeLanguage
            ? "border-[color:var(--color-brand-purple)] bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand-purple)]"
            : "border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-muted)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
        }`}
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        {activeLanguage
          ? REQUEST_CODE_FORMATS[activeLanguage].label
          : placeholder}
        <span
          aria-hidden="true"
          className={`transition ${isOpen ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {isOpen ? (
        <div
          aria-label={menuLabel}
          className="absolute left-0 z-20 mt-1 grid w-56 gap-0.5 rounded-xl border border-[color:var(--color-brand-border)] bg-white p-1 shadow-[0_18px_40px_rgba(64,45,137,0.16)]"
          id={menuId}
          role="group"
        >
          {SNIPPET_LANGUAGES.map((language) => (
            <button
              aria-pressed={language === activeLanguage}
              className={`rounded-lg px-2.5 py-1.5 text-left text-xs font-bold transition ${
                language === activeLanguage
                  ? "bg-[color:var(--color-brand-purple)] text-white"
                  : "text-[color:var(--color-brand-navy)] hover:bg-[color:var(--color-brand-soft)] hover:text-[color:var(--color-brand-purple)]"
              }`}
              key={language}
              type="button"
              onClick={() => {
                onSelect(language);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
            >
              {REQUEST_CODE_FORMATS[language].label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
