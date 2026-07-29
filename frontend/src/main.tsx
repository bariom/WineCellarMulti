import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./monitor.css";
import { App } from "./App";

const MonitorApp = lazy(() => import("./MonitorApp").then((module) => ({ default: module.MonitorApp })));
const monitorOnly = import.meta.env.VITE_VINARIS_MONITOR === "true";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      {monitorOnly || window.location.pathname.startsWith("/monitor") ? <MonitorApp /> : <App />}
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
