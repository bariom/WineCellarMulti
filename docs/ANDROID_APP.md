# Vinaris Android pilot

`android/` packages the main Vinaris app as a Trusted Web Activity (TWA) opening
`https://vinaris.app` through a compatible browser. Account access, cellar data,
Moments and Stripe use the existing website/backend. This direct-download pilot
is separate from the frontend's Capacitor configuration for **Vinaris Monitor**.

## Recommended: build on GitHub without installing anything on the PC

The manual workflow `.github/workflows/android-apk.yml` compiles on an Ubuntu
GitHub Actions runner. Node, JDK 17 and Android SDK components are supplied there.
Android Studio and a local Android SDK are unnecessary.

### One-time signing setup

Use a persistent release key; do not generate a new key on each workflow run.
This workstation already has `keytool.exe` in its Java 8 runtime. Java 8 is sufficient
to create the key, although compilation runs with Java 17 on GitHub. Use the existing
tool in PowerShell (no installation):

```powershell
$signingDirectory = Join-Path $env:USERPROFILE '.vinaris-signing'
New-Item -ItemType Directory -Force -Path $signingDirectory | Out-Null
$signingKey = Join-Path $signingDirectory 'vinaris-release.jks'
& 'C:\Program Files\Eclipse Adoptium\jre-8.0.504.1-hotspot\bin\keytool.exe' -genkeypair -storetype JKS -keystore $signingKey -alias vinaris -keyalg RSA -keysize 3072 -validity 10000
```

Answer the certificate identity questions and password prompts. Retain the key and
passwords in a private backup. If an existing release key is available, reuse it.
The tool refuses to replace an existing alias. Never place this key in git or in
the website downloads directory.

In the repository's **Settings > Secrets and variables > Actions**, create:

| Repository secret | Value |
| --- | --- |
| `VINARIS_ANDROID_KEYSTORE_BASE64` | Base64 of the entire keystore |
| `VINARIS_ANDROID_KEY_ALIAS` | `vinaris` |
| `VINARIS_ANDROID_STORE_PASSWORD` | Keystore password |
| `VINARIS_ANDROID_KEY_PASSWORD` | Key password (same as store password if selected during creation) |

Copy the Base64 directly to the clipboard with built-in PowerShell, then paste it
into the GitHub secret form. This avoids printing private signing material:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes($signingKey)) | Set-Clipboard
# After saving the secret on GitHub:
Set-Clipboard -Value ''
```

No GitHub token or deployment credentials are required by this workflow. Signing
secrets are passed only to the steps that need them. The decoded keystore is private
to the temporary runner directory and excluded from uploaded artifacts.

### Build and download from the browser

Once these changes are pushed to GitHub, open **Actions > Android APK > Run workflow**.
Select the intended branch. Check **first_release** only when no APK has yet been
published on the website; subsequent releases must keep it unchecked.

The workflow runs packaging tests, retrieves the website's previous `release.json`,
builds and verifies the signed APK, and uploads `vinaris-android-<run number>`.
Download that artifact ZIP from the completed run; it contains the APK,
`assetlinks.json` and `release.json`. It expires after 30 days, so retain published
releases on the server. The workflow does not deploy or change the website.

For updates, edit `android/vinaris.json` to increase `versionCode`, push and run the
workflow again. Its comparison with the published metadata rejects a changed key,
package or non-increasing version code. Unavailable/malformed metadata fails the
build; only an explicit first release accepts HTTP 404. Stage and retain the verified
files using the deployment procedure below.

## Optional local project generation

From the repository root, with Node 18+ available:

```powershell
$env:Path = "C:\ERI\node;$env:Path" # Use the actual installed Node directory.
npm.cmd --prefix android ci
npm.cmd --prefix android run generate
npm.cmd --prefix android test
```

Open `android/twa/` in Android Studio. Generation reads the repository's PWA
manifest/icons without contacting production. Settings are in `android/vinaris.json`:
package `app.vinaris.cellar`, version name/code and Android 8.0/API 26 minimum.
Bubblewrap is pinned in a separate lockfile; generated code retains its upstream
Apache-2.0 license notices. The generated directory is ignored: change the generator
in `android/scripts/`, rather than editing generated files.

Generation works without a JDK/SDK. Compilation requires **JDK 17 or 21**, Android
SDK **Platform 36**, and stable **Build-Tools**. Install these and accept SDK licenses
through Android Studio's SDK Manager. A Java 8 runtime cannot build the APK.

## Optional local APK compilation

Create a persistent signing key through Android Studio or `keytool`. Keep it outside
the repository and back it up with its passwords. Example, after creating a private
directory and setting `JAVA_HOME` to your JDK:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -keystore C:\private\vinaris-release.jks -alias vinaris -keyalg RSA -keysize 3072 -validity 10000
```

