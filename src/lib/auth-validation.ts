export type AuthFormErrors = {
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LETTER_PATTERN = /\p{L}/u;
const DIGIT_PATTERN = /\p{N}/u;
const SPECIAL_CHARACTER_PATTERN = /[^\p{L}\p{N}\s]/u;

export function validateEmail(email: string) {
  if (!email.trim()) {
    return "Email is required.";
  }

  if (!EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }

  return "";
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

export function validateAuthForm(email: string, password: string) {
  const errors: AuthFormErrors = {};
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);

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
