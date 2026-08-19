import { useEffect, useRef, useState } from "react";
import type { Locale } from "../types";
import "./LocalizedDateInput.css";

type LocalizedDateInputProps = {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  disabled?: boolean;
  required?: boolean;
};

function displayDate(value: string, locale: Locale) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const [, year, month, day] = match;
  return locale === "it" ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

function isoDate(value: string, locale: Locale) {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const localizedMatch = /^(\d{2})[/.\-](\d{2})[/.\-](\d{4})$/.exec(value.trim());
  if (!isoMatch && !localizedMatch) return null;
  const year = Number(isoMatch?.[1] || localizedMatch?.[3]);
  const month = Number(isoMatch?.[2] || (locale === "it" ? localizedMatch?.[2] : localizedMatch?.[1]));
  const day = Number(isoMatch?.[3] || (locale === "it" ? localizedMatch?.[1] : localizedMatch?.[2]));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function LocalizedDateInput({ value, onChange, locale, disabled = false, required = false }: LocalizedDateInputProps) {
  const [text, setText] = useState(() => displayDate(value, locale));
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => setText(displayDate(value, locale)), [locale, value]);

  const updateText = (next: string) => {
    setText(next);
    if (!next.trim()) {
      onChange("");
      return;
    }
    const parsed = isoDate(next, locale);
    if (parsed) onChange(parsed);
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker || disabled) return;
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.click();
  };

  return (
    <span className="localized-date-input">
      <input
        type="text"
        value={text}
        onChange={(event) => updateText(event.target.value)}
        onBlur={() => setText(displayDate(value, locale))}
        placeholder={locale === "it" ? "GG/MM/AAAA" : "MM/DD/YYYY"}
        inputMode="numeric"
        maxLength={10}
        disabled={disabled}
        required={required}
        aria-label={locale === "it" ? "Data in formato giorno, mese, anno" : "Date in month, day, year format"}
      />
      <input
        ref={pickerRef}
        className="localized-date-native-picker"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
      />
      <button type="button" className="localized-date-picker-button" onClick={openPicker} disabled={disabled} aria-label={locale === "it" ? "Apri calendario" : "Open calendar"}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v3M17 2v3M3.5 9h17M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /></svg>
      </button>
    </span>
  );
}
