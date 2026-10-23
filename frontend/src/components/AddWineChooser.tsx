import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../types";
import { AppIcon } from "./AppIcon";
import "./BottlePhotoImport.css";

/** The two ways into the cellar: from a photo of the bottles, or the full form. */
export default function AddWineChooser({ locale, onQuick, onDetailed, onReceipt, onClose }: {
  locale: Locale;
  onQuick: () => void;
  onDetailed: () => void;
  /** Absent when the purchase import is not available to this user. */
  onReceipt?: () => void;
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
      </div>
      {onReceipt ? <p className="add-wine-receipt">
        {it ? "Hai una ricevuta o una fattura? " : "Have a receipt or an invoice? "}
        <button type="button" className="link-button" onClick={onReceipt}>{it ? "Importa l'acquisto" : "Import the purchase"}</button>
      </p> : null}
    </dialog>,
    document.body,
  );
}
