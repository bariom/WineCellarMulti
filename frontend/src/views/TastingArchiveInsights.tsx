import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Locale, TastingArchiveProfile } from "../types";
import "./TastingArchiveInsights.css";

const labels: Record<Locale, Record<string, string>> = {
  en: {
    Red: "Red",
    White: "White",
    Rose: "Rosé",
    Sparkling: "Sparkling",
    Sweet: "Sweet",
    Fortified: "Fortified",
    Other: "Other",
  },
  it: {
    Red: "Rossi",
    White: "Bianchi",
    Rose: "Rosati",
    Sparkling: "Spumanti",
    Sweet: "Dolci",
    Fortified: "Fortificati",
    Other: "Altri",
  },
};

function typeLabel(value: string, locale: Locale) {
  return labels[locale][value] || value || labels[locale].Other;
}

function formatMoney(value: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(locale === "it" ? "it-CH" : "en-CH", {
    style: "currency",
    currency: currency || "CHF",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function TastingArchiveInsights({
  locale,
}: {
  locale: Locale;
}) {
  const [profile, setProfile] = useState<TastingArchiveProfile[]>([]);

  useEffect(() => {
    let active = true;
    api<{ profile: TastingArchiveProfile[] }>("/api/v1/wines/tasting-archive?limit=1&offset=0")
      .then((response) => {
        if (active) setProfile(response.profile || []);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!profile.length) return null;
  const total = profile.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="tasting-archive-insights" aria-label={locale === "it" ? "Profilo storico" : "History profile"}>
      <header>
        <div>
          <p className="eyebrow">{locale === "it" ? "Profilo degustazioni" : "Tasting profile"}</p>
          <h3>{locale === "it" ? "Cosa hai bevuto e quanto valeva" : "What you drank and what it was worth"}</h3>
        </div>
        <span>{total} {locale === "it" ? "bottiglie" : "bottles"}</span>
      </header>
      <div className="tasting-profile-grid">
        {profile.map((item) => {
          const difference = item.market_value_total - item.comparable_purchase_total;
          const percentage = total ? Math.round((item.count / total) * 100) : 0;
          return (
            <article className={`tasting-profile-card tone-${item.wine_type.toLowerCase()}`} key={`${item.wine_type}-${item.currency}`}>
              <div className="tasting-profile-title">
                <strong>{typeLabel(item.wine_type, locale)}</strong>
                <span>{item.count} · {percentage}%</span>
              </div>
              <dl>
                <div>
                  <dt>{locale === "it" ? "Costo acquisto" : "Purchase cost"}</dt>
                  <dd>{formatMoney(item.purchase_total, item.currency, locale)}</dd>
                </div>
                {item.comparable_count ? (
                  <>
                    <div>
                      <dt>{locale === "it" ? "Valore alla bevuta" : "Value when consumed"}</dt>
                      <dd>{formatMoney(item.market_value_total, item.currency, locale)}</dd>
                    </div>
                    <div>
                      <dt>{locale === "it" ? "Differenza" : "Difference"} ({item.comparable_count}/{item.count})</dt>
                      <dd className={difference >= 0 ? "positive" : "negative"}>{difference >= 0 ? "+" : ""}{formatMoney(difference, item.currency, locale)}</dd>
                    </div>
                  </>
                ) : (
                  <div className="tasting-profile-unavailable">
                    {locale === "it" ? "Nessun valore storico disponibile" : "No historical value available"}
                  </div>
                )}
              </dl>
            </article>
          );
        })}
      </div>
      <p className="tasting-profile-note">
        {locale === "it"
          ? "Il valore è congelato alla registrazione della degustazione; per le degustazioni precedenti viene usata soltanto una quotazione storica già disponibile."
          : "Value is captured when the tasting is recorded; older tastings use only an already available historical valuation."}
      </p>
    </section>
  );
}
