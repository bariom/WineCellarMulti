import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api, extractApiErrorText } from "../services/api";
import type { Locale, Wine } from "../types";
import { AppIcon } from "./AppIcon";
import "./BottlePhotoCapture.css";

const DETAIL_SIZE = { width: 480, height: 720 };
const THUMBNAIL_SIZE = { width: 160, height: 240 };

type ProcessedBottlePhoto = {
  detail: Blob;
  thumbnail: Blob;
  previewUrl: string;
};

export type PreparedBottlePhoto = Pick<ProcessedBottlePhoto, "detail" | "thumbnail">;

function canvasPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed")), "image/png");
  });
}

function canvasJpeg(canvas: HTMLCanvasElement, quality = 0.9) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("JPEG export failed")),
      "image/jpeg",
      quality,
    );
  });
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

class BottlePhotoAiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function processedAiPhoto(detail: Blob): Promise<ProcessedBottlePhoto> {
  const bitmap = await createImageBitmap(detail, { imageOrientation: "from-image" });
  const detailCanvas = document.createElement("canvas");
  detailCanvas.width = DETAIL_SIZE.width;
  detailCanvas.height = DETAIL_SIZE.height;
  const detailContext = detailCanvas.getContext("2d");
  if (!detailContext) throw new Error("Canvas is not available");
  detailContext.drawImage(bitmap, 0, 0, DETAIL_SIZE.width, DETAIL_SIZE.height);
  bitmap.close();

  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = THUMBNAIL_SIZE.width;
  thumbnailCanvas.height = THUMBNAIL_SIZE.height;
  const thumbnailContext = thumbnailCanvas.getContext("2d");
  if (!thumbnailContext) throw new Error("Canvas is not available");
  thumbnailContext.imageSmoothingEnabled = true;
  thumbnailContext.imageSmoothingQuality = "high";
  thumbnailContext.drawImage(detailCanvas, 0, 0, THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height);

  const [normalizedDetail, thumbnail] = await Promise.all([canvasPng(detailCanvas), canvasPng(thumbnailCanvas)]);
  return { detail: normalizedDetail, thumbnail, previewUrl: URL.createObjectURL(normalizedDetail) };
}

async function processBottlePhotoWithAi(source: Blob): Promise<ProcessedBottlePhoto> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const uploadCanvas = document.createElement("canvas");
  uploadCanvas.width = 960;
  uploadCanvas.height = 1440;
  const uploadContext = uploadCanvas.getContext("2d");
  if (!uploadContext) throw new Error("Canvas is not available");
  const targetRatio = uploadCanvas.width / uploadCanvas.height;
  const sourceRatio = bitmap.width / bitmap.height;
  const cropWidth = sourceRatio > targetRatio ? bitmap.height * targetRatio : bitmap.width;
  const cropHeight = sourceRatio > targetRatio ? bitmap.height : bitmap.width / targetRatio;
  uploadContext.drawImage(
    bitmap,
    (bitmap.width - cropWidth) / 2,
    (bitmap.height - cropHeight) / 2,
    cropWidth,
    cropHeight,
    0,
    0,
    uploadCanvas.width,
    uploadCanvas.height,
  );
  bitmap.close();
  const optimizedSource = await canvasJpeg(uploadCanvas);
  const formData = new FormData();
  formData.append("source_image", optimizedSource, "bottle-source.jpg");
  const response = await fetch("/api/v1/wines/photo/process", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!response.ok) {
    const message = extractApiErrorText(await response.text()) || `Request failed: ${response.status}`;
    throw new BottlePhotoAiRequestError(message, response.status);
  }
  return processedAiPhoto(await response.blob());
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function guideHalfWidth(width: number, height: number, y: number) {
  const guideY = (y / height - 0.05) / 0.9;
  if (guideY < 0 || guideY > 1) return 0;
  if (guideY < 0.18) return width * 0.065;
  if (guideY < 0.34) return width * (0.065 + ((guideY - 0.18) / 0.16) * 0.095);
  return width * 0.16;
}

