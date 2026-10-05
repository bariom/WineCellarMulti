import { useEffect, useState } from "react";
import { divIcon } from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { api } from "../services/api";
import type { Locale, TastingArchiveApiItem, TastingArchivePage } from "../types";
import "leaflet/dist/leaflet.css";
import "./MemoryAtlas.css";

type LocatedMemory = TastingArchiveApiItem & {
  archiveIndex: number;
  memory_photo_location: { latitude: number; longitude: number };
};

function Locations({ memories, locale, onSelect }: {
  memories: LocatedMemory[]; locale: Locale; onSelect: (entries: LocatedMemory[]) => void;
}) {
  const [zoom, setZoom] = useState(0);
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  useEffect(() => { map.fitWorld({ animate: false }); setZoom(map.getZoom()); }, [map]);
  type Group = { x: number; y: number; entries: LocatedMemory[] };
  const groups: Group[] = [];
  const buckets = new Map<string, Group[]>();
  for (const entry of memories) {
    const location = entry.memory_photo_location;
    const point = map.project([location.latitude, location.longitude], zoom);
    const x = Math.floor(point.x / 50);
    const y = Math.floor(point.y / 50);
    let group: Group | undefined;
    for (let dx = -1; dx <= 1 && !group; dx++) {
      for (let dy = -1; dy <= 1 && !group; dy++) {
        group = buckets.get(`${x + dx}-${y + dy}`)?.find(candidate => Math.hypot(point.x - candidate.x, point.y - candidate.y) < 50);
      }
    }
    if (group) group.entries.push(entry);
    else {
      const next = { x: point.x, y: point.y, entries: [entry] };
      groups.push(next);
      const key = `${x}-${y}`;
      buckets.set(key, [...(buckets.get(key) || []), next]);
    }
  }
  return <>{groups.map(({ entries }) => {
    const location = entries[0].memory_photo_location;
    const label = locale === "it" ? `${entries.length} ${entries.length === 1 ? "ricordo" : "ricordi"} in questa zona` : `${entries.length} ${entries.length === 1 ? "memory" : "memories"} in this area`;
    const icon = divIcon({ className: "memory-atlas-marker", html: `<span>${entries.length}</span>`, iconSize: [44, 44], iconAnchor: [22, 22] });
    return <Marker key={`${zoom}-${entries[0].source}-${entries[0].tasting_id}`} position={[location.latitude, location.longitude]} icon={icon} title={label}
      eventHandlers={{
        add: event => { event.target.getElement()?.setAttribute("aria-label", label); },
        click: () => onSelect(entries),
        keydown: event => {
          if (event.originalEvent.key === "Enter" || event.originalEvent.key === " ") {
            event.originalEvent.preventDefault();
            onSelect(entries);
          }
        },
      }} />;
  })}</>;
}

export default function MemoryAtlas({ locale, query, month, onSelect }: {
  locale: Locale; query: string; month: string; onSelect: (archiveIndex: number) => void;
}) {
  const it = locale === "it";
  const [memories, setMemories] = useState<LocatedMemory[]>([]);
  const [selected, setSelected] = useState<LocatedMemory[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(false); setSelected([]); setMemories([]);
    async function load() {
      const params = new URLSearchParams({ photos_only: "true", limit: "200" });
      if (query) params.set("q", query);
      if (month) {
        const [year, monthNumber] = month.split("-").map(Number);
        params.set("from_date", `${month}-01`);
        params.set("to_date", `${month}-${new Date(year, monthNumber, 0).getDate()}`);
      }
      const located: LocatedMemory[] = [];
      let offset = 0;
      let count = 0;
      do {
        params.set("offset", String(offset));
        const page = await api<TastingArchivePage>(`/api/v1/wines/tasting-archive?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        count = page.total;
        page.items.forEach((entry, position) => {
          const location = entry.memory_photo_location;
          if (entry.memory_photo_url && location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
            && Math.abs(location.latitude) <= 90 && Math.abs(location.longitude) <= 180) {
            located.push({ ...entry, archiveIndex: offset + position, memory_photo_location: location });
          }
        });
        offset += page.items.length;
        if (!page.items.length && offset < count) throw new Error("Incomplete memory archive");
      } while (offset < count);
      setMemories(located); setTotal(count);
    }
    void load().catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [query, month, retry]);

  return <section className="memory-atlas" aria-label={it ? "Mappa dei ricordi" : "Memory map"}>
    {busy ? <p role="status">{it ? "Preparazione dei luoghi…" : "Preparing places…"}</p> : error ? <div role="alert">
      <p>{it ? "Impossibile caricare la mappa dei ricordi." : "Unable to load the memory map."}</p>
      <button type="button" onClick={() => setRetry(value => value + 1)}>{it ? "Riprova" : "Try again"}</button>
    </div> : <>
      <p className="memory-atlas-summary" role="status">{it ? `${memories.length} di ${total} ricordi con posizione` : `${memories.length} of ${total} memories with a location`}</p>
      {memories.length ? <>
        <MapContainer center={[20, 0]} zoom={0} minZoom={0} maxZoom={18} worldCopyJump className="memory-atlas-map" aria-label={it ? "Esplora i luoghi dei ricordi" : "Explore memory locations"}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          <Locations memories={memories} locale={locale} onSelect={setSelected} />
        </MapContainer>
        <p className="memory-atlas-hint">{it ? "Tocca un punto per vedere le foto. Ingrandisci la mappa per separare i luoghi vicini." : "Tap a point to see photos. Zoom in to separate nearby places."}</p>
        {selected.length ? <div className="memory-atlas-previews" role="region" aria-label={it ? "Ricordi in questa zona" : "Memories in this area"}>
          {selected.map(entry => <button key={`${entry.source}-${entry.tasting_id}`} type="button" aria-label={it ? `Apri ricordo: ${entry.wine_name}` : `Open memory: ${entry.wine_name}`} onClick={() => onSelect(entry.archiveIndex)}>
            <img src={entry.memory_photo_url} alt={it ? `Ricordo: ${entry.wine_name}` : `Memory: ${entry.wine_name}`} loading="lazy" />
            <span>{entry.occasion || entry.wine_name}</span>
            <time dateTime={entry.consumed_at}>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${entry.consumed_at.slice(0, 10)}T12:00:00`))}</time>
          </button>)}
        </div> : null}
      </> : <p>{it ? "Nessuna foto con posizione per questi filtri. I ricordi senza posizione restano disponibili nella vista Foto." : "No geolocated photos match these filters. Memories without a location are still available in Photos."}</p>}
    </>}
  </section>;
}
