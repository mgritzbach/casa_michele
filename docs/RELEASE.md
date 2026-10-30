# v5 release record

## Scope and quality gate

Guest entry uses a name plus email or WhatsApp number, as clarified by the owner.
These are contact details, not verified login. Bartenders work offline; guests
need an internet connection. The shared bartender password remains unchanged.

The goal remains open until every critical requirement in `ACCEPTANCE.md` has
passed. The scores below are internal assessments, not external certification.
Do not turn a pending check into a pass merely because the build compiles.

| Area | Evidence | Current gate |
| --- | --- | --- |
| Engineering | 17 persistence, retry, link and offline-asset tests; TypeScript; production build; SQL authorization and idempotency assertions | Web checks passed; native runtime check pending |
| Product | Offline walk-in, status, stock and reload; reconnect; cross-client menu updates; email and WhatsApp-number join; expired-session recovery; guest offline block; ready notification | Browser checks passed; installed Android link check pending |
| UI | Shared gold/charcoal/grey system; 390px mobile review; keyboard cards, focus-managed dialogs, visible labels; automated WCAG checks | Final audit evidence recorded in test-results |
| Release | Android APK compiles; same web bundle copied into APK; additive v4-compatible schema; CI and rollback instructions | Live web deployment and native runtime acceptance pending |

## Verification performed

The browser checks used a synthetic event `QA30GOLD` in two separate browser
profiles. No message was sent by email or WhatsApp.

1. Create the event online. Join a separate guest session using an email address.
2. Disable networking for the bartender. Read a recipe and photo, create a
   walk-in Negroni, mark it complete and mark Gin unavailable.
3. Reload offline. The completed order and all three pending changes remain.
4. Reconnect. Exactly one walk-in order reaches the server; its status is completed.
   The guest menu reflects unavailable Gin. A separately submitted guest order
   appears in the bartender workspace.
5. Complete the guest order. The guest receives the in-app ready notification.
6. Make an offline stock edit while another client changes that row. Reconnect:
   the conflict remains visible. Choose the local version and verify revision 3
   with an empty outbox. Unit tests also cover accepting the server version.
7. Expire only the test event's bartender sessions on the server. Cached data
   remains usable; reconnecting with the password restores synchronization.
8. Disable guest networking. The guest sees the internet-required screen and
   cannot submit. Reconnect and join a new session using a WhatsApp number.
9. Install a web service-worker update. Saved session and orders remain intact.

The SQL test `supabase/tests/offline_sync.sql` runs inside BEGIN/ROLLBACK and
asserts duplicate retry behaviour, row revisions, v4 conflicts, guest restrictions,
event isolation, contact retention and lack of direct anonymous table access.

The Android instrumentation test uses a disposable API 35 emulator in CI. It
checks first-run offline menu/photos, walk-in completion, process/activity restart
persistence, both link intent filters and the offline guest screen. The local
Windows emulator could not boot without a working hypervisor; no system driver,
firewall permission or Windows virtualization setting was changed to bypass that.

The dependency audit has no moderate, high or critical findings. Four low findings
share one build-only deepmerge dependency in the service-worker tooling. npm's
suggested forced fix would downgrade the PWA plugin to an incompatible version;
that downgrade is not applied.

Supabase's advisor reports intentional token-gated SECURITY DEFINER RPCs and
RLS-protected tables with no client policies. The Casa SQL tests verify the
intended boundaries. The shared project also contains unrelated advisor findings;
this release does not change unrelated applications.

## Database rollout

The additive functions have been applied to project `cbtroatixvydpwoviezf`.
The first two files were applied transactionally through SQL; the validation
follow-up uses the migration API. This is a shared project with a wider migration
history than this repository. Do not run an unreviewed blanket `db push` or reset.
For another installation, apply the v4 baseline first, then these files in order:

- `20261030010846_offline_sync_and_guest_contacts.sql`
- `20261030011637_persist_guest_contact_on_order.sql`
- `20261030013306_validate_offline_mutation_kind.sql`

Run the SQL assertions inside a transaction and roll them back. New APIs do not
remove v4 RPCs or existing event data. Mutation receipts must not be pruned while
clients might retry old changes.

## Web deployment

Cloudflare's connected Git build publishes this branch at
https://codex-offline-cross-platform-casa-michele.mic-gritzbach.workers.dev.
The branch preview was opened and visually checked on 30 October 2026. It is
separate from the production URL used in printed QR codes.

Deploy the built `dist` directory to the existing Cloudflare Worker configured in
`wrangler.json`. Preserve the public URL because printed QR codes depend on it.

```sh
npm ci
npm run verify
npx wrangler deploy
```

Cloudflare authentication is required on the release machine. The current browser
session is at the Cloudflare sign-in screen. Production deployment is pending.
After deployment verify the root page, the new bundle, service worker, and
`/.well-known/assetlinks.json`, then use an Android device to test HTTPS link
verification and the custom-scheme fallback. Check a fresh guest session against
the same event used by the app. Do not mark release readiness as 9/10 until these
checks pass.

## APK and signing

The normal package is `com.casamichele.app`. The side-by-side debug package is
`com.casamichele.app.preview`, displayed as **Casa Michele v5**. It can coexist
with v4, preserving the old installation and local data. Both use the same online
backend. This is a sideload build, not a Play Store release.

The v4 APK certificate SHA-256 starts `59CBF87F6DF6B570`; this machine's certificate
starts `E4A55A142ED22C92`. Android will reject an in-place update signed by a different
key. Do not uninstall the old app to work around this before saving its data.
Use the side-by-side build, or supply the original private signing key for a true
in-place upgrade. Keep private signing material outside Git. `assetlinks.json`
contains public certificate fingerprints only.

## Rollback

Roll back the Cloudflare Worker to the prior known-good deployment. The v5 database
migration is additive and v4-compatible, so retain it. Do not drop revision columns
or mutation receipts as a rollback step. A v5 device may still have unsynced edits.
A side-by-side APK can be removed without affecting v4, but first sync any new work.
Never clear the v5 app's data while it has pending changes.
