# Architecture

## Responsibilities

- `App.tsx`: event routing and the guest/bartender workflows.
- `components/`: entry forms, welcome screen, sync state, update prompt and shared controls.
- `hooks/useEventSync.ts`: cache hydration, connection state, replay and snapshot reconciliation.
- `services/offlineStore.ts`: atomic IndexedDB transactions, projected views and conflict choices.
- `services/casaApi.ts`: the versioned server boundary and error translation.
- `services/guestRequests.ts`: persisted guest request identities for uncertain responses.
- `services/links.ts`: one validated event-code and public-link contract.
- `data/menu.json` and `public/images/`: the versioned offline menu.
- `supabase/migrations/`: additive server functions, revisions and mutation receipts.

## Offline writes and reconnect

A bartender action writes its payload and a stable UUID to the event's outbox in
one IndexedDB transaction. The UI projects these changes over the last server
snapshot. A network request never removes an edit before the server acknowledges
it. Acknowledgement removes only that UUID, preserving edits made while the
request was in flight. Old snapshots cannot revert newer acknowledged revisions.

The server validates the opaque session and bartender role before every mutation.
It serializes event mutations, checks the expected row revision and records a
receipt atomically. A repeated UUID returns the original result. A conflicting
revision remains pending until the bartender chooses the server version or
rebases the local edits. Other entities can continue syncing.

V4 writes also increment row revisions through database triggers. This detects
conflicts between old and new clients. Deletion is an order status, so it can be
synchronized without silently resurrecting removed orders.

A guest does not have an offline outbox. An order can be submitted only with a
working connection. The request UUID persists across a reload and is removed
after acknowledgement. Retrying an uncertain request cannot create another order.

## Data boundaries

The public client key identifies the application, not a user. SECURITY DEFINER
RPCs validate a password or opaque session and use an empty search path. Direct
client table privileges remain revoked. Guests receive only their own session's
orders; contact details are returned only to the event's bartender.

Email and WhatsApp numbers are self-reported contact information. There is no
OTP provider or claim of WhatsApp account authentication. Contact buttons open a
draft in the user's email or WhatsApp application; they do not send automatically.

Saved bartender sessions and cached orders remain on the device for offline use.
Leaving an event does not discard its pending work. Use a trusted device and clear
browser/app data when retiring it, after all changes have synchronized. Clearing
app storage removes unsynced work. Browser storage is subject to platform eviction;
this application does not pretend to be a remote backup while disconnected.

## Design system

The primary action colour is muted gold `#c6a266`. Background, panel and border
roles use `#111110`, `#1c1c1a` and `#30302d`. Warm grey supports secondary text;
red and green indicate operational states. Gold is reserved for actions and
selection. Typography pairs a restrained serif on guest editorial headings with
system sans-serif for operational controls. All fonts, icons and styles work offline.

This follows role-based colour and clear visual hierarchy, informed by Material 3
and Apple's Human Interface Guidelines. It does not depend on a network font CDN,
ornamental glow effects or continuous decorative animation.

Sources: https://m3.material.io/styles/color/the-color-system and
https://developer.apple.com/design/human-interface-guidelines
