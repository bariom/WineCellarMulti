import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api } from "../services/api";
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

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] || 0;
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
  const borderRed: number[] = [];
  const borderGreen: number[] = [];
  const borderBlue: number[] = [];
  const sample = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    borderRed.push(data[offset]);
    borderGreen.push(data[offset + 1]);
    borderBlue.push(data[offset + 2]);
  };
  for (let x = 0; x < width; x += 8) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 8; y < height - 8; y += 8) {
    sample(0, y);
    sample(width - 1, y);
  }
  const background = [median(borderRed), median(borderGreen), median(borderBlue)];
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let queueStart = 0;
  let queueEnd = 0;
  const colorDistance = (index: number) => {
    const offset = index * 4;
    const red = data[offset] - background[0];
    const green = data[offset + 1] - background[1];
    const blue = data[offset + 2] - background[2];
    return Math.sqrt(red * red + green * green + blue * blue);
  };
  const enqueueBackground = (index: number) => {
    if (visited[index] || colorDistance(index) > 82) return;
    visited[index] = 1;
    queue[queueEnd++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueueBackground(x);
    enqueueBackground((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueBackground(y * width);
    enqueueBackground(y * width + width - 1);
  }
  while (queueStart < queueEnd) {
    const index = queue[queueStart++];
    const x = index % width;
    if (x > 0) enqueueBackground(index - 1);
    if (x < width - 1) enqueueBackground(index + 1);
    if (index >= width) enqueueBackground(index - width);
    if (index < width * (height - 1)) enqueueBackground(index + width);
  }

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let index = 0; index < visited.length; index += 1) {
    const offset = index * 4;
    const x = index % width;
    const y = Math.floor(index / width);
    if (visited[index]) {
      const distance = colorDistance(index);
      data[offset + 3] = Math.round(Math.max(0, Math.min(1, (distance - 58) / 28)) * 255);
    }
    const guideY = (y / height - 0.05) / 0.9;
    let allowedHalfWidth = 0;
    if (guideY >= 0 && guideY <= 1) {
      allowedHalfWidth = guideY < 0.18
        ? width * 0.065
        : guideY < 0.34
          ? width * (0.065 + ((guideY - 0.18) / 0.16) * 0.095)
          : width * 0.16;
    }
    if (Math.abs(x - width / 2) > allowedHalfWidth) data[offset + 3] = 0;
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
    try {
      const result = await processBottlePhoto(source);
      if (processed) URL.revokeObjectURL(processed.previewUrl);
      setProcessed(result);
      stopCamera();
    } catch {
      onError(isItalian
        ? "Non riesco a isolare la bottiglia. Usa un fondo uniforme e contrastante, poi riprova."
        : "The bottle could not be isolated. Use a plain, contrasting background and try again.");
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
              {processed ? <img src={processed.previewUrl} alt={isItalian ? "Anteprima scontornata" : "Background-free preview"} /> : (
                <>
                  <video ref={videoRef} autoPlay muted playsInline onLoadedData={() => { setCameraError(""); setCameraReady(true); }} />
                  <svg className="bottle-guide" viewBox="0 0 200 300" aria-hidden="true">
                    <path d="M88 18h24v35c0 11 4 18 11 25 8 8 12 18 12 31v151c0 14-10 24-24 24H89c-14 0-24-10-24-24V109c0-13 4-23 12-31 7-7 11-14 11-25V18Z" />
                    <path d="M72 145h56v67H72z" className="bottle-guide-label" />
                  </svg>
                  {cameraError ? <div className="bottle-camera-error" role="alert">{cameraError}</div> : null}
                </>
              )}
              {busy ? <div className="bottle-processing">{isItalian ? "Elaborazione e scontorno…" : "Processing and removing background…"}</div> : null}
            </div>
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
