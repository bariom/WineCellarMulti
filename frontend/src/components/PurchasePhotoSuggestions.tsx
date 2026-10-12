import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Locale, PurchasePhotoSuggestion } from "../types";

export default function PurchasePhotoSuggestions({ name, producer, locale, selected, onSelect }: {
  name: string; producer: string; locale: Locale; selected: string; onSelect: (id: string) => void;
}) {
  const it = locale === "it";
  const identity = JSON.stringify([name.trim(), producer.trim()]);
  const [result, setResult] = useState<{ identity: string; photos: PurchasePhotoSuggestion[]; failed?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (name.trim().length < 2 || !producer.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ name: name.trim(), producer: producer.trim() });
      void api<PurchasePhotoSuggestion[]>(`/api/v1/imports/purchases/photo-suggestions?${query}`, { signal: controller.signal })
        .then(photos => { if (!controller.signal.aborted) setResult({ identity, photos }); })
        .catch(() => { if (!controller.signal.aborted) setResult({ identity, photos: [], failed: true }); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [identity, name, producer, retry]);
  if (name.trim().length < 2 || !producer.trim() || result?.identity !== identity) return null;
  if (result.failed) return <div className="purchase-photo-error"><small>{it ? "Fotografie non disponibili. Puoi continuare senza foto." : "Photos unavailable. You can continue without a photo."}</small><button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>{it ? "Riprova foto" : "Retry photos"}</button></div>;
  if (!result.photos.length) return null;
  return <section className="purchase-photo-suggestions" aria-label={it ? "Fotografie disponibili" : "Available photos"}>
    <div><strong>{it ? "Una foto per il tuo vino" : "A photo for your wine"}</strong><p>{it ? "Disponibile nella libreria condivisa. È una foto di riferimento: verifica annata e formato. La scelta è facoltativa." : "Available in the shared library. This is a reference photo: check vintage and bottle format. Choosing a photo is optional."}</p></div>
    <div className="purchase-photo-options" role="group" aria-label={it ? "Scegli una fotografia" : "Choose a photo"}>
      <button type="button" className="secondary purchase-photo-none" aria-pressed={!selected} onClick={() => onSelect("")}>{it ? "Senza foto" : "No photo"}</button>
      {result.photos.map((photo, index) => <button key={photo.id} type="button" className="secondary purchase-photo-option" aria-pressed={selected === photo.id} aria-label={`${it ? "Usa fotografia" : "Use photo"} ${index + 1}`} onClick={() => onSelect(photo.id)}><img src={photo.thumbnail_url} alt="" /><span>{selected === photo.id ? (it ? "Selezionata" : "Selected") : (it ? "Usa foto" : "Use photo")}</span></button>)}
    </div>
  </section>;
}
