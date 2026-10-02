import { access, copyFile, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, join, isAbsolute } from "node:path";
import { androidRoot, projectRoot, generateProject } from "./generate.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: projectRoot, encoding: "utf8", ...options });
  if (result.error || result.status !== 0) throw new Error(`Android tool failed: ${command}. Check toolchain and signing configuration.`);
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

export function certificateFingerprint(output) {
  const digests = new Set([...output.matchAll(/^Signer(?: #\d+)?(?: \([^\r\n]*\))? certificate SHA-256 digest:[ \t]*([a-fA-F0-9]{64})[ \t]*\r?$/gm)]
    .map(match => match[1].toUpperCase()));
  if (digests.size !== 1) {
    // Diagnostics exclude certificate identities and all key material.
    const status = output.split(/\r?\n/).filter(line => /^(?:Verifies|Verified using |Number of signers:)/.test(line)).join("; ");
    const labels = output.split(/\r?\n/).filter(line => /SHA-256 digest:/.test(line))
      .map(line => line.slice(0, line.indexOf("digest:") + 7)).join("; ");
    throw new Error(`The release APK must have one unambiguous verified signing certificate. Verification: ${status || "no status"}. Certificate labels: ${labels || "none"}.`);
  }
  return [...digests][0].match(/.{2}/g).join(":");
}

export function assetLinks(packageId, fingerprint) {
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: {
    namespace: "android_app", package_name: packageId, sha256_cert_fingerprints: [fingerprint],
  } }];
}

export function checkUpdate(previous, config, fingerprint) {
  if (!previous) return;
  if (previous.packageId !== config.packageId || previous.certificateSha256 !== fingerprint) {
    throw new Error("Use the existing package ID and signing key so installed apps can update.");
  }
  if (config.versionCode <= previous.versionCode) throw new Error("Increase versionCode before releasing an update.");
}

export async function release() {
  for (const name of ["JAVA_HOME", "ANDROID_HOME", "VINARIS_ANDROID_KEYSTORE", "VINARIS_ANDROID_KEY_ALIAS", "VINARIS_ANDROID_STORE_PASSWORD", "VINARIS_ANDROID_KEY_PASSWORD"]) {
    if (!process.env[name]) throw new Error(`Missing ${name}. See docs/ANDROID_APP.md. No APK was published.`);
  }
  if (!isAbsolute(process.env.VINARIS_ANDROID_KEYSTORE)) throw new Error("VINARIS_ANDROID_KEYSTORE must be an absolute path.");
  await access(process.env.VINARIS_ANDROID_KEYSTORE);
  await access(join(process.env.ANDROID_HOME, "platforms/android-36/android.jar"));
  const java = join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java");
  const javaVersion = spawnSync(java, ["-version"], { encoding: "utf8" });
  if (javaVersion.error || javaVersion.status !== 0 || !/version "(?:17|21)\./.test(javaVersion.stderr)) {
    throw new Error("Set JAVA_HOME to JDK 17 or 21; the installed Java 8 runtime cannot build the APK.");
  }
  const config = await generateProject();
  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", "gradlew.bat --no-daemon assembleRelease"], { stdio: "inherit" });
  } else {
    run("./gradlew", ["--no-daemon", "assembleRelease"], { stdio: "inherit" });
  }
  const apk = resolve(projectRoot, "app/build/outputs/apk/release/app-release.apk");
  const buildTools = (await readdir(join(process.env.ANDROID_HOME, "build-tools")))
    .filter(name => /^\d+\.\d+\.\d+$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  if (!buildTools) throw new Error("Install stable Android SDK build-tools using Android Studio.");
  const apksigner = join(process.env.ANDROID_HOME, "build-tools", buildTools, "lib/apksigner.jar");
  const verified = run(java, ["-jar", apksigner, "verify", "--verbose", "--print-certs", apk]);
  const fingerprint = certificateFingerprint(verified);
  const releaseRoot = resolve(androidRoot, "releases");
  let previous = null;
  try { previous = JSON.parse(await readFile(resolve(releaseRoot, "release.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  checkUpdate(previous, config, fingerprint);
  const filename = `vinaris-${config.versionName}-${config.versionCode}.apk`;
  await mkdir(releaseRoot, { recursive: true });
  const existing = await readdir(releaseRoot);
  if (existing.includes(filename)) throw new Error("This release already exists. Increase versionCode before releasing again.");
  const sha256 = createHash("sha256").update(await readFile(apk)).digest("hex");
  await copyFile(apk, resolve(releaseRoot, filename));
  await writeFile(resolve(releaseRoot, "assetlinks.json"), JSON.stringify(assetLinks(config.packageId, fingerprint), null, 2) + "\n");
  await writeFile(resolve(releaseRoot, "release.json"), JSON.stringify({
    packageId: config.packageId, versionName: config.versionName, versionCode: config.versionCode,
    url: `/downloads/android/${filename}`, sha256, certificateSha256: fingerprint,
  }, null, 2) + "\n");
  console.log(`Verified release staged in android/releases/${filename}. Nothing was uploaded.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(androidRoot, "scripts/release.mjs")) {
  try { await release(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
