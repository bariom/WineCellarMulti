import { useState } from "react";

export const HOME_BACKDROP_SESSION_KEY = "vinaris.home-backdrop.v1";
export const HOME_BACKDROPS = [
  { id: "vineyard", src: "/images/home-vineyard-v1.jpg" },
  { id: "barrels", src: "/images/home-barrels-v1.jpg" },
  { id: "tasting", src: "/images/home-tasting-v1.jpg" },
] as const;
const fallback = "/images/premium-cellar-empty.jpg";
let memoryChoice: (typeof HOME_BACKDROPS)[number] | undefined;

function sessionBackdrop() {
  // React remounts and in-app navigation must not trigger another draw.
  if (memoryChoice) return memoryChoice;
  let previous: (typeof HOME_BACKDROPS)[number] | undefined;
  try {
    const stored = window.sessionStorage.getItem(HOME_BACKDROP_SESSION_KEY);
    previous = HOME_BACKDROPS.find(image => image.id === stored);
  } catch { /* Storage may be disabled; keep the selection in memory. */ }
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (previous && navigation?.type !== "reload") {
    memoryChoice = previous;
    return memoryChoice;
  }
  // Both ordinary and cache-bypassing reloads pick a different scene.
  const candidates = HOME_BACKDROPS.filter(image => image.id !== previous?.id);
  memoryChoice = candidates[Math.floor(Math.random() * candidates.length)];
  try { window.sessionStorage.setItem(HOME_BACKDROP_SESSION_KEY, memoryChoice.id); } catch { /* No persistence available. */ }
  return memoryChoice;
}

export function resetHomeBackdropSession() {
  memoryChoice = undefined;
  try { window.sessionStorage.removeItem(HOME_BACKDROP_SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

/** Decorative photography stays stable in-app; a full reload draws another scene. */
export function CellarHomeBackdrop() {
  const [selection] = useState(sessionBackdrop);
  const [src, setSrc] = useState<string>(selection.src);
  const [failed, setFailed] = useState(false);
  return <div className="cellar-home-backdrop" aria-hidden="true" data-scene={selection.id}>
    {!failed && <img src={src} alt="" decoding="async" fetchPriority="high" onError={() => {
      if (src !== fallback) setSrc(fallback);
      else setFailed(true);
    }} />}
  </div>;
}
