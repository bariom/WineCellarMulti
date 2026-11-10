import { useEffect, useRef, useState } from "react";

/**
 * A light copy of a photo for showing on screen. A phone camera file (50 MP and
 * more on recent phones) shown as-is makes mobile browsers drop and re-decode it
 * over and over, and the picture flickers; the original still goes to the AI.
 * `side` is the longest side of the copy, in pixels.
 */
export async function photoPreview(file: Blob, side: number): Promise<string> {
  if (typeof createImageBitmap !== "function") return URL.createObjectURL(file);
  try {
    const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, side / Math.max(probe.width, probe.height));
    const width = Math.max(1, Math.round(probe.width * scale));
    const height = Math.max(1, Math.round(probe.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(probe, 0, 0, width, height);
    probe.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return URL.createObjectURL(blob ?? file);
  } catch {
    return URL.createObjectURL(file);
  }
}

/**
 * One light preview per photo, in the same order; "" while it is being made.
 * Each preview is made once and released when its photo leaves the list.
 */
export function usePhotoPreviews(photos: File[], side: number): string[] {
  const made = useRef(new Map<File, string>());
  const mounted = useRef(true);
  const [, setVersion] = useState(0);
  useEffect(() => {
    for (const [file, url] of made.current) {
      if (!photos.includes(file)) {
        if (url) URL.revokeObjectURL(url);
        made.current.delete(file);
      }
    }
    for (const file of photos) {
      if (made.current.has(file)) continue;
      made.current.set(file, "");
      void photoPreview(file, side).then((url) => {
        // The photo was removed, or the component closed, while it was being made.
        if (!mounted.current || made.current.get(file) !== "") {
          URL.revokeObjectURL(url);
          return;
        }
        made.current.set(file, url);
        setVersion((version) => version + 1);
      });
    }
  }, [photos, side]);
  useEffect(() => {
    mounted.current = true;
    const previews = made.current;
    return () => {
      mounted.current = false;
      for (const url of previews.values()) if (url) URL.revokeObjectURL(url);
      previews.clear();
    };
  }, []);
  return photos.map((file) => made.current.get(file) ?? "");
}
