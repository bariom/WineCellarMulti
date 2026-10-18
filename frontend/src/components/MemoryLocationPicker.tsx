import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { PhotoLocation } from "../domain/photoLocation";
import { loadMapConfig } from "../services/mapConfig";
import type { Locale } from "../types";
import MapBaseLayers from "./MapBaseLayers";
import "./MemoryLocationPicker.css";

type Candidate = PhotoLocation & { address: string };

// Southern Switzerland / northern Italy until the user searches or taps.
const DEFAULT_CENTRE: [number, number] = [45.9, 9.0];

function FollowPoint({ point }: { point: PhotoLocation | null }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize({ pan: false });
    if (point) map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 15), { animate: false });
  }, [map, point?.latitude, point?.longitude]);
  return null;
}

function TapToPlace({ onPick }: { onPick: (point: PhotoLocation) => void }) {
  useMapEvents({ click: (event) => onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  return null;
}

/** Lets the user place a memory photo whose GPS is missing: address search or a tap on the map. */
export default function MemoryLocationPicker({ locale, initial, onConfirm, onCancel }: {
  locale: Locale; initial: PhotoLocation | null; onConfirm: (location: PhotoLocation) => void; onCancel: () => void;
}) {
  const it = locale === "it";
  const [point, setPoint] = useState<PhotoLocation | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  async function search() {
    const text = query.trim();
    if (text.length < 3) { setMessage(it ? "Inserisci almeno 3 caratteri." : "Enter at least 3 characters."); return; }
    setSearching(true); setMessage(""); setResults([]);
    try {
      const { arcgis_api_key: token } = await loadMapConfig();
      if (!token) throw new Error(it ? "Ricerca non disponibile: tocca la mappa per indicare il luogo." : "Search unavailable: tap the map to place it.");
      const params = new URLSearchParams({ SingleLine: text, f: "json", token, outSR: "4326", maxLocations: "5", forStorage: "false" });
      const response = await fetch(`https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`);
      if (!response.ok) throw new Error(it ? "Il servizio di ricerca non risponde." : "The search service is unavailable.");
      const payload = await response.json() as { candidates?: Array<{ address?: string; location?: { x?: number; y?: number } }> };
      const found = (payload.candidates || []).flatMap((candidate) => {
        const latitude = Number(candidate.location?.y), longitude = Number(candidate.location?.x);
        return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ address: String(candidate.address || text), latitude, longitude }] : [];
      });
      setResults(found);
      if (!found.length) setMessage(it ? "Nessun luogo trovato: prova con via e località, o tocca la mappa." : "No place found: try street and town, or tap the map.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (it ? "Ricerca non riuscita." : "Search failed."));
    } finally { setSearching(false); }
  }

  return <div className="memory-location-picker" role="group" aria-label={it ? "Indica il luogo della foto" : "Set the photo location"}>
    <p>{it ? "Cerca un indirizzo o tocca la mappa nel punto in cui hai scattato la foto." : "Search an address or tap the map where you took the photo."}</p>
    <div className="memory-location-search">
      <input type="search" value={query} aria-label={it ? "Cerca indirizzo o località" : "Search address or place"} placeholder={it ? "Via, località, ristorante…" : "Street, town, restaurant…"}
        onChange={(event) => setQuery(event.target.value)}
        // Inside the tasting form: Enter searches instead of submitting the form.
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} />
      <button type="button" className="secondary" disabled={searching} onClick={() => void search()}>{searching ? (it ? "Ricerca…" : "Searching…") : (it ? "Cerca" : "Search")}</button>
    </div>
    {results.length ? <ul className="memory-location-results" aria-label={it ? "Luoghi trovati" : "Places found"}>
      {results.map((candidate) => <li key={`${candidate.latitude},${candidate.longitude}`}>
        <button type="button" onClick={() => { setPoint(candidate); setResults([]); setMessage(it ? "Luogo trovato: tocca la mappa per rifinirlo." : "Place found: tap the map to refine it."); }}>{candidate.address}</button>
      </li>)}
    </ul> : null}
    {message ? <small role="status">{message}</small> : null}
    <div className="memory-location-map">
      <MapContainer center={point ? [point.latitude, point.longitude] : DEFAULT_CENTRE} zoom={point ? 15 : 7} scrollWheelZoom={false}>
        <MapBaseLayers locale={locale} />
        <FollowPoint point={point} />
        <TapToPlace onPick={setPoint} />
        {point ? <CircleMarker center={[point.latitude, point.longitude]} radius={9} pathOptions={{ color: "#fffaf0", weight: 3, fillColor: "#76233d", fillOpacity: .95 }} /> : null}
      </MapContainer>
    </div>
    <small className="memory-location-coordinates">{point ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : (it ? "Nessun punto scelto" : "No point selected")}</small>
    <div className="memory-location-actions">
      <button type="button" disabled={!point} onClick={() => point && onConfirm(point)}>{it ? "Usa questo luogo" : "Use this place"}</button>
      <button type="button" className="secondary" onClick={onCancel}>{it ? "Annulla" : "Cancel"}</button>
    </div>
  </div>;
}
