import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale, TasteMatch, WineImageRecognitionCandidate, WineImageRecognitionResult } from "../types";
import { AppIcon } from "./AppIcon";
import "./WishlistLiveTasteScanner.css";

export type WishlistLiveTasteScan = {
  recognition: WineImageRecognitionResult;
  match: TasteMatch | null;
};

type ScannerPhase = "framing" | "analysing" | "result" | "error";

function frameBlob(video: HTMLVideoElement): Promise<{ blob: Blob; previewUrl: string }> {
  const canvas = document.createElement("canvas");
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error("Unable to capture camera frame"));
      return;
    }
    resolve({ blob, previewUrl: URL.createObjectURL(blob) });
  }, "image/jpeg", 0.9));
}

function candidateName(candidate: WineImageRecognitionCandidate) {
  return candidate.wine_name || candidate.cuvee || candidate.appellation;
}

function traitLabel(trait: string, locale: Locale) {
  if (locale !== "it") return trait;
  return ({
    body: "corpo",
    acidity: "acidità",
    tannin: "tannini",
    sweetness: "dolcezza",
    "aromatic intensity": "intensità aromatica",
    fruit: "frutto",
    wood: "legno",
    spice: "spezie",
    minerality: "mineralità",
  } as Record<string, string>)[trait] || trait;
}

