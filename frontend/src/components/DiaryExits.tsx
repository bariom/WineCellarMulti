import { useEffect, useState } from "react";
import { formatBottleCount } from "../domain/cellar";
import { isOtherExit, OTHER_EXIT_TYPES, otherExitLabel, type OtherExitType } from "../domain/stockExits";
import { api } from "../services/api";
import type { Locale, StockMovement } from "../types";
import { formatDisplayDate } from "./panelSupport";
import { LoadingState } from "./AppUi";
import "./DiaryExits.css";

/** Diary → Exits: bottles given away, broken, faulty, taken by a co-owner, returned or corrected. */
export default function DiaryExits({ locale, onOpenWine }: { locale: Locale; onOpenWine: (wineId: string) => void }) {
  const it = locale === "it";
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<OtherExitType | "">("");
  useEffect(() => {
    let active = true;
    api<StockMovement[]>("/api/v1/inventory/movements?limit=500")
      .then((items) => { if (active) setMovements(items); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  if (error) return <p className="empty-state" role="alert">{it ? "Non è stato possibile caricare le uscite." : "The exits could not be loaded."}</p>;
  if (!movements) return <LoadingState label={it ? "Carico le uscite…" : "Loading exits…"} />;

  // One exit can span several purchase lots: show it once, with all its bottles.
  const exits = new Map<string, StockMovement & { type: OtherExitType; bottles: number }>();
  for (const movement of movements) {
    if (!isOtherExit(movement.movement_type)) continue;
    const key = `${movement.wine_id}|${movement.movement_type}|${movement.occurred_on}|${movement.created_at.slice(0, 19)}|${movement.note}`;
    const current = exits.get(key);
    if (current) current.bottles += -movement.quantity_delta;
    else exits.set(key, { ...movement, type: movement.movement_type as OtherExitType, bottles: -movement.quantity_delta });
  }
  const rows = [...exits.values()].sort((first, second) => second.occurred_on.localeCompare(first.occurred_on) || second.created_at.localeCompare(first.created_at));
  const counts = OTHER_EXIT_TYPES
    .map((type) => ({ type, bottles: rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.bottles, 0) }))
    .filter((item) => item.bottles > 0);
  const visible = filter ? rows.filter((row) => row.type === filter) : rows;

  if (!rows.length) {
    return (
      <section className="diary-exits" aria-label={it ? "Uscite" : "Exits"}>
        <p className="empty-state">{it ? "Nessuna uscita registrata. Bottiglie regalate, rotte o difettose si registrano dalla scheda del vino, con «Altra uscita»." : "No exits recorded yet. Bottles given away, broken or faulty are recorded from the wine's page, with “Other exit”."}</p>
      </section>
    );
  }
  return (
    <section className="diary-exits" aria-label={it ? "Uscite" : "Exits"}>
      <div className="diary-exits-filters" role="group" aria-label={it ? "Filtra per motivo" : "Filter by reason"}>
        <button type="button" aria-pressed={!filter} className={!filter ? "active" : ""} onClick={() => setFilter("")}>
          {it ? "Tutte" : "All"} <b>{formatBottleCount(rows.reduce((sum, row) => sum + row.bottles, 0), locale)}</b>
        </button>
        {counts.map(({ type, bottles }) => (
          <button type="button" key={type} aria-pressed={filter === type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}>
            {otherExitLabel(type, locale)} <b>{formatBottleCount(bottles, locale)}</b>
          </button>
        ))}
      </div>
      <ol className="diary-exits-list">
        {visible.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => onOpenWine(row.wine_id)}>
              <span className="diary-exits-date">{formatDisplayDate(row.occurred_on)}</span>
              <span className="diary-exits-wine">
                <strong>{row.wine_name}{row.wine_vintage ? ` ${row.wine_vintage}` : ""}</strong>
                <small>{[row.wine_producer, row.note].filter(Boolean).join(" · ")}</small>
              </span>
              <span className={`diary-exits-type is-${row.type}`}>{otherExitLabel(row.type, locale)}</span>
              <b className="diary-exits-bottles">{formatBottleCount(row.bottles, locale)} {it ? "bott." : "btl."}</b>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
