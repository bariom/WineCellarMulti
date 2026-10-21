import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "./AppIcon";
import { WineListChat } from "./WineListChat";
import type { RestaurantWineListQuestionPayload, RestaurantWineListQuestionResult, WineShelfBottle, WineShelfCellarMode, WineShelfScanResult } from "../types";
import "./WineShelfScanner.css";

const maxPhotos = 3;

/** Smooth scrolling, unless the system asks for reduced motion. */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export type ShelfWishlistCandidate = {
  name: string;
  producer: string;
  vintage: string;
  merchant: string;
  merchant_type: "local_shop" | "online";
  price: string;
  currency: string;
  availability: string;
  delivery_estimate: string;
  source_url: string;
  reason: string;
  local: boolean;
  confidence: "high" | "medium" | "low";
};

function shelfPrice(priceText: string) {
  const match = priceText.replace(/['’]/g, "").match(/\d+(?:[.,]\d{1,2})?/);
  return match ? match[0].replace(",", ".") : "";
}

export function WineShelfScanner({
  locale,
  canGenerateAi,
  canWriteWishlist,
  formatAiBudget,
  onScan,
  onAsk,
  onAddToWishlist,
}: {
  locale: "it" | "en";
  canGenerateAi: boolean;
  canWriteWishlist: boolean;
  formatAiBudget: (value: string | number) => string;
  onScan: (formData: FormData) => Promise<WineShelfScanResult>;
  onAsk: (payload: RestaurantWineListQuestionPayload) => Promise<RestaurantWineListQuestionResult>;
  onAddToWishlist: (candidate: ShelfWishlistCandidate) => Promise<void>;
}) {
  const it = locale === "it";
  const [photos, setPhotos] = useState<File[]>([]);
  const [occasion, setOccasion] = useState("");
  const [budget, setBudget] = useState("");
  const [wineType, setWineType] = useState("");
  const [rankingSize, setRankingSize] = useState(3);
  const [cellarMode, setCellarMode] = useState<WineShelfCellarMode>("avoid_owned");
  const [ignoreTaste, setIgnoreTaste] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WineShelfScanResult | null>(null);
  const [resultKey, setResultKey] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [activeBottle, setActiveBottle] = useState<number | null>(null);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomDialogRef = useRef<HTMLDialogElement>(null);
  const [savedBottles, setSavedBottles] = useState<Set<number>>(() => new Set());
  const [savingBottle, setSavingBottle] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  // The photos stay on the device: the result is drawn on the local previews.
  const previews = useMemo(() => photos.map((photo) => URL.createObjectURL(photo)), [photos]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
  useEffect(() => {
    const dialog = zoomDialogRef.current;
    if (!dialog) return;
    if (zoomedPhoto !== null && !dialog.open) dialog.showModal();
    if (zoomedPhoto === null && dialog.open) dialog.close();
  }, [zoomedPhoto]);
  useEffect(() => {
    if (!showResult) return;
    const frame = window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [showResult, resultKey]);

  function addPhotos(input: HTMLInputElement) {
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    const next = [...photos, ...files];
    setError(next.length > maxPhotos ? (it ? `Puoi analizzare al massimo ${maxPhotos} foto per volta.` : `You can analyse up to ${maxPhotos} photos at a time.`) : "");
    setPhotos(next.slice(0, maxPhotos));
    // Bottle positions refer to the analysed photos, so a changed set needs a new analysis.
    setResult(null);
  }

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photos.length) {
      setError(it ? "Scatta o carica una foto dello scaffale." : "Take or upload a photo of the shelf.");
      return;
    }
    setError("");
    setScanning(true);
    const formData = new FormData();
    photos.forEach((photo) => formData.append("images", photo));
    formData.set("occasion", occasion.trim());
    formData.set("max_price_chf", budget.trim());
    formData.set("wine_type", wineType);
    formData.set("ranking_size", String(rankingSize));
    formData.set("cellar_mode", cellarMode);
    formData.set("ignore_preferences", String(ignoreTaste));
    try {
      const next = await onScan(formData);
      setResult(next);
      setResultKey((key) => key + 1);
      setActiveBottle(next.recommendations[0]?.bottle_index ?? null);
      setShowAllLabels(false);
      setSavedBottles(new Set());
      setShowResult(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (it ? "Non è stato possibile analizzare lo scaffale." : "The shelf could not be analysed."));
    } finally {
      setScanning(false);
    }
  }

  async function addToWishlist(bottle: WineShelfBottle, index: number, reason: string) {
    setSavingBottle(index);
    try {
      await onAddToWishlist({
        name: bottle.name, producer: bottle.producer, vintage: bottle.vintage, merchant: "", merchant_type: "local_shop",
        price: shelfPrice(bottle.price_text), currency: "CHF", availability: "", delivery_estimate: "", source_url: "",
        reason, local: true, confidence: bottle.confidence,
      });
      setSavedBottles((current) => new Set(current).add(index));
    } catch {
      setError(it ? "Non è stato possibile aggiungere il vino alla wishlist." : "The wine could not be added to the wishlist.");
    } finally {
      setSavingBottle(null);
    }
  }

  const rankByBottle = new Map(result?.recommendations.map((item) => [item.bottle_index, item.rank]) || []);
  const disabled = !canGenerateAi || scanning;
  const identity = (bottle: WineShelfBottle) => [bottle.producer, bottle.vintage, bottle.region].filter(Boolean).join(" · ");
  const suggestions = it
    ? ["Perché la prima e non la seconda?", "Quale si conserva più a lungo?", "C'è un'alternativa più economica?"]
    : ["Why the first rather than the second?", "Which one will age longer?", "Is there a cheaper alternative?"];

  function openZoom(photoIndex: number) {
    setZoom(1);
    setZoomedPhoto(photoIndex);
  }

  function renderShelfFrame(url: string, photoIndex: number, variant: "inline" | "zoom") {
    if (!result) return null;
    return <div className={`wine-shelf-photo-frame is-${variant}`} style={variant === "zoom" && zoom > 1 ? { width: `${zoom * 100}%` } : undefined}>
      <img src={url} alt={it ? `Scaffale, foto ${photoIndex + 1}` : `Shelf, photo ${photoIndex + 1}`} onClick={variant === "inline" ? () => openZoom(photoIndex) : undefined} />
      {result.bottles.map((bottle, bottleIndex) => {
        if (bottle.image_index !== photoIndex) return null;
        const rank = rankByBottle.get(bottleIndex);
        if (!rank && !showAllLabels) return null;
        const style = {
          left: `${(bottle.x + bottle.width / 2) * 100}%`,
          top: `${(bottle.y + bottle.height / 2) * 100}%`,
          "--halo": `${Math.min(Math.max(bottle.width, 0.04), 0.22) * 100}%`,
        } as CSSProperties;
        const label = `${rank ? `${rank}. ` : ""}${bottle.name}${bottle.vintage ? ` ${bottle.vintage}` : ""}`;
        return rank
          ? <button type="button" key={bottleIndex} className={`wine-shelf-pin rank-${Math.min(rank, 4)}${activeBottle === bottleIndex ? " is-active" : ""}`} style={style} aria-label={label} aria-pressed={activeBottle === bottleIndex} onClick={() => { setActiveBottle(bottleIndex); if (variant === "inline") document.getElementById(`wine-shelf-choice-${bottleIndex}`)?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" }); }}><b>{rank}</b></button>
          : <span key={bottleIndex} className="wine-shelf-dot" style={style} title={label} aria-hidden="true" />;
      })}
    </div>;
  }

  const zoomedChoice = result && activeBottle !== null && result.bottles[activeBottle]?.image_index === zoomedPhoto
    ? result.recommendations.find((item) => item.bottle_index === activeBottle) || null
    : null;

  if (showResult && result) {
    return <div ref={resultRef} className="wine-shelf-result" tabIndex={-1}>
      <header className="wine-shelf-result-heading">
        <div>
          <span>{it ? "Quale compro?" : "Which one should I buy?"}</span>
          <h3>{result.bottles.length
            ? (it ? `${result.bottles.length} etichette riconosciute` : `${result.bottles.length} labels recognized`)
            : (it ? "Nessuna etichetta leggibile" : "No legible label")}</h3>
        </div>
        <div className="wine-shelf-result-meta">
          <span>{it ? "Costo AI" : "AI cost"} {formatAiBudget(result.estimated_cost_usd)}</span>
          {result.taste_profile_applied ? <span className="is-profile">{it ? "Profilo gusto applicato" : "Taste profile applied"}</span> : null}
          <small>{result.model}</small>
          <button type="button" className="secondary compact" onClick={() => setShowResult(false)}>{it ? "Nuova analisi" : "New analysis"}</button>
        </div>
      </header>
      {result.summary ? <p className="wine-shelf-summary">{result.summary}</p> : null}
      {previews.length ? <div className="wine-shelf-photos">
        {previews.map((url, photoIndex) => <figure key={url} className="wine-shelf-photo">
          {renderShelfFrame(url, photoIndex, "inline")}
          <figcaption>
            {previews.length > 1 ? <span>{it ? `Foto ${photoIndex + 1}` : `Photo ${photoIndex + 1}`}</span> : null}
            <button type="button" className="secondary compact" onClick={() => openZoom(photoIndex)}><AppIcon name="search" size="0.95rem" />{it ? "Ingrandisci" : "Enlarge"}</button>
          </figcaption>
        </figure>)}
        {result.bottles.length > result.recommendations.length ? <label className="pairing-option wine-shelf-toggle"><input type="checkbox" checked={showAllLabels} onChange={(event) => setShowAllLabels(event.target.checked)} /><span>{it ? "Mostra tutte le etichette riconosciute" : "Show every recognized label"}</span></label> : null}
        <small className="wine-shelf-note">{it ? "Le posizioni sono indicative: controlla l'etichetta sulla bottiglia." : "Positions are approximate: check the label on the bottle."}</small>
      </div> : null}
      {result.recommendations.length ? <ol className="wine-shelf-ranking" aria-label={it ? "Classifica" : "Ranking"}>
        {result.recommendations.map((item) => {
          const bottle = result.bottles[item.bottle_index];
          if (!bottle) return null;
          const saved = savedBottles.has(item.bottle_index);
          return <li key={item.bottle_index} id={`wine-shelf-choice-${item.bottle_index}`} className={`wine-shelf-choice rank-${Math.min(item.rank, 4)}${activeBottle === item.bottle_index ? " is-active" : ""}`} onClick={() => setActiveBottle(item.bottle_index)}>
            <div className="wine-shelf-choice-head">
              <span className="wine-shelf-medal" aria-hidden="true">{item.rank}</span>
              <div>
                <strong>{bottle.name}</strong>
                {identity(bottle) ? <span>{identity(bottle)}</span> : null}
                {item.taste_affinity > 0 ? <span className="restaurant-taste-affinity" aria-label={it ? `Affinità AI con il tuo gusto: ${item.taste_affinity} su 6` : `AI taste affinity: ${item.taste_affinity} out of 6`}>{Array.from({ length: 6 }, (_, heart) => <i key={heart} className={heart < item.taste_affinity ? "filled" : ""} aria-hidden="true">♥</i>)}</span> : null}
              </div>
              <b className={bottle.price_text ? "" : "is-missing"}>{bottle.price_text || (budget.trim()
                ? (it ? "Prezzo non leggibile · budget non verificato" : "Price not legible · budget not checked")
                : (it ? "Prezzo da verificare" : "Check the price"))}</b>
            </div>
            <p>{item.reason}</p>
            <div className="wine-shelf-choice-badges">
              {bottle.owned ? <span className="is-owned">{it ? "Già in cantina" : "Already in your cellar"}</span> : null}
              {bottle.confidence === "low" ? <span className="is-uncertain">{it ? "Lettura incerta" : "Uncertain reading"}</span> : null}
              <button type="button" className="secondary compact" disabled={!canWriteWishlist || saved || savingBottle === item.bottle_index} onClick={(event) => { event.stopPropagation(); void addToWishlist(bottle, item.bottle_index, item.reason); }}>
                {saved ? (it ? "In wishlist" : "In wishlist") : savingBottle === item.bottle_index ? (it ? "Aggiunta…" : "Adding…") : (it ? "Aggiungi alla wishlist" : "Add to wishlist")}
              </button>
            </div>
          </li>;
        })}
      </ol> : <p className="wine-shelf-empty">{it ? "Nessuna bottiglia rispetta i limiti indicati. Prova ad allargare budget o tipologia, oppure fotografa un altro scaffale." : "No bottle fits the limits you set. Try a wider budget or type, or photograph another shelf."}</p>}
      {error ? <p className="restaurant-wine-list-error" role="alert">{error}</p> : null}
      {result.bottles.length ? <WineListChat key={resultKey} locale={locale} canGenerateAi={canGenerateAi} wines={result.bottles.map(({ name, producer, vintage, price_text, style }) => ({ name, producer, vintage, price_text, style }))} dish={occasion} maxPriceChf={budget} ignorePreferences={ignoreTaste} setting="shop" suggestions={suggestions} scope={it ? `Risponde solo sulle ${result.bottles.length} bottiglie riconosciute.` : `Answers only about the ${result.bottles.length} recognized bottles.`} onAsk={onAsk} /> : null}
      <dialog ref={zoomDialogRef} className="wine-shelf-zoom" aria-label={it ? "Foto dello scaffale ingrandita" : "Enlarged shelf photo"} onClose={() => setZoomedPhoto(null)}>
        {zoomedPhoto !== null && previews[zoomedPhoto] ? <>
          <header className="wine-shelf-zoom-bar">
            <strong>{previews.length > 1 ? (it ? `Foto ${zoomedPhoto + 1} di ${previews.length}` : `Photo ${zoomedPhoto + 1} of ${previews.length}`) : (it ? "Scaffale" : "Shelf")}</strong>
            <div className="wine-shelf-zoom-actions">
              {previews.length > 1 ? <button type="button" className="secondary compact" aria-label={it ? "Foto precedente" : "Previous photo"} disabled={zoomedPhoto === 0} onClick={() => { setZoom(1); setZoomedPhoto(zoomedPhoto - 1); }}><AppIcon name="chevron-left" size="1rem" /></button> : null}
              {previews.length > 1 ? <button type="button" className="secondary compact" aria-label={it ? "Foto successiva" : "Next photo"} disabled={zoomedPhoto === previews.length - 1} onClick={() => { setZoom(1); setZoomedPhoto(zoomedPhoto + 1); }}><AppIcon name="chevron-right" size="1rem" /></button> : null}
              <button type="button" className="secondary compact" aria-label={it ? "Riduci" : "Zoom out"} disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 1))}>−</button>
              <span aria-live="polite">{zoom}×</span>
              <button type="button" className="secondary compact" aria-label={it ? "Ingrandisci di più" : "Zoom in"} disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 1))}>+</button>
              <button type="button" className="compact" onClick={() => setZoomedPhoto(null)}>{it ? "Chiudi" : "Close"}</button>
            </div>
          </header>
          <div className={`wine-shelf-zoom-stage${zoom > 1 ? " is-zoomed" : ""}`}>
            {renderShelfFrame(previews[zoomedPhoto], zoomedPhoto, "zoom")}
          </div>
          {zoomedChoice && activeBottle !== null ? <footer className={`wine-shelf-zoom-choice rank-${Math.min(zoomedChoice.rank, 4)}`}>
            <span className="wine-shelf-medal" aria-hidden="true">{zoomedChoice.rank}</span>
            <div><strong>{result.bottles[activeBottle].name}{result.bottles[activeBottle].vintage ? ` ${result.bottles[activeBottle].vintage}` : ""}</strong><span>{result.bottles[activeBottle].price_text || (it ? "Prezzo da verificare" : "Check the price")}</span></div>
          </footer> : null}
        </> : null}
      </dialog>
      {result.bottles.length ? <details className="wine-shelf-all"><summary>{it ? `Tutte le etichette riconosciute (${result.bottles.length})` : `Every recognized label (${result.bottles.length})`}</summary><ul>{result.bottles.map((bottle, index) => <li key={index}><span>{[bottle.name, bottle.producer, bottle.vintage].filter(Boolean).join(" · ")}</span>{bottle.price_text ? <b>{bottle.price_text}</b> : null}</li>)}</ul></details> : null}
    </div>;
  }

  return <form className="wine-shelf-form" onSubmit={(event) => void scan(event)}>
    <div className="wine-shelf-intro">
      <span>{it ? "In enoteca" : "In the wine shop"}</span>
      <h3>{it ? "Fotografa lo scaffale: ti dico quale comprare" : "Photograph the shelf: I'll tell you which one to buy"}</h3>
      <p>{it ? "L'AI riconosce le etichette leggibili e le mette in classifica per il tuo gusto, il budget e la tua cantina." : "AI reads every legible label and ranks the bottles for your taste, budget and cellar."}</p>
    </div>
    <div className="wine-shelf-capture">
      <label className="wine-shelf-camera"><span><AppIcon name="camera" size="1.3rem" /><b>{photos.length ? (it ? "Scatta un'altra foto" : "Take another photo") : (it ? "Fotografa lo scaffale" : "Photograph the shelf")}</b></span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => addPhotos(event.currentTarget)} disabled={disabled || photos.length >= maxPhotos} /></label>
      <label className="wine-shelf-upload"><span><AppIcon name="import" size="1.05rem" /><b>{it ? "Carica foto" : "Upload photos"}</b></span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => addPhotos(event.currentTarget)} disabled={disabled || photos.length >= maxPhotos} /></label>
      {previews.length ? <ol className="wine-shelf-thumbs" aria-label={it ? "Foto dello scaffale" : "Shelf photos"}>{previews.map((url, index) => <li key={url}><img src={url} alt="" /><button type="button" className="secondary compact" aria-label={it ? `Rimuovi foto ${index + 1}` : `Remove photo ${index + 1}`} onClick={() => { setPhotos((current) => current.filter((_, position) => position !== index)); setResult(null); }} disabled={scanning}><AppIcon name="delete" size="0.9rem" /></button></li>)}</ol> : null}
      <small>{it ? `Fino a ${maxPhotos} foto, una per tratto di parete. Avvicinati quanto basta per leggere le etichette. Le foto non vengono archiviate.` : `Up to ${maxPhotos} photos, one per stretch of wall. Get close enough to read the labels. Photos are not stored.`}</small>
    </div>
    <div className="wine-shelf-fields">
      <label><span>{it ? "Budget massimo (CHF)" : "Maximum budget (CHF)"}</span><input type="number" min="1" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="40" disabled={scanning} /><small>{it ? "Si applica solo alle bottiglie con prezzo leggibile: le altre restano in classifica." : "Applies only to bottles with a legible price: the others stay in the ranking."}</small></label>
      <label><span>{it ? "Tipologia" : "Wine type"}</span><select value={wineType} onChange={(event) => setWineType(event.target.value)} disabled={scanning}>
        <option value="">{it ? "Qualsiasi" : "Any"}</option>
        <option value="Red">{it ? "Rosso" : "Red"}</option>
        <option value="White">{it ? "Bianco" : "White"}</option>
        <option value="Rose">Rosé</option>
        <option value="Sparkling">{it ? "Bollicine" : "Sparkling"}</option>
        <option value="Sweet">{it ? "Dolce" : "Sweet"}</option>
        <option value="Fortified">{it ? "Fortificato" : "Fortified"}</option>
      </select></label>
      <label className="is-wide"><span>{it ? "Occasione o piatto (facoltativo)" : "Occasion or dish (optional)"}</span><input value={occasion} maxLength={240} onChange={(event) => setOccasion(event.target.value)} placeholder={it ? "Es. regalo, cena con brasato, da tenere in cantina" : "E.g. a gift, braised beef dinner, to cellar"} disabled={scanning} /></label>
      <label><span>{it ? "La mia cantina" : "My cellar"}</span><select value={cellarMode} onChange={(event) => setCellarMode(event.target.value as WineShelfCellarMode)} disabled={scanning}>
        <option value="avoid_owned">{it ? "Evita vini che ho già" : "Avoid wines I already own"}</option>
        <option value="fill_gaps">{it ? "Riempi i buchi della cantina" : "Fill the gaps in my cellar"}</option>
        <option value="ignore">{it ? "Non considerarla" : "Do not consider it"}</option>
      </select></label>
      <label><span>{it ? "Bottiglie in classifica" : "Bottles to rank"}</span><select value={rankingSize} onChange={(event) => setRankingSize(Number(event.target.value))} disabled={scanning}>
        {[1, 2, 3, 4, 5].map((size) => <option key={size} value={size}>{size}</option>)}
      </select></label>
    </div>
    <label className="pairing-option"><input type="checkbox" checked={ignoreTaste} onChange={(event) => setIgnoreTaste(event.target.checked)} disabled={scanning} /><span>{it ? "Non usare il mio profilo gusto" : "Do not use my taste profile"}</span></label>
    <button type="submit" className="wine-shelf-submit" disabled={disabled}>{scanning ? (it ? "Leggo le etichette…" : "Reading the labels…") : (it ? "Quale compro?" : "Which one should I buy?")}</button>
    {scanning ? <p className="wine-shelf-progress" role="status">{it ? "Leggo lo scaffale a sezioni: uno scaffale affollato può richiedere un paio di minuti." : "The shelf is read in sections: a crowded shelf can take a couple of minutes."}</p> : null}
    {error ? <p className="restaurant-wine-list-error" role="alert">{error}</p> : null}
    {result ? <button type="button" className="secondary compact" onClick={() => setShowResult(true)}>{it ? "Torna all'ultima classifica" : "Back to the last ranking"}</button> : null}
  </form>;
}

export default WineShelfScanner;