type Rgb = [number, number, number];
type RowBounds = { left: number; right: number } | null;

function medianColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
): Rgb {
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  for (let y = clamp(Math.floor(startY), 0, height - 1); y <= clamp(Math.ceil(endY), 0, height - 1); y += 2) {
    for (let x = clamp(Math.floor(startX), 0, width - 1); x <= clamp(Math.ceil(endX), 0, width - 1); x += 2) {
      const offset = (y * width + x) * 4;
      red.push(data[offset]);
      green.push(data[offset + 1]);
      blue.push(data[offset + 2]);
    }
  }
  return [median(red), median(green), median(blue)];
}

function colorDistance(data: Uint8ClampedArray, offset: number, color: Rgb) {
  const red = data[offset] - color[0];
  const green = data[offset + 1] - color[1];
  const blue = data[offset + 2] - color[2];
  return Math.sqrt(red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11);
}

function sampleSpread(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  color: Rgb,
) {
  const distances: number[] = [];
  for (let y = clamp(Math.floor(startY), 0, height - 1); y <= clamp(Math.ceil(endY), 0, height - 1); y += 3) {
    for (let x = clamp(Math.floor(startX), 0, width - 1); x <= clamp(Math.ceil(endX), 0, width - 1); x += 3) {
      distances.push(colorDistance(data, (y * width + x) * 4, color));
    }
  }
  return median(distances);
}

