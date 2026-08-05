import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { loadMapConfig } from "../services/mapConfig";
import type { Locale } from "../types";
import MapBaseLayers from "./MapBaseLayers";
import "./VineyardLocationEditor.css";

type VineyardLocationEditorProps = {
  locale: Locale;
  label: string;
  latitude: number | null;
  longitude: number | null;
  onSave: (latitude: number, longitude: number) => Promise<void>;
};

type Point = { latitude: number; longitude: number };
type GeocodeCandidate = Point & { address: string; score: number };

function MapViewport({ point, searchFocus }: { point: Point | null; searchFocus: Point | null }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize({ pan: false });
    const target = searchFocus || point;
    if (target) map.setView([target.latitude, target.longitude], 15, { animate: false });
  }, [map, point?.latitude, point?.longitude, searchFocus?.latitude, searchFocus?.longitude]);

  return null;
}

function MapPointPicker({ point, label, onChange }: { point: Point | null; label: string; onChange: (point: Point) => void }) {
  useMapEvents({
    click(event) {
      onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  if (!point) return null;
  return (
    <CircleMarker
      center={[point.latitude, point.longitude]}
      radius={9}
      pathOptions={{ color: "#fffaf0", weight: 3, fillColor: "#76233d", fillOpacity: 0.95 }}
    >
      <Tooltip permanent direction="top" offset={[0, -8]}>{label}</Tooltip>
    </CircleMarker>
  );
}

export default function VineyardLocationEditor({ locale, label, latitude, longitude, onSave }: VineyardLocationEditorProps) {
  const isItalian = locale === "it";
  const initialPoint = latitude !== null && longitude !== null ? { latitude, longitude } : null;
  const [point, setPoint] = useState<Point | null>(initialPoint);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [locationQuery, setLocationQuery] = useState(label);
  const [locationResults, setLocationResults] = useState<GeocodeCandidate[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState("");
  const [searchFocus, setSearchFocus] = useState<GeocodeCandidate | null>(null);

  useEffect(() => {
    setPoint(latitude !== null && longitude !== null ? { latitude, longitude } : null);
    setError("");
    setLocationQuery(label);
    setLocationResults([]);
    setLocationSearchError("");
    setSearchFocus(null);
  }, [label, latitude, longitude]);

  const changed = Boolean(point && (
    latitude === null
    || longitude === null
    || Math.abs(point.latitude - latitude) > 0.0000001
    || Math.abs(point.longitude - longitude) > 0.0000001
  ));

  function updateCoordinate(field: keyof Point, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setSearchFocus(null);
    setPoint((current) => ({
      latitude: current?.latitude ?? 46.5,
      longitude: current?.longitude ?? 8.5,
      [field]: parsed,
    }));
  }

  async function savePoint() {
    if (!point) return;
    setSaving(true);
    setError("");
    try {
      await onSave(point.latitude, point.longitude);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : (isItalian ? "Impossibile salvare il punto." : "Unable to save the point."));
    } finally {
      setSaving(false);
    }
  }

  async function searchLocation() {
    const query = locationQuery.trim();
    if (query.length < 3) {
      setLocationSearchError(isItalian ? "Inserisci almeno 3 caratteri." : "Enter at least 3 characters.");
      return;
    }
    setLocationSearching(true);
    setLocationSearchError("");
    setLocationResults([]);
    try {
      const mapConfig = await loadMapConfig();
      if (!mapConfig.arcgis_api_key) {
        throw new Error(isItalian ? "Ricerca non configurata: manca la chiave ArcGIS." : "Search is not configured: the ArcGIS key is missing.");
      }
      const params = new URLSearchParams({
        SingleLine: query,
        f: "json",
        token: mapConfig.arcgis_api_key,
        outSR: "4326",
        maxLocations: "5",
        forStorage: "false",
      });
      const response = await fetch(`https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`);
      if (!response.ok) throw new Error(isItalian ? "Il servizio di ricerca non risponde." : "The search service is unavailable.");
      const payload = await response.json() as {
        candidates?: Array<{ address?: string; score?: number; location?: { x?: number; y?: number } }>;
        error?: { message?: string };
      };
      if (payload.error?.message) throw new Error(payload.error.message);
      const candidates = (payload.candidates || []).flatMap((candidate) => {
        const latitude = Number(candidate.location?.y);
        const longitude = Number(candidate.location?.x);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
        return [{
          address: String(candidate.address || query),
          score: Number(candidate.score || 0),
          latitude,
          longitude,
        }];
      });
      setLocationResults(candidates);
      if (!candidates.length) {
        setLocationSearchError(isItalian ? "Nessun luogo trovato. Prova con produttore, località e paese." : "No places found. Try producer, locality and country.");
      }
    } catch (searchError) {
      setLocationSearchError(searchError instanceof Error ? searchError.message : (isItalian ? "Ricerca non riuscita." : "Search failed."));
    } finally {
      setLocationSearching(false);
    }
  }

  function focusLocation(candidate: GeocodeCandidate) {
    setSearchFocus(candidate);
    setLocationResults([]);
    setLocationSearchError(isItalian
      ? "Zona trovata: clicca sulla mappa per impostare il punto preciso."
      : "Area found: click the map to set the exact point.");
  }

  const mapCentre: [number, number] = point ? [point.latitude, point.longitude] : [46.5, 8.5];
  return (
    <div className="vineyard-location-editor">
      <div className="vineyard-location-editor-heading">
        <div>
          <strong>{isItalian ? "Verifica il punto sulla mappa" : "Check the point on the map"}</strong>
          <small>{isItalian ? "Clicca sulla posizione esatta della tenuta o inserisci le coordinate." : "Click the exact estate location or enter its coordinates."}</small>
        </div>
        {latitude !== null && longitude !== null ? (
          <button type="button" className="secondary compact" disabled={!changed || saving} onClick={() => { setPoint(initialPoint); setSearchFocus(null); }}>
            {isItalian ? "Ripristina" : "Reset"}
          </button>
        ) : null}
      </div>
      <form className="vineyard-location-search" onSubmit={(event) => { event.preventDefault(); void searchLocation(); }}>
        <input
          type="search"
          maxLength={200}
          value={locationQuery}
          onChange={(event) => setLocationQuery(event.target.value)}
          placeholder={isItalian ? "Cerca tenuta, indirizzo o località" : "Search estate, address or locality"}
          aria-label={isItalian ? "Cerca un luogo sulla mappa" : "Search for a place on the map"}
        />
        <button type="submit" className="secondary compact" disabled={locationSearching}>
          {locationSearching ? (isItalian ? "Cerco…" : "Searching…") : (isItalian ? "Cerca luogo" : "Search place")}
        </button>
      </form>
      {locationResults.length ? (
        <div className="vineyard-location-search-results">
          {locationResults.map((candidate, index) => (
            <button
              type="button"
              key={`${candidate.latitude}:${candidate.longitude}:${index}`}
              onClick={() => focusLocation(candidate)}
            >
              <span>{candidate.address}</span>
              <small>{Math.round(candidate.score)}%</small>
            </button>
          ))}
        </div>
      ) : null}
      {locationSearchError ? <p className="vineyard-location-search-feedback">{locationSearchError}</p> : null}
      <MapContainer center={mapCentre} zoom={point ? 15 : 5} scrollWheelZoom className="vineyard-location-editor-map">
        <MapBaseLayers locale={locale} />
        <MapViewport point={point} searchFocus={searchFocus} />
        {searchFocus ? (
          <CircleMarker
            center={[searchFocus.latitude, searchFocus.longitude]}
            radius={11}
            pathOptions={{ color: "#1f5d78", weight: 3, dashArray: "5 4", fillColor: "#fffaf0", fillOpacity: 0.8 }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>{searchFocus.address}</Tooltip>
          </CircleMarker>
        ) : null}
        <MapPointPicker point={point} label={label} onChange={(nextPoint) => { setPoint(nextPoint); setSearchFocus(null); }} />
      </MapContainer>
      <div className="vineyard-location-editor-controls">
        <label>
          <span>{isItalian ? "Latitudine" : "Latitude"}</span>
          <input type="number" min="-90" max="90" step="0.000001" value={point?.latitude ?? ""} onChange={(event) => updateCoordinate("latitude", event.target.value)} />
        </label>
        <label>
          <span>{isItalian ? "Longitudine" : "Longitude"}</span>
          <input type="number" min="-180" max="180" step="0.000001" value={point?.longitude ?? ""} onChange={(event) => updateCoordinate("longitude", event.target.value)} />
        </label>
        <button type="button" className="compact" disabled={!point || !changed || saving} onClick={() => void savePoint()}>
          {saving ? (isItalian ? "Salvo…" : "Saving…") : (isItalian ? "Salva punto preciso" : "Save precise point")}
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
