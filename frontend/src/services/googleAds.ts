const GOOGLE_ADS_CONVERSION_LABEL = "AW-814958967/poQGCLu-5-scEPeSzYQD";
const GOOGLE_ADS_TAG_ID = "AW-814958967";
const GOOGLE_ANALYTICS_ID = "G-MY7R9EMSGX";
// One gtag.js serves both tags; it loads only after a consent that needs it.
const GOOGLE_TAG_SCRIPT_ID = "vinaris-google-tag";
const SUBSCRIPTION_CONVERSION_VALUES = {
  monthly: 6,
  annual: 60,
  ai_credits: 5,
} as const;
let marketingEnabled = false;
const configuredTags = new Set<string>();

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

function configureTag(tagId: string) {
  if (configuredTags.has(tagId)) return;
  configuredTags.add(tagId);
  gtag("config", tagId);
}

export function updateGoogleConsent({ marketing, analytics }: { marketing: boolean; analytics: boolean }) {
  marketingEnabled = marketing;
  const ads = marketing ? "granted" : "denied";
  gtag("consent", "update", {
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
    analytics_storage: analytics ? "granted" : "denied",
  });
  if (!marketing) clearGoogleCookies("_gcl");
  if (!analytics) clearGoogleCookies("_ga");
  if (!marketing && !analytics) return;
  if (!document.getElementById(GOOGLE_TAG_SCRIPT_ID)) {
    gtag("js", new Date());
    const script = document.createElement("script");
    script.id = GOOGLE_TAG_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${analytics ? GOOGLE_ANALYTICS_ID : GOOGLE_ADS_TAG_ID}`;
    document.head.append(script);
  }
  if (analytics) configureTag(GOOGLE_ANALYTICS_ID);
  if (marketing) configureTag(GOOGLE_ADS_TAG_ID);
}

export function reportGoogleAdsCheckoutConversion(plan: GoogleAdsCheckoutPlan) {
  if (!marketingEnabled || !document.getElementById(GOOGLE_TAG_SCRIPT_ID)) return;
  gtag("event", "conversion", {
    send_to: GOOGLE_ADS_CONVERSION_LABEL,
    value: SUBSCRIPTION_CONVERSION_VALUES[plan],
    currency: "CHF",
  });
}
