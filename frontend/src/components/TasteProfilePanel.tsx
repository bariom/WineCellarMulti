import { useEffect, useState } from "react";
import type { Locale, TasteProfile, TasteProfileCollection } from "../types";
import { api } from "../services/api";

export function TasteProfilePanel({ locale }: { locale: Locale }) {
  const italian = locale === "it";
  const [profiles, setProfiles] = useState<TasteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const load = () => api<TasteProfileCollection>("/api/v1/taste-profile/me")
    .then((result) => setProfiles(result.profiles))
    .finally(() => setLoading(false));

  useEffect(() => { void load(); }, []);
  const overall = profiles.find((profile) => profile.category === "global");
  const strongest = overall ? Object.entries(overall.dimensions)
    .sort(([, first], [, second]) => second.preference - first.preference)
    .slice(0, 4) : [];
  const label = (key: string) => key.replace(/_/g, " ");

  async function rebuild() {
    setRebuilding(true);
    try {
      const result = await api<TasteProfileCollection>("/api/v1/taste-profile/me/rebuild", { method: "POST" });
      setProfiles(result.profiles);
    } finally { setRebuilding(false); }
  }

  return <section className="settings-card settings-card-wide">
    <div className="settings-card-heading">
      <div><span>{italian ? "Preferenze personali" : "Personal preferences"}</span><h3>{italian ? "Il mio gusto" : "My Taste"}</h3></div>
      <button type="button" className="secondary compact" disabled={rebuilding} onClick={() => void rebuild()}>{rebuilding ? (italian ? "Aggiornamento…" : "Updating…") : (italian ? "Aggiorna profilo" : "Refresh profile")}</button>
    </div>
    {loading ? <p className="empty-state">{italian ? "Caricamento profilo…" : "Loading taste profile…"}</p> : !overall ? <p className="empty-state">{italian ? "Valuta alcuni vini degustati per iniziare a costruire il tuo profilo." : "Rate a few wines you have tasted to start building your profile."}</p> : <>
      <p className="settings-card-intro">{italian ? `${overall.sample_count} vini valutati · preferenza ${overall.confidence_level === "established" ? "consolidata" : overall.confidence_level === "probable" ? "probabile" : "in evoluzione"}` : `${overall.sample_count} rated wines · ${overall.confidence_level} preference`}</p>
      <div className="detail-grid">
        {strongest.map(([dimension, value]) => <div className="detail-field" key={dimension}><span>{label(dimension)}</span><strong>{Math.round(value.preference * 100)}%</strong><small>{value.samples} {italian ? "campioni" : "samples"}</small></div>)}
      </div>
      {Object.entries(overall.attributes).filter(([, values]) => values.length).slice(0, 3).map(([kind, values]) => <p key={kind} className="empty-state"><strong>{label(kind.replace("preferred_", ""))}:</strong> {values.map(([name]) => name).join(", ")}</p>)}
      {profiles.filter((profile) => profile.category !== "global").length ? <p className="empty-state">{italian ? "Profili per categoria: " : "Profiles by category: "}{profiles.filter((profile) => profile.category !== "global").map((profile) => profile.category).join(", ")}</p> : null}
    </>}
  </section>;
}

export default TasteProfilePanel;
