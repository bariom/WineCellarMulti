import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const limits = {
  // Guard against regressions while leaving deliberate product refinements a realistic margin.
  javascriptBytes: 800_000,
  javascriptGzipBytes: 210_000,
  cssBytes: 430_000,
  cssGzipBytes: 72_000,
  chunkBytes: 500_000,
  // PDF.js is a separate worker loaded only for document previews. Its former
  // .mjs asset was outside the application-chunk budget; now bound it explicitly.
  pdfWorkerBytes: 1_300_000,
};

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)]
  .map((match) => match[1])
  .filter((assetPath, index, paths) => paths.indexOf(assetPath) === index);

async function totals(extension) {
  const paths = assetPaths.filter((assetPath) => assetPath.endsWith(extension));
  let bytes = 0;
  let gzipBytes = 0;
  for (const assetPath of paths) {
    const url = new URL(`../dist${assetPath}`, import.meta.url);
    const content = await readFile(url);
    bytes += (await stat(url)).size;
    gzipBytes += gzipSync(content).length;
  }
  return { paths, bytes, gzipBytes };
}

const javascript = await totals(".js");
const css = await totals(".css");
const failures = [];
const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const assetNames = await readdir(assetsDirectory);
const pdfWorkerNames = assetNames.filter((name) => /^pdf\.worker\.min-.*\.(?:mjs|js)$/.test(name));
if (pdfWorkerNames.length !== 1 || !pdfWorkerNames[0].endsWith(".js")) {
  failures.push("PDF preview must emit one .js worker for production MIME compatibility");
}
for (const name of pdfWorkerNames) {
  const bytes = (await stat(new URL(name, assetsDirectory))).size;
  if (bytes > limits.pdfWorkerBytes) failures.push(`${name} ${bytes} > ${limits.pdfWorkerBytes} bytes`);
}
const chunks = await Promise.all(assetNames
  .filter((name) => name.endsWith(".js") && !pdfWorkerNames.includes(name))
  .map(async (name) => ({ name, bytes: (await stat(new URL(name, assetsDirectory))).size })));
for (const chunk of chunks) {
  if (chunk.bytes > limits.chunkBytes) failures.push(`${chunk.name} ${chunk.bytes} > ${limits.chunkBytes} bytes`);
}
const largestChunk = chunks.sort((a, b) => b.bytes - a.bytes)[0];
if (largestChunk) console.log(`Largest JS chunk: ${largestChunk.name}, ${(largestChunk.bytes / 1000).toFixed(2)} kB`);

if (javascript.bytes > limits.javascriptBytes) failures.push(`initial JS ${javascript.bytes} > ${limits.javascriptBytes} bytes`);
if (javascript.gzipBytes > limits.javascriptGzipBytes) failures.push(`initial JS gzip ${javascript.gzipBytes} > ${limits.javascriptGzipBytes} bytes`);
if (css.bytes > limits.cssBytes) failures.push(`initial CSS ${css.bytes} > ${limits.cssBytes} bytes`);
if (css.gzipBytes > limits.cssGzipBytes) failures.push(`initial CSS gzip ${css.gzipBytes} > ${limits.cssGzipBytes} bytes`);

console.log(`Initial JS:  ${(javascript.bytes / 1000).toFixed(2)} kB, ${(javascript.gzipBytes / 1000).toFixed(2)} kB gzip (${javascript.paths.length} files)`);
console.log(`Initial CSS: ${(css.bytes / 1000).toFixed(2)} kB, ${(css.gzipBytes / 1000).toFixed(2)} kB gzip (${css.paths.length} files)`);

if (failures.length) {
  console.error(`Bundle budget exceeded:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
}
