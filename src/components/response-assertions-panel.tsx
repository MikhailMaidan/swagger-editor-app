"use client";

import { memo, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  ASSERTION_OPERATORS,
  MAX_ASSERTION_IMPORT_BYTES,
  MAX_RESPONSE_ASSERTIONS,
  evaluateResponseAssertions,
  parseResponseAssertions,
  serializeAssertionReport,
  serializeResponseAssertions,
  validateResponseAssertion,
  type AssertionOperator,
  type AssertionResponse,
  type AssertionTarget,
  type ResponseAssertion,
} from "@/lib/response-assertions";
import { downloadTextFile } from "@/lib/schema-download";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--color-brand-navy)] hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs text-[color:var(--color-brand-navy)]";
const defaults: Record<AssertionTarget, ResponseAssertion> = {
  status: {
    name: "",
    target: "status",
    path: "",
    operator: "equals",
    expected: "200",
  },
  header: {
    name: "",
    target: "header",
    path: "content-type",
    operator: "contains",
    expected: "application/json",
  },
  body: {
    name: "",
    target: "body",
    path: "",
    operator: "type",
    expected: "object",
  },
  duration: {
    name: "",
    target: "duration",
    path: "",
    operator: "lte",
    expected: "1000",
  },
};

export const ResponseAssertionsPanel = memo(function ResponseAssertionsPanel({
  response,
  endpoint,
}: {
  response: AssertionResponse | null;
  endpoint: { method: string; path: string };
}) {
  const { t } = useI18n();
  const id = useId();
  const nextId = useRef(0);
  const [entries, setEntries] = useState<
    { id: number; rule: ResponseAssertion }[]
  >([]);
  const [filter, setFilter] = useState("all");
  const [importText, setImportText] = useState("");
  const [importIssue, setImportIssue] = useState<
    "invalid-set" | "too-large" | "too-many" | null
  >(null);
  const [feedback, setFeedback] = useState<{
    context: string;
    key: TranslationKey;
    error: boolean;
  } | null>(null);
  const rules = useMemo(() => entries.map((entry) => entry.rule), [entries]);
  const issues = useMemo(() => rules.map(validateResponseAssertion), [rules]);
  const results = useMemo(
    () => (response ? evaluateResponseAssertions(rules, response) : null),
    [rules, response],
  );
  const definition = useMemo(() => serializeResponseAssertions(rules), [rules]);
  const report = useMemo(
    () =>
      response && rules.length
        ? serializeAssertionReport(rules, response, endpoint)
        : "",
    [rules, response, endpoint],
  );
  const context = `${definition}\n${report}`;
  const currentFeedback = feedback?.context === context ? feedback : null;
  const validSet = rules.length > 0 && !issues.some(Boolean);
  const visibleEntries = entries
    .map((entry, index) => ({ ...entry, index }))
    .filter(
      ({ index }) =>
        filter === "all" || (results?.[index].outcome ?? "pending") === filter,
    );

  function update(entryId: number, patch: Partial<ResponseAssertion>) {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? { ...entry, rule: { ...entry.rule, ...patch } }
          : entry,
      ),
    );
    setFeedback(null);
  }

  function add(target: AssertionTarget) {
    if (entries.length >= MAX_RESPONSE_ASSERTIONS) return;
    const entry = { id: nextId.current++, rule: { ...defaults[target] } };
    setEntries((current) => [...current, entry]);
    setFilter("all");
    setFeedback(null);
  }

  function appendImport() {
    const parsed = parseResponseAssertions(importText);
    if (!parsed.ok) {
      setImportIssue(parsed.issue);
      return;
    }
    if (parsed.rules.length + entries.length > MAX_RESPONSE_ASSERTIONS) {
      setImportIssue("too-many");
      return;
    }
    const imported = parsed.rules.map((rule) => ({
      id: nextId.current++,
      rule,
    }));
    setEntries((current) => [...current, ...imported]);
    setImportText("");
    setImportIssue(null);
    setFilter("all");
    setFeedback(null);
  }

  async function copy(kind: "set" | "report") {
    const content = kind === "set" ? definition : report;
    const success = await writeTextToClipboard(content);
    setFeedback({
      context,
      key: success ? "assertions.copySuccess" : "assertions.copyError",
      error: !success,
    });
  }

  function download(kind: "set" | "report") {
    const slug = `${endpoint.method}-${endpoint.path}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 80)
      .replace(/^-+|-+$/g, "");
    const success = downloadTextFile(
      kind === "set" ? definition : report,
      `rsswag-${slug || "endpoint"}-assertion-${kind}.json`,
      "application/json",
    );
    setFeedback({
      context,
      key: success ? "assertions.downloadSuccess" : "assertions.downloadError",
      error: !success,
    });
  }

  return (
    <details className="mt-4 rounded-2xl border border-[color:var(--color-brand-border)] bg-[#fbfaff] p-4">
      <summary className="cursor-pointer text-sm font-extrabold text-[color:var(--color-brand-navy)]">
        {t("assertions.title")}
      </summary>
      <section aria-labelledby={id} className="mt-3">
        <h4
          id={id}
          className="text-sm font-bold text-[color:var(--color-brand-navy)]"
        >
          {t("assertions.builder")}
        </h4>
        <p className="mt-1 text-xs text-[color:var(--color-brand-muted)]">
          {t("assertions.description")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(defaults) as AssertionTarget[]).map((target) => (
            <button
              key={target}
              type="button"
              className={buttonClass}
              disabled={entries.length >= MAX_RESPONSE_ASSERTIONS}
              onClick={() => add(target)}
            >
              {t(`assertions.add.${target}`)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs font-semibold" aria-live="polite">
          {results && rules.length
            ? t("assertions.summary", {
                pass: String(
                  results.filter((result) => result.outcome === "pass").length,
                ),
                fail: String(
                  results.filter((result) => result.outcome === "fail").length,
                ),
                error: String(
                  results.filter((result) => result.outcome === "error").length,
                ),
                source: t(`assertions.${response!.source}`),
              })
            : t(rules.length ? "assertions.awaiting" : "assertions.empty")}
        </p>
        {entries.length > 0 ? (
          <>
            <label className="mt-3 block max-w-xs text-xs font-bold">
              {t("assertions.filter")}
              <select
                className={inputClass}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                {["all", "pass", "fail", "error", "pending"].map((value) => (
                  <option key={value} value={value}>
                    {t(`assertions.${value}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </label>
            {visibleEntries.length === 0 ? (
              <p className="mt-3 text-xs">{t("assertions.noMatches")}</p>
            ) : null}
            <div className="mt-3 space-y-3">
              {visibleEntries.map(({ id: entryId, rule, index }) => {
                const issue = issues[index] ?? results?.[index].issue;
                const outcome = results?.[index].outcome ?? "pending";
                return (
                  <fieldset
                    key={entryId}
                    className="min-w-0 rounded-xl border border-[color:var(--color-brand-border)] bg-white p-3"
                  >
                    <legend className="px-1 text-xs font-extrabold">
                      {t("assertions.check", { number: String(index + 1) })} ·{" "}
                      {t(`assertions.${outcome}`)}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold">
                        {t("assertions.name")}
                        <input
                          className={inputClass}
                          value={rule.name}
                          maxLength={120}
                          onChange={(event) =>
                            update(entryId, { name: event.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs font-bold">
                        {t("assertions.target")}
                        <select
                          className={inputClass}
                          value={rule.target}
                          onChange={(event) =>
                            update(entryId, {
                              ...defaults[
                                event.target.value as AssertionTarget
                              ],
                              name: rule.name,
                            })
                          }
                        >
                          {(Object.keys(defaults) as AssertionTarget[]).map(
                            (target) => (
                              <option key={target} value={target}>
                                {t(`assertions.target.${target}`)}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      {rule.target === "body" || rule.target === "header" ? (
                        <label className="text-xs font-bold">
                          {t(
                            rule.target === "body"
                              ? "assertions.path"
                              : "assertions.header",
                          )}
                          <input
                            className={`${inputClass} font-mono`}
                            value={rule.path}
                            maxLength={512}
                            aria-invalid={issues[index] === "invalid-path"}
                            aria-describedby={
                              rule.target === "body"
                                ? `${id}-path-help`
                                : undefined
                            }
                            onChange={(event) =>
                              update(entryId, { path: event.target.value })
                            }
                          />
                        </label>
                      ) : null}
                      <label className="text-xs font-bold">
                        {t("assertions.operator")}
                        <select
                          className={inputClass}
                          value={rule.operator}
                          onChange={(event) => {
                            const operator = event.target
                              .value as AssertionOperator;
                            update(entryId, {
                              operator,
                              expected:
                                rule.target === "status" ||
                                rule.target === "duration"
                                  ? defaults[rule.target].expected
                                  : operator === "type"
                                    ? "object"
                                    : operator === "length" ||
                                        operator === "gte" ||
                                        operator === "lte"
                                      ? "0"
                                      : operator === "equals" &&
                                          rule.target === "body"
                                        ? "null"
                                        : "",
                            });
                          }}
                        >
                          {ASSERTION_OPERATORS[rule.target].map((operator) => (
                            <option key={operator} value={operator}>
                              {t(`assertions.operator.${operator}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {rule.operator !== "exists" &&
                      rule.operator !== "absent" ? (
                        <label className="text-xs font-bold sm:col-span-2">
                          {t(
                            rule.target === "body" && rule.operator === "equals"
                              ? "assertions.expectedJson"
                              : "assertions.expected",
                          )}
                          {rule.operator === "type" ? (
                            <select
                              className={inputClass}
                              value={rule.expected}
                              onChange={(event) =>
                                update(entryId, {
                                  expected: event.target.value,
                                })
                              }
                            >
                              {[
                                "object",
                                "array",
                                "string",
                                "number",
                                "boolean",
                                "null",
                              ].map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className={`${inputClass} font-mono`}
                              value={rule.expected}
                              maxLength={4096}
                              aria-invalid={
                                issues[index] === "invalid-expected"
                              }
                              onChange={(event) =>
                                update(entryId, {
                                  expected: event.target.value,
                                })
                              }
                            />
                          )}
                        </label>
                      ) : null}
                    </div>
                    {issue ? (
                      <p className="mt-2 text-xs text-[color:var(--color-brand-muted)]">
                        {t(`assertions.issue.${issue}`)}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className={`${buttonClass} mt-3`}
                      aria-label={t("assertions.remove", {
                        number: String(index + 1),
                      })}
                      onClick={() => {
                        setEntries((current) =>
                          current.filter((entry) => entry.id !== entryId),
                        );
                        setFeedback(null);
                      }}
                    >
                      {t("assertions.removeButton")}
                    </button>
                  </fieldset>
                );
              })}
            </div>
          </>
        ) : null}
        <p
          id={`${id}-path-help`}
          className="mt-3 text-xs text-[color:var(--color-brand-muted)]"
        >
          {t("assertions.pathHelp")}
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold">
            {t("assertions.transfer")}
          </summary>
          <p className="mt-2 text-xs text-[color:var(--color-brand-muted)]">
            {t("assertions.exportHelp")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!validSet}
              onClick={() => void copy("set")}
            >
              {t("assertions.copySet")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!validSet}
              onClick={() => download("set")}
            >
              {t("assertions.downloadSet")}
            </button>
          </div>
          <label className="mt-3 block text-xs font-bold">
            {t("assertions.importLabel")}
            <textarea
              className={`${inputClass} font-mono`}
              rows={5}
              maxLength={MAX_ASSERTION_IMPORT_BYTES}
              value={importText}
              aria-invalid={Boolean(importIssue)}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportIssue(null);
              }}
            />
          </label>
          <button
            type="button"
            className={`${buttonClass} mt-2`}
            disabled={!importText.trim()}
            onClick={appendImport}
          >
            {t("assertions.import")}
          </button>
          {importIssue ? (
            <p role="alert" className="mt-2 text-xs">
              {t(`assertions.import.${importIssue}`)}
            </p>
          ) : null}
        </details>
        {report ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => void copy("report")}
            >
              {t("assertions.copyReport")}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => download("report")}
            >
              {t("assertions.downloadReport")}
            </button>
          </div>
        ) : null}
        {currentFeedback ? (
          <p
            role={currentFeedback.error ? "alert" : undefined}
            aria-live="polite"
            className="mt-2 text-xs"
          >
            {t(currentFeedback.key)}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-[color:var(--color-brand-muted)]">
          {t("assertions.limits")}
        </p>
      </section>
    </details>
  );
});
