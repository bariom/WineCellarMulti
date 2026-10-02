import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TwaManifest, TwaGenerator, ConsoleLog, fetchUtils } from "@bubblewrap/core";

export const androidRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const projectRoot = resolve(androidRoot, "twa");

export async function readConfig() {
  const config = JSON.parse(await readFile(resolve(androidRoot, "vinaris.json"), "utf8"));
  if (config.origin !== "https://vinaris.app" || config.packageId !== "app.vinaris.cellar") {
    throw new Error("The pilot must use https://vinaris.app and app.vinaris.cellar.");
  }
  if (!Number.isSafeInteger(config.versionCode) || config.versionCode < 1
    || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(config.versionName)
    || config.minSdkVersion !== 26) throw new Error("Invalid Android version configuration.");
  return config;
}

export async function generateProject(target = projectRoot) {
  const config = await readConfig();
  const publicRoot = resolve(androidRoot, "../frontend/public");
  const manifestPath = resolve(publicRoot, "manifest.webmanifest");
  const webManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifestUrl = new URL("/manifest.webmanifest", config.origin);
  const base = TwaManifest.fromWebManifestJson(manifestUrl, { ...webManifest, shortcuts: [] }).toJson();
  const manifest = new TwaManifest({
    ...base,
    packageId: config.packageId,
    name: "Vinaris",
    launcherName: "Vinaris",
    appVersion: config.versionName,
    appVersionCode: config.versionCode,
    minSdkVersion: config.minSdkVersion,
    display: "standalone",
    displayOverride: [],
    orientation: "default",
    enableNotifications: false,
    features: {},
    shortcuts: [],
    fallbackType: "customtabs",
    additionalTrustedOrigins: [],
    signingKey: { path: "", alias: "" },
  });

  // Bubblewrap fetches manifest/icons by URL. Restrict that adapter to the exact
  // repository assets, so generation never depends on the deployed site.
  const assets = new Map([[manifestUrl.href, { path: manifestPath, type: "application/manifest+json" }]]);
  for (const icon of webManifest.icons) {
    if (!/^\/icons\/[a-zA-Z0-9-]+\.png$/.test(icon.src)) throw new Error("Unexpected icon path.");
    assets.set(new URL(icon.src, config.origin).href, { path: resolve(publicRoot, icon.src.slice(1)), type: "image/png" });
  }
  const originalFetch = fetchUtils.fetch;
  fetchUtils.fetch = async url => {
    const asset = assets.get(String(url));
    if (!asset) throw new Error("Android generation requested an unexpected remote asset.");
    return new Response(await readFile(asset.path), { headers: { "Content-Type": asset.type } });
  };
  try {
    await mkdir(target, { recursive: true });
    await new TwaGenerator().createTwaProject(target, manifest, new ConsoleLog("vinaris"));
    await manifest.saveToFile(resolve(target, "twa-manifest.json"));
  } finally {
    fetchUtils.fetch = originalFetch;
  }
  const buildPath = resolve(target, "build.gradle");
  const build = (await readFile(buildPath, "utf8")).replaceAll("jcenter()", "mavenCentral()");
  await writeFile(buildPath, build);
  await writeFile(resolve(target, "app/build.gradle"), `${await readFile(resolve(target, "app/build.gradle"), "utf8")}\n${await readFile(resolve(androidRoot, "scripts/signing.gradle"), "utf8")}`);
  return config;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateProject();
  console.log("Generated android/twa. Open it in Android Studio or run npm run release.");
}
