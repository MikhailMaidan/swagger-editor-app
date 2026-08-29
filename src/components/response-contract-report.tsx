"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard, type ClipboardWriter } from "@/lib/clipboard";
import type {
  ResponseContractEndpoint,
  ResponseContractCheckCode,
  ResponseContractCheckResult,
  ResponseContractReport as ContractReport,
} from "@/lib/response-contract";
import { serializeResponseContractReport } from "@/lib/response-contract";
import type { TranslationKey } from "@/lib/translations";

const checkMessageKeys: Record<ResponseContractCheckCode, TranslationKey> = {
  "body-empty": "workspace.contractBodyEmpty",
  "body-invalid-json": "workspace.contractBodyInvalidJson",
  "body-matched": "workspace.contractBodyMatched",
  "body-missing-required": "workspace.contractBodyMissingRequired",
  "body-not-documented": "workspace.contractBodyNotDocumented",
  "body-not-expected": "workspace.contractBodyNotExpected",
  "body-type-mismatch": "workspace.contractBodyTypeMismatch",
  "content-type-matched": "workspace.contractContentTypeMatched",
  "content-type-mismatch": "workspace.contractContentTypeMismatch",
  "content-type-missing": "workspace.contractContentTypeMissing",
  "content-type-not-documented": "workspace.contractContentTypeNotDocumented",
  "status-matched": "workspace.contractStatusMatched",
  "status-undocumented": "workspace.contractStatusUndocumented",
};

const checkTypeKeys: Record<
  ContractReport["checks"][number]["type"],
  TranslationKey
> = {
  body: "workspace.contractBody",
  "content-type": "workspace.contractContentType",
  status: "workspace.contractStatus",
};

const checkResultLabelKeys: Record<
  ResponseContractCheckResult,
  TranslationKey
> = {
  fail: "workspace.contractCheckFailed",
  pass: "workspace.contractPassed",
  skipped: "workspace.contractSkipped",
};

const reportResultLabelKeys: Record<
  ResponseContractCheckResult,
  TranslationKey
> = {
  fail: "workspace.contractFailed",
  pass: "workspace.contractPassed",
  skipped: "workspace.contractSkipped",
};

const resultClasses: Record<ResponseContractCheckResult, string> = {
  fail: "bg-red-100 text-red-700",
  pass: "bg-emerald-100 text-emerald-700",
  skipped: "bg-slate-100 text-slate-600",
};

type CopyAction = {
  content: string;
  result: "copying" | "error" | "success";
};

export function ResponseContractReport({
  clipboard,
  endpoint,
  report,
}: {
  clipboard?: ClipboardWriter;
  endpoint: ResponseContractEndpoint;
  report: ContractReport;
}) {
  const { t } = useI18n();
  const [copyAction, setCopyAction] = useState<CopyAction | null>(null);
  const reportJson = serializeResponseContractReport(report, endpoint);
  const currentCopyResult =
    copyAction?.content === reportJson ? copyAction.result : null;

  async function handleCopyReport() {
    if (currentCopyResult === "copying") {
      return;
    }

    setCopyAction({ content: reportJson, result: "copying" });
    const copied = await writeTextToClipboard(reportJson, clipboard);

    setCopyAction({
      content: reportJson,
      result: copied ? "success" : "error",
    });
  }

  return (
    <section
      aria-label={t("workspace.contractTitle")}
      className="mt-3 border-y border-[color:var(--color-brand-border)] py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-extrabold text-[color:var(--color-brand-navy)]">
            {t("workspace.contractTitle")}
          </h4>
          <span
            className={`rounded-md px-2 py-1 text-xs font-extrabold ${resultClasses[report.result]}`}
          >
            {t(reportResultLabelKeys[report.result])}
          </span>
          <p className="text-xs font-semibold text-[color:var(--color-brand-muted)]">
            {report.failedCount > 0
              ? t("workspace.contractSummaryFailed", {
                  checked: String(report.checkedCount),
                  failed: String(report.failedCount),
                })
              : t("workspace.contractSummaryPassed", {
                  checked: String(report.checkedCount),
                })}
          </p>
        </div>
        <button
          className="h-8 rounded-md border border-[color:var(--color-brand-border)] px-3 text-xs font-extrabold text-[color:var(--color-brand-navy)] transition hover:border-[color:var(--color-brand-purple)] hover:text-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={currentCopyResult === "copying"}
          type="button"
          onClick={handleCopyReport}
        >
          {t(
            currentCopyResult === "copying"
              ? "workspace.contractCopying"
              : "workspace.contractCopy",
          )}
        </button>
      </div>

      {currentCopyResult === "success" || currentCopyResult === "error" ? (
        <p
          className={`mt-2 text-xs font-semibold ${
            currentCopyResult === "error" ? "text-red-700" : "text-emerald-700"
          }`}
          role={currentCopyResult === "error" ? "alert" : "status"}
        >
          {t(
            currentCopyResult === "error"
              ? "workspace.contractCopyError"
              : "workspace.contractCopySuccess",
          )}
        </p>
      ) : null}

      <ul className="mt-3 grid gap-2 lg:grid-cols-3">
        {report.checks.map((check) => (
          <li className="min-w-0 text-xs" key={check.type}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-[color:var(--color-brand-navy)]">
                {t(checkTypeKeys[check.type])}
              </span>
              <span
                className={`rounded-md px-2 py-0.5 font-bold ${resultClasses[check.result]}`}
              >
                {t(checkResultLabelKeys[check.result])}
              </span>
            </div>
            <p className="mt-1 font-medium leading-5 text-[color:var(--color-brand-muted)]">
              {t(checkMessageKeys[check.code], check.params)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
