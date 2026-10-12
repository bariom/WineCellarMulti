import { useState } from "react";

const storageKey = "vinaris.cellar-empty-scene.v1";
const fallback = "/images/premium-cellar-empty.jpg";
const scenes = [
  "/images/cellar-stone-v1.webp",
  "/images/cellar-modern-v1.webp",
  "/images/cellar-rustic-v1.webp",
  "/images/cellar-red-glass-v1.webp",
  "/images/cellar-white-glasses-v1.webp",
  "/images/cellar-tasting-glasses-v1.webp",
  fallback,
] as const;
let documentScene: string | undefined;

function chooseScene(): string {
  // Keep navigation and React remounts stable; avoid repeating on the next load.
  if (documentScene) return documentScene;
  let previous: string | null = null;
  try { previous = sessionStorage.getItem(storageKey); } catch { /* Storage is optional. */ }
  const candidates = scenes.filter(scene => scene !== previous);
  documentScene = candidates[Math.floor(Math.random() * candidates.length)];
  try { sessionStorage.setItem(storageKey, documentScene); } catch { /* Keep the in-memory choice. */ }
  return documentScene;
}

export function CellarEmptyImage() {
  const [src, setSrc] = useState(chooseScene);
  const [failed, setFailed] = useState(false);
  return <div className="empty-detail-image" aria-hidden="true">
    {!failed && <img src={src} alt="" loading="lazy" decoding="async" onError={() => {
      if (src !== fallback) setSrc(fallback);
      else setFailed(true);
    }} />}
  </div>;
}
