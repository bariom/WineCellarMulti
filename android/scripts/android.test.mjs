import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { generateProject, androidRoot } from "./generate.mjs";
import { assetLinks, certificateFingerprint, release, checkUpdate } from "./release.mjs";
import { previousRelease, decodeKeystore } from "./prepare-cloud.mjs";

test("cloud updates require valid published metadata; only an explicit first release permits 404", async () => {
  const missing = async () => new Response(null, { status: 404 });
  assert.equal(await previousRelease("https://vinaris.app", true, missing), null);
  await assert.rejects(previousRelease("https://vinaris.app", false, missing), /previous website release/);
  await assert.rejects(previousRelease("https://vinaris.app", true, async () => new Response(null, { status: 503 })));
  await assert.rejects(previousRelease("https://vinaris.app", true, async () => Response.json({})), /Invalid/);
  const valid = { packageId: "app.vinaris.cellar", versionCode: 1, certificateSha256: "AB:".repeat(31) + "AB" };
  assert.deepEqual(await previousRelease("https://vinaris.app", false, async url => {
    assert.equal(url.href, "https://vinaris.app/downloads/android/release.json");
    return Response.json(valid);
  }), valid);
});

test("cloud signing rejects missing/malformed secrets without printing their contents", () => {
  for (const value of [undefined, "", "not a secret", "YWJj"]) assert.throws(() => decodeKeystore(value));
  const bytes = Buffer.alloc(300, 1);
  assert.deepEqual(decodeKeystore(bytes.toString("base64")), bytes);
});

test("first release accepts the undeployed SPA HTML fallback while updates and invalid JSON fail closed", async () => {
  const html = async () => new Response('<!doctype html><html><body>Vinaris</body></html>', {
    headers: { "Content-Type": "text/html" },
  });
  assert.equal(await previousRelease("https://vinaris.app", true, html), null);
  await assert.rejects(previousRelease("https://vinaris.app", false, html), /Expected release.json/);
  for (const body of ["broken JSON", "null", '{"versionCode":1}']) {
    await assert.rejects(previousRelease("https://vinaris.app", true, async () => new Response(body)));
  }
});

test("generate the actual Android project offline with canonical URLs and no billing or extra privileges", async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), "vinaris-android-test-"));
  try {
    await generateProject(temporary);
    const gradle = await readFile(resolve(temporary, "app/build.gradle"), "utf8");
    assert.match(gradle, /applicationId: 'app\.vinaris\.cellar'/);
    assert.match(gradle, /hostName: 'vinaris\.app'/);
    assert.match(gradle, /targetSdkVersion 36/);
    assert.match(gradle, /androidbrowserhelper/);
    assert.doesNotMatch(gradle, /billingclient|appsFlyer|localhost|127\.0\.0\.1/);
    const xml = await readFile(resolve(temporary, "app/src/main/AndroidManifest.xml"), "utf8");
    assert.match(xml, /android:autoVerify="true"/);
    assert.doesNotMatch(xml, /POST_NOTIFICATIONS|ACCESS_FINE_LOCATION|READ_MEDIA_IMAGES|CAMERA/);
    const manifest = JSON.parse(await readFile(resolve(temporary, "twa-manifest.json"), "utf8"));
    assert.equal(manifest.webManifestUrl, "https://vinaris.app/manifest.webmanifest");
    assert.deepEqual(manifest.additionalTrustedOrigins, []);
    assert.equal(manifest.fallbackType, "customtabs");
    const launcher = await readFile(resolve(temporary, "app/src/main/java/app/vinaris/cellar/LauncherActivity.java"), "utf8");
    assert.match(launcher, /com\.google\.androidbrowserhelper\.trusted\.LauncherActivity/);
    await readFile(resolve(temporary, "gradle/wrapper/gradle-wrapper.jar"));
    await readFile(resolve(temporary, "app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"));
  } finally {
    // Delete only the explicitly created temporary directory.
    assert.equal(dirname(temporary), resolve(tmpdir()));
    assert.ok(temporary.startsWith(resolve(tmpdir(), "vinaris-android-test-")));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("domain association uses the APK's verified certificate, and rejects unsigned output", () => {
  const digest = "ab".repeat(32);
  const fingerprint = certificateFingerprint(`Signer #1 certificate SHA-256 digest: ${digest}`);
  const links = assetLinks("app.vinaris.cellar", fingerprint);
  assert.equal(links[0].target.sha256_cert_fingerprints[0], "AB:".repeat(31) + "AB");
  assert.equal(links[0].target.package_name, "app.vinaris.cellar");
  assert.throws(() => certificateFingerprint("DOES NOT VERIFY"));
});

test("release refuses to publish without signing configuration", async () => {
  const original = process.env.VINARIS_ANDROID_KEYSTORE;
  delete process.env.VINARIS_ANDROID_KEYSTORE;
  try { await assert.rejects(release(), /Missing .*No APK was published/); }
  finally {
    if (original !== undefined) process.env.VINARIS_ANDROID_KEYSTORE = original;
  }
});

test("updates reject a changed signing key and a non-increasing Android version", () => {
  const previous = { packageId: "app.vinaris.cellar", certificateSha256: "old", versionCode: 1 };
  assert.throws(() => checkUpdate(previous, { packageId: previous.packageId, versionCode: 2 }, "new"), /signing key/);
  assert.throws(() => checkUpdate(previous, { packageId: previous.packageId, versionCode: 1 }, "old"), /versionCode/);
  assert.doesNotThrow(() => checkUpdate(previous, { packageId: previous.packageId, versionCode: 2 }, "old"));
});

test("service worker leaves APKs, release metadata and domain verification on the network", async () => {
  const handlers = new Map();
  const script = (await readFile(resolve(androidRoot, "../frontend/public/sw.js"), "utf8"))
    .replace("__VINARIS_PRECACHE_URLS__", "[]");
  const origin = "https://vinaris.app";
  vm.runInNewContext(script, { URL, self: { location: { origin }, addEventListener: (name, handler) => handlers.set(name, handler) } });
  for (const path of ["/downloads/android/vinaris-0.1.0-1.apk", "/downloads/android/release.json", "/.well-known/assetlinks.json", "/api/v1/auth/session"]) {
    let intercepted = false;
    handlers.get("fetch")({ request: { url: origin + path, method: "GET", mode: "navigate" }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
});
