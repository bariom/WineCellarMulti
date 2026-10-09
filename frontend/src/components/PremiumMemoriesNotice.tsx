import type { Locale } from "../types";
import "./PremiumMemoriesNotice.css";

export default function PremiumMemoriesNotice({ locale, onActivate, polaroids = false }: {
  locale: Locale; onActivate: () => void; polaroids?: boolean;
}) {
  const it = locale === "it";
  return <section className="premium-memories-notice" aria-label={it ? "Ricordi Premium" : "Premium memories"}>
    <span className="premium-memories-badge">Premium</span>
    <h3>{polaroids ? (it ? "Le tue Polaroid" : "Your Polaroids") : (it ? "I miei ricordi" : "My memories")}</h3>
    <p>{it ? "Ritrova le tue serate in un album di foto, esplora le Polaroid e rivivi i luoghi dei tuoi ricordi." : "Rediscover your evenings in a photo album, explore Polaroids and revisit the places behind your memories."}</p>
    <p className="premium-memories-requirement">{it ? "Inclusi nell’abbonamento Vinaris. L’AI Pack non sblocca questa funzione." : "Included in a Vinaris subscription. An AI Pack does not unlock this feature."}</p>
    <button type="button" onClick={onActivate}>{it ? "Scopri l’abbonamento" : "Explore subscription"}</button>
  </section>;
}
