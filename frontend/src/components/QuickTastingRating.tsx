import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Locale, Wine } from "../types";
import "./QuickTastingRating.css";

type TastingToRate = {
  tasting_id: string;
  wine_id: string;
  wine_name: string;
  vintage: string;
  producer: string;
  consumed_at: string;
};

/**
 * Answers the "how was it?" reminder in place: one row of stars per bottle drunk
 * recently without a rating, saved with a single tap.
 */
export default function QuickTastingRating({ locale, onRated, onAllRated }: {
  locale: Locale;
  onRated: (wine: Wine) => void;
  onAllRated: () => void;
}) {
  const it = locale === "it";
  const [items, setItems] = useState<TastingToRate[] | null>(null);
  const [rated, setRated] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api<TastingToRate[]>("/api/v1/notifications/tastings-to-rate")
      .then((next) => { if (active) setItems(next); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, []);

  async function rate(item: TastingToRate, stars: number) {
    setSaving(item.tasting_id);
    setError("");
    try {
      const wine = await api<Wine>(`/api/v1/wines/${item.wine_id}/tastings/${item.tasting_id}/rating`, {
        method: "POST",
        body: JSON.stringify({ rating: stars }),
      });
      const next = { ...rated, [item.tasting_id]: stars };
      setRated(next);
      onRated(wine);
      if (items && items.every((candidate) => next[candidate.tasting_id])) onAllRated();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (it ? "Non è stato possibile salvare il voto." : "The rating could not be saved."));
    } finally {
      setSaving("");
    }
  }

  if (items === null) return null;
  if (!items.length) return <p className="quick-rating-done">{it ? "Non ci sono bevute da valutare." : "There are no bottles to rate."}</p>;
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  return <ul className="quick-rating" aria-label={it ? "Valuta le bevute" : "Rate your bottles"}>
    {items.map((item) => {
      const given = rated[item.tasting_id];
      const name = [item.wine_name, item.vintage].filter(Boolean).join(" ");
      return <li key={item.tasting_id}>
        <div>
          <strong>{name}</strong>
          <small>{[item.producer, date.format(new Date(item.consumed_at))].filter(Boolean).join(" · ")}</small>
        </div>
        {given ? <span className="quick-rating-thanks">✓ {it ? `${given} su 6, grazie` : `${given} of 6, thanks`}</span> : <div className="quick-rating-stars" role="group" aria-label={it ? `Voto per ${name}` : `Rating for ${name}`}>
          {[1, 2, 3, 4, 5, 6].map((stars) => <button type="button" key={stars} disabled={Boolean(saving)} aria-label={it ? `${stars} su 6` : `${stars} of 6`} onClick={() => void rate(item, stars)}>★</button>)}
        </div>}
      </li>;
    })}
    {error ? <li className="quick-rating-error" role="alert">{error}</li> : null}
  </ul>;
}
