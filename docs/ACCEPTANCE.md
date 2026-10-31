# Casa Michele v5 acceptance contract

The current product scope supersedes the initial verification proposal: guests
provide their name and either email or a WhatsApp number. These are self-reported
contact details, not verified identities. There is no paid OTP provider requirement.
The existing shared bartender password remains supported.

Each area must score at least 9/10. Every critical check below is mandatory;
scores cannot compensate for a missing critical feature. Evidence is recorded
alongside the release. A score is an engineering assessment, not an external certification.

## Engineering

- Critical: menu, recipes and photos are bundled for first-run Android offline use.
- Critical: installed web app starts offline after initial preparation.
- Critical: bartender stock, order status and walk-in orders survive refresh/restart.
- Critical: local edits and their outbox records commit atomically.
- Critical: retries after lost responses cannot duplicate orders or apply a mutation twice.
- Critical: remote snapshots never erase unsent local edits.
- Critical: concurrent device edits are detected and resolved explicitly.
- Critical: expired sessions retain local work and can resume after reauthentication.
- Critical: server checks bartender/guest roles and event isolation on every operation.
- Type checking, production build, focused automated tests and dependency audit pass.

## Product

- Critical: guests cannot join or order without a working backend connection.
- Critical: bartender can continue offline and see what is pending or unsynced.
- Critical: guest entry accepts either email or WhatsApp number, with clear labels.
- Critical: no assertion that entered contact information is verified or imported from WhatsApp.
- Critical: all QR codes use the public web URL and work across Android and browsers.
- Critical: Android handles supported join links; browser fallback remains usable.
- Existing search, filters, recipes, stock, ready status, undo, deletion and contact actions remain.

## UI and accessibility

- Critical: offline, reconnecting, expired-session and conflict states are understandable and actionable.
- Critical: no false 'guest notified' claim for an unsent or offline change.
- Forms have persistent labels, keyboard access, error messages and pending states.
- Mobile layouts have no overflow or clipped controls; primary actions have adequate touch targets.
- Loading, empty, success and failure states are checked visually.
- No essential network-only styles, fonts or icons.

## Release and operations

- Critical: Android artifact and web production build use the same source version.
- Critical: migration is additive, preserves existing event records and keeps v4 compatible.
- Critical: database authorization tests and offline/reconnect tests have recorded results.
- Critical: APK build is verified and signing limitations are explicit.
- Critical: deployment location, source commit, setup steps and rollback instructions are recorded.
- No credentials in the repository, browser bundle, logs or test artifacts.
- Final scores remain pending until actual verification is complete.
