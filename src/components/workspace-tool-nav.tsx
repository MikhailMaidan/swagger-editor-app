"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/translations";

export type WorkspaceToolGroup = "design" | "export" | "quality" | "testing";

export type WorkspaceTool = {
  alertCount?: number;
  group: WorkspaceToolGroup;
  id: string;
  label: TranslationKey;
};

const groupOrder: WorkspaceToolGroup[] = [
  "design",
  "quality",
  "testing",
  "export",
];

const groupTranslationKeys: Record<WorkspaceToolGroup, TranslationKey> = {
  design: "workspace.toolNavGroupDesign",
  export: "workspace.toolNavGroupExport",
  quality: "workspace.toolNavGroupQuality",
  testing: "workspace.toolNavGroupTesting",
};

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function WorkspaceToolNav({
  endpointListId = "",
  tools,
}: {
  endpointListId?: string;
  tools: WorkspaceTool[];
}) {
  const { t } = useI18n();
  const [activeToolId, setActiveToolId] = useState("");
  const toolIds = tools.map((tool) => tool.id).join(" ");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !toolIds) {
      return;
    }

    const visibleIds = new Set<string>();
    const orderedIds = toolIds.split(" ");
    // Highlights the first tool in document order that overlaps the band
    // just below the sticky header, which reads as "where am I" while
    // scrolling through the long stack of panels.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleIds.add(entry.target.id);
          } else {
            visibleIds.delete(entry.target.id);
          }
        }

        setActiveToolId(orderedIds.find((id) => visibleIds.has(id)) ?? "");
      },
      { rootMargin: "-160px 0px -55% 0px" },
    );

    for (const id of orderedIds) {
      const element = document.getElementById(id);

      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [toolIds]);

  if (tools.length === 0) {
    return null;
  }

  function handleNavigate(id: string) {
    const target = document.getElementById(id);

    if (!target) {
      return;
    }

    // Endpoint permalinks live in the URL hash, so tool jumps are buttons that
    // scroll and move focus without replacing it.
    target.scrollIntoView?.({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    target.focus({ preventScroll: true });
    setActiveToolId(id);
  }

  return (
    <nav
      aria-label={t("workspace.toolNavLabel")}
      className="mt-5 rounded-2xl border border-[color:var(--color-brand-border)] bg-[linear-gradient(135deg,#ffffff_0%,#fbfaff_60%,var(--color-brand-soft)_100%)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase text-[color:var(--color-brand-purple)]">
          {t("workspace.toolNavTitle")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-[color:var(--color-brand-muted)] ring-1 ring-[color:var(--color-brand-border)]">
            {t("workspace.toolNavCount", { count: String(tools.length) })}
          </span>
          {endpointListId ? (
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[color:var(--color-brand-navy)] px-3 text-xs font-extrabold text-white transition hover:bg-[color:var(--color-brand-purple)]"
              type="button"
              onClick={() => handleNavigate(endpointListId)}
            >
              {t("workspace.toolNavEndpoints")}
              <span aria-hidden="true">↓</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {groupOrder.map((group) => {
          const groupTools = tools.filter((tool) => tool.group === group);

          if (groupTools.length === 0) {
            return null;
          }

          return (
            <div className="min-w-0" key={group}>
              <p className="text-[11px] font-extrabold uppercase text-[color:var(--color-brand-muted)]">
                {t(groupTranslationKeys[group])}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {groupTools.map((tool) => {
                  const isActive = activeToolId === tool.id;

                  return (
                    <li key={tool.id}>
                      <button
                        aria-controls={tool.id}
                        aria-current={isActive ? "location" : undefined}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${
                          isActive
                            ? "border-[color:var(--color-brand-purple)] bg-[color:var(--color-brand-purple)] text-white shadow-[0_6px_16px_rgba(90,45,255,0.22)]"
                            : "border-[color:var(--color-brand-border)] bg-white text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)]"
                        }`}
                        type="button"
                        onClick={() => handleNavigate(tool.id)}
                      >
                        {t(tool.label)}
                        {tool.alertCount ? " " : null}
                        {tool.alertCount ? (
                          <span
                            className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-extrabold leading-5 ${
                              isActive
                                ? "bg-white text-[color:var(--color-brand-purple)]"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {tool.alertCount}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
