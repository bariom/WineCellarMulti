const GOOGLE_ADS_CONVERSION_LABEL = "AW-814958967/poQGCLu-5-scEPeSzYQD";
// The Google tag (AW-814958967 and G-MY7R9EMSGX) is loaded by index.html in consent
// mode with everything denied; the cookie banner only updates that consent.
const SUBSCRIPTION_CONVERSION_VALUES = {
  monthly: 6,
  annual: 60,
  ai_credits: 5,
} as const;

export type GoogleAdsCheckoutPlan = keyof typeof SUBSCRIPTION_CONVERSION_VALUES;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...queuedArgs: unknown[]) => window.dataLayer?.push(queuedArgs));
  window.gtag(...args);
}

function clearGoogleCookies(prefix: string) {
  // Analytics sets its cookies on the parent domain, so clear both scopes.
  const domain = window.location.hostname.replace(/^www\./, "");
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=", 1)[0];
    if (!name.startsWith(prefix)) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${domain}; SameSite=Lax`;
  }
}

export function updateGoogleConsent({ marketing, analytics }: { marketing: boolean; analytics: boolean }) {
  const ads = marketing ? "granted" : "denied";
  gtag("consent", "update", {
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
    analytics_storage: analytics ? "granted" : "denied",
  });
  if (!marketing) clearGoogleCookies("_gcl");
  if (!analytics) clearGoogleCookies("_ga");
}

/** Without marketing consent Google receives this only as a cookieless, anonymous signal. */
export function reportGoogleAdsCheckoutConversion(plan: GoogleAdsCheckoutPlan) {
  gtag("event", "conversion", {
    send_to: GOOGLE_ADS_CONVERSION_LABEL,
    value: SUBSCRIPTION_CONVERSION_VALUES[plan],
    currency: "CHF",
  });
}
