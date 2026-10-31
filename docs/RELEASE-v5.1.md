# v5.1 stock controls

## Behavior

The bartender Recipes tab counts recipes ready to make, marks unavailable recipes
with a red border and missing ingredient names, and provides a Makeable only filter
that combines with recipe search.

Stock contains an event-specific Allow out-of-stock drinks for guests to order
switch. It defaults to off. Turning it on permits guest orders while retaining
stock warnings. Turning it off rejects new unavailable orders on the server.
Walk-in orders retain their existing stock rules.

Offline changes to this setting persist across reloads and native restarts. They
reach guests after reconnection. Revision checks preserve conflicting changes for
explicit resolution. Duplicate requests retain their original result.

## Verification

- 24 unit tests, TypeScript and production build pass.
- Both SQL suites pass inside rolled-back transactions, including guest denial,
  event isolation, default-off policy, retry idempotency and revision conflicts.
- Two separate mobile browser contexts passed recipe borders, combined filters,
  offline policy persistence, reconnect, guest ordering, restriction restoration
  and stock recovery. Synthetic event: SMVWGTZT5.
- The three changed screens have zero automated WCAG 2 A/AA and 2.1 AA violations.
- Both final CI jobs pass in run 41207920283, including Android API 35 runtime
  tests. A prior run exposed a startup race, fixed by resolving native launch
  recovery before displaying navigation. A deterministic delayed-callback
  browser test also passes. Native tests cover offline first launch, restart
  persistence of stock and the guest policy, cold/warm links and native back.
- The dependency audit has no moderate, high or critical findings. Four low
  reports share the existing build-only deepmerge dependency.
- All 54 packaged web files match the tested local production build byte for byte.
  The web-only .well-known association directory is intentionally not packaged.

Application source: 85871ac24ce09c7e0228d292f66aaaa46dc73a0c.
APK SHA-256: 7502b8cea4bb79f85acfbf40ee7a851b888ece37429094c06c906c19abf28067.
Package: com.casamichele.app.preview, version 5.1.1, versionCode 7.
Certificate SHA-256:
E4:A5:5A:14:2E:D2:2C:92:C0:98:05:A8:6A:CD:48:D1:12:76:B0:FB:5F:FE:3A:EF:9D:76:19:3F:CD:20:C6:ED.

This sideload build updates the v5.0 preview while preserving its application
data. It remains separate from v4. Keep the same private signing key for later
updates. Never clear application data while changes are pending.

Published APK:
https://github.com/mgritzbach/casa_michele/releases/download/v5.1.1-preview/CasaMichele-v5.1.1-preview.apk.
The downloaded release asset matches the SHA-256 above.

## Deployment

The additive migration 20261031133618_event_stock_order_policy.sql is applied to
the existing Supabase project. It preserves prior clients and event data.

The production website update is pending Cloudflare authentication. Production
still serves v5.0 until that deployment is completed. Older guest web clients
continue to hide unavailable drinks, so the new guest override requires v5.1
on both the bartender and guest client.

The v5.1 branch preview is published at
https://codex-offline-cross-platform-casa-michele.mic-gritzbach.workers.dev.
Its application JavaScript, CSS and images match the tested build. The full
two-client stock acceptance flow also passes there, event SMVWGZDWO. Printed QR
codes still use the canonical production host.

After authenticating, deploy the tested dist directory with the existing
wrangler.json. Keep the canonical production host because printed QR codes use it.
Run scripts/verify-stock-browser.cjs with CASA_TEST_URL set to production after
deployment. The prior web version 88c9497e is the rollback target for this update.
Retain the additive database columns and receipts during a rollback.
