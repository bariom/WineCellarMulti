import type { CSSProperties } from "react";
import type { Locale, Wine } from "../types";
import "./OwnershipShareChart.css";

type Share = { key: string; name: string; email?: string; pct: number; you: boolean; rest?: boolean };

// Shades that stay apart in both themes; the reader's own share always takes the first.
const TONES = ["#2f6b55", "#b8954a", "#c47a8a", "#5b7fa6", "#8a6bb0", "#6f9a5c"];

function initials(name: string) {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shares(wine: Wine, userEmail: string | null | undefined, locale: Locale): Share[] {
  const it = locale === "it";
  const email = (userEmail || "").trim().toLowerCase();
  let rows: Share[];
  if (wine.owners.length) {
    rows = wine.owners.map((owner, index) => {
      const you = Boolean(email && owner.email && owner.email.trim().toLowerCase() === email);
      return { key: `${owner.email || owner.name}-${index}`, name: owner.name || owner.email || "?", email: owner.email, pct: Number(owner.share_pct) || 0, you };
    });
  } else {
    // No named owners: only this cellar's share is known.
    const own = Number(wine.owner_share_pct || 100);
    rows = [{ key: "own", name: it ? "Questa cantina" : "This cellar", pct: own, you: true }];
  }
  rows.sort((a, b) => Number(b.you) - Number(a.you));
  const total = rows.reduce((sum, row) => sum + row.pct, 0);
  if (total < 99.5) rows.push({ key: "rest", name: wine.owners.length ? (it ? "Non assegnata" : "Unassigned") : (it ? "Altri proprietari" : "Other owners"), pct: 100 - total, you: false, rest: true });
  return rows;
}

function bottles(quantity: number, pct: number, locale: Locale) {
  const count = Math.round(quantity * pct) / 100;
  const text = count.toLocaleString(locale, { maximumFractionDigits: 1 });
  if (locale === "it") return `${text} ${count === 1 ? "bottiglia" : "bottiglie"}`;
  return `${text} ${count === 1 ? "bottle" : "bottles"}`;
}

/** Who owns how much of a shared wine: one bar split by share, then each owner with bottles and percentage. */
export default function OwnershipShareChart({ wine, locale, userEmail }: { wine: Wine; locale: Locale; userEmail?: string | null }) {
  const it = locale === "it";
  const rows = shares(wine, userEmail, locale);
  const named = rows.filter((row) => !row.rest);
  const quantity = Math.max(0, Number(wine.quantity) || 0);
  const pct = (value: number) => `${value.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  let toneIndex = 0;
  const toned = rows.map((row) => ({ ...row, tone: row.rest ? "" : TONES[toneIndex++ % TONES.length] }));
  const summary = toned.map((row) => `${row.you && wine.owners.length ? (it ? "Tu" : "You") : row.name} ${pct(row.pct)}`).join(", ");

  return (
    <div className="ownership-chart">
      <div className="ownership-chart-head">
        <strong>{it ? "Quote di proprietà" : "Ownership shares"}</strong>
        <span>{quantity ? `${bottles(quantity, 100, locale)} · ` : ""}{wine.owners.length ? (it ? `${named.length} ${named.length === 1 ? "proprietario" : "proprietari"}` : `${named.length} ${named.length === 1 ? "owner" : "owners"}`) : (it ? "quota condivisa" : "shared")}</span>
      </div>
      <div className="ownership-chart-bar" role="img" aria-label={summary}>
        {toned.map((row) => row.pct > 0 ? <i key={row.key} className={row.rest ? "is-rest" : undefined} style={{ flexGrow: row.pct, "--owner-tone": row.tone } as CSSProperties} /> : null)}
      </div>
      <ul className="ownership-chart-people">
        {toned.map((row) => (
          <li key={row.key} className={row.rest ? "is-rest" : undefined}>
            <span className="ownership-chart-avatar" style={{ "--owner-tone": row.tone } as CSSProperties} aria-hidden="true">{row.rest ? "" : row.key === "own" ? <svg viewBox="0 0 24 24"><path d="M3 20V9l9-5 9 5v11" /><path d="M8 20v-6h8v6" /></svg> : initials(row.name)}</span>
            <div className="ownership-chart-name">
              <span>{row.you && wine.owners.length ? (it ? `Tu · ${row.name}` : `You · ${row.name}`) : row.name}</span>
              <small>{[quantity ? bottles(quantity, row.pct, locale) : "", row.email || ""].filter(Boolean).join(" · ")}</small>
            </div>
            <em>{pct(row.pct)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
