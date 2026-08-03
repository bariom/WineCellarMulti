import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const limits = {
  // Keep a small margin for the lazy history module's runtime metadata.
  javascriptBytes: 756_000,
  javascriptGzipBytes: 196_500,
  cssBytes: 390_500,
  cssGzipBytes: 67_000,
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
