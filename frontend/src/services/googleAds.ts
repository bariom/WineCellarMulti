const GOOGLE_ADS_CONVERSION_LABEL = "AW-814958967/poQGCLu-5-scEPeSzYQD";
const GOOGLE_ADS_TAG_ID = "AW-814958967";
const GOOGLE_ADS_SCRIPT_ID = "vinaris-google-ads-tag";
const SUBSCRIPTION_CONVERSION_VALUES = {
  monthly: 6,
  annual: 60,
  ai_credits: 5,
} as const;
let marketingEnabled = false;

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

function clearGoogleAdsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=", 1)[0];
    if (!name.startsWith("_gcl")) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

export function updateGoogleAdsConsent(marketing: boolean) {
  marketingEnabled = marketing;
  const consent = marketing ? "granted" : "denied";
  gtag("consent", "update", {
    ad_storage: consent,
    ad_user_data: consent,
    ad_personalization: consent,
    analytics_storage: "denied",
  });
  if (!marketing) {
    clearGoogleAdsCookies();
    return;
  }
  if (document.getElementById(GOOGLE_ADS_SCRIPT_ID)) return;
  gtag("js", new Date());
  gtag("config", GOOGLE_ADS_TAG_ID);
  const script = document.createElement("script");
  script.id = GOOGLE_ADS_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_TAG_ID}`;
  document.head.append(script);
}

export function reportGoogleAdsCheckoutConversion(plan: GoogleAdsCheckoutPlan) {
  if (!marketingEnabled || !document.getElementById(GOOGLE_ADS_SCRIPT_ID)) return;
  gtag("event", "conversion", {
    send_to: GOOGLE_ADS_CONVERSION_LABEL,
    value: SUBSCRIPTION_CONVERSION_VALUES[plan],
    currency: "CHF",
  });
}
