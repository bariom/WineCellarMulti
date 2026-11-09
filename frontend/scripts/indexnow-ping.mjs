// Tells IndexNow-enabled search engines (Bing, Yandex, Seznam, Naver...) which
// public URLs changed, so they do not wait for the next sitemap crawl.
//
//   node scripts/indexnow-ping.mjs [previous-sitemap.xml]
//
// With a previous sitemap, only URLs that are new or whose <lastmod> changed are
// sent; without one, every URL in public/sitemap.xml is sent. update.sh runs it
// after a deploy that changed the sitemap. The key is public by design: it only
// proves the ping comes from the owner of the host serving public/<key>.txt.
import { readFile } from "node:fs/promises";

const key = "a655eda722f15cbda3993736960c13fa";
const host = "vinaris.app";

function entries(xml) {
  return new Map([...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((match) => [match[1], match[2]]));
}

const current = entries(await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8"));
const previousPath = process.argv[2];
const previous = previousPath ? entries(await readFile(previousPath, "utf8").catch(() => "")) : new Map();
const urlList = [...current].filter(([url, lastmod]) => previous.get(url) !== lastmod).map(([url]) => url);

if (!urlList.length) {
  console.log("IndexNow: no changed URLs");
} else {
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList }),
  });
  console.log(`IndexNow: sent ${urlList.length} URL(s), status ${response.status}`);
}
