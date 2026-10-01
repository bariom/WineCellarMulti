import type { Locale, TasteProfile, Wine } from "../types";
import { isWinePhysicallyInCellar } from "../domain/cellar";
import "./TasteOrigins.css";

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function TasteOrigins({ profile, wines, locale, onOpenWine }: {
  profile: TasteProfile; wines?: Wine[]; locale: Locale; onOpenWine?: (wine: Wine) => void;
}) {
  const it = locale === "it";
  const regions = profile.attributes.preferred_regions || [];
  const regional = regions.length > 0;
  // Attribute scores are accumulated evidence weights, not ratings or percentages.
  const origins = (regional ? regions : profile.attributes.preferred_countries || [])
    .filter(([name, score]) => name.trim() && Number.isFinite(score) && score > 0)
    .slice().sort((a, b) => b[1] - a[1]).slice(0, 3);
  const stock = (wines || []).filter(wine => wine.quantity > 0 && isWinePhysicallyInCellar(wine));
  const preferredRegions = new Set(regions.map(([name]) => normalize(name)));
  const grapes = (profile.attributes.preferred_grapes || [])
    .filter(([, score]) => Number.isFinite(score) && score > 0)
    .slice().sort((a, b) => b[1] - a[1]);
  const discovery = grapes.flatMap(([grape]) => stock
    .filter(wine => wine.region.trim() && !preferredRegions.has(normalize(wine.region))
      && wine.grapes.some(item => normalize(item.name) === normalize(grape)))
    .map(wine => ({ wine, grape })))[0];

  return <div className="taste-origins">
    <h4>{it ? "Le tue origini più apprezzate" : "Your most appreciated origins"}</h4>
    <p className="taste-origins-source">{it
      ? "Ordinate dai segnali positivi delle tue degustazioni e stelline personali. La quantità in cantina indica disponibilità, non gradimento."
      : "Ranked by positive signals from your tastings and personal star ratings. Cellar quantity indicates availability, not enjoyment."}</p>
    {profile.confidence_level === "emerging" ? <p>{it ? "Il profilo è ancora in scoperta: questa classifica può cambiare con nuovi giudizi." : "Your profile is still developing: this ranking may change with new ratings."}</p> : null}
    <div className="taste-origin-cards">
      {origins.map(([name], index) => {
        const available = stock.filter(wine => normalize(regional ? wine.region : wine.vineyard_country || "") === normalize(name));
        const quantity = available.reduce((total, wine) => total + wine.quantity, 0);
        return <article className="taste-origin-card" key={name}>
          <span className="taste-origin-rank">{index + 1} · {it ? (regional ? "Regione" : "Paese") : (regional ? "Region" : "Country")}</span>
          <h5>{name}</h5>
          <p>{wines ? (it ? `${quantity} ${quantity === 1 ? "bottiglia" : "bottiglie"} in cantina · ${available.length} ${available.length === 1 ? "etichetta" : "etichette"}` : `${quantity} ${quantity === 1 ? "bottle" : "bottles"} in cellar · ${available.length} ${available.length === 1 ? "label" : "labels"}`) : (it ? "Disponibilità in cantina non presente in questa vista." : "Cellar availability is not provided in this view.")}</p>
          {available.length ? <details className="taste-origin-wines">
            <summary>{it ? "Vedi i vini in cantina" : "See cellar wines"}</summary>
            <ul>{available.map(wine => <li key={wine.id}>{onOpenWine
              ? <button type="button" className="secondary" onClick={() => onOpenWine(wine)}>{wine.name} · {wine.vintage}<small>{wine.producer} · {wine.quantity} {it ? "bottiglie" : "bottles"}</small></button>
              : <span>{wine.name} · {wine.vintage}</span>}</li>)}</ul>
          </details> : null}
        </article>;
      })}
    </div>
    {!origins.length ? <p>{it ? "Non ci sono ancora segnali sufficienti per ordinare le origini." : "There is not enough evidence to rank origins yet."}</p> : null}
    <article className="taste-origin-discovery">
      <span className="taste-origin-rank">{it ? "Una scoperta da provare" : "A discovery to try"}</span>
      {discovery && regions.length ? <>
        <h4>{discovery.wine.region} · {discovery.wine.name}</h4>
        <p>{it ? `${discovery.grape} emerge tra le uve associate ai tuoi giudizi positivi. Questa bottiglia è già in cantina e viene da una regione fuori dalle tue origini principali.` : `${discovery.grape} appears among grapes associated with your positive ratings. This bottle is already in your cellar and comes from outside your leading regions.`}</p>
        <small>{it ? "Una proposta da verificare con una degustazione: non è una previsione di gradimento." : "A suggestion to test with a tasting, rather than a predicted rating."}</small>
        {onOpenWine ? <button type="button" className="secondary" onClick={() => onOpenWine(discovery.wine)}>{it ? "Apri la bottiglia da esplorare" : "Open the bottle to explore"}</button> : null}
      </> : <p>{it ? "Degusta un vino di un'altra regione e registra il tuo giudizio per ampliare il confronto. Non ci sono ancora bottiglie con dati sufficienti per una proposta mirata." : "Taste a wine from another region and record your rating to broaden the comparison. No bottles currently have enough data for a targeted suggestion."}</p>}
    </article>
  </div>;
}
