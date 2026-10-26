import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./BottlePhotoImport.css";

/**
 * Everything the user records, behind the one "+" button: wines into the cellar
 * (from a photo, the full form or a receipt), a tasting, or a wine to buy.
 */
export default function AddWineChooser({ locale, onQuick, onDetailed, onReceipt, onTasting, onWishlist, onClose }: {
  locale: Locale;
  onQuick: () => void;
  onDetailed: () => void;
  onReceipt: () => void;
  /** Absent where a tasting cannot be recorded, e.g. offline. */
  onTasting?: () => void;
  onWishlist: () => void;
  onClose: () => void;
}) {
  const it = locale === "it";
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return createPortal(
    <dialog ref={dialog} className="bottle-photo-import add-wine-chooser" aria-labelledby="add-wine-chooser-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="bottle-photo-header">
        <div>
          <p>{it ? "Aggiungi" : "Add"}</p>
          <h2 id="add-wine-chooser-title">{it ? "Cosa vuoi aggiungere?" : "What do you want to add?"}</h2>
        </div>
        <button type="button" className="secondary compact" onClick={onClose}>{it ? "Chiudi" : "Close"}</button>
      </header>
      <p className="add-wine-section">{it ? "Vini in cantina" : "Wines in the cellar"}</p>
      <div className="add-wine-paths">
        <button type="button" className="add-wine-path is-quick" onClick={onQuick}>
          <span className="add-wine-path-icon"><AppIcon name="camera" /></span>
          <span className="add-wine-path-text">
            <strong>{it ? "Inserimento veloce" : "Quick add"}</strong>
            <span>{it ? "Fotografa una o più bottiglie: Vinaris riconosce i vini, conta le bottiglie uguali e li compila dal catalogo. Tu controlli annata e quantità." : "Photograph one or more bottles: Vinaris recognises the wines, counts identical bottles and fills them in from the catalog. You check vintage and quantity."}</span>
            <em>{it ? "Consigliato per iniziare · usa il credito AI" : "Best to get started · uses AI credit"}</em>
          </span>
        </button>
        <button type="button" className="add-wine-path" onClick={onDetailed}>
          <span className="add-wine-path-icon"><AppIcon name="edit" /></span>
          <span className="add-wine-path-text">
            <strong>{it ? "Inserimento dettagliato" : "Detailed entry"}</strong>
            <span>{it ? "Una bottiglia alla volta con tutti i dati: acquisto, prezzo, fornitore, posizione, foto e note." : "One wine at a time with every detail: purchase, price, supplier, location, photo and notes."}</span>
          </span>
        </button>
        <button type="button" className="add-wine-path is-receipt" onClick={onReceipt}>
          <span className="add-wine-path-icon"><AppIcon name="import" /></span>
          <span className="add-wine-path-text">
            <strong>{it ? "Da scontrino o fattura" : "From a receipt or invoice"}</strong>
            <span>{it ? "Hai appena comprato? Fotografa lo scontrino o carica la fattura PDF: Vinaris prepara vini, quantità e prezzi pagati." : "Just bought some wine? Photograph the receipt or upload the PDF invoice: Vinaris prepares wines, quantities and prices paid."}</span>
            <em>{it ? "Con abbonamento o credito AI" : "With a subscription or AI credit"}</em>
          </span>
        </button>
      </div>
      <p className="add-wine-section">{it ? "Altro" : "More"}</p>
      <div className="add-wine-more">
        {onTasting ? <button type="button" className="add-wine-more-item" onClick={onTasting}>
          <AppIcon name="tasting" />
          <span><strong>{it ? "Registra una bevuta" : "Record a tasting"}</strong><small>{it ? "Una bottiglia aperta, con voto, occasione e foto." : "A bottle opened, with rating, occasion and photo."}</small></span>
        </button> : null}
        <button type="button" className="add-wine-more-item" onClick={onWishlist}>
          <AppIcon name="wishlist" />
          <span><strong>{it ? "Aggiungi alla wishlist" : "Add to the wishlist"}</strong><small>{it ? "Un vino da comprare, con il prezzo che vuoi pagare." : "A wine to buy, with the price you want to pay."}</small></span>
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
