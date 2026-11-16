import { useState, type FormEvent, type Ref } from "react";
import { currentUserSharePct, formatBottleCount } from "../domain/cellar";
import { OTHER_EXIT_TYPES, otherExitHint, otherExitLabel, type OtherExitType } from "../domain/stockExits";
import { api } from "../services/api";
import type { Locale, Session, Wine } from "../types";
import LocalizedDateInput from "./LocalizedDateInput";
import { ButtonBusyContent } from "./AppUi";

type CoOwner = { key: string; label: string; email: string; name: string; bottles: number };

/** The other owners of a wine and how many bottles each holds; the implicit co-owner without named owners. */
export function wineCoOwners(wine: Wine, session: Session | null, locale: Locale): CoOwner[] {
  const myEmail = (session?.user_email || "").trim().toLowerCase();
  if (wine.owners.length) {
    return wine.owners
      .filter((owner) => String(owner.email || "").trim().toLowerCase() !== myEmail || !myEmail)
      .map((owner) => {
        const email = String(owner.email || "");
        const name = String(owner.name || email);
        return { key: email || name, label: name || email, email, name, bottles: (wine.quantity * Number(owner.share_pct || 0)) / 100 };
      })
      .filter((owner) => owner.bottles > 0.05);
  }
  const others = (wine.quantity * (100 - currentUserSharePct(wine, session))) / 100;
  return others > 0.05 ? [{ key: "co-owner", label: locale === "it" ? "Comproprietario" : "Co-owner", email: "", name: "", bottles: others }] : [];
}

/** Wine detail → "Other exit": bottles given away, broken, faulty, taken by a co-owner, returned or corrected. */
export default function OtherExitPanel({ wine, session, locale, saving, panelRef, hidden, onDone }: {
  wine: Wine;
  session: Session | null;
  locale: Locale;
  saving: boolean;
  panelRef: Ref<HTMLDetailsElement>;
  hidden: boolean;
  onDone: () => Promise<void> | void;
}) {
  const it = locale === "it";
  const coOwners = wineCoOwners(wine, session, locale);
  const types = OTHER_EXIT_TYPES.filter((type) => type !== "co_owner_withdrawal" || coOwners.length > 0);
  const [type, setType] = useState<OtherExitType>("complimentary");
  const [quantity, setQuantity] = useState("1");
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [coOwnerKey, setCoOwnerKey] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const coOwner = coOwners.find((owner) => owner.key === coOwnerKey) || coOwners[0];
  const maxQuantity = type === "co_owner_withdrawal" && coOwner ? Math.max(Math.floor(coOwner.bottles + 0.05), 0) : wine.quantity;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saving) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const count = Number(quantity);
      await api("/api/v1/inventory/movements", {
        method: "POST",
        body: JSON.stringify({
          wine_id: wine.id,
          movement_type: type,
          quantity: count,
          occurred_on: occurredOn,
          note: note.trim(),
          co_owner_email: type === "co_owner_withdrawal" ? coOwner?.email || "" : "",
          co_owner_name: type === "co_owner_withdrawal" ? coOwner?.name || "" : "",
        }),
      });
      setMessage(it
        ? `${formatBottleCount(count, locale)} ${count === 1 ? "bottiglia registrata" : "bottiglie registrate"} come «${otherExitLabel(type, locale).toLowerCase()}».`
        : `${formatBottleCount(count, locale)} ${count === 1 ? "bottle" : "bottles"} recorded as “${otherExitLabel(type, locale).toLowerCase()}”.`);
      setQuantity("1");
      setNote("");
      await onDone();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (it ? "Non è stato possibile registrare l'uscita." : "The exit could not be recorded."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="detail-section consume-panel other-exit-panel" ref={panelRef} hidden={hidden}>
      <summary><span>{it ? "Altra uscita" : "Other exit"}</span></summary>
      <p className="consume-help">{it ? "Bottiglie che escono dalla cantina senza essere bevute o vendute. Restano nel Diario, nella scheda Uscite." : "Bottles leaving the cellar without being drunk or sold. They stay in the Diary, under Exits."}</p>
      <form className="consume-form" onSubmit={submit}>
        <fieldset className="other-exit-types" disabled={busy || saving}>
          <legend>{it ? "Motivo" : "Reason"}</legend>
          {types.map((value) => (
            <label key={value} className={value === type ? "is-active" : ""}>
              <input type="radio" name={`other-exit-${wine.id}`} value={value} checked={value === type} onChange={() => { setType(value); setMessage(""); }} />
              <span>{otherExitLabel(value, locale)}</span>
            </label>
          ))}
        </fieldset>
        <p className="consume-help">{otherExitHint(type, locale)}</p>
        <div className="detail-grid consume-grid">
          {type === "co_owner_withdrawal" && coOwners.length > 1 ? (
            <label><span>{it ? "Comproprietario" : "Co-owner"}</span>
              <select value={coOwner?.key || ""} onChange={(event) => setCoOwnerKey(event.target.value)} disabled={busy || saving}>
                {coOwners.map((owner) => <option key={owner.key} value={owner.key}>{owner.label} · {formatBottleCount(owner.bottles, locale)} {it ? "bott." : "btl."}</option>)}
              </select>
            </label>
          ) : null}
          <label><span>{it ? "Data" : "Date"}</span><LocalizedDateInput value={occurredOn} onChange={setOccurredOn} locale={locale} disabled={busy || saving} required ariaLabel={it ? "Data dell'uscita" : "Exit date"} /></label>
          <label><span>{it ? "Bottiglie" : "Bottles"}</span><input type="number" min="1" max={maxQuantity} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={busy || saving} required /></label>
        </div>
        {type === "co_owner_withdrawal" && coOwner ? (
          <p className="consume-help">{it ? `${coOwner.label} può ritirare al massimo ${formatBottleCount(maxQuantity, locale)} bottiglie.` : `${coOwner.label} can take at most ${formatBottleCount(maxQuantity, locale)} bottles.`}</p>
        ) : null}
        <label><span>{it ? "Nota" : "Note"}</span><textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy || saving} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        <div className="form-actions">
          <button type="submit" disabled={busy || saving || maxQuantity < 1}>
            <ButtonBusyContent busy={busy} idleLabel={it ? "Registra uscita" : "Record exit"} busyLabel={it ? "Registro…" : "Recording…"} />
          </button>
        </div>
      </form>
    </details>
  );
}
