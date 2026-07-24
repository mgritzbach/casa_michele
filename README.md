# Casa Michele

Casa Michele is a mobile-first cocktail menu and event bar app. Guests join an
event, browse the live menu, and place orders. Bartenders operate the same event
from a protected dashboard for orders, stock, recipes, and guest-ready updates.

The production web app is available at
[casa-michele.mic-gritzbach.workers.dev](https://casa-michele.mic-gritzbach.workers.dev).
The Android app uses the same Supabase database and server-validated API.

## Product flows

- Guest: join by event code or QR, filter/search 41 cocktails, order, and receive
  a ready notification.
- Bartender: create or resume a protected event, manage orders, update ingredient
  availability, inspect recipes, and share the event QR.
- Resilience: opaque sessions are restored locally, network state is visible,
  mutations are optimistic with rollback, and duplicate orders are idempotent.

## Security model

- No database password or service-role key ships in the client.
- Direct anonymous access to the Casa tables is revoked.
- Guest and bartender operations use token/PIN-gated `SECURITY DEFINER` RPCs.
- Bartender PINs and session tokens are stored as hashes; repeated failed PIN
  attempts are temporarily locked.
- Android blocks cleartext traffic and disables device backups.
- The web build has a restrictive Content Security Policy.

The database migration is in `supabase/migrations/` and is designed to preserve
the existing orders and availability data.

## Local development

Prerequisites: Node.js 22+ and Java 21 for Android builds.

```bash
npm install
npm run dev
```

The checked-in Supabase publishable key identifies the public client and is safe
to distribute. Authorization is enforced in the database. To target another
project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Verification

```bash
npm run typecheck
npm run build
npm audit
```

## Android

```bash
npm run build
npx cap sync android
cd android
./gradlew testDebugUnitTest assembleDebug
```

The debug APK is generated at
`android/app/build/outputs/apk/debug/app-debug.apk`. A Play Store release still
requires the owner's release keystore and store signing configuration.
