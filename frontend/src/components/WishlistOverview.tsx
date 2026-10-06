import type { Locale, WishlistList } from "../types";
import type { TranslationKey } from "../i18n";
import "./WishlistOverview.css";

export default function WishlistOverview({ locale, lists, selectedId, onSelect, canWrite, canAdmin, saving, count, targetValue, highPriority, readyToBuy, onCreate, onRename, onDelete, onSaveWine, onOffer, onStrategy, t }: {
  locale: Locale; lists: WishlistList[]; selectedId: string; onSelect: (id: string) => void;
  canWrite: boolean; canAdmin: boolean; saving: boolean; count: number; targetValue: string;
  highPriority: number; readyToBuy: number; onCreate: () => void; onRename: () => void; onDelete: () => void;
  onSaveWine: () => void; onOffer: () => void; onStrategy: () => void; t: (key: TranslationKey) => string;
}) {
  const it = locale === "it";
  const actions = [
    { title: it ? "Salva un vino" : "Save a wine", description: it ? "Un vino da ricordare, provare o acquistare." : "A wine to remember, taste or buy.", action: onSaveWine, disabled: !canWrite },
    { title: it ? "Valuta un’offerta" : "Evaluate an offer", description: it ? "Inserisci vino e prezzo. Dopo il salvataggio, confronta l’offerta con il mercato." : "Enter the wine and price. After saving, compare the offer with the market.", action: onOffer, disabled: !canWrite },
    { title: it ? "Pianifica gli acquisti" : "Plan your purchases", description: it ? "Confronta i vini di questa lista e scegli le priorità con l’AI." : "Compare wines in this list and choose priorities with AI.", action: onStrategy, disabled: count === 0 },
  ];
  return <section className="wishlist-overview" aria-label={it ? "La tua wishlist" : "Your wishlist"}>
    <header>
      <span className="eyebrow">{it ? "Dall’idea al prossimo calice" : "From an idea to your next glass"}</span>
      <h2>{it ? "Vini da scoprire e da scegliere" : "Wines to discover and choose"}</h2>
      <p>{it ? "Salva ciò che ti incuriosisce. Puoi valutarlo, assaggiarlo o acquistarlo quando vuoi." : "Save what catches your eye. Evaluate, taste or buy it whenever you like."}</p>
    </header>
    <div className="wishlist-start-actions" aria-label={it ? "Cosa vuoi fare?" : "What would you like to do?"}>
      {actions.map((item, index) => <button key={index} type="button" className="secondary" onClick={item.action} disabled={saving || item.disabled}>
        <span className="wishlist-start-number" aria-hidden="true">0{index + 1}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><span aria-hidden="true">→</span>
      </button>)}
    </div>
    {!canWrite ? <p className="wishlist-start-hint">{it ? "Hai accesso in lettura: puoi consultare i vini e i consigli già salvati. Per aggiungere vini o registrare acquisti e assaggi serve il permesso di modifica." : "You have read-only access to wines and saved advice. Adding wines or recording purchases and tastings requires editing permission."}</p>
      : !count ? <p className="wishlist-start-hint">{it ? "Inizia da “Salva un vino”. La pianificazione sarà disponibile quando questa lista contiene almeno un vino." : "Start with “Save a wine”. Planning becomes available when this list contains at least one wine."}</p> : null}
    <div className="wishlist-overview-list">
      <label><span>{it ? "I vini nella lista" : "Wines in this list"}</span><select value={selectedId} onChange={event => onSelect(event.target.value)} disabled={saving || !lists.length}>
        {lists.map(list => <option key={list.id} value={list.id}>{list.name} ({list.item_count})</option>)}
      </select></label>
      <details className="wishlist-list-options"><summary>{it ? "Gestisci liste e riepilogo" : "Manage lists and summary"}</summary>
        <div className="inline-actions">
          <button type="button" className="secondary compact" disabled={!canWrite || saving} onClick={onCreate}>{t("createWishlistList")}</button>
          <button type="button" className="secondary compact" disabled={!canWrite || saving || !selectedId} onClick={onRename}>{t("renameWishlistList")}</button>
          <button type="button" className="danger compact" disabled={!canAdmin || saving || lists.length <= 1 || !selectedId} onClick={onDelete}>{t("deleteWishlistList")}</button>
        </div>
        <dl><div><dt>{t("wishlistItems")}</dt><dd>{count}</dd></div><div><dt>{t("targetValue")}</dt><dd>{targetValue}</dd></div><div><dt>{t("highPriority")}</dt><dd>{highPriority}</dd></div><div><dt>{t("readyToBuy")}</dt><dd>{readyToBuy}</dd></div></dl>
      </details>
    </div>
    {count > 0 ? <p className="wishlist-next-step">{it ? "Apri un vino per analizzare l’offerta o registrare un assaggio. “Registra acquisto” aggiunge le bottiglie alla cantina; l’assaggio salva solo la tua esperienza." : "Open a wine to analyse the offer or record a tasting. “Record purchase” adds bottles to your cellar; a tasting only saves your experience."}</p> : null}
  </section>;
}
