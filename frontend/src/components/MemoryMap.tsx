import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import type { PhotoLocation } from "../domain/photoLocation";
import type { Locale } from "../types";
import "leaflet/dist/leaflet.css";

export default function MemoryMap({ location, locale }: { location: PhotoLocation; locale: Locale }) {
  const position: [number, number] = [location.latitude, location.longitude];
  return <div>
    <div role="region" aria-label={locale === "it" ? "Luogo della foto" : "Photo location"}>
      <MapContainer center={position} zoom={13} scrollWheelZoom={false} style={{ height: 260, width: "100%", borderRadius: 16, marginTop: 12 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
        <CircleMarker center={position} radius={9} pathOptions={{ color: "#76233d", fillOpacity: .8 }} />
      </MapContainer>
    </div>
    <small>{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</small>
  </div>;
}
