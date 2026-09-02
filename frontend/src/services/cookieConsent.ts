export type CookieConsent = {
  marketing: boolean;
  updatedAt: string;
};

const COOKIE_CONSENT_STORAGE_KEY = "vinaris.cookie-consent";
export const COOKIE_CONSENT_SETTINGS_EVENT = "vinaris:open-cookie-settings";

export function openCookieConsentSettings() {
  window.dispatchEvent(new Event(COOKIE_CONSENT_SETTINGS_EVENT));
}

export function readCookieConsent(): CookieConsent | null {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    return typeof parsed.marketing === "boolean" && typeof parsed.updatedAt === "string"
      ? { marketing: parsed.marketing, updatedAt: parsed.updatedAt }
      : null;
  } catch {
    return null;
  }
}

export function saveCookieConsent(marketing: boolean): CookieConsent {
  const consent = { marketing, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  return consent;
}
