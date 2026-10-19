"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  JWT_ALGORITHMS,
  MAX_JWT_CASES,
  MAX_JWT_KEYS,
  MAX_JWT_PROJECT_BYTES,
  demoJwtProject,
  emptyJwtProject,
  exportJwtPem,
  generateJwtKeys,
  importJwtPem,
  inspectJwt,
  jwtCanSign,
  jwtCanVerify,
  jwtCasesReport,
  jwtError,
  JwtError,
  jwtKeyKind,
  jwtPublicJwks,
  jwtPublicKey,
  jwtSecretKey,
  jwtThumbprint,
  jwtVerificationReport,
  normalizeJwtCase,
  normalizeJwtPolicy,
  parseJwtKeys,
  parseJwtProject,
  runJwtCases,
  serializeJwtProject,
  signJwt,
  validateJwtKeys,
  verifyJwt,
  type JwtAlgorithm,
  type JwtCase,
  type JwtCaseResult,
  type JwtInspection,
  type JwtKey,
  type JwtPolicy,
  type JwtProject,
  type JwtVerification,
} from "@/lib/jwt-studio";
import type { TranslationKey } from "@/lib/translations";

const buttonClass =
  "rounded-lg border border-[color:var(--color-brand-border)] bg-white px-3 py-2 text-xs font-bold hover:border-[color:var(--color-brand-purple)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-[color:var(--color-brand-border)] bg-white p-2 text-xs";
const json = (value: unknown) => JSON.stringify(value, null, 2);
const newCase = (token = ""): JwtCase => ({
  id: crypto.randomUUID(),
  name: "Verification case",
  token,
  keyId: "",
  expected: "accepted",
});
type Job =
  | "demo"
  | "read"
  | "keys"
  | "verify"
  | "sign"
  | "batch"
  | "export"
  | "fingerprint";

type PolicyDraft = Omit<
  JwtPolicy,
  "toleranceSeconds" | "maxAgeSeconds" | "nowSeconds"
> & {
  toleranceSeconds: string;
  maxAgeSeconds: string;
  nowSeconds: string;
};
const draftPolicy = (policy: JwtPolicy): PolicyDraft => ({
  ...policy,
  toleranceSeconds: String(policy.toleranceSeconds),
  maxAgeSeconds: String(policy.maxAgeSeconds),
  nowSeconds: policy.nowSeconds === null ? "" : String(policy.nowSeconds),
});

