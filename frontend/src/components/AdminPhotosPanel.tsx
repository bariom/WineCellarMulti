import { useEffect, useState } from "react";

import { api } from "../services/api";
import type { Locale, OperationalWinePhotos } from "../types";
import { LoadingState } from "./AppUi";
import "./AdminPhotosPanel.css";

export function AdminPhotosPanel({ locale }: { locale: Locale }) {
  const isItalian = locale === "it";
  const [winePhotos, setWinePhotos] = useState<OperationalWinePhotos | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState("");

  async function loadWinePhotos() {
    try {
      setPhotoError("");
      setWinePhotos(await api<OperationalWinePhotos>("/api/v1/admin/operations/photos?limit=200"));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Unable to load bottle photos");
    }
  }

  useEffect(() => {
    void loadWinePhotos();
  }, []);

  async function deleteWinePhoto(wineId: string, label: string) {
    const confirmed = window.confirm(isItalian
      ? `Eliminare definitivamente la fotografia di ${label}?`
      : `Permanently delete the photograph for ${label}?`);
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

  return (
    <section className="settings-card settings-card-wide admin-photos-card">
      <div className="settings-card-heading admin-photos-heading">
        <div>
          <span>{isItalian ? "Amministrazione applicazione" : "Application administration"}</span>
          <h3>{isItalian ? "Fotografie bottiglia" : "Bottle photographs"}</h3>
          <small>
            {isItalian
              ? "Libreria globale delle fotografie caricate in tutte le cantine."
              : "Global library of photographs uploaded across all cellars."}
          </small>
        </div>
        <div className="admin-photos-heading-actions">
          <strong>{winePhotos?.total ?? "—"}</strong>
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
                    <small>{photo.household_name}</small>
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
  );
}

export default AdminPhotosPanel;
