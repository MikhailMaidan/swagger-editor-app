export type AuthFormErrors = {
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LETTER_PATTERN = /\p{L}/u;
const DIGIT_PATTERN = /\p{N}/u;
const SPECIAL_CHARACTER_PATTERN = /[^\p{L}\p{N}\s]/u;

export function validateEmail(email: string) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return "Email is required.";
  }

  // EMAIL_PATTERN's character classes exclude whitespace entirely, so
  // testing the untrimmed value would reject a perfectly valid address that
  // merely picked up a leading/trailing space from autofill or paste.
  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return "Enter a valid email address.";
  }

  return "";
}

function validateSignInPassword(password: string) {
  return password ? "" : "Password is required.";
}

export function validatePassword(password: string) {
  if (!password) {
    return "Password is required.";
  }

  if (password.length < 8) {
    return "Password must contain at least 8 characters.";
  }

  if (!LETTER_PATTERN.test(password)) {
    return "Password must contain at least one letter.";
  }

  if (!DIGIT_PATTERN.test(password)) {
    return "Password must contain at least one digit.";
  }

  if (!SPECIAL_CHARACTER_PATTERN.test(password)) {
    return "Password must contain at least one special character.";
  }

  return "";
}

export function validateAuthForm(
  email: string,
  password: string,
  mode: "sign-in" | "sign-up" = "sign-up",
) {
  const errors: AuthFormErrors = {};
  const emailError = validateEmail(email);
  // This demo never checks a sign-in password against anything stored (the
  // auth token is derived from the email alone), so enforcing the sign-up
  // complexity policy here only blocks a returning user from signing in
  // with whatever password they actually used - the check on this path is
  // just "did they type something at all".
  const passwordError =
    mode === "sign-in"
      ? validateSignInPassword(password)
      : validatePassword(password);

  if (emailError) {
    errors.email = emailError;
  }

  if (passwordError) {
    errors.password = passwordError;
  }

  return errors;
}

export function hasAuthFormErrors(errors: AuthFormErrors) {
  return Boolean(errors.email || errors.password);
}
