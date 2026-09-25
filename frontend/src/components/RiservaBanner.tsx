import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";

export function RiservaBanner({ locale, onExplore }: { locale: Locale; onExplore: () => void }) {
  const it = locale === "it";
  return <section className="cellar-riserva" aria-label="Vinaris Riserva">
    <p><AppIcon name="star" detailLevel="compact" /> VINARIS <span>RISERVA</span></p>
    <h2>{it ? "Dai spazio alla tua passione." : "Make room for your passion."}</h2>
    <p>{it ? "Una collezione senza limiti. Scopri Riserva e le opzioni AI per conoscere meglio i tuoi vini." : "An unlimited collection. Explore Reserve and AI options to understand your wines better."}</p>
    <button type="button" onClick={onExplore}>{it ? "Scopri Riserva" : "Explore Reserve"} <span aria-hidden="true">→</span></button>
  </section>;
}
