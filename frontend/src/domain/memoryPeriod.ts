import type { Locale } from "../types";

export function memoryMonthBounds(month: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match || Number(match[1]) === 0) return null;
  const year = Number(match[1]);
  const number = Number(match[2]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][number - 1];
  return { from: `${month}-01`, to: `${month}-${days}` };
}

// A browser without native month support exposes a plain text input instead.
export function parseMemoryMonth(value: string, locale: Locale, currentYear = new Date().getFullYear()): string | null {
  const text = value.trim().toLocaleLowerCase(locale);
  if (!text) return "";
  if (memoryMonthBounds(text)) return text;
  const match = /^([\p{L}.]+)(?:\s+(\d{4}))?$/u.exec(text);
  if (!match) return null;
  const year = match[2] || String(currentYear).padStart(4, "0");
  for (let month = 1; month <= 12; month++) {
    const name = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2020, month - 1, 1)).toLocaleLowerCase(locale);
    if (name === match[1]) {
      const normalized = `${year}-${String(month).padStart(2, "0")}`;
      return memoryMonthBounds(normalized) ? normalized : null;
    }
  }
  return null;
}

export function formatMemoryMonth(month: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
}
