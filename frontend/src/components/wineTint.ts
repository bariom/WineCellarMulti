import { useEffect, useState, type CSSProperties } from "react";
import type { WineTone } from "../types";

/*
 * Per-wine colour for the Wine Detail hero (docs/UI_WOW_RECIPE.md).
 * The label thumbnail is sampled on a tiny canvas; the average of its
 * saturated pixels becomes `--wine-tint`. Without a photo, or when the image
 * cannot be read (cross-origin without CORS), the wine type decides.
 */

const SAMPLE_SIZE = 16;
const tintCache = new Map<string, string | null>();

const TONE_FALLBACK: Record<WineTone, string> = {
  red: "#6b1f2a",
  white: "#c9b36a",
  rose: "#c97b8a",
  sparkling: "var(--accent)",
  sweet: "#a66a2c",
  other: "var(--accent)",
};

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

/** Light themes keep the tint dark enough to sit behind text; dark themes keep it visible. */
function themeIsDark(): boolean {
  if (typeof document === "undefined") return false;
  const tone = document.documentElement.dataset.themeTone;
  if (tone) return tone === "dark";
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
  const match = /^#([0-9a-f]{6})$/i.exec(surface);
  if (!match) return false;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

function sampleTint(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    if (/^https?:/i.test(url) && !url.startsWith(window.location.origin)) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        let hx = 0, hy = 0, sSum = 0, lSum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          if (s < 0.18 || l < 0.08 || l > 0.94) continue;
          const radians = (h * Math.PI) / 180;
          hx += Math.cos(radians) * s;
          hy += Math.sin(radians) * s;
          sSum += s;
          lSum += l;
          count++;
        }
        if (count < 6) return resolve(null);
        const hue = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
        const saturation = Math.min(0.72, Math.max(0.3, sSum / count));
        const lightness = themeIsDark() ? Math.max(0.28, Math.min(0.5, lSum / count)) : Math.min(0.62, Math.max(0.34, lSum / count));
        resolve(`hsl(${hue.toFixed(0)} ${(saturation * 100).toFixed(0)}% ${(lightness * 100).toFixed(0)}%)`);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** CSS variables for the detail root: `--wine-tint` always set, from the photo when readable. */
export function useWineTint(photoUrl: string, tone: WineTone): CSSProperties {
  const [sampled, setSampled] = useState<string | null>(() => (photoUrl && tintCache.get(photoUrl)) || null);

  useEffect(() => {
    if (!photoUrl || typeof window === "undefined") {
      setSampled(null);
      return;
    }
    const cached = tintCache.get(photoUrl);
    if (cached !== undefined) {
      setSampled(cached);
      return;
    }
    let active = true;
    setSampled(null);
    void sampleTint(photoUrl).then((tint) => {
      tintCache.set(photoUrl, tint);
      if (active) setSampled(tint);
    });
    return () => {
      active = false;
    };
  }, [photoUrl]);

  const tint = sampled || `color-mix(in srgb, ${TONE_FALLBACK[tone]} 70%, var(--surface))`;
  return { "--wine-tint": tint, "--wine-tint-source": sampled ? "photo" : "type" } as CSSProperties;
}