`keytool` prompts for passwords and certificate identity. Do not put passwords in
command arguments, git or download directories. Configuration names are documented
in `android/.env.example`; scripts do not load `.env` automatically. Set variables
in the build shell:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr" # Verify JDK version.
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:VINARIS_ANDROID_KEYSTORE = "C:\private\vinaris-release.jks"
$env:VINARIS_ANDROID_KEY_ALIAS = "vinaris"
$storeSecret = Read-Host "Keystore password" -AsSecureString
$env:VINARIS_ANDROID_STORE_PASSWORD = [System.Net.NetworkCredential]::new("", $storeSecret).Password
$keySecret = Read-Host "Key password" -AsSecureString
$env:VINARIS_ANDROID_KEY_PASSWORD = [System.Net.NetworkCredential]::new("", $keySecret).Password
try {
    npm.cmd --prefix android run release
} finally {
    Remove-Item Env:VINARIS_ANDROID_STORE_PASSWORD, Env:VINARIS_ANDROID_KEY_PASSWORD
}
```

The release command regenerates/compiles the project, verifies the APK signature
with Android's `apksigner`, and stages these files in ignored `android/releases/`:

- `vinaris-<versionName>-<versionCode>.apk`: signed APK;
- `assetlinks.json`: domain association using the APK's actual certificate;
- `release.json`: version, download URL, APK SHA-256 and public certificate fingerprint.

It does not upload anything. Signing secrets are supplied to Gradle through the
environment and are not written into generated sources or release artifacts.
For updates, increment `versionCode` and keep the same package/signing key. The
script rejects a changed certificate or a non-increasing version code relative to
the previous staged release. Preserve `release.json` and release history on the
build machine so these checks remain effective.

## Distribute the pilot from the site

The prepared nginx routes serve the persistent server directory
`/home/administrator/progetti/WineCellarMulti/android/releases/`, outside `dist/`:

- `https://vinaris.app/.well-known/assetlinks.json`
- `https://vinaris.app/downloads/android/release.json`
- `https://vinaris.app/downloads/android/vinaris-0.1.0-1.apk` for the first release.

Copy only verified release artifacts there. Apply `deploy/nginx/vinaris.app.conf`
through the normal deployment procedure, check `nginx -t`, and reload nginx.
Missing artifacts return 404, not React HTML. The service worker leaves downloads
and domain verification files on the network.

The APK can install before domain verification, but may show a browser toolbar.
Fullscreen trust requires the real matching `assetlinks.json`. Never publish a
placeholder fingerprint or declare Stripe as an owned/trusted origin. Stripe
checkout uses the browser's external-origin UI; test return-to-app on actual devices.

Initially share the versioned URL with testers. Android asks them to allow installation
from that browser/source and confirm installation. Updates require user confirmation.
This stage does not add a silent updater or a public landing-page download button.

## Checks before inviting testers

The local tooling tests cover actual offline project generation, canonical URLs,
permissions, certificate parsing, update guards and service-worker exclusions.
Run `npm run build` in `frontend/` after changing its manifest, icons or service worker.
The frontend also exposes `android:generate`, `android:release` and `test:android`.

Generation tests do not replace APK compilation or phone testing. On a real device:

- Install the signed APK and verify domain association, fallback and Android Back.
- Check login/logout, household switching, photos, Moments and maps.
- Check GPS availability: Android/browser photo selection can withhold location
  metadata. Preserve only GPS actually supplied; never substitute current phone location.
- Test Stripe in test mode, bank authentication, cancellation, return to Vinaris
  and server-side entitlement/AI balance refresh.
- Install a second release over the first using the same key and a higher version code.
- Check network failures and existing offline behavior; the backend remains online.

For public distribution, plan Android developer verification as its rollout expands.
A future Play release needs a separate review of digital purchase flows.

References: [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md),
[TWA](https://developer.chrome.com/docs/android/trusted-web-activity),
[Android signing](https://developer.android.com/studio/publish/app-signing),
[direct distribution](https://developer.android.com/distribute/marketing-tools/alternative-distribution),
[developer verification](https://developer.android.com/developer-verification).
