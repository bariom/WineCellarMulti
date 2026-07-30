import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./monitor.css";
import { App } from "./App";

const MonitorApp = lazy(() => import("./MonitorApp").then((module) => ({ default: module.MonitorApp })));
const LegalDocumentView = lazy(() => import("./legal/LegalDocumentView").then((module) => ({ default: module.LegalDocumentView })));
const monitorOnly = import.meta.env.VITE_VINARIS_MONITOR === "true";
const legalDocument = window.location.pathname === "/privacy"
  ? "privacy"
  : window.location.pathname === "/terms"
    ? "terms"
    : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      {legalDocument
        ? <LegalDocumentView kind={legalDocument} />
        : monitorOnly || window.location.pathname.startsWith("/monitor")
          ? <MonitorApp />
          : <App />}
    </Suspense>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation remains optional; the app must keep working if registration fails.
    });
  });
}
