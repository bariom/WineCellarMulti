import { lazy, Suspense, useState } from "react";
import type { Locale } from "../types";
import MemoryTable from "./MemoryTable";
import "./DashboardSummaryWidget.css";
import "./PolaroidsWidget.css";

const MemoryBook = lazy(() => import("../views/MemoryBook"));

export default function PolaroidsWidget({ locale, preview = false, offline = false }: { locale: Locale; preview?: boolean; offline?: boolean }) {
  const it = locale === "it";
  const [selected, setSelected] = useState<number | null>(null);
  return <article className="dashboard-summary polaroids-widget">
    <header><p>{it ? "Vino, amici e storie" : "Wine, friends and stories"}</p><h3>{it ? "Polaroid" : "Polaroids"}</h3></header>
    {offline ? <p>{it ? "Collegati per ritrovare le tue istantanee." : "Connect to revisit your snapshots."}</p>
      : <MemoryTable locale={locale} query="" month="" pageSize={6} preview={preview} onSelect={setSelected} />}
    <footer><button type="button" className="summary-explore" disabled={preview || offline} aria-haspopup="dialog" onClick={() => setSelected(0)}>{it ? "Sfoglia tutti i ricordi" : "Browse all memories"}<span aria-hidden="true">↗</span></button></footer>
    {selected !== null ? <Suspense fallback={<p role="status">{it ? "Caricamento…" : "Loading…"}</p>}><MemoryBook locale={locale} initialIndex={selected} onClose={() => setSelected(null)} /></Suspense> : null}
  </article>;
}
