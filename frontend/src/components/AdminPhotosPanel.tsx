import { useEffect, useState } from "react";

import { api } from "../services/api";
import type { Locale, OperationalWinePhotos } from "../types";
import { LoadingState } from "./AppUi";
import "./AdminPhotosPanel.css";

type DemoCandidate = {
  wine_id: string;
  name: string;
  producer: string;
  vintage: string;
  quantity: number;
  type: string;
  thumbnail_url: string;
};

type DemoCellarState = {
  published_count: number;
  selected_wine_ids: string[];
  candidates: DemoCandidate[];
};

export function AdminPhotosPanel({ locale }: { locale: Locale }) {
  const isItalian = locale === "it";
  const [winePhotos, setWinePhotos] = useState<OperationalWinePhotos | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState("");
  const [syncingPhotoLibrary, setSyncingPhotoLibrary] = useState(false);
  const [demoCellar, setDemoCellar] = useState<DemoCellarState | null>(null);
  const [demoSelection, setDemoSelection] = useState<string[]>([]);
  const [publishingDemo, setPublishingDemo] = useState(false);

  async function loadWinePhotos() {
    try {
      setPhotoError("");
      setWinePhotos(await api<OperationalWinePhotos>("/api/v1/admin/operations/photos?limit=200"));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to load bottle photos");
    }
  }

  async function loadDemoCellar() {
    try {
      setPhotoError("");
      const nextDemo = await api<DemoCellarState>("/api/v1/admin/operations/demo-cellar");
      setDemoCellar(nextDemo);
      setDemoSelection(nextDemo.selected_wine_ids);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to load demo cellar");
    }
  }

  useEffect(() => {
    void Promise.all([loadWinePhotos(), loadDemoCellar()]);
  }, []);

  function toggleDemoWine(wineId: string) {
    setDemoSelection((current) => current.includes(wineId)
      ? current.filter((value) => value !== wineId)
      : current.length < 75 ? [...current, wineId] : current);
  }

  async function publishDemoCellar() {
    if (!demoSelection.length) return;
    const confirmed = window.confirm(isItalian
      ? `Pubblicare ${demoSelection.length} vini nella cantina demo? La versione precedente sarà sostituita.`
      : `Publish ${demoSelection.length} wines to the demo cellar? The previous version will be replaced.`);
    if (!confirmed) return;
    setPublishingDemo(true);
    setPhotoError("");
    try {
      const published = await api<{ published_count: number; selected_wine_ids: string[] }>("/api/v1/admin/operations/demo-cellar", {
        method: "PUT",
        body: JSON.stringify({ wine_ids: demoSelection }),
      });
      setDemoCellar((current) => current ? {
        ...current,
        published_count: published.published_count,
        selected_wine_ids: published.selected_wine_ids,
      } : current);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to publish demo cellar");
    } finally {
      setPublishingDemo(false);
    }
  }

  async function deleteWinePhoto(wineId: string, label: string) {
    const confirmed = window.confirm(isItalian
      ? `Rimuovere ${label} dall'archivio fotografico condiviso?`
      : `Remove ${label} from the shared photo archive?`);
    if (!confirmed) return;
    setDeletingPhotoId(wineId);
    try {
      await api<void>(`/api/v1/admin/operations/photos/${wineId}`, { method: "DELETE" });
      setWinePhotos((current) => current ? {
        total: Math.max(0, current.total - 1),
        items: current.items.filter((item) => item.wine_id !== wineId),
      } : current);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to delete bottle photo");
    } finally {
      setDeletingPhotoId("");
    }
  }

  async function syncPhotoLibrary() {
    setSyncingPhotoLibrary(true);
    setPhotoError("");
    try {
      await api<{ processed: number; added: number; total: number }>("/api/v1/admin/operations/photos/sync-library", { method: "POST" });
      await loadWinePhotos();
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to synchronize the photo library");
    } finally {
      setSyncingPhotoLibrary(false);
    }
  }

  return (
    <>
    <section className="settings-card settings-card-wide admin-demo-card">
      <details className="collapsible-panel admin-demo-panel">
      <summary className="settings-card-heading admin-photos-heading">
        <div>
          <span>{isItalian ? "Presentazione pubblica" : "Public presentation"}</span>
          <h3>{isItalian ? "Cantina demo" : "Demo cellar"}</h3>
          <small>{isItalian
            ? "Scegli dalla cantina attiva i vini con fotografia. La pubblicazione crea una copia sanitizzata e in sola lettura."
            : "Choose photographed wines from the active cellar. Publishing creates a sanitized, read-only copy."}</small>
        </div>
        <div className="admin-photos-heading-actions">
          <strong>{demoCellar?.published_count ?? "—"}</strong>
        </div>
      </summary>
      <div className="admin-demo-panel-content">
        <div className="admin-demo-panel-actions">
          <button type="button" className="secondary compact" onClick={() => void loadDemoCellar()}>{isItalian ? "Aggiorna" : "Refresh"}</button>
        </div>
      {demoCellar ? (
        demoCellar.candidates.length ? (
          <>
            <div className="admin-demo-toolbar">
              <span>{isItalian ? `${demoSelection.length} vini selezionati · massimo 75` : `${demoSelection.length} wines selected · 75 maximum`}</span>
              <button type="button" disabled={!demoSelection.length || publishingDemo} onClick={() => void publishDemoCellar()}>
                {publishingDemo ? (isItalian ? "Pubblicazione…" : "Publishing…") : (isItalian ? "Pubblica cantina demo" : "Publish demo cellar")}
              </button>
            </div>
            <div className="admin-demo-grid">
              {demoCellar.candidates.map((wine) => {
                const selected = demoSelection.includes(wine.wine_id);
                const label = [wine.name, wine.vintage].filter(Boolean).join(" ");
                return (
                  <label className={`admin-demo-wine${selected ? " selected" : ""}`} key={wine.wine_id}>
                    <input type="checkbox" checked={selected} disabled={!selected && demoSelection.length >= 75} onChange={() => toggleDemoWine(wine.wine_id)} />
                    <img src={wine.thumbnail_url} alt="" loading="lazy" />
                    <span><strong>{label}</strong><small>{wine.producer}</small><small>{wine.quantity} × {wine.type || (isItalian ? "vino" : "wine")}</small></span>
                  </label>
                );
              })}
            </div>
          </>
        ) : <p className="admin-photos-empty">{isItalian ? "Nella cantina attiva non ci sono ancora vini con fotografia." : "The active cellar has no photographed wines yet."}</p>
      ) : <LoadingState label={isItalian ? "Caricamento cantina demo…" : "Loading demo cellar…"} compact />}
      </div>
      </details>
    </section>
    <section className="settings-card settings-card-wide admin-photos-card">
      <div className="settings-card-heading admin-photos-heading">
        <div>
          <span>{isItalian ? "Amministrazione applicazione" : "Application administration"}</span>
          <h3>{isItalian ? "Fotografie bottiglia" : "Bottle photographs"}</h3>
          <small>
            {isItalian
              ? "Archivio centrale: ogni fotografia identica compare una sola volta."
              : "Central archive: each identical photograph appears only once."}
          </small>
        </div>
        <div className="admin-photos-heading-actions">
          <strong>{winePhotos?.total ?? "—"}</strong>
          <button type="button" className="secondary compact" disabled={syncingPhotoLibrary} onClick={() => void syncPhotoLibrary()}>
            {syncingPhotoLibrary ? (isItalian ? "Sincronizzazione…" : "Synchronizing…") : (isItalian ? "Sincronizza archivio" : "Sync archive")}
          </button>
          <button type="button" className="secondary compact" onClick={() => void loadWinePhotos()}>
            {isItalian ? "Aggiorna" : "Refresh"}
          </button>
        </div>
      </div>
      {photoError ? <p className="admin-photos-error" role="alert">{photoError}</p> : null}
      {winePhotos ? (
        winePhotos.items.length ? (
          <div className="admin-photos-grid">
            {winePhotos.items.map((photo) => {
              const label = [photo.name, photo.vintage].filter(Boolean).join(" ");
              return (
                <article className="admin-photo-card" key={photo.wine_id}>
                  <a href={photo.detail_url} target="_blank" rel="noreferrer" aria-label={`${isItalian ? "Apri fotografia" : "Open photograph"}: ${label}`}>
                    <img src={photo.thumbnail_url} alt={label} loading="lazy" />
                  </a>
                  <div>
                    <strong>{label}</strong>
                    <span>{photo.producer || (isItalian ? "Produttore non indicato" : "Producer not provided")}</span>
                    <small>{isItalian ? "Archivio fotografico condiviso" : "Shared photo library"}</small>
                  </div>
                  <button type="button" className="danger compact" disabled={deletingPhotoId === photo.wine_id} onClick={() => void deleteWinePhoto(photo.wine_id, label)}>
                    {deletingPhotoId === photo.wine_id
                      ? (isItalian ? "Eliminazione…" : "Deleting…")
                      : (isItalian ? "Elimina" : "Delete")}
                  </button>
                </article>
              );
            })}
          </div>
        ) : <p className="admin-photos-empty">{isItalian ? "Nessuna fotografia archiviata." : "No photographs stored."}</p>
      ) : <LoadingState label={isItalian ? "Caricamento fotografie…" : "Loading photographs…"} compact />}
    </section>
    </>
  );
}

export default AdminPhotosPanel;