export function WishlistLiveTasteScanner({
  disabled,
  locale,
  onAnalyse,
  onConfirm,
}: {
  disabled: boolean;
  locale: Locale;
  onAnalyse: (image: Blob) => Promise<WishlistLiveTasteScan>;
  onConfirm: (candidate: WineImageRecognitionCandidate, recognitionId: string) => void;
}) {
  const italian = locale === "it";
  const [open, setOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [phase, setPhase] = useState<ScannerPhase>("framing");
  const [guide, setGuide] = useState(italian ? "Centra l’etichetta" : "Centre the label");
  const [scan, setScan] = useState<WishlistLiveTasteScan | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const stableFramesRef = useRef(0);
  const analysisStartedRef = useRef(false);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  }

  function close() {
    stopCamera();
    clearPreview();
    setScan(null);
    setOpen(false);
  }

  async function startCamera() {
    stopCamera();
    clearPreview();
    setScan(null);
    setPhase("framing");
    setGuide(italian ? "Centra l’etichetta" : "Centre the label");
    previousFrameRef.current = null;
    stableFramesRef.current = 0;
    analysisStartedRef.current = false;
    setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1440 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setPhase("error");
      setGuide(italian ? "Fotocamera non disponibile. Puoi scegliere una foto." : "Camera unavailable. You can choose a photo.");
    }
  }

  async function analyse(blob: Blob, nextPreviewUrl: string) {
    if (analysisStartedRef.current) return;
    analysisStartedRef.current = true;
    setPreviewUrl(nextPreviewUrl);
    setPhase("analysing");
    setGuide(italian ? "Riconosco il vino e confronto il tuo gusto…" : "Identifying the wine and comparing your taste…");
    stopCamera();
    try {
      const result = await onAnalyse(blob);
      setScan(result);
      setPhase("result");
    } catch {
      setPhase("error");
      setGuide(italian ? "Non sono riuscito a leggere l’etichetta." : "I could not read the label.");
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight || analysisStartedRef.current) return;
    const captured = await frameBlob(video);
    await analyse(captured.blob, captured.previewUrl);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearPreview();
    analysisStartedRef.current = false;
    await analyse(file, URL.createObjectURL(file));
  }

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!open || !video || !stream || previewUrl) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().then(() => setCameraReady(true)).catch(() => {
      setPhase("error");
      setGuide(italian ? "Il browser ha bloccato la fotocamera." : "The browser blocked the camera.");
    });
  }, [italian, open, previewUrl]);

  useEffect(() => {
    if (!open || !cameraReady || phase !== "framing") return;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video?.videoWidth || !video.videoHeight || analysisStartedRef.current) return;
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 112;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, video.videoWidth * 0.18, video.videoHeight * 0.2, video.videoWidth * 0.64, video.videoHeight * 0.6, 0, 0, 80, 112);
      const pixels = context.getImageData(0, 0, 80, 112).data;
      const luminance = new Uint8ClampedArray(80 * 112);
      let total = 0;
      let variation = 0;
      for (let pixel = 0, sample = 0; pixel < pixels.length; pixel += 4, sample += 1) {
        const value = Math.round(pixels[pixel] * 0.299 + pixels[pixel + 1] * 0.587 + pixels[pixel + 2] * 0.114);
        luminance[sample] = value;
        total += value;
        if (sample > 0) variation += Math.abs(value - luminance[sample - 1]);
      }
      const brightness = total / luminance.length;
      const detail = variation / luminance.length;
      const previous = previousFrameRef.current;
      let movement = Number.POSITIVE_INFINITY;
      if (previous?.length === luminance.length) {
        let difference = 0;
        for (let index = 0; index < luminance.length; index += 1) difference += Math.abs(luminance[index] - previous[index]);
        movement = difference / luminance.length;
      }
      previousFrameRef.current = luminance;
      const readable = brightness >= 42 && brightness <= 222 && detail >= 10;
      const stable = readable && movement < 7;
      stableFramesRef.current = stable ? stableFramesRef.current + 1 : 0;
      setGuide(!readable
        ? (italian ? "Più luce e avvicina l’etichetta" : "Add light and move closer")
        : stableFramesRef.current >= 2
          ? (italian ? "Etichetta stabile · acquisizione" : "Label steady · capturing")
          : (italian ? "Tieni fermo un istante" : "Hold still for a moment"));
      if (stableFramesRef.current >= 3) void capture();
    }, 450);
    return () => window.clearInterval(timer);
  }, [cameraReady, italian, open, phase]);

  const recognized = scan?.recognition;
  const canConfirm = Boolean(recognized && (recognized.status === "recognized" || recognized.status === "ambiguous") && candidateName(recognized));
  const hearts = scan?.match?.score === null || scan?.match?.score === undefined
    ? 0
    : Math.min(6, Math.max(1, Math.round(scan.match.score * 6)));

  return <>
    <button type="button" className="wishlist-live-scan-launch" disabled={disabled} onClick={() => void startCamera()}>
      <AppIcon name="camera" />
      <span>{italian ? "Scansione gusto live" : "Live taste scan"}</span>
    </button>
    {open ? createPortal(<div className="wishlist-live-scan-layer" role="dialog" aria-modal="true" aria-label={italian ? "Scansione gusto live" : "Live taste scan"}>
      <section className="wishlist-live-scan-modal">
        <header><div><span>VINARIS VISION</span><strong>{italian ? "Inquadra. Riconosci. Scopri." : "Frame. Identify. Discover."}</strong></div><button type="button" onClick={close} aria-label={italian ? "Chiudi" : "Close"}>×</button></header>
        <div className="wishlist-live-scan-stage">
          {previewUrl ? <img src={previewUrl} alt="" /> : <video ref={videoRef} autoPlay muted playsInline />}
          <div className={`wishlist-live-scan-reticle ${phase}`} aria-hidden="true"><i /><i /><i /><i /></div>
          {phase !== "result" ? <div className={`wishlist-live-scan-status ${phase}`} role="status"><span className="wishlist-live-scan-pulse" />{phase === "analysing" ? (italian ? "Sommelier AI al lavoro" : "AI sommelier working") : guide}</div> : null}
          {phase === "result" && recognized ? <article className="wishlist-live-result">
            <span>{recognized.status === "ambiguous" ? (italian ? "CONFERMA NECESSARIA" : "CONFIRMATION NEEDED") : (italian ? "VINO RICONOSCIUTO" : "WINE IDENTIFIED")}</span>
            <h2>{candidateName(recognized) || (italian ? "Etichetta non identificata" : "Label not identified")}</h2>
            <p>{[recognized.producer || recognized.estate, recognized.vintage, recognized.appellation].filter(Boolean).join(" · ")}</p>
            {hearts ? <div className="wishlist-live-affinity" aria-label={`${hearts}/6`}><div>{Array.from({ length: 6 }, (_, index) => <i key={index} className={index < hearts ? "filled" : ""}>♥</i>)}</div><span><small>{scan.match && scan.match.confidence < .3 ? (italian ? "Affinità iniziale" : "Early affinity") : (italian ? "Affinità personale" : "Personal affinity")}</small><strong>{hearts}/6</strong></span></div> : <div className="wishlist-live-affinity-unavailable"><strong>{italian ? "Affinità non ancora disponibile" : "Affinity not available yet"}</strong><small>{italian ? "Puoi comunque continuare e aggiungere questo vino alla wishlist." : "You can still continue and add this wine to your wishlist."}</small></div>}
            {scan.match?.matching_traits.length ? <small>{italian ? "In sintonia" : "In tune"}: {scan.match.matching_traits.map((trait) => traitLabel(trait, locale)).join(", ")}</small> : null}
            <small className="wishlist-live-ai-cost">{italian ? "Costo AI" : "AI cost"}: ${Number(recognized.estimated_cost_usd || 0).toFixed(4)}</small>
          </article> : null}
        </div>
        <footer className={phase}>
          <input ref={fileRef} type="file" accept="image/*" onChange={(event) => void selectFile(event)} />
          {phase === "framing" ? <><button type="button" className="secondary" onClick={() => fileRef.current?.click()}>{italian ? "Scegli foto" : "Choose photo"}</button><button type="button" disabled={!cameraReady} onClick={() => void capture()}><AppIcon name="camera" />{italian ? "Scatta ora" : "Capture now"}</button></> : null}
          {canConfirm && recognized ? <button type="button" className="wishlist-live-continue" onClick={() => { onConfirm(recognized, recognized.recognition_id); close(); }}>{italian ? "Continua con questo vino" : "Continue with this wine"}</button> : null}
          {phase === "result" || phase === "error" ? <button type="button" className="secondary" onClick={() => void startCamera()}>{italian ? "Riprova" : "Try again"}</button> : null}
        </footer>
      </section>
    </div>, document.body) : null}
  </>;
}

export default WishlistLiveTasteScanner;
