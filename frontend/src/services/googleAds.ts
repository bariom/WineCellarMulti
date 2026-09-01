const GOOGLE_ADS_CONVERSION_LABEL = "AW-814958967/poQGCLu-5-scEPeSzYQD";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function reportGoogleAdsCheckoutConversion() {
  window.gtag?.("event", "conversion", {
    send_to: GOOGLE_ADS_CONVERSION_LABEL,
    value: 1.0,
    currency: "CHF",
  });
}
