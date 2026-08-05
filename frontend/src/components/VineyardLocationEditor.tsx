import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
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

function MapViewport({ point }: { point: Point | null }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize({ pan: false });
    if (point) map.setView([point.latitude, point.longitude], 15, { animate: false });
  }, [map, point?.latitude, point?.longitude]);

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

  useEffect(() => {
    setPoint(latitude !== null && longitude !== null ? { latitude, longitude } : null);
    setError("");
  }, [latitude, longitude]);

  const changed = Boolean(point && (
    latitude === null
    || longitude === null
    || Math.abs(point.latitude - latitude) > 0.0000001
    || Math.abs(point.longitude - longitude) > 0.0000001
  ));

  function updateCoordinate(field: keyof Point, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
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

  const mapCentre: [number, number] = point ? [point.latitude, point.longitude] : [46.5, 8.5];
  return (
    <div className="vineyard-location-editor">
      <div className="vineyard-location-editor-heading">
        <div>
          <strong>{isItalian ? "Verifica il punto sulla mappa" : "Check the point on the map"}</strong>
          <small>{isItalian ? "Clicca sulla posizione esatta della tenuta o inserisci le coordinate." : "Click the exact estate location or enter its coordinates."}</small>
        </div>
        {latitude !== null && longitude !== null ? (
          <button type="button" className="secondary compact" disabled={!changed || saving} onClick={() => setPoint(initialPoint)}>
            {isItalian ? "Ripristina" : "Reset"}
          </button>
        ) : null}
      </div>
      <MapContainer center={mapCentre} zoom={point ? 15 : 5} scrollWheelZoom className="vineyard-location-editor-map">
        <MapBaseLayers locale={locale} />
        <MapViewport point={point} />
        <MapPointPicker point={point} label={label} onChange={setPoint} />
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
