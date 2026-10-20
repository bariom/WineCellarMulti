import { useState } from "react";
import type { Locale, TasteProfile, Wine } from "../types";
import { isWinePhysicallyInCellar } from "../domain/cellar";
import { AppIcon } from "./AppIcon";
import { KeyPositionWineIllustration } from "./KeyPositionCardParts";
import { wineTone } from "./panelSupport";
import "./TasteOrigins.css";

const normalize = (value: string) => value.trim().toLocaleLowerCase();

function OriginLandscape() {
  return <svg className="taste-origin-landscape" viewBox="0 0 400 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <circle cx="320" cy="24" r="17" fill="currentColor" opacity=".3" />
    <path d="M0 64Q90 2 190 51T400 32V90H0Z" fill="currentColor" opacity=".13" />
    <path d="M0 85Q110 22 230 64T400 48" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".65" />
    <path d="M0 100Q120 38 240 76T400 64M50 100Q145 54 260 88T400 80M120 100Q195 70 300 100" fill="none" stroke="currentColor" opacity=".35" />
  </svg>;
}

function DiscoveryBottle({ wine, locale }: { wine: Wine; locale: Locale }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const url = [wine.photo_thumbnail_url, wine.photo_detail_url].find(value => value && !failedUrls.includes(value));
  return <div className="taste-discovery-visual">
    <div className="taste-discovery-photo">
      {url ? <img src={url} alt={locale === "it" ? `Foto di ${wine.name}` : `Photo of ${wine.name}`} loading="lazy"
        onError={() => setFailedUrls(current => [...current, url])} />
        : <span className={`taste-discovery-placeholder tone-${wineTone(wine.type)}`}><KeyPositionWineIllustration /></span>}
    </div>
    <span className="taste-discovery-stock"><AppIcon name="cellar" />{locale === "it" ? "Già nella tua cantina" : "Already in your cellar"}</span>
  </div>;
}

export function TasteOrigins({ profile, wines, locale, onOpenWine }: {
  profile: TasteProfile; wines?: Wine[]; locale: Locale; onOpenWine?: (wine: Wine) => void;
}) {
  const it = locale === "it";
  const regions = profile.attributes.preferred_regions || [];
  const regional = regions.length > 0;
  // Higher score = more liked (average stars, or older profiles' accumulated weights); only the order is used.
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
      ? "Ordinate da quanto ti sono piaciute, secondo le tue degustazioni e stelline personali. La quantità in cantina indica disponibilità, non gradimento."
      : "Ranked by how much you enjoyed them, from your tastings and personal star ratings. Cellar quantity indicates availability, not enjoyment."}</p>
    {profile.confidence_level === "emerging" ? <p>{it ? "Il profilo è ancora in scoperta: questa classifica può cambiare con nuovi giudizi." : "Your profile is still developing: this ranking may change with new ratings."}</p> : null}
    <div className="taste-origin-cards">
      {origins.map(([name], index) => {
        const available = stock.filter(wine => normalize(regional ? wine.region : wine.vineyard_country || "") === normalize(name));
        const quantity = available.reduce((total, wine) => total + wine.quantity, 0);
        return <article className="taste-origin-card" key={name}>
          <div className="taste-origin-illustration"><OriginLandscape /><span className="taste-origin-rank"><b>{String(index + 1).padStart(2, "0")}</b>{it ? (regional ? "Regione" : "Paese") : (regional ? "Region" : "Country")}</span><AppIcon name="location" size="1.2rem" /></div>
          <div className="taste-origin-card-content">
          <h5>{name}</h5>
          <p>{wines ? (it ? `${quantity} ${quantity === 1 ? "bottiglia" : "bottiglie"} in cantina · ${available.length} ${available.length === 1 ? "etichetta" : "etichette"}` : `${quantity} ${quantity === 1 ? "bottle" : "bottles"} in cellar · ${available.length} ${available.length === 1 ? "label" : "labels"}`) : (it ? "Disponibilità in cantina non presente in questa vista." : "Cellar availability is not provided in this view.")}</p>
          {available.length ? <details className="taste-origin-wines">
            <summary>{it ? "Vedi i vini in cantina" : "See cellar wines"}</summary>
            <ul>{available.map(wine => <li key={wine.id}>{onOpenWine
              ? <button type="button" className="secondary" onClick={() => onOpenWine(wine)}>{wine.name} · {wine.vintage}<small>{wine.producer} · {wine.quantity} {it ? "bottiglie" : "bottles"}</small></button>
              : <span>{wine.name} · {wine.vintage}</span>}</li>)}</ul>
          </details> : null}
          </div>
        </article>;
      })}
    </div>
    {!origins.length ? <p>{it ? "Non ci sono ancora segnali sufficienti per ordinare le origini." : "There is not enough evidence to rank origins yet."}</p> : null}
    <article className={`taste-origin-discovery${discovery && regions.length ? " has-suggestion" : ""}`}>
      {discovery && regions.length ? <DiscoveryBottle key={discovery.wine.id} wine={discovery.wine} locale={locale} /> : <div className="taste-discovery-empty-icon" aria-hidden="true"><AppIcon name="location" size="2.5rem" /></div>}
      <div className="taste-discovery-copy">
      <span className="taste-origin-rank">{it ? "Una scoperta da provare" : "A discovery to try"}</span>
      {discovery && regions.length ? <>
        <h4>{discovery.wine.name}</h4>
        <span className="taste-discovery-identity">{[discovery.wine.region, discovery.wine.vintage, discovery.wine.producer].filter(Boolean).join(" · ")}</span>
        <p>{it ? `${discovery.grape} emerge tra le uve associate ai tuoi giudizi positivi. Provalo in una regione diversa dalle tue origini principali.` : `${discovery.grape} appears among grapes associated with your positive ratings. Explore it in a region outside your leading origins.`}</p>
        <small>{it ? "Una proposta da verificare con una degustazione: non è una previsione di gradimento." : "A suggestion to test with a tasting, rather than a predicted rating."}</small>
        {onOpenWine ? <button type="button" className="secondary" onClick={() => onOpenWine(discovery.wine)}>{it ? "Apri la bottiglia da esplorare" : "Open the bottle to explore"}<AppIcon name="chevron-right" /></button> : null}
      </> : <p>{it ? "Degusta un vino di un'altra regione e registra il tuo giudizio per ampliare il confronto. Non ci sono ancora bottiglie con dati sufficienti per una proposta mirata." : "Taste a wine from another region and record your rating to broaden the comparison. No bottles currently have enough data for a targeted suggestion."}</p>}
      </div>
    </article>
  </div>;
}
