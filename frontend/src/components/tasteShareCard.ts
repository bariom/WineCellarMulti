/*
 * Share card for the taste signature (docs/UI_WOW_RECIPE.md): a 1080×1350 PNG
 * with a dark surface, gold hairline, the wheel centred, the portrait title and
 * the user's first name. No e-mail, no cellar totals.
 */

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const STYLE_PROPERTIES = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "opacity", "font-size", "font-weight", "font-family", "text-anchor", "dominant-baseline"];

/** SVG drawn as an image loses the page's stylesheet, so computed styles are copied inline. */
function inlineSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const sources = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const targets = [clone, ...Array.from(clone.querySelectorAll("*"))];
  sources.forEach((source, index) => {
    const target = targets[index] as SVGElement | undefined;
    if (!target) return;
    const computed = getComputedStyle(source);
    const declarations = STYLE_PROPERTIES.map((property) => `${property}:${computed.getPropertyValue(property)}`).join(";");
    target.setAttribute("style", `${declarations};animation:none;clip-path:none`);
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "360");
  clone.setAttribute("height", "360");
  clone.querySelector("title")?.remove();
  clone.querySelector("desc")?.remove();
  return new XMLSerializer().serializeToString(clone);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

export async function renderTasteShareCard({ svg, title, firstName, locale }: { svg: SVGSVGElement; title: string; firstName: string; locale: "it" | "en" }): Promise<Blob> {
  const it = locale === "it";
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");

  const background = context.createRadialGradient(CARD_WIDTH / 2, 560, 80, CARD_WIDTH / 2, 600, 900);
  background.addColorStop(0, "#3a1c22");
  background.addColorStop(1, "#140b0d");
  context.fillStyle = background;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  context.strokeStyle = "rgba(237, 197, 131, 0.55)";
  context.lineWidth = 2;
  context.strokeRect(36, 36, CARD_WIDTH - 72, CARD_HEIGHT - 72);

  context.textAlign = "center";
  context.fillStyle = "#edc583";
  context.font = "600 26px 'Hanken Grotesk Variable', 'Segoe UI', sans-serif";
  context.fillText((it ? "Firma sensoriale" : "Sensory signature").toUpperCase().split("").join(" "), CARD_WIDTH / 2, 120);

  context.fillStyle = "#f6efe4";
  context.font = "italic 500 60px 'Newsreader Variable', Georgia, serif";
  wrapLines(context, title, CARD_WIDTH - 200, 2).forEach((line, index) => context.fillText(line, CARD_WIDTH / 2, 210 + index * 70));

  const wheel = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(inlineSvg(svg))}`);
  const wheelSize = 820;
  context.drawImage(wheel, (CARD_WIDTH - wheelSize) / 2, 330, wheelSize, wheelSize);

  context.fillStyle = "#f3ded3";
  context.font = "500 34px 'Newsreader Variable', Georgia, serif";
  if (firstName) context.fillText(it ? `Il gusto di ${firstName}` : `${firstName}'s taste`, CARD_WIDTH / 2, CARD_HEIGHT - 120);
  context.fillStyle = "#edc583";
  context.font = "600 24px 'Hanken Grotesk Variable', 'Segoe UI', sans-serif";
  context.fillText("V I N A R I S", CARD_WIDTH / 2, CARD_HEIGHT - 72);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))), "image/png"));
}

/** Native share sheet with the PNG where supported, download otherwise. */
export async function shareOrDownload(blob: Blob, fileName: string, shareText: string) {
  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: shareText });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
