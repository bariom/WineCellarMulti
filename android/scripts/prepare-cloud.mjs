import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { androidRoot, readConfig } from "./generate.mjs";

export async function previousRelease(origin, firstRelease, fetcher = fetch) {
  const response = await fetcher(new URL("/downloads/android/release.json", origin), {
    redirect: "error", signal: AbortSignal.timeout(15000), headers: { "Cache-Control": "no-cache" },
  });
  if (response.status === 404 && firstRelease) return null;
  if (!response.ok) throw new Error("Cannot verify the previous website release. Allow 404 only for the first release.");
  const body = await response.text();
  // Before nginx's dedicated download route is deployed, the SPA fallback may
  // serve index.html with HTTP 200 for a file that does not exist yet.
  if (firstRelease && /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(body)) return null;
  let previous;
  try { previous = JSON.parse(body); }
  catch { throw new Error("Expected release.json but the website returned HTML or invalid JSON. Deploy the Android download route; allow HTML fallback only for the first release."); }
  if (!previous || previous.packageId !== "app.vinaris.cellar" || !Number.isSafeInteger(previous.versionCode)
    || previous.versionCode < 1 || !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(previous.certificateSha256)) {
    throw new Error("Invalid previous website release metadata.");
  }
  return previous;
}

export function decodeKeystore(encoded) {
  if (typeof encoded !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded.trim())) {
    throw new Error("Configure VINARIS_ANDROID_KEYSTORE_BASE64 in GitHub Actions secrets.");
  }
  const bytes = Buffer.from(encoded.trim(), "base64");
  if (bytes.length < 256) throw new Error("The Android signing keystore is missing or invalid.");
  return bytes;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(androidRoot, "scripts/prepare-cloud.mjs")) {
  try {
    if (!process.env.RUNNER_TEMP) throw new Error("This preparation script requires a GitHub Actions runner.");
    const key = decodeKeystore(process.env.VINARIS_ANDROID_KEYSTORE_BASE64);
    const config = await readConfig();
    const previous = await previousRelease(config.origin, process.env.FIRST_RELEASE === "true");
    if (previous) {
      const releaseRoot = resolve(androidRoot, "releases");
      await mkdir(releaseRoot, { recursive: true });
      await writeFile(resolve(releaseRoot, "release.json"), JSON.stringify(previous) + "\n");
    }
    await writeFile(resolve(process.env.RUNNER_TEMP, "vinaris-release.jks"), key, { mode: 0o600, flag: "wx" });
    console.log("Cloud signing prepared; private key is excluded from release artifacts.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