function detectedBottleMask(pixels: ImageData) {
  const { data, width, height } = pixels;
  const centerX = width / 2;
  const candidates = new Uint8Array(width * height);
  const bounds: RowBounds[] = Array.from({ length: height }, () => null);
  const guideWidths = new Float32Array(height);
  const sideBandWidth = Math.round(width * 0.085);

  // Compare every row with the areas immediately outside the guide. This adapts
  // to a non-uniform scene: an object behind the bottle is removed when its
  // colour continues on either side of the expected bottle outline.
  for (let y = 0; y < height; y += 1) {
    const radius = guideHalfWidth(width, height, y);
    guideWidths[y] = radius;
    if (!radius) continue;
    const innerGap = Math.max(5, Math.round(radius * 0.08));
    const leftStart = centerX - radius - sideBandWidth;
    const leftEnd = centerX - radius - innerGap;
    const rightStart = centerX + radius + innerGap;
    const rightEnd = centerX + radius + sideBandWidth;
    const leftColor = medianColor(data, width, height, leftStart, leftEnd, y - 5, y + 5);
    const rightColor = medianColor(data, width, height, rightStart, rightEnd, y - 5, y + 5);
    const backgroundSpread = Math.min(
      sampleSpread(data, width, height, leftStart, leftEnd, y - 5, y + 5, leftColor),
      sampleSpread(data, width, height, rightStart, rightEnd, y - 5, y + 5, rightColor),
    );
    const threshold = clamp(30 + backgroundSpread * 1.7, 34, 64);
    const startX = Math.max(0, Math.floor(centerX - radius));
    const endX = Math.min(width - 1, Math.ceil(centerX + radius));
    for (let x = startX; x <= endX; x += 1) {
      const offset = (y * width + x) * 4;
      const distance = Math.min(colorDistance(data, offset, leftColor), colorDistance(data, offset, rightColor));
      const centralBias = Math.abs(x - centerX) < radius * 0.35 ? 0.86 : 1;
      if (distance > threshold * centralBias) candidates[y * width + x] = 1;
    }
  }

  // Find the continuous foreground run nearest the centre on every row. Small
  // gaps caused by label text or reflections are bridged, while detached scene
  // details do not enlarge the silhouette.
  for (let y = 0; y < height; y += 1) {
    const radius = guideWidths[y];
    if (!radius) continue;
    const startX = Math.max(0, Math.floor(centerX - radius));
    const endX = Math.min(width - 1, Math.ceil(centerX + radius));
    const seedRange = Math.max(8, Math.round(radius * 0.35));
    let seed = -1;
    for (let distance = 0; distance <= seedRange; distance += 1) {
      const left = Math.round(centerX - distance);
      const right = Math.round(centerX + distance);
      if (left >= startX && candidates[y * width + left]) {
        seed = left;
        break;
      }
      if (right <= endX && candidates[y * width + right]) {
        seed = right;
        break;
      }
    }
    if (seed < 0) continue;
    const gapLimit = Math.max(4, Math.round(radius * 0.08));
    let leftBound = seed;
    let gap = 0;
    for (let x = seed - 1; x >= startX; x -= 1) {
      if (candidates[y * width + x]) {
        leftBound = x;
        gap = 0;
      } else if (++gap > gapLimit) {
        break;
      }
    }
    let rightBound = seed;
    gap = 0;
    for (let x = seed + 1; x <= endX; x += 1) {
      if (candidates[y * width + x]) {
        rightBound = x;
        gap = 0;
      } else if (++gap > gapLimit) {
        break;
      }
    }
    if (rightBound - leftBound >= 6) bounds[y] = { left: leftBound, right: rightBound };
  }

  const bodyWidths = bounds
    .slice(Math.floor(height * 0.3), Math.ceil(height * 0.82))
    .filter((row): row is NonNullable<RowBounds> => Boolean(row))
    .map((row) => row.right - row.left)
    .sort((first, second) => first - second);
  const bodyWidth = bodyWidths[Math.floor(bodyWidths.length * 0.82)] || 0;
  if (bodyWidth < width * 0.12 || bodyWidth > width * 0.37) throw new Error("Bottle width is unreliable");

  const rowIsSubject = (y: number) => {
    const row = bounds[y];
    if (!row) return false;
    const minimumWidth = y > height * 0.55 ? bodyWidth * 0.38 : bodyWidth * 0.13;
    return row.right - row.left >= minimumWidth;
  };
  let top = -1;
  for (let y = Math.floor(height * 0.02); y < height * 0.48; y += 1) {
    let nearbyRows = 0;
    for (let nextY = y; nextY < Math.min(height, y + 8); nextY += 1) if (rowIsSubject(nextY)) nearbyRows += 1;
    if (nearbyRows >= 5) {
      top = y;
      break;
    }
  }
  let bottom = -1;
  for (let y = Math.ceil(height * 0.97); y > height * 0.5; y -= 1) {
    let nearbyRows = 0;
    for (let previousY = y; previousY >= Math.max(0, y - 8); previousY -= 1) if (rowIsSubject(previousY)) nearbyRows += 1;
    if (nearbyRows >= 5) {
      bottom = y;
      break;
    }
  }
  if (top < 0 || bottom - top < height * 0.5) throw new Error("Bottle height is unreliable");

  const smoothed: RowBounds[] = Array.from({ length: height }, () => null);
  for (let y = top; y <= bottom; y += 1) {
    const leftValues: number[] = [];
    const rightValues: number[] = [];
    for (let sampleY = Math.max(top, y - 4); sampleY <= Math.min(bottom, y + 4); sampleY += 1) {
      const row = bounds[sampleY];
      if (row) {
        leftValues.push(row.left);
        rightValues.push(row.right);
      }
    }
    if (leftValues.length >= 3) smoothed[y] = { left: median(leftValues), right: median(rightValues) };
  }

  // The label and strong reflections can be very close to the background
  // colour. They must never create transparent holes inside the bottle. Build
  // a continuous outer profile from the reliable rows and fill its interior.
  const bodyRows = smoothed
    .slice(Math.max(top, Math.floor(height * 0.4)), Math.min(bottom + 1, Math.ceil(height * 0.82)))
    .filter((row): row is NonNullable<RowBounds> => Boolean(row));
  const bodyCenters = bodyRows.map((row) => (row.left + row.right) / 2);
  const bodyCenter = bodyCenters.length ? median(bodyCenters) : centerX;
  const repaired: RowBounds[] = Array.from({ length: height }, () => null);
  let repairedRows = 0;
  for (let y = top; y <= bottom; y += 1) {
    const row = smoothed[y];
    const subjectProgress = (y - top) / Math.max(1, bottom - top);
    const guideWidth = guideWidths[y] * 2;
    const profileMinimumWidth = subjectProgress < 0.2
      ? bodyWidth * 0.34
      : subjectProgress < 0.38
        ? bodyWidth * (0.34 + ((subjectProgress - 0.2) / 0.18) * 0.54)
        : bodyWidth * 0.88;
    const guideMinimumWidth = subjectProgress < 0.2
      ? guideWidth * 0.84
      : subjectProgress < 0.38
        ? guideWidth * (0.84 + ((subjectProgress - 0.2) / 0.18) * 0.08)
        : guideWidth * 0.92;
    const minimumWidth = Math.max(profileMinimumWidth, guideMinimumWidth);
    const measuredWidth = row ? row.right - row.left : 0;
    const rowCenter = row ? (row.left + row.right) / 2 : bodyCenter;
    const stableCenter = Math.abs(rowCenter - bodyCenter) <= bodyWidth * 0.18 ? rowCenter : bodyCenter;
    const repairedWidth = Math.min(Math.max(measuredWidth, minimumWidth), guideWidth * 0.96);
    if (repairedWidth < 6) continue;
    repaired[y] = {
      left: stableCenter - repairedWidth / 2,
      right: stableCenter + repairedWidth / 2,
    };
    repairedRows += 1;
  }
  if (repairedRows / Math.max(1, bottom - top + 1) < 0.96) {
    throw new Error("Bottle outline is discontinuous");
  }

  let guideContactRows = 0;
  let measuredRows = 0;
  for (let y = top; y <= bottom; y += 1) {
    const row = smoothed[y];
    if (!row) continue;
    measuredRows += 1;
    if ((row.right - row.left) / 2 >= guideWidths[y] * 0.92) guideContactRows += 1;
  }
  if (!measuredRows || guideContactRows / measuredRows > 0.42) throw new Error("Bottle edges are not distinguishable from the background");

  const alpha = new Uint8ClampedArray(width * height);
  for (let y = top; y <= bottom; y += 1) {
    const row = repaired[y];
    if (!row) continue;
    const verticalAlpha = clamp(Math.min(y - top + 1, bottom - y + 1) / 3, 0, 1);
    for (let x = Math.ceil(row.left); x <= Math.floor(row.right); x += 1) {
      const edgeDistance = Math.min(x - row.left, row.right - x);
      const horizontalAlpha = clamp((edgeDistance + 1) / 3, 0, 1);
      alpha[y * width + x] = Math.round(255 * horizontalAlpha * verticalAlpha);
    }
  }
  return alpha;
}

