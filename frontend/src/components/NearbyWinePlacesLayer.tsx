import { useCallback, useEffect, useRef, useState } from "react";
import type { LayerGroup as LeafletLayerGroup } from "leaflet";
import { CircleMarker, LayerGroup, Tooltip, useMap, useMapEvents } from "react-leaflet";

import { api } from "../services/api";

type MapPlace = {
  name: string;
  latitude: number;
  longitude: number;
  kind: "winery" | "vineyard" | "producer" | "tasting" | "wine_shop";
};

type Viewport = {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
};

const MINIMUM_PLACES_ZOOM = 12;

function readViewport(map: ReturnType<typeof useMap>): Viewport {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
    zoom: map.getZoom(),
  };
}

function NearbyWinePlaceMarkers({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [places, setPlaces] = useState<MapPlace[]>([]);

  useMapEvents({
    moveend: () => {
      if (enabled) setViewport(readViewport(map));
    },
    zoomend: () => {
      if (enabled) setViewport(readViewport(map));
    },
  });

  useEffect(() => {
    if (!enabled) {
      setPlaces([]);
      return;
    }
    setViewport(readViewport(map));
  }, [enabled, map]);

  useEffect(() => {
    if (!viewport || viewport.zoom < MINIMUM_PLACES_ZOOM) {
      setPlaces([]);
      return;
    }
    let active = true;
    const search = new URLSearchParams({
      south: viewport.south.toFixed(5),
      west: viewport.west.toFixed(5),
      north: viewport.north.toFixed(5),
      east: viewport.east.toFixed(5),
    });
    void api<MapPlace[]>(`/api/v1/map/places?${search.toString()}`)
      .then((result) => {
        if (active) setPlaces(result);
      })
      .catch(() => {
        if (active) setPlaces([]);
      });
    return () => {
      active = false;
    };
  }, [viewport]);

  return (
    <>
      {places.map((place) => (
        <CircleMarker
          key={`${place.name}:${place.latitude}:${place.longitude}`}
          center={[place.latitude, place.longitude]}
          radius={6}
          pathOptions={{
            color: "#fffaf0",
            weight: 2,
            fillColor: place.kind === "vineyard" ? "#af8436" : place.kind === "winery" || place.kind === "producer" ? "#8f6230" : "#496f61",
            fillOpacity: 0.94,
          }}
        >
          <Tooltip permanent direction="top" offset={[0, -7]} className="nearby-wine-place-label">
            <strong>{place.name}</strong>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

export default function NearbyWinePlacesLayer() {
  const map = useMap();
  const [enabled, setEnabled] = useState(false);
  const layerRef = useRef<LeafletLayerGroup | null>(null);
  const disableLayer = useCallback(() => {
    const layer = layerRef.current;
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  }, [map]);

  useMapEvents({
    zoomend: () => {
      if (enabled && map.getZoom() < MINIMUM_PLACES_ZOOM) disableLayer();
    },
  });

  return (
    <LayerGroup
      ref={layerRef}
      eventHandlers={{
        add: () => {
          if (map.getZoom() < MINIMUM_PLACES_ZOOM) {
            queueMicrotask(disableLayer);
            return;
          }
          setEnabled(true);
        },
        remove: () => setEnabled(false),
      }}
    >
      <NearbyWinePlaceMarkers enabled={enabled} />
    </LayerGroup>
  );
}
