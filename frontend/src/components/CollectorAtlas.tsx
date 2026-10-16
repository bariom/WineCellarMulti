import { useId, useState, type ReactNode } from "react";
import type { Locale } from "../types";
import "./CollectorAtlas.css";

export function CollectorAtlas({ locale, origins, maturity, value }: {
  locale: Locale; origins: ReactNode; maturity?: ReactNode; value: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const id = useId();
  const italian = locale === "it";
  // The maturity scene is optional: hosts that already show a maturity timeline omit it.
  const scenes = [
    { label: italian ? "Origini" : "Origins", node: origins },
    ...(maturity != null ? [{ label: italian ? "Maturità" : "Maturity", node: maturity }] : []),
    { label: italian ? "Valore" : "Value", node: value },
  ];
  const labels = scenes.map(scene => scene.label);
  return <section className="collector-atlas" aria-labelledby={`${id}-title`}>
    <header>
      <div><span className="eyebrow">{italian ? "UNO SGUARDO D'INSIEME" : "THE BIG PICTURE"}</span>
        <h2 id={`${id}-title`}>{italian ? "Atlante della collezione" : "Collection atlas"}</h2>
        <p>{italian ? "I luoghi, il tempo e il valore dei tuoi vini." : "The places, time and value of your wines."}</p></div>
      <div role="tablist" aria-label={italian ? "Esplora la collezione" : "Explore the collection"}>
        {labels.map((label, index) => <button key={label} type="button" role="tab" id={`${id}-tab-${index}`}
          aria-selected={active === index} aria-controls={`${id}-panel`} tabIndex={active === index ? 0 : -1}
          onClick={() => setActive(index)} onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % labels.length : event.key === "ArrowLeft" ? (index + labels.length - 1) % labels.length : event.key === "Home" ? 0 : event.key === "End" ? labels.length - 1 : null;
            if (next === null) return;
            event.preventDefault(); setActive(next); document.getElementById(`${id}-tab-${next}`)?.focus();
          }}>{label}</button>)}
      </div>
    </header>
    <div className="collector-atlas-scene" role="tabpanel" tabIndex={0} id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`}>
      {scenes[Math.min(active, scenes.length - 1)].node}
    </div>
  </section>;
}
