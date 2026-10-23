import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./BottlePhotoImport.css";

/** The ways into the cellar: a photo of the bottles, the full form, or a receipt. */
export default function AddWineChooser({ locale, onQuick, onDetailed, onReceipt, onClose }: {
  locale: Locale;
  onQuick: () => void;
  onDetailed: () => void;
  onReceipt: () => void;
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
          <p>{it ? "Aggiungi in cantina" : "Add to the cellar"}</p>
          <h2 id="add-wine-chooser-title">{it ? "Come vuoi inserire i vini?" : "How do you want to add wines?"}</h2>
        </div>
        <button type="button" className="secondary compact" onClick={onClose}>{it ? "Chiudi" : "Close"}</button>
      </header>
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
    </dialog>,
    document.body,
  );
}
