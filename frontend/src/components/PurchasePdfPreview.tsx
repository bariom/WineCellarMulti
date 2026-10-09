import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Locale } from "../types";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PurchasePdfPreview({ file, locale }: { file: File; locale: Locale }) {
  const it = locale === "it";
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof getDocument> | undefined;
    setDocument(null); setPage(1); setFailed(false); setRendered(false);
    void file.arrayBuffer().then(async data => {
      if (disposed) return;
      task = getDocument({ data: new Uint8Array(data), useSystemFonts: true });
      const pdf = await task.promise;
      if (!disposed) setDocument(pdf);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; void task?.destroy(); };
  }, [file]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let disposed = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    setRendered(false);
    void document.getPage(page).then(async pdfPage => {
      if (disposed || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale: 1 });
      const scaled = pdfPage.getViewport({ scale: Math.min(1400 / viewport.width, 1800 / viewport.height, 2) });
      canvas.current.width = Math.ceil(scaled.width);
      canvas.current.height = Math.ceil(scaled.height);
      task = pdfPage.render({ canvas: canvas.current, viewport: scaled });
      await task.promise;
      if (!disposed) setRendered(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; task?.cancel(); };
  }, [document, page]);

  return <div className="purchase-pdf-preview">
    {failed ? <p role="status">{it ? "Anteprima non disponibile. Puoi aprire il PDF originale." : "Preview unavailable. You can open the original PDF."}</p>
      : <>
        {!rendered ? <p role="status">{it ? "Caricamento anteprima…" : "Loading preview…"}</p> : null}
        <canvas ref={canvas} role="img" aria-label={it ? `Anteprima PDF, pagina ${page}` : `PDF preview, page ${page}`} hidden={!rendered} />
        {document ? <nav aria-label={it ? "Pagine del documento" : "Document pages"}>
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)} aria-label={it ? "Pagina precedente" : "Previous page"}>←</button>
          <span aria-live="polite">{it ? "Pagina" : "Page"} {page} / {document.numPages}</span>
          <button type="button" className="secondary" disabled={page >= document.numPages} onClick={() => setPage(value => value + 1)} aria-label={it ? "Pagina successiva" : "Next page"}>→</button>
        </nav> : null}
      </>}
  </div>;
}