export const JwtStudioPanel = memo(function JwtStudioPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(emptyJwtProject);
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft>(() =>
    draftPolicy(emptyJwtProject().policy),
  );
  const [inspection, setInspection] = useState<JwtInspection | null>(null),
    [verification, setVerification] = useState<JwtVerification | null>(null);
  const [keyId, setKeyId] = useState(""),
    [signingId, setSigningId] = useState(""),
    [verificationId, setVerificationId] = useState("");
  const [keySource, setKeySource] = useState(""),
    [keyName, setKeyName] = useState("Local signing key"),
    [keyKid, setKeyKid] = useState("local-key");
  const [keyAlgorithm, setKeyAlgorithm] = useState<JwtAlgorithm>("RS256"),
    [keyFormat, setKeyFormat] = useState("jwk");
  const [reveal, setReveal] = useState(false),
    [thumbprint, setThumbprint] = useState("");
  const [headerSource, setHeaderSource] = useState('{"typ":"JWT"}'),
    [claimsSource, setClaimsSource] = useState('{"sub":"example-user"}');
  const [caseId, setCaseId] = useState(""),
    [caseDraft, setCaseDraft] = useState(newCase),
    [caseDirty, setCaseDirty] = useState(false);
  const [results, setResults] = useState<JwtCaseResult[]>([]),
    [completed, setCompleted] = useState(0),
    [caseSearch, setCaseSearch] = useState("");
  const [includeSigningKeys, setIncludeSigningKeys] = useState(false);
  const [busy, setBusy] = useState<Job | null>(null),
    [feedback, setFeedback] = useState<{
      key: TranslationKey;
      error: boolean;
    } | null>(null);
  const generation = useRef(0),
    abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      abort.current?.abort();
    },
    [],
  );
  const policyDirty = json(policyDraft) !== json(draftPolicy(project.policy)),
    pending = policyDirty || caseDirty || !!keySource;
  const selectedKey =
    project.keys.find((k) => k.id === keyId) ?? project.keys[0];
  const signingKey =
    project.keys.find((k) => k.id === signingId && jwtCanSign(k)) ??
    project.keys.find(jwtCanSign);
  const verifyId = project.keys.some(
    (k) => k.id === verificationId && jwtCanVerify(k),
  )
    ? verificationId
    : "";
  const savedCase = project.cases.find((c) => c.id === caseId);
  const terms = caseSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleCases = project.cases.filter((c) =>
    terms.every((term) =>
      `${c.name} ${c.expected} ${results.find((r) => r.id === c.id)?.status ?? ""}`
        .toLowerCase()
        .includes(term),
    ),
  );
  const hiddenKeyCount = project.keys.filter(
    (k) => jwtKeyKind(k) !== "public",
  ).length;
  function fail(error: unknown) {
    setFeedback({
      key: `jwtStudio.error.${jwtError(error).code}`,
      error: true,
    });
  }
  function invalidate() {
    setInspection(null);
    setVerification(null);
    setResults([]);
    setCompleted(0);
    setFeedback(null);
  }
  function editProject(next: JwtProject) {
    setProject(next);
    invalidate();
  }
  function setToken(token: string) {
    setProject({ ...project, token });
    setInspection(null);
    setVerification(null);
    setFeedback(null);
  }
  function syncCase(c?: JwtCase) {
    setCaseId(c?.id ?? "");
    setCaseDraft(c ?? newCase());
    setCaseDirty(false);
  }
  function accept(next: JwtProject) {
    setProject(next);
    setPolicyDraft(draftPolicy(next.policy));
    setKeyId(next.keys[0]?.id ?? "");
    setSigningId("");
    setVerificationId("");
    setKeySource("");
    setReveal(false);
    setThumbprint("");
    setIncludeSigningKeys(false);
    syncCase(next.cases[0]);
    setCaseSearch("");
    setHeaderSource('{"typ":"JWT"}');
    setClaimsSource('{"sub":"example-user"}');
    invalidate();
  }
  async function task<T>(
    kind: Job,
    work: (signal: AbortSignal) => Promise<T>,
    apply: (value: T) => void,
  ) {
    const token = ++generation.current,
      cancellation = new AbortController();
    abort.current = cancellation;
    setBusy(kind);
    setFeedback(null);
    try {
      const value = await work(cancellation.signal);
      if (token === generation.current) apply(value);
    } catch (error) {
      if (token === generation.current) fail(error);
    } finally {
      if (token === generation.current) {
        setBusy(null);
        abort.current = null;
      }
    }
  }
  function addKeys(keys: JwtKey[]) {
    const next = parseJwtProject(
      json({ ...project, keys: [...project.keys, ...keys] }),
    );
    editProject(next);
    setKeyId(keys[0].id);
    setSigningId(keys.find(jwtCanSign)?.id ?? "");
    setReveal(false);
    setThumbprint("");
    setKeySource("");
    setFeedback({ key: "jwtStudio.keysAdded", error: false });
  }
  function importKeys() {
    void task(
      "keys",
      async () => {
        const keys =
          keyFormat === "pem"
            ? await importJwtPem(keySource, keyAlgorithm, keyName, keyKid)
            : keyFormat === "utf8" || keyFormat === "base64url"
              ? [jwtSecretKey(keySource, keyFormat, keyName, keyKid)]
              : parseJwtKeys(keySource, keyAlgorithm, keyName);
        if (keys.length + project.keys.length > MAX_JWT_KEYS)
          throw new JwtError("limit");
        await validateJwtKeys(keys);
        return keys;
      },
      addKeys,
    );
  }
  function generate() {
    void task(
      "keys",
      async () => {
        const keys = await generateJwtKeys(keyAlgorithm, keyName, keyKid);
        if (keys.length + project.keys.length > MAX_JWT_KEYS)
          throw new JwtError("limit");
        return keys;
      },
      addKeys,
    );
  }
  function decode() {
    try {
      setInspection(inspectJwt(project.token));
      setVerification(null);
      setFeedback({ key: "jwtStudio.decoded", error: false });
    } catch (error) {
      setInspection(null);
      setVerification(null);
      fail(error);
    }
  }
  function verify() {
    void task(
      "verify",
      () => verifyJwt(project.token, project.keys, project.policy, verifyId),
      (value) => {
        try {
          setInspection(inspectJwt(project.token));
        } catch {
          setInspection(null);
        }
        setVerification(value);
      },
    );
  }
  function savePolicy() {
    try {
      const policy = normalizeJwtPolicy({
        ...policyDraft,
        toleranceSeconds: Number(policyDraft.toleranceSeconds),
        maxAgeSeconds: Number(policyDraft.maxAgeSeconds),
        nowSeconds: policyDraft.nowSeconds.trim()
          ? Number(policyDraft.nowSeconds)
          : null,
      });
      editProject({ ...project, policy });
      setPolicyDraft(draftPolicy(policy));
      setFeedback({ key: "jwtStudio.policySaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function saveCase() {
    try {
      const c = normalizeJwtCase(caseDraft),
        cases = savedCase
          ? project.cases.map((previous) =>
              previous.id === caseId ? c : previous,
            )
          : [...project.cases, c];
      const next = parseJwtProject(json({ ...project, cases }));
      editProject(next);
      syncCase(c);
      setFeedback({ key: "jwtStudio.caseSaved", error: false });
    } catch (error) {
      fail(error);
    }
  }
  function fileRead(file: File, kind: "project" | "key") {
    void task(
      "read",
      async () => {
        if (
          file.size > (kind === "project" ? MAX_JWT_PROJECT_BYTES : 256 * 1024)
        )
          throw new JwtError("limit");
        const text = await file.text();
        if (kind === "key") return text;
        const next = parseJwtProject(text);
        await validateJwtKeys(next.keys);
        return next;
      },
      (value) => {
        if (typeof value === "string") {
          setKeySource(value);
          setFeedback({ key: "jwtStudio.keyFileLoaded", error: false });
        } else {
          accept(value);
          setFeedback({ key: "jwtStudio.projectLoaded", error: false });
        }
      },
    );
  }
  function saveDownload(
    content: string,
    suffix: string,
    extension = "json",
    mime = "application/json",
  ) {
    const fileName =
      project.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) ||
      "jwt-workspace";
    const ok = downloadTextFile(
      content,
      `${fileName}-${suffix}.${extension}`,
      mime,
    );
    setFeedback({
      key: ok ? "jwtStudio.downloaded" : "jwtStudio.downloadFailed",
      error: !ok,
    });
  }
  function download(
    kind: "project" | "jwks" | "key" | "token" | "report" | "cases",
  ) {
    try {
      if (kind === "project")
        saveDownload(
          serializeJwtProject(project, includeSigningKeys),
          "project",
        );
      else if (kind === "jwks")
        saveDownload(jwtPublicJwks(project.keys), "public-jwks");
      else if (kind === "key" && selectedKey)
        saveDownload(
          json(
            includeSigningKeys
              ? selectedKey.jwk
              : jwtPublicKey(selectedKey).jwk,
          ),
          "selected-key",
        );
      else if (kind === "token")
        saveDownload(project.token, "token", "txt", "text/plain");
      else if (kind === "report" && verification)
        saveDownload(json(jwtVerificationReport(verification)), "verification");
      else if (kind === "cases")
        saveDownload(
          json(jwtCasesReport(results, project.cases.length)),
          "cases-report",
        );
    } catch (error) {
      fail(error);
    }
  }
  function downloadPem(privateKey = false) {
    if (selectedKey)
      void task(
        "export",
        () => exportJwtPem(selectedKey, privateKey),
        (pem) =>
          saveDownload(
            pem,
            privateKey ? "private-key" : "public-key",
            "pem",
            "application/x-pem-file",
          ),
      );
  }
  function copy(header = false) {
    void task(
      "export",
      async () => {
        if (header) inspectJwt(project.token);
        return writeTextToClipboard(
          header ? `Authorization: Bearer ${project.token}` : project.token,
        );
      },
      (ok) =>
        setFeedback({
          key: ok ? "jwtStudio.copied" : "jwtStudio.copyFailed",
          error: !ok,
        }),
    );
  }
  const button = (
    key: TranslationKey,
    action: () => void,
    disabled = false,
  ) => (
    <button
      type="button"
      className={buttonClass}
      onClick={action}
      disabled={disabled}
    >
      {t(key)}
    </button>
  );
  const field = (
    key: TranslationKey,
    value: string | number,
    change: (value: string) => void,
    multiline = false,
    disabled = false,
  ) => (
    <label className="block text-xs font-semibold">
      {t(key)}
      {multiline ? (
        <textarea
          className={`${inputClass} font-mono`}
          rows={5}
          spellCheck={false}
          value={value}
          onChange={(e) => change(e.target.value)}
          disabled={disabled}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          onChange={(e) => change(e.target.value)}
          disabled={disabled}
        />
      )}
    </label>
  );
  const editPolicy = (patch: Partial<PolicyDraft>) => {
    setPolicyDraft({ ...policyDraft, ...patch });
    invalidate();
  };
  const editCase = (patch: Partial<JwtCase>) => {
    setCaseDraft({ ...caseDraft, ...patch });
    setCaseDirty(true);
    setResults([]);
    setCompleted(0);
    setFeedback(null);
  };

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-2xl border border-[color:var(--color-brand-border)] bg-white/80 p-4"
    >
      <summary className="cursor-pointer text-sm font-bold text-[color:var(--color-brand-navy)]">
        {t("jwtStudio.title")}
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-600">{t("jwtStudio.description")}</p>
          <p className="text-xs text-slate-600">{t("jwtStudio.help")}</p>
          {feedback && (
            <p
              className="break-words text-xs"
              role={feedback.error ? "alert" : "status"}
            >
              {t(feedback.key)}
            </p>
          )}
          {busy && (
            <div className="flex flex-wrap items-center gap-2">
              <p role="status" className="text-xs">
                {t("jwtStudio.busy", {
                  count: String(completed),
                  total: String(project.cases.length),
                })}
              </p>
              {button("jwtStudio.cancel", () => {
                abort.current?.abort();
                if (busy !== "batch") {
                  generation.current++;
                  setBusy(null);
                }
                setFeedback({ key: "jwtStudio.cancelled", error: false });
              })}
            </div>
          )}
          <fieldset disabled={!!busy} className="space-y-4">
            <fieldset
              disabled={pending}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("jwtStudio.project")}
              </legend>
              {field("jwtStudio.projectName", project.name, (name) =>
                editProject({ ...project, name }),
              )}
              <div className="flex flex-wrap gap-2">
                {button("jwtStudio.newProject", () =>
                  accept(emptyJwtProject()),
                )}
                {button(
                  "jwtStudio.demo",
                  () =>
                    void task(
                      "demo",
                      () => demoJwtProject(),
                      (next) => {
                        accept(next);
                        setFeedback({
                          key: "jwtStudio.demoLoaded",
                          error: false,
                        });
                      },
                    ),
                )}
                <label className="text-xs font-semibold">
                  {t("jwtStudio.importProject")}
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="mt-1 block max-w-full text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) fileRead(file, "project");
                    }}
                  />
                </label>
              </div>
            </fieldset>
            <section
              className="space-y-3 rounded-xl border p-3"
              aria-label={t("jwtStudio.tokenSection")}
            >
              <h3 className="text-sm font-bold">
                {t("jwtStudio.tokenSection")}
              </h3>
              {field("jwtStudio.token", project.token, setToken, true)}
              <label className="block text-xs font-semibold">
                {t("jwtStudio.verificationKey")}
                <select
                  className={inputClass}
                  value={verifyId}
                  disabled={pending}
                  onChange={(e) => {
                    setVerificationId(e.target.value);
                    setVerification(null);
                  }}
                >
                  <option value="">{t("jwtStudio.autoKey")}</option>
                  {project.keys.filter(jwtCanVerify).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} · {k.algorithm}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {button("jwtStudio.decode", decode, !project.token)}
                {button("jwtStudio.verify", verify, pending || !project.token)}
                {button("jwtStudio.copyToken", () => copy(), !project.token)}
                {button(
                  "jwtStudio.copyHeader",
                  () => copy(true),
                  !project.token,
                )}
                {button(
                  "jwtStudio.downloadToken",
                  () => download("token"),
                  !project.token,
                )}
              </div>
              {inspection && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p role="status" className="text-xs">
                    {t("jwtStudio.decodedOnly")}
                  </p>
                  <p className="text-xs">
                    {t("jwtStudio.decodedSizes", {
                      header: String(inspection.headerBytes),
                      claims: String(inspection.claimsBytes),
                      signature: String(inspection.signature.length),
                    })}
                  </p>
                  <label className="block text-xs font-semibold">
                    {t("jwtStudio.decodedHeader")}
                    <textarea
                      readOnly
                      rows={5}
                      className={`${inputClass} font-mono`}
                      value={json(inspection.header)}
                    />
                  </label>
                  <label className="block text-xs font-semibold">
                    {t("jwtStudio.decodedClaims")}
                    <textarea
                      readOnly
                      rows={7}
                      className={`${inputClass} font-mono`}
                      value={json(inspection.claims)}
                    />
                  </label>
                  <dl className="space-y-1 text-xs">
                    {["iat", "nbf", "exp"].map((claim) => {
                      const value = inspection.claims[claim];
                      if (typeof value !== "number") return null;
                      const date = new Date(value * 1000);
                      return (
                        <div key={claim} className="flex flex-wrap gap-2">
                          <dt>{claim}</dt>
                          <dd>
                            {Number.isFinite(date.getTime())
                              ? date.toISOString()
                              : t("jwtStudio.dateOutsideRange")}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              )}
              {verification && (
                <div
                  className="space-y-2 rounded-lg border p-3"
                  aria-label={t("jwtStudio.verificationResult")}
                >
                  <p role="status" className="text-sm font-bold">
                    {t("jwtStudio.verificationSummary", {
                      status: t(`jwtStudio.outcome.${verification.status}`),
                      signature: t(`jwtStudio.check.${verification.signature}`),
                      claims: t(`jwtStudio.check.${verification.claims}`),
                    })}
                  </p>
                  <p className="text-xs">
                    {t("jwtStudio.checkedAt", {
                      time: String(verification.checkedAt),
                      algorithm: verification.algorithm || "—",
                    })}
                  </p>
                  <ul className="space-y-1 text-xs">
                    {verification.findings.map((f, i) => (
                      <li key={i}>
                        {t(`jwtStudio.finding.${f.code}`)}
                        {f.claim && ` · ${f.claim}`}
                      </li>
                    ))}
                  </ul>
                  {button(
                    "jwtStudio.downloadReport",
                    () => download("report"),
                    pending,
                  )}
                </div>
              )}
            </section>
            <fieldset
              disabled={caseDirty || !!keySource}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("jwtStudio.policy")}
              </legend>
              <p className="text-xs text-slate-600">
                {t("jwtStudio.policyHelp")}
              </p>
              <fieldset className="flex flex-wrap gap-3">
                <legend className="text-xs font-semibold">
                  {t("jwtStudio.allowedAlgorithms")}
                </legend>
                {JWT_ALGORITHMS.map((alg) => (
                  <label key={alg} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={policyDraft.algorithms.includes(alg)}
                      onChange={(e) =>
                        editPolicy({
                          algorithms: e.target.checked
                            ? [...policyDraft.algorithms, alg]
                            : policyDraft.algorithms.filter((a) => a !== alg),
                        })
                      }
                    />
                    {alg}
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-3 md:grid-cols-2">
                {field("jwtStudio.issuer", policyDraft.issuer, (issuer) =>
                  editPolicy({ issuer }),
                )}
                {field("jwtStudio.audience", policyDraft.audience, (audience) =>
                  editPolicy({ audience }),
                )}
                {field("jwtStudio.subject", policyDraft.subject, (subject) =>
                  editPolicy({ subject }),
                )}
                {field("jwtStudio.type", policyDraft.type, (type) =>
                  editPolicy({ type }),
                )}
                {field(
                  "jwtStudio.tolerance",
                  policyDraft.toleranceSeconds,
                  (value) => editPolicy({ toleranceSeconds: value }),
                )}
                {field("jwtStudio.maxAge", policyDraft.maxAgeSeconds, (value) =>
                  editPolicy({ maxAgeSeconds: value }),
                )}
                {field("jwtStudio.now", policyDraft.nowSeconds, (value) =>
                  editPolicy({
                    nowSeconds: value,
                  }),
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={policyDraft.requireExpiration}
                    onChange={(e) =>
                      editPolicy({ requireExpiration: e.target.checked })
                    }
                  />
                  {t("jwtStudio.requireExpiration")}
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={policyDraft.checkIssuedAt}
                    onChange={(e) =>
                      editPolicy({ checkIssuedAt: e.target.checked })
                    }
                  />
                  {t("jwtStudio.checkIssuedAt")}
                </label>
              </div>
              {policyDirty && (
                <p role="status" className="text-xs">
                  {t("jwtStudio.policyDirty")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {button("jwtStudio.savePolicy", savePolicy, !policyDirty)}
                {button(
                  "jwtStudio.discardPolicy",
                  () => {
                    setPolicyDraft(draftPolicy(project.policy));
                    setFeedback(null);
                  },
                  !policyDirty,
                )}
              </div>
            </fieldset>
            <fieldset
              disabled={policyDirty || caseDirty}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("jwtStudio.keys")}
              </legend>
              <p className="text-xs text-slate-600">
                {t("jwtStudio.keysHelp")}
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {field("jwtStudio.keyName", keyName, setKeyName)}
                {field("jwtStudio.keyKid", keyKid, setKeyKid)}
                <label className="block text-xs font-semibold">
                  {t("jwtStudio.keyAlgorithm")}
                  <select
                    className={inputClass}
                    value={keyAlgorithm}
                    onChange={(e) =>
                      setKeyAlgorithm(e.target.value as JwtAlgorithm)
                    }
                  >
                    {JWT_ALGORITHMS.map((alg) => (
                      <option key={alg}>{alg}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-semibold">
                {t("jwtStudio.keyFormat")}
                <select
                  className={inputClass}
                  value={keyFormat}
                  onChange={(e) => setKeyFormat(e.target.value)}
                >
                  <option value="jwk">JWK / JWKS</option>
                  <option value="pem">PEM (SPKI / PKCS8)</option>
                  <option value="utf8">HS256 UTF-8</option>
                  <option value="base64url">HS256 base64url</option>
                </select>
              </label>
              {field("jwtStudio.keySource", keySource, setKeySource, true)}
              <div className="flex flex-wrap gap-2">
                {button("jwtStudio.addKeys", importKeys, !keySource)}
                {button(
                  "jwtStudio.discardKey",
                  () => {
                    setKeySource("");
                    setFeedback(null);
                  },
                  !keySource,
                )}
                {button(
                  "jwtStudio.generate",
                  generate,
                  !!keySource || project.keys.length >= MAX_JWT_KEYS,
                )}
                <label className="text-xs font-semibold">
                  {t("jwtStudio.importKeyFile")}
                  <input
                    disabled={!!keySource}
                    type="file"
                    accept=".json,.jwk,.pem,.txt,application/json,text/plain"
                    className="mt-1 block max-w-full text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) fileRead(file, "key");
                    }}
                  />
                </label>
              </div>
              <label className="block text-xs font-semibold">
                {t("jwtStudio.selectedKey")}
                <select
                  className={inputClass}
                  value={selectedKey?.id ?? ""}
                  onChange={(e) => {
                    setKeyId(e.target.value);
                    setReveal(false);
                    setThumbprint("");
                  }}
                >
                  <option value="">{t("jwtStudio.noKeys")}</option>
                  {project.keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} · {k.algorithm} ·{" "}
                      {t(`jwtStudio.keyKind.${jwtKeyKind(k)}`)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedKey && (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-xs">
                    {selectedKey.name} · {selectedKey.algorithm} ·{" "}
                    {String(selectedKey.jwk.kid ?? "—")}
                  </p>
                  {jwtKeyKind(selectedKey) !== "public" && (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={reveal}
                        onChange={(e) => setReveal(e.target.checked)}
                      />
                      {t("jwtStudio.reveal")}
                    </label>
                  )}
                  {jwtKeyKind(selectedKey) === "public" || reveal ? (
                    <label className="block text-xs font-semibold">
                      {t("jwtStudio.keyPreview")}
                      <textarea
                        readOnly
                        rows={7}
                        className={`${inputClass} font-mono`}
                        value={json(selectedKey.jwk)}
                      />
                    </label>
                  ) : (
                    <p className="text-xs">{t("jwtStudio.keyHidden")}</p>
                  )}
                  {thumbprint && (
                    <p className="break-all text-xs">
                      {t("jwtStudio.thumbprintValue", { value: thumbprint })}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {button(
                      "jwtStudio.thumbprint",
                      () =>
                        void task(
                          "fingerprint",
                          () => jwtThumbprint(selectedKey),
                          setThumbprint,
                        ),
                      jwtKeyKind(selectedKey) === "secret",
                    )}
                    {button(
                      "jwtStudio.removeKey",
                      () => {
                        editProject({
                          ...project,
                          keys: project.keys.filter(
                            (k) => k.id !== selectedKey.id,
                          ),
                        });
                        setReveal(false);
                        setThumbprint("");
                      },
                      pending,
                    )}
                    {button(
                      "jwtStudio.downloadKey",
                      () => download("key"),
                      !!keySource ||
                        (jwtKeyKind(selectedKey) === "secret" &&
                          !includeSigningKeys),
                    )}
                    {button(
                      "jwtStudio.publicPem",
                      () => downloadPem(),
                      jwtKeyKind(selectedKey) === "secret",
                    )}
                    {button(
                      "jwtStudio.privatePem",
                      () => downloadPem(true),
                      !includeSigningKeys ||
                        jwtKeyKind(selectedKey) !== "private",
                    )}
                  </div>
                </div>
              )}
              {button(
                "jwtStudio.forgetSigning",
                () => {
                  editProject({
                    ...project,
                    keys: project.keys.filter(
                      (k) => jwtKeyKind(k) === "public",
                    ),
                  });
                  setKeySource("");
                  setReveal(false);
                  setThumbprint("");
                  setIncludeSigningKeys(false);
                },
                !hiddenKeyCount && !keySource,
              )}
            </fieldset>
            <fieldset
              disabled={pending}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("jwtStudio.signing")}
              </legend>
              <p className="text-xs text-slate-600">
                {t("jwtStudio.signingHelp")}
              </p>
              <label className="block text-xs font-semibold">
                {t("jwtStudio.signingKey")}
                <select
                  className={inputClass}
                  value={signingKey?.id ?? ""}
                  onChange={(e) => setSigningId(e.target.value)}
                >
                  <option value="">{t("jwtStudio.noSigningKey")}</option>
                  {project.keys.filter(jwtCanSign).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} · {k.algorithm}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {button(
                  "jwtStudio.buildHeader",
                  () => {
                    if (signingKey)
                      setHeaderSource(
                        json({
                          typ: project.policy.type || "JWT",
                          alg: signingKey.algorithm,
                          ...(signingKey.jwk.kid
                            ? { kid: signingKey.jwk.kid }
                            : {}),
                        }),
                      );
                  },
                  !signingKey,
                )}
                {button("jwtStudio.buildClaims", () => {
                  const now = Math.floor(
                    project.policy.nowSeconds ?? Date.now() / 1000,
                  );
                  setClaimsSource(
                    json({
                      sub: project.policy.subject || "example-user",
                      ...(project.policy.issuer
                        ? { iss: project.policy.issuer }
                        : {}),
                      ...(project.policy.audience
                        ? { aud: project.policy.audience }
                        : {}),
                      iat: now,
                      exp: now + 3600,
                    }),
                  );
                })}
              </div>
              {field(
                "jwtStudio.signHeader",
                headerSource,
                setHeaderSource,
                true,
              )}
              {field(
                "jwtStudio.signClaims",
                claimsSource,
                setClaimsSource,
                true,
              )}
              {button(
                "jwtStudio.sign",
                () => {
                  if (signingKey)
                    void task(
                      "sign",
                      () => signJwt(signingKey, headerSource, claimsSource),
                      (token) => {
                        setToken(token);
                        setInspection(inspectJwt(token));
                        setFeedback({ key: "jwtStudio.signed", error: false });
                      },
                    );
                },
                !signingKey,
              )}
              {button(
                "jwtStudio.useDecoded",
                () => {
                  try {
                    const decoded = inspectJwt(project.token);
                    setHeaderSource(json(decoded.header));
                    setClaimsSource(json(decoded.claims));
                  } catch (error) {
                    fail(error);
                  }
                },
                !project.token,
              )}
            </fieldset>
            <fieldset
              disabled={policyDirty || !!keySource}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("jwtStudio.cases")}
              </legend>
              <p className="text-xs text-slate-600">
                {t("jwtStudio.casesHelp")}
              </p>
              <label className="block text-xs font-semibold">
                {t("jwtStudio.selectedCase")}
                <select
                  disabled={caseDirty}
                  className={inputClass}
                  value={caseId}
                  onChange={(e) =>
                    syncCase(project.cases.find((c) => c.id === e.target.value))
                  }
                >
                  <option value="">{t("jwtStudio.newCase")}</option>
                  {project.cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {field("jwtStudio.caseName", caseDraft.name, (name) =>
                editCase({ name }),
              )}
              {field(
                "jwtStudio.caseToken",
                caseDraft.token,
                (token) => editCase({ token }),
                true,
              )}
              <label className="block text-xs font-semibold">
                {t("jwtStudio.caseExpected")}
                <select
                  className={inputClass}
                  value={caseDraft.expected}
                  onChange={(e) =>
                    editCase({
                      expected: e.target.value as JwtCase["expected"],
                    })
                  }
                >
                  <option value="accepted">
                    {t("jwtStudio.outcome.accepted")}
                  </option>
                  <option value="rejected">
                    {t("jwtStudio.outcome.rejected")}
                  </option>
                </select>
              </label>
              <label className="block text-xs font-semibold">
                {t("jwtStudio.caseKey")}
                <select
                  className={inputClass}
                  value={caseDraft.keyId}
                  onChange={(e) => editCase({ keyId: e.target.value })}
                >
                  <option value="">{t("jwtStudio.autoKey")}</option>
                  {caseDraft.keyId &&
                    !project.keys.some(
                      (k) => k.id === caseDraft.keyId && jwtCanVerify(k),
                    ) && (
                      <option value={caseDraft.keyId}>
                        {t("jwtStudio.missingCaseKey")}
                      </option>
                    )}
                  {project.keys.filter(jwtCanVerify).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} · {k.algorithm}
                    </option>
                  ))}
                </select>
              </label>
              {caseDirty && (
                <p role="status" className="text-xs">
                  {t("jwtStudio.caseDirty")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {button(
                  "jwtStudio.currentToCase",
                  () => editCase({ token: project.token }),
                  !project.token,
                )}
                {button(
                  "jwtStudio.saveCase",
                  saveCase,
                  !savedCase && project.cases.length >= MAX_JWT_CASES,
                )}
                {button(
                  "jwtStudio.discardCase",
                  () => {
                    syncCase(savedCase);
                    setFeedback(null);
                  },
                  !caseDirty,
                )}
                {button(
                  "jwtStudio.removeCase",
                  () => {
                    const cases = project.cases.filter((c) => c.id !== caseId);
                    editProject({ ...project, cases });
                    syncCase(cases[0]);
                  },
                  caseDirty || !savedCase,
                )}
                {button(
                  "jwtStudio.loadCase",
                  () => {
                    setToken(caseDraft.token);
                    setVerificationId(caseDraft.keyId);
                  },
                  caseDirty || !savedCase,
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {button(
                  "jwtStudio.runCases",
                  () => {
                    setResults([]);
                    setCompleted(0);
                    void task(
                      "batch",
                      (signal) =>
                        runJwtCases(project, signal, (done) => {
                          if (!signal.aborted) setCompleted(done);
                        }),
                      setResults,
                    );
                  },
                  pending || !project.cases.length,
                )}
                {button(
                  "jwtStudio.downloadCases",
                  () => download("cases"),
                  pending || !results.length,
                )}
              </div>
              {results.length > 0 && (
                <p role="status" className="text-xs">
                  {t("jwtStudio.casesSummary", {
                    completed: String(results.length),
                    total: String(project.cases.length),
                    passed: String(
                      results.filter((r) => r.status === "passed").length,
                    ),
                    failed: String(
                      results.filter((r) => r.status === "failed").length,
                    ),
                  })}
                </p>
              )}
              <label className="block text-xs font-semibold">
                {t("jwtStudio.caseSearch")}
                <input
                  className={inputClass}
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setCaseSearch("");
                    }
                  }}
                />
              </label>
              <ul className="space-y-1 text-xs">
                {visibleCases.map((c) => {
                  const result = results.find((r) => r.id === c.id);
                  return (
                    <li key={c.id} className="break-words">
                      {c.name} · {t(`jwtStudio.outcome.${c.expected}`)}
                      {result && (
                        <>
                          {" "}
                          · {t(`jwtStudio.caseStatus.${result.status}`)}
                          {result.verification.findings.map((f, i) => (
                            <span key={i}>
                              {" "}
                              · {t(`jwtStudio.finding.${f.code}`)}
                            </span>
                          ))}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <fieldset
              disabled={pending}
              className="space-y-3 rounded-xl border p-3"
            >
              <legend className="text-sm font-bold">
                {t("jwtStudio.exports")}
              </legend>
              <p className="text-xs text-slate-600">
                {t("jwtStudio.exportHelp")}
              </p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeSigningKeys}
                  onChange={(e) => setIncludeSigningKeys(e.target.checked)}
                />
                {t("jwtStudio.includeSigning")}
              </label>
              {!includeSigningKeys && (
                <p className="text-xs">
                  {t("jwtStudio.omittedKeys", {
                    count: String(hiddenKeyCount),
                  })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {button("jwtStudio.downloadProject", () => download("project"))}
                {button(
                  "jwtStudio.downloadJwks",
                  () => download("jwks"),
                  !project.keys.some((k) => jwtKeyKind(k) === "public"),
                )}
              </div>
            </fieldset>
          </fieldset>
        </div>
      )}
    </details>
  );
});