async function processBottlePhoto(source: Blob): Promise<ProcessedBottlePhoto> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const working = document.createElement("canvas");
  working.width = DETAIL_SIZE.width;
  working.height = DETAIL_SIZE.height;
  const context = working.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available");

  const targetRatio = DETAIL_SIZE.width / DETAIL_SIZE.height;
  const sourceRatio = bitmap.width / bitmap.height;
  const cropWidth = sourceRatio > targetRatio ? bitmap.height * targetRatio : bitmap.width;
  const cropHeight = sourceRatio > targetRatio ? bitmap.height : bitmap.width / targetRatio;
  const cropX = (bitmap.width - cropWidth) / 2;
  const cropY = (bitmap.height - cropHeight) / 2;
  context.drawImage(bitmap, cropX, cropY, cropWidth, cropHeight, 0, 0, working.width, working.height);
  bitmap.close();

  const pixels = context.getImageData(0, 0, working.width, working.height);
  const { data, width, height } = pixels;
  const alpha = detectedBottleMask(pixels);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let index = 0; index < alpha.length; index += 1) {
    const offset = index * 4;
    const x = index % width;
    const y = Math.floor(index / width);
    data[offset + 3] = alpha[index];
    if (data[offset + 3] > 40) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX >= maxX || minY >= maxY) throw new Error("Bottle outline was not detected");
  context.putImageData(pixels, 0, 0);

  const detailCanvas = document.createElement("canvas");
  detailCanvas.width = DETAIL_SIZE.width;
  detailCanvas.height = DETAIL_SIZE.height;
  const detailContext = detailCanvas.getContext("2d");
  if (!detailContext) throw new Error("Canvas is not available");
  const subjectWidth = maxX - minX + 1;
  const subjectHeight = maxY - minY + 1;
  const scale = Math.min((DETAIL_SIZE.width * 0.82) / subjectWidth, (DETAIL_SIZE.height * 0.9) / subjectHeight);
  const outputWidth = subjectWidth * scale;
  const outputHeight = subjectHeight * scale;
  detailContext.drawImage(
    working,
    minX,
    minY,
    subjectWidth,
    subjectHeight,
    (DETAIL_SIZE.width - outputWidth) / 2,
    DETAIL_SIZE.height * 0.055,
    outputWidth,
    outputHeight,
  );

  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = THUMBNAIL_SIZE.width;
  thumbnailCanvas.height = THUMBNAIL_SIZE.height;
  const thumbnailContext = thumbnailCanvas.getContext("2d");
  if (!thumbnailContext) throw new Error("Canvas is not available");
  thumbnailContext.imageSmoothingEnabled = true;
  thumbnailContext.imageSmoothingQuality = "high";
  thumbnailContext.drawImage(detailCanvas, 0, 0, THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height);

  const [detail, thumbnail] = await Promise.all([canvasPng(detailCanvas), canvasPng(thumbnailCanvas)]);
  return { detail, thumbnail, previewUrl: URL.createObjectURL(detail) };
}

