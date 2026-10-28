import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { readCookieConsent } from "./services/cookieConsent";
import { updateGoogleConsent } from "./services/googleAds";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/hanken-grotesk/wght.css";
import "./tokens.css";
import "./monitor.css";

const storedCookieConsent = readCookieConsent();
if (storedCookieConsent) updateGoogleConsent(storedCookieConsent);

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

// Local module updates must reuse the React root instead of starting another
// application in the same container while the previous tree is still alive.
const root: ReactDOM.Root = import.meta.hot?.data.root
  ?? ReactDOM.createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;

const splash = <div className="vinaris-splash" aria-hidden="true">VINARIS<i /></div>;

root.render(
  <React.StrictMode>
    <Suspense fallback={splash}>
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
