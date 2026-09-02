import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { readCookieConsent } from "./services/cookieConsent";
import { updateGoogleAdsConsent } from "./services/googleAds";
import "./monitor.css";

const storedCookieConsent = readCookieConsent();
if (storedCookieConsent) updateGoogleAdsConsent(storedCookieConsent.marketing);

const monitorOnly = import.meta.env.VITE_VINARIS_MONITOR === "true";
const App = monitorOnly
  ? null
  : lazy(() => import("./App").then((module) => ({ default: module.App })));
const MonitorApp = lazy(() => import("./MonitorApp").then((module) => ({ default: module.MonitorApp })));
const LegalDocumentView = lazy(() => import("./legal/LegalDocumentView").then((module) => ({ default: module.LegalDocumentView })));
const PublicRestaurantWineList = lazy(() => import("./views/PublicRestaurantWineList").then((module) => ({ default: module.PublicRestaurantWineList })));
const publicWineListToken = window.location.pathname.match(/^\/wine-list\/([A-Za-z0-9_-]+)$/)?.[1] || null;
const legalDocument = window.location.pathname === "/privacy"
  ? "privacy"
  : window.location.pathname === "/terms"
    ? "terms"
    : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      {publicWineListToken
        ? <PublicRestaurantWineList token={publicWineListToken} />
        : legalDocument
        ? <LegalDocumentView kind={legalDocument} />
        : monitorOnly || window.location.pathname.startsWith("/monitor")
          ? <MonitorApp />
          : App ? <App /> : null}
    </Suspense>
    <CookieConsentBanner />
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation remains optional; the app must keep working if registration fails.
    });
  });
}
