# Casa Michele

One React application for the web and Android. Guests join an event, choose a
cocktail, and see when it is ready. Bartenders manage orders, recipes and stock,
including when the internet is unavailable.

Production URL: https://casa-michele.mic-gritzbach.workers.dev

## Updates in v5.2

Use **Check for updates** on the welcome screen or the download icon in the
bartender and guest headers. Android checks published GitHub releases for its
installed package, including preview releases. **Download and install** verifies
the SHA-256 checksum, package, signing certificate and newer version code before
opening Android's confirmation screen. Android may first ask you to allow this
app to install updates. Return to Casa Michele and tap the button again after
allowing it. Saved bar data is preserved.

Install v5.2 once using its APK to get this updater. Future versions can use the
button. Updates require internet; checks never block offline bartender work.
Updates and restarts happen only when requested.

The web button checks GitHub and the deployed service worker. A GitHub release
alone does not deploy the website. Once the website is deployed, **Install web
update** reloads the app with the new version and retains saved changes.

Release maintainers must increment the package version and Android versionCode,
sign with the same key, and upload `CasaMichele-vX.Y.Z-preview.apk` to the published
`vX.Y.Z-preview` release. GitHub provides the asset SHA-256. Draft releases and
unfinished or incompatible assets are ignored. Keep the preview and normal
package channels separate. This direct APK updater is for sideload distribution.
The CI `updateTestVersionCode` override is only for disposable test fixtures;
never publish that fixture.

## Stock controls in v5.1

In **Recipes**, drinks missing stock have a red border and list the missing
ingredients. **Makeable only** hides them and combines with recipe search.
Availability follows the ingredient selections in **Stock**, including offline.

In **Stock > Guest ordering**, turn on **Allow out-of-stock drinks for guests to
order** to accept those orders for the current event. It starts off, remains
independent of actual stock, and synchronizes to other devices. Offline changes
take effect for guests after sync. Missing-stock warnings remain visible, and
turning the setting off restores the server-side restriction for new orders.

The v5.1 preview APK uses the same package and signing key as the v5.0 preview,
so it updates that installation without clearing its saved data. It still
coexists with the older v4 app.

## What v5 changes

- Bundles the menu, recipes and 41 optimised photos for Android's first offline launch.
- Prepares the web application for offline use with a service worker. The initial
  visit must finish while connected. An update is installed only when the user chooses.
- Saves bartender stock, walk-in orders and order status in IndexedDB with an
  atomic outbox. Reconnect replays stable mutation IDs. Concurrent changes require
  an explicit choice; unrelated work continues syncing.
- Retains cached work when a bartender session expires and supports reconnecting
  the same event. Local-only bars can be connected later.
- Blocks guest ordering when the backend cannot be reached. Guests enter their
  name and either an email or WhatsApp number. These are contact details, not
  verified identities. WhatsApp account numbers cannot be read from another app.
- Generates public HTTPS event QR codes, with browser fallback and Android join links.
- Uses a shared gold, charcoal and grey design system, labelled forms, keyboard
  controls, focus-managed dialogs and reduced-motion support.

## Development

Node.js 22+, Java 21 and Android SDK 36 are required for both targets.

```sh
npm ci
npm run dev
npm run verify
npm audit --audit-level=moderate
```

The Supabase publishable key in the client is public by design. No service-role
key or database password belongs in this application. Optional configuration:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

`npm run menu:bundle` refreshes the committed menu and optimised photographs from
the existing menu sheet. Review the resulting data and images before release.
The in-app refresh also retrieves menu edits; newly added remote photos are not
guaranteed offline until included in a new bundled release.

## Android

```sh
npm run android:sync
cd android
./gradlew testDebugUnitTest assembleDebug
```

The APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`.
To install beside an older APK when its signing key is unavailable:

```sh
./gradlew assembleDebug -PsideBySide=true
```

This uses `com.casamichele.app.preview` and the label **Casa Michele v5**. It
preserves the old app and its local storage. Both apps can join the same online
event. An in-place upgrade of the old app requires its original signing key.
The repository does not contain private signing material. Keep the distribution
key stable and update `public/.well-known/assetlinks.json` if the signing identity changes.

## Architecture and release

See `docs/ARCHITECTURE.md`, `docs/ACCEPTANCE.md` and `docs/RELEASE.md` for data
ownership, test evidence, deployment and rollback. GitHub Actions checks types,
automated persistence tests, web packaging, dependency audit and Android compilation.

The database is shared with unrelated applications. Apply only the Casa migrations
in the documented order. Do not reset the project or blindly push a partial local
migration history to it. Existing v4 RPCs remain available.
