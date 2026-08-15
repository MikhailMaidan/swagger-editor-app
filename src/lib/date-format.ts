import type { Language } from "./translations";

const DATE_TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
  year: "numeric",
};

// Constructing Intl.DateTimeFormat resolves locale data and isn't free;
// this is called once per row in every history/schemas list render, so the
// two possible formatters are built once and reused instead of rebuilding
// one on every call.
const dateTimeFormatters: Record<Language, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-GB", DATE_TIME_FORMAT_OPTIONS),
  ru: new Intl.DateTimeFormat("ru-RU", DATE_TIME_FORMAT_OPTIONS),
};

export function formatEuropeanDateTime(value: string, language: Language) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatters[language].format(date);
}
