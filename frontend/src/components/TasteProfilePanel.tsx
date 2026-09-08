import { useEffect, useState } from "react";
import type { Locale, TasteProfile, TasteProfileCollection } from "../types";
import { api } from "../services/api";

export function TasteProfilePanel({ locale, variant = "settings" }: { locale: Locale; variant?: "settings" | "insight" }) {
  const italian = locale === "it";
  const insight = variant === "insight";
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
  const labels: Record<string, string> = italian ? {
    body: "Corpo", acidity: "Acidità", tannin: "Tannini", sweetness: "Dolcezza",
    aromatic_intensity: "Intensità aromatica", fruit: "Frutto", wood: "Legno", spice: "Spezie", minerality: "Mineralità",
    preferred_countries: "Paesi preferiti", preferred_regions: "Regioni preferite", preferred_appellations: "Denominazioni preferite",
    preferred_producers: "Produttori preferiti", preferred_grapes: "Uve preferite", preferred_price_ranges: "Fasce di prezzo preferite",
    global: "Generale", red: "Rossi", white: "Bianchi", sparkling: "Spumanti", sweet: "Dolci",
    under_30: "Sotto 30", "30_60": "30–60", over_60: "Oltre 60",
  } : {
    body: "Body", acidity: "Acidity", tannin: "Tannin", sweetness: "Sweetness",
    aromatic_intensity: "Aromatic intensity", fruit: "Fruit", wood: "Wood", spice: "Spice", minerality: "Minerality",
    preferred_countries: "Preferred countries", preferred_regions: "Preferred regions", preferred_appellations: "Preferred appellations",
    preferred_producers: "Preferred producers", preferred_grapes: "Preferred grapes", preferred_price_ranges: "Preferred price ranges",
    global: "Global", red: "Red", white: "White", sparkling: "Sparkling", sweet: "Sweet",
    under_30: "Under 30", "30_60": "30–60", over_60: "Over 60",
  };
  const label = (key: string) => labels[key.toLowerCase()] || key.replace(/_/g, " ");

  async function rebuild() {
    setRebuilding(true);
    try {
      const result = await api<TasteProfileCollection>("/api/v1/taste-profile/me/rebuild", { method: "POST" });
      setProfiles(result.profiles);
    } finally { setRebuilding(false); }
  }

  return <section className={insight ? "dashboard-card taste-profile-panel" : "settings-card settings-card-wide taste-profile-panel"}>
    <div className={insight ? "card-heading" : "settings-card-heading"}>
      <div><span>{italian ? "Approfondimento personale" : "Personal insight"}</span>{insight ? <h2>{italian ? "Il mio gusto" : "My Taste"}</h2> : <h3>{italian ? "Il mio gusto" : "My Taste"}</h3>}</div>
      <button type="button" className="secondary compact" disabled={rebuilding} onClick={() => void rebuild()}>{rebuilding ? (italian ? "Aggiornamento…" : "Updating…") : (italian ? "Aggiorna profilo" : "Refresh profile")}</button>
    </div>
    {loading ? <p className="empty-state">{italian ? "Caricamento profilo…" : "Loading taste profile…"}</p> : !overall ? <p className="empty-state">{italian ? "Valuta alcuni vini degustati per iniziare a costruire il tuo profilo." : "Rate a few wines you have tasted to start building your profile."}</p> : <>
      <p className="settings-card-intro">{italian ? `${overall.sample_count} vini valutati · preferenza ${overall.confidence_level === "established" ? "consolidata" : overall.confidence_level === "probable" ? "probabile" : "in evoluzione"}` : `${overall.sample_count} rated wines · ${overall.confidence_level} preference`}</p>
      <div className="detail-grid">
        {strongest.map(([dimension, value]) => <div className="detail-field" key={dimension}><span>{label(dimension)}</span><strong>{Math.round(value.preference * 100)}%</strong><small>{value.samples} {italian ? "campioni" : "samples"}</small></div>)}
      </div>
      <div className="detail-grid taste-profile-attribute-grid">
        {Object.entries(overall.attributes).filter(([, values]) => values.length).slice(0, 3).map(([kind, values]) => <div key={kind} className="detail-field taste-profile-attribute"><span>{label(kind)}</span><strong>{values.map(([name]) => label(name)).join(", ")}</strong></div>)}
      </div>
      {profiles.filter((profile) => profile.category !== "global").length ? <p className="taste-profile-categories"><strong>{italian ? "Preferenze per tipologia" : "Preferences by wine style"}</strong><span>{profiles.filter((profile) => profile.category !== "global").map((profile) => label(profile.category)).join(" · ")}</span><small>{italian ? "Le degustazioni di ogni tipologia contribuiscono anche a un profilo separato." : "Each style's tastings also contribute to a separate profile."}</small></p> : null}
    </>}
  </section>;
}

export function TasteProfileExplanation({ locale }: { locale: Locale }) {
  const italian = locale === "it";
  return <article className="dashboard-card taste-profile-explanation">
    <div className="card-heading"><div><span>{italian ? "Metodo" : "Method"}</span><h2>{italian ? "Come viene costruito il profilo" : "How your profile is built"}</h2></div></div>
    <div className="taste-profile-method">
        <p>{italian ? "Vinaris usa solo le degustazioni che hai registrato tu. Il voto resta il segnale principale: vicino al valore neutro pesa poco, mentre un voto alto o basso rafforza o riduce l’affinità per le caratteristiche del vino." : "Vinaris uses only the tastings you recorded. Your rating is the main signal: a neutral rating has little effect, while high or low ratings strengthen or reduce affinity for a wine’s characteristics."}</p>
        <ul>
          <li>{italian ? "Le caratteristiche sensoriali (corpo, acidità, tannini e altre) appartengono al vino e sono dati condivisi Vinaris; non vengono generate durante una degustazione o mentre visualizzi questa pagina." : "Sensory characteristics (body, acidity, tannin, and more) belong to the wine and are shared Vinaris data; they are not generated while you rate a wine or view this page."}</li>
          <li>{italian ? "Le informazioni mancanti non valgono zero: vengono semplicemente escluse dal calcolo." : "Missing information is never treated as zero; it is simply excluded from the calculation."}</li>
          <li>{italian ? "Il risultato combina un profilo generale con profili distinti per rossi, bianchi, spumanti e dolci quando ci sono dati sufficienti." : "The result combines an overall profile with separate red, white, sparkling, and sweet profiles when enough data is available."}</li>
          <li>{italian ? "La confidenza cresce con numero, coerenza e qualità dei vini valutati. Il profilo è privato: le valutazioni di altri utenti non lo influenzano." : "Confidence grows with the number, consistency, and quality of rated wines. Your profile is private: other users’ ratings never influence it."}</li>
        </ul>
    </div>
  </article>;
}

export default TasteProfilePanel;