export function BottlePhotoCapture({
  wine,
  draftName = "",
  prepared = false,
  canWrite,
  locale,
  onSaved,
  onPrepared,
  onError,
}: {
  wine?: Wine;
  draftName?: string;
  prepared?: boolean;
  canWrite: boolean;
  locale: Locale;
  onSaved?: (wine: Wine) => void;
  onPrepared?: (photo: PreparedBottlePhoto) => void;
  onError: (message: string) => void;
}) {
  const isItalian = locale === "it";
  const [open, setOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState<ProcessedBottlePhoto | null>(null);
  const [processingMode, setProcessingMode] = useState<"ai" | "local" | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRequestRef = useRef(0);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  function close() {
    cameraRequestRef.current += 1;
    stopCamera();
    if (processed) URL.revokeObjectURL(processed.previewUrl);
    setProcessed(null);
    setProcessingMode(null);
    setFallbackMessage("");
    setOpen(false);
  }

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || processed || !open) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => setCameraError(isItalian
      ? "Il browser ha bloccato la riproduzione della fotocamera. Premi Riprova fotocamera."
      : "The browser blocked camera playback. Press Retry camera."));
  }, [cameraReady, isItalian, open, processed]);

  function cameraFailureMessage(error?: unknown) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return isItalian
        ? "La fotocamera diretta richiede HTTPS oppure localhost. Apri http://localhost:5173; da telefono usa HTTPS. In alternativa premi Scegli foto."
        : "Direct camera access requires HTTPS or localhost. Open http://localhost:5173; use HTTPS on a phone. Alternatively, press Choose photo.";
    }
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return isItalian
        ? "Permesso fotocamera negato. Abilita la fotocamera dall’icona accanto all’indirizzo del sito, poi premi Riprova fotocamera."
        : "Camera permission was denied. Allow it from the icon beside the site address, then press Retry camera.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return isItalian ? "Nessuna fotocamera disponibile su questo dispositivo." : "No camera is available on this device.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return isItalian
        ? "La fotocamera è già utilizzata da un’altra applicazione. Chiudila e riprova."
        : "The camera is already being used by another application. Close it and try again.";
    }
    return isItalian
      ? "Non è stato possibile avviare la fotocamera. Controlla i permessi del browser oppure usa Scegli foto."
      : "The camera could not be started. Check browser permissions or use Choose photo.";
  }

  async function startCamera() {
    const requestId = ++cameraRequestRef.current;
    setOpen(true);
    setProcessed(null);
    setProcessingMode(null);
    setFallbackMessage("");
    setCameraError("");
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(cameraFailureMessage());
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1440 }, height: { ideal: 2160 } },
        audio: false,
      });
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      setCameraReady(false);
      setCameraError(cameraFailureMessage(error));
    }
  }

  async function prepare(source: Blob) {
    setBusy(true);
    setFallbackMessage("");
    try {
      let result: ProcessedBottlePhoto;
      let mode: "ai" | "local" = "ai";
      try {
        result = await processBottlePhotoWithAi(source);
      } catch (error) {
        if (error instanceof BottlePhotoAiRequestError && error.status === 422) throw error;
        const reason = error instanceof BottlePhotoAiRequestError
          ? `${error.status}: ${error.message}`
          : (error instanceof Error ? error.message : "unknown error");
        setFallbackMessage(isItalian
          ? `AI non disponibile (${reason}). È stato applicato lo scontorno locale.`
          : `AI unavailable (${reason}). Local cutout was applied.`);
        result = await processBottlePhoto(source);
        mode = "local";
      }
      if (processed) URL.revokeObjectURL(processed.previewUrl);
      setProcessed(result);
      setProcessingMode(mode);
      stopCamera();
    } catch (error) {
      const aiRejected = error instanceof BottlePhotoAiRequestError && error.status === 422;
      onError(aiRejected
        ? (isItalian
          ? "L’AI non riconosce una sagoma di bottiglia affidabile. Libera lo spazio dietro la bottiglia, riallineala alla guida e riprova."
          : "AI could not find a reliable bottle outline. Clear the space behind the bottle, realign it with the guide and try again.")
        : (isItalian
          ? "Non riesco a isolare la bottiglia. Usa un fondo uniforme e contrastante, poi riprova."
          : "The bottle could not be isolated. Use a plain, contrasting background and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    await prepare(await canvasPng(canvas));
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await prepare(file);
  }

  async function save() {
    if (!processed) return;
    if (!wine) {
      onPrepared?.({ detail: processed.detail, thumbnail: processed.thumbnail });
      close();
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("thumbnail_image", processed.thumbnail, "bottle-thumbnail.png");
      formData.append("detail_image", processed.detail, "bottle-detail.png");
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}/photo`, { method: "PUT", body: formData });
      onSaved?.(updated);
      close();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to save bottle photo");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    if (processed) URL.revokeObjectURL(processed.previewUrl);
    setProcessed(null);
    setProcessingMode(null);
    setFallbackMessage("");
    startCamera();
  }

  async function remove() {
    if (!wine) return;
    setBusy(true);
    try {
      const updated = await api<Wine>(`/api/v1/wines/${wine.id}/photo`, { method: "DELETE" });
      onSaved?.(updated);
      close();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to remove bottle photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="secondary compact bottle-photo-button" disabled={!canWrite} onClick={startCamera}>
        <AppIcon name="camera" />
        {wine?.photo_detail_url || prepared
          ? (isItalian ? "Sostituisci foto" : "Replace photo")
          : wine
            ? (isItalian ? "Aggiungi foto" : "Add photo")
            : (isItalian ? "Fotografa bottiglia" : "Photograph bottle")}
      </button>
      {open ? createPortal((
        <div className="bottle-capture-layer" role="dialog" aria-modal="true" aria-label={isItalian ? "Fotografa bottiglia" : "Photograph bottle"}>
          <div className="bottle-capture-modal">
            <header>
              <div>
                <span>{isItalian ? "Foto prodotto" : "Product photo"}</span>
                <h2>{wine?.name || draftName || (isItalian ? "Nuovo vino" : "New wine")}</h2>
              </div>
              <button type="button" className="secondary compact" onClick={close} aria-label={isItalian ? "Chiudi" : "Close"}>×</button>
            </header>
            <p className="bottle-capture-help">
              {isItalian
                ? "Appoggia la bottiglia su un fondo uniforme e contrastante. Inquadra tutta la sagoma, con il collo al centro e l’etichetta frontale."
                : "Place the bottle on a plain, contrasting background. Keep the full outline, centred neck and front-facing label inside the guide."}
            </p>
            <div className={`bottle-capture-stage${processed ? " preview" : ""}`}>
              {processed ? (
                <>
                  <img src={processed.previewUrl} alt={isItalian ? "Anteprima scontornata" : "Background-free preview"} />
                  {processingMode ? (
                    <span className={`bottle-processing-mode ${processingMode}`}>
                      {processingMode === "ai"
                        ? (isItalian ? "Scontorno AI" : "AI cutout")
                        : (isItalian ? "Scontorno locale" : "Local cutout")}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <video ref={videoRef} autoPlay muted playsInline onLoadedData={() => { setCameraError(""); setCameraReady(true); }} />
                  <svg className="bottle-guide" viewBox="0 0 200 300" aria-hidden="true">
                    <path d="M88 18h24v35c0 11 4 18 11 25 8 8 12 18 12 31v151c0 14-10 24-24 24H89c-14 0-24-10-24-24V109c0-13 4-23 12-31 7-7 11-14 11-25V18Z" />
                    <path d="M72 145h56v67H72z" className="bottle-guide-label" />
                  </svg>
                  {cameraError ? <div className="bottle-camera-error" role="alert">{cameraError}</div> : null}
                </>
              )}
              {busy ? <div className="bottle-processing">{isItalian ? "Analisi AI e scontorno…" : "AI analysis and background removal…"}</div> : null}
            </div>
            {fallbackMessage ? <p className="bottle-fallback-message" role="status">{fallbackMessage}</p> : null}
            <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" onChange={selectFile} />
            <div className="bottle-capture-tips">
              <span>{isItalian ? "✓ Luce morbida frontale" : "✓ Soft frontal light"}</span>
              <span>{isItalian ? "✓ Nessun oggetto dietro" : "✓ No objects behind"}</span>
              <span>{isItalian ? "✓ Bottiglia verticale" : "✓ Bottle upright"}</span>
            </div>
            <footer>
              {processed ? (
                <>
                  <button type="button" className="secondary" disabled={busy} onClick={retake}>
                    {isItalian ? "Rifai" : "Retake"}
                  </button>
                  <button type="button" disabled={busy} onClick={save}>{isItalian ? "Usa questa foto" : "Use this photo"}</button>
                </>
              ) : (
                <>
                  <button type="button" className="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                    {isItalian ? "Scegli foto" : "Choose photo"}
                  </button>
                  <button type="button" disabled={busy || (!cameraReady && !cameraError)} onClick={cameraError ? startCamera : capture}>
                    <AppIcon name="camera" /> {cameraError ? (isItalian ? "Riprova fotocamera" : "Retry camera") : (isItalian ? "Scatta" : "Capture")}
                  </button>
                </>
              )}
              {wine?.photo_detail_url ? <button type="button" className="danger-link" disabled={busy} onClick={remove}>{isItalian ? "Elimina foto" : "Remove photo"}</button> : null}
            </footer>
          </div>
        </div>
      ), document.body) : null}
    </>
  );
}

export default BottlePhotoCapture;
