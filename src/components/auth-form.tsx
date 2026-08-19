"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  AuthFormErrors,
  hasAuthFormErrors,
  validateAuthForm,
} from "@/lib/auth-validation";
import { saveClientAuth } from "@/lib/client-auth";
import type { TranslationKey } from "@/lib/translations";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
};

const authErrorKeys: Record<string, TranslationKey> = {
  "Email is required.": "auth.errors.emailRequired",
  "Enter a valid email address.": "auth.errors.emailInvalid",
  "Password is required.": "auth.errors.passwordRequired",
  "Password must contain at least 8 characters.": "auth.errors.passwordLength",
  "Password must contain at least one digit.": "auth.errors.passwordDigit",
  "Password must contain at least one letter.": "auth.errors.passwordLetter",
  "Password must contain at least one special character.":
    "auth.errors.passwordSpecial",
};

export function AuthForm({ mode }: AuthFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<AuthFormErrors>({});

  const isSignIn = mode === "sign-in";
  const title = isSignIn ? t("auth.signIn") : t("auth.signUp");
  const helperText = isSignIn ? t("auth.signInHelper") : t("auth.signUpHelper");

  function getErrorMessage(error?: string) {
    if (!error) {
      return "";
    }

    const errorKey = authErrorKeys[error];

    return errorKey ? t(errorKey) : error;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formErrors = validateAuthForm(email, password, mode);
    setErrors(formErrors);

    if (hasAuthFormErrors(formErrors)) {
      return;
    }

    saveClientAuth(email.trim());
    router.push("/");
    router.refresh();
  }

  return (
    <section className="mx-auto flex w-full max-w-[520px] flex-1 items-center px-4 py-12">
      <form
        className="w-full rounded-[28px] border border-[color:var(--color-brand-border)] bg-white p-8 shadow-[0_18px_45px_rgba(64,45,137,0.12)]"
        noValidate
        onSubmit={handleSubmit}
      >
        <p className="text-sm font-extrabold uppercase text-[color:var(--color-brand-purple)]">
          {t("auth.account")}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold text-[color:var(--color-brand-navy)]">
          {title}
        </h1>
        <p className="mt-3 text-base font-medium leading-7 text-[color:var(--color-brand-muted)]">
          {helperText}
        </p>

        <div className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
            {t("auth.email")}
            <input
              autoComplete="email"
              className="h-12 rounded-2xl border border-[color:var(--color-brand-border)] px-4 text-base font-medium outline-none transition focus:border-[color:var(--color-brand-purple)]"
              name="email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((currentErrors) => ({
                  ...currentErrors,
                  email: undefined,
                }));
              }}
              placeholder="alex@example.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              required
            />
            {errors.email ? (
              <span
                className="text-sm font-semibold text-red-600"
                id="email-error"
                role="alert"
              >
                {getErrorMessage(errors.email)}
              </span>
            ) : null}
          </label>

          <div className="flex flex-col gap-2 text-sm font-bold text-[color:var(--color-brand-navy)]">
            <label htmlFor="auth-password">{t("auth.password")}</label>
            <div className="relative">
              <input
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                aria-invalid={Boolean(errors.password)}
                autoComplete={isSignIn ? "current-password" : "new-password"}
                className="h-12 w-full rounded-2xl border border-[color:var(--color-brand-border)] px-4 pr-24 text-base font-medium outline-none transition focus:border-[color:var(--color-brand-purple)]"
                id="auth-password"
                minLength={8}
                name="password"
                placeholder={t("auth.passwordPlaceholder")}
                required
                type={isPasswordVisible ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((currentErrors) => ({
                    ...currentErrors,
                    password: undefined,
                  }));
                }}
              />
              <button
                aria-label={
                  isPasswordVisible
                    ? t("auth.hidePassword")
                    : t("auth.showPassword")
                }
                aria-pressed={isPasswordVisible}
                className="absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-xl px-3 text-sm font-extrabold text-[color:var(--color-brand-purple)] transition hover:bg-[color:var(--color-brand-soft)]"
                type="button"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
              >
                {isPasswordVisible
                  ? t("auth.hidePasswordShort")
                  : t("auth.showPasswordShort")}
              </button>
            </div>
            {errors.password ? (
              <span
                className="text-sm font-semibold text-red-600"
                id="password-error"
                role="alert"
              >
                {getErrorMessage(errors.password)}
              </span>
            ) : null}
          </div>
        </div>

        <button
          className="mt-7 h-12 w-full rounded-2xl bg-[linear-gradient(135deg,var(--color-brand-purple),var(--color-brand-purple-dark))] text-base font-extrabold text-white shadow-[0_12px_26px_rgba(90,45,255,0.26)] transition hover:translate-y-[-1px]"
          type="submit"
        >
          {title}
        </button>

        <p className="mt-5 text-center text-sm font-semibold text-[color:var(--color-brand-muted)]">
          {isSignIn ? t("auth.needAccount") : t("auth.alreadyHaveAccount")}{" "}
          <Link
            href={isSignIn ? "/sign-up" : "/sign-in"}
            className="text-[color:var(--color-brand-purple)]"
          >
            {isSignIn ? t("auth.signUp") : t("auth.signIn")}
          </Link>
        </p>
      </form>
    </section>
  );
}
