# v5 release record

## Scope and quality gate

Guest entry uses a name plus email or WhatsApp number, as clarified by the owner.
These are contact details, not verified login. Bartenders work offline; guests
need an internet connection. The shared bartender password remains unchanged.

Every critical requirement in `ACCEPTANCE.md` has passed for the clarified scope.
The scores below are internal assessments, not external certification.

| Area | Evidence | Current gate |
| --- | --- | --- |
| Engineering | 19 persistence, retry, link and offline-asset tests; TypeScript; production build; SQL authorization and idempotency assertions; Android offline runtime test | 9/10 internal assessment; critical engineering checks passed |
| Product | Offline walk-in, status, stock and reload; reconnect; cross-client menu updates; email and WhatsApp-number join; expired-session recovery; guest offline block; ready notification; decoded production QR and verified Android links | 9/10 internal assessment; critical product checks passed |
| UI | Shared gold/charcoal/grey system; mobile and desktop review; keyboard cards, focus-managed dialogs, visible labels; zero automated WCAG violations on five key screens | 9/10 internal assessment; evidence recorded in test-results |
| Release | Published web and signed APK; matching application bundles; additive v4-compatible schema; CI; live production checks; rollback instructions | 9/10 internal assessment; critical release checks passed |

## Verification performed

The source at `fdc4d30e328b56bebfc9b88f472ffc100b53c299` passed both CI jobs:
https://github.com/mgritzbach/casa_michele/actions/runs/40990127637.
This includes the API 35 emulator test with cold custom links, warm HTTPS links
and native back navigation. The side-by-side APK SHA-256 is
`0f3ca8044c81812d5e1ff54f5f1e0aee8219d330a3caebfd1c6009a8670e2cdd`.
Its 54 packaged web files were compared byte-for-byte with the local web build.
Later documentation-only commits do not change these tested application sources.
Both web/build and native-runtime jobs also passed for verification commit
`2ecd62c9caaf0af528c28f83cc6660774d5608c6` in
https://github.com/mgritzbach/casa_michele/actions/runs/41030642527.

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
10. Create a new bar entirely offline, add a walk-in, reconnect and authenticate.
    Event `BARAE7FB51E` synchronized with an empty outbox and exactly one server
    order at revision 1, preserving the order created before the event existed online.

The SQL test `supabase/tests/offline_sync.sql` runs inside BEGIN/ROLLBACK and
asserts duplicate retry behaviour, row revisions, v4 conflicts, guest restrictions,
event isolation, contact retention and lack of direct anonymous table access.

The Android instrumentation test uses a disposable API 35 emulator in CI. It
checks first-run offline menu/photos, walk-in completion, process/activity restart
persistence, both link intent filters, cold custom links, warm HTTPS links,
the native back button and the offline guest screen. An initial emulator run
exposed an Android WebView that returns an empty hostname for custom-scheme
URLs. The custom route now has an explicit parser and a regression test.
The local
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

Production was published on 30 October 2026 at
https://casa-michele.mic-gritzbach.workers.dev. Cloudflare version `88c9497e`
serves 100% of traffic, from commit
`6e62e1b861980eb19e55960781370fb3b4b33304`. This has the same application
source as the distributed APK; later commits change only documentation and CI.
The prior production version `9134b54c` is the rollback target.

All 55 public build files were retrieved successfully. Application JavaScript,
CSS, images and domain association match the local bundle. HTML, manifest and
service worker match the verified CI artifact, including build-environment
whitespace and content hashes. The association endpoint returns JSON, and the
Google Digital Asset Links API confirms the distributed package and certificate
are linked to production.

The production event `QA30LIVE` passed fresh email guest entry, cross-client
ordering, offline bartender completion, offline reload, reconnect, guest ready
notification, guest offline blocking and WhatsApp-number entry. No email or
WhatsApp message was sent. ZXing decoded the rendered production QR screenshot
to `https://casa-michele.mic-gritzbach.workers.dev/?code=QA30LIVE`.

The exact signed APK is published as a prerelease at
https://github.com/mgritzbach/casa_michele/releases/tag/v5.0.0-preview.
The production-link workflow downloads that file, checks its SHA-256 and tests
Android's own domain verifier without forcing approval.

The exact distributed APK passed on an API 35 Google APIs emulator in
https://github.com/mgritzbach/casa_michele/actions/runs/41030635767 (attempt 2).
`pm get-app-links` reported the production host as `verified` for the expected
certificate. Unqualified HTTPS and custom-scheme VIEW intents both opened
`com.casamichele.app.preview/com.casamichele.app.MainActivity`. The captured
screen shows the join form with event `QA30LIVE`. This tests actual Android
verification, not merely intent-filter registration or forced approval.
The first attempt could not download an unpublished draft release; publishing
the prerelease made it available without widening CI permissions.

The release retains these explicit limitations: sideload/debug signing rather
than an in-place v4 upgrade; self-reported contact details rather than verified
identities; and newly added remote photos need inclusion in the next bundled
release for guaranteed offline availability. These do not remove the accepted
offline bartender, guest connectivity or shared-link requirements.

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

Roll back the Cloudflare Worker to version `9134b54c`. The v5 database
migration is additive and v4-compatible, so retain it. Do not drop revision columns
or mutation receipts as a rollback step. A v5 device may still have unsynced edits.
A side-by-side APK can be removed without affecting v4, but first sync any new work.
Never clear the v5 app's data while it has pending changes.
