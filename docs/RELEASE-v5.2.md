# v5.2 GitHub updates

The welcome screen and bartender/guest headers offer Check for updates. The
Android button reads published GitHub releases for the installed package channel,
compares numeric versions and offers Download and install. Preview packages use
preview assets; the normal package never receives a preview-package update.

The native updater downloads only from the Casa Michele repository and GitHub's
HTTPS release-asset hosts. It limits file size, network time and redirects, then
verifies the SHA-256 digest, package identity, installed signing certificate and
increasing Android versionCode. Only a verified APK is shared with Android's
installer through a private cache FileProvider URI. Installation requires user
confirmation. Android may require allowing this app as an installation source.
The user returns and taps the update button again after granting that permission.

The first updater-enabled APK must be installed manually. It updates the existing
v5 preview package and preserves its local data. Future releases use the button.
This is a sideload release, not a Play Store distribution.

Web updates use the deployed service worker. The button checks for a new worker
and installs it only when requested. GitHub publication alone does not deploy the
website; the UI explains this when the repository has a newer release. Saved
bar changes remain in IndexedDB across the update and reload.

## Verification

- 27 unit tests, TypeScript and production build pass.
- Browser acceptance covers newer versions, explicit install intent, source
  permission guidance, failed verification, offline checks and GitHub rate limits.
- A real service-worker replacement reloads only after Install web update and
  preserves an unsynced stock edit. The stock, ordering and startup regressions
  also pass. The new dialog has zero automated WCAG A/AA violations; the workspace
  and dialog fit a 320px viewport.
- A live browser request to GitHub succeeds under the production CSP and reads
  the real release's SHA-256 metadata.
- Android CI builds a versionCode 999 fixture with its disposable signing key,
  then installs the normal versionCode 8 app. It verifies the newer same-key APK,
  rejects a wrong checksum and same-version APK, and opens Android's Update
  confirmation without installing the fixture. Existing native offline/restart
  and QR-link tests are retained. The first run's cleanup revoked an app-op and
  killed the instrumentation process; cleanup now relies on Gradle uninstall and
  disposal of the emulator. Both CI jobs passed in run 41209668554. A subsequent UI-only change adds
  plain-language offline/update-check errors and passes the same local checks.

Native verification source: 0e31bac244ea372336192482d54d66366c6f0480.
The release tag identifies the final application source.
Package: com.casamichele.app.preview, versionName 5.2.0, versionCode 8.
APK SHA-256: 16ee8dd5775f06b59aa23d1b7e76e4f6d3bc9412617852b395e602321e528984.
Certificate SHA-256: e4a55a142ed22c92c09805a86acd48d11276b0fb5ffe3aef9d76193fcd20c6ed.
All 53 packaged web files match the tested production build byte for byte.

## Deployment and maintenance

The branch preview deploys through the connected Cloudflare build. Production
remains on v5.0 pending Cloudflare authorization, including the prior stock UI
update. Do not confuse the release button with a website deployment mechanism.
No database changes are needed for this release.

Publish a higher package version and Android versionCode, use the existing key,
and attach CasaMichele-vX.Y.Z-preview.apk to the matching vX.Y.Z-preview release.
Do not publish CI fixture APKs or ephemeral-key CI builds. Leave release assets
immutable once distributed. Keep the production QR host and assetlinks intact.

The current web rollback target is Cloudflare version 88c9497e. Retain all offline
data and additive database changes. Do not uninstall the Android app as an update
workaround; publish a fixed build with a higher versionCode instead.
