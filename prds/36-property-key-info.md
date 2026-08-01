# 36 — Property Key Info (Emergencies, Wi-Fi, Contact Kinds)

**Phase**: 7 (authoring assist) · **Depends on**: 03 (property pages), 27 (column guard posture) · **Feeds**: 37 (paste ingestion needs these destinations)
**Status**: 🟢 ready (2026-07-31)
**Parallel-safe with**: 35 (different files). **37 must wait for this** — ingestion routes into the fields this PRD creates.

---

## Why this exists

Dad pasted his whole Google Doc for Loon-A-See — address, neighbors, Wi-Fi, emergency numbers, seventeen service providers, utility systems, alarm notes — into the "Living Here" textarea. 4,400 characters of `●`/`○` bullets in one blob, while the property's structured Contacts table sits at **zero rows**. That's not a Dad problem; it's the app not having an opinion. The information a family actually reaches for at a lake house has a shape: *who do I call in an emergency, what's the Wi-Fi, who's the caretaker, who fixes the dock.* Today none of that shape exists in the schema, so the page can't surface any of it — it's all prose.

This PRD gives the property page that opinion: structured homes for the highest-value facts and a right column that leads with them. It is deliberately **structure-first**: PRD 37 (paste/AI ingestion) fills these fields automatically, so the destinations must exist before the filler does.

**A hard line this PRD draws**: Wi-Fi is a credential the family *should* share; utility account logins are not. Dad's paste currently includes plaintext passwords for NH Electric, Dead River, and Conexon, visible to every signed-in account **including property guests**. This PRD gives Wi-Fi a proper home and adds guidance copy steering account credentials out of narrative fields — it does **not** build a credentials vault (that's PRD 07/08 territory).

## Goal

The right column of a property page reads, top to bottom: **Emergencies** (always first), **Wi-Fi** (password + a QR code a phone camera can join from), **Contacts on the Ground**. Service providers get a scannable directory of their own. Members can enter all of it through the existing edit page.

## What already exists (don't rebuild)

| Piece | State |
|---|---|
| Contacts | `property_contacts` (label, name, phone, email, notes) + edit-page Contacts panel + `addPropertyContact` gated action with `recordRevision` |
| Right column today | `page.tsx` ~225-307: Amenities panel (if any), then a single "Contacts / On the Ground" `LedgerPanel` |
| Narrative rendering | Left column: The Place / Living Here / What We Ask via `<Markdown>` — unchanged by this PRD |
| Edit form | `PropertyEditForm` (`property-edit-form.tsx`) — `RichTextField`s + `ChipListField`; `updateProperty` whitelist + PRD-27 column guard |
| Write posture | `updateProperty` records revisions; guests blocked at route + action + RLS; privileged columns admin-only via DB trigger |
| Intake | PRD 32/34 propose contacts through parse-time whitelists — **do not touch intake in this PRD**; PRD 37 wires the new fields in deliberately |

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Wi-Fi storage** | Two columns on `properties`: `wifi_network text`, `wifi_password text`. Member-editable (NOT added to the privileged-column guard), like the narrative fields. | It's one network per house in practice; a join table is overkill. Members maintaining it is the point — and guests already can't write anything. |
| **Wi-Fi visibility** | Rendered to everyone who can see the property page, guests included. | A guest standing in the kitchen is exactly who needs it. That's the difference between the Wi-Fi password and an account password. |
| **QR code** | Server-rendered SVG from the standard Wi-Fi QR payload `WIFI:T:WPA;S:<ssid>;P:<password>;;` (escape `\` `;` `,` `:` `"` with backslash; empty password → `T:nopass`). Small server-side dependency (e.g. `qrcode`'s SVG output), inlined — no client JS, no external fetch (CSP-safe). | iPhone and Android cameras join from this natively — that IS the "button to connect." A literal tap-to-join button isn't possible from a web page; the honest equivalents are the QR plus a Copy Password button. |
| **Contact kinds** | Additive `kind` column on `property_contacts`: `'emergency' \| 'on_the_ground' \| 'service'`, check-constrained, `default 'on_the_ground'` (backfills existing rows correctly — today's panel is literally headed "On the Ground"). | Three kinds cover Dad's doc exactly (his sections 2/3/4). Don't invent a taxonomy admin screen; it's one select on the contact form. |
| **Emergencies panel** | Always renders, always first. Fixed first row **911** (both properties are US), then `kind = 'emergency'` contacts (hospital, non-emergency police, poison control…). Briefing-adjacent restraint — no red alarm styling; a fine rule and clear type is the house way to say "important." | "First square on the right column" per Dan. Rendering 911 even when no contacts exist means the panel is never uselessly empty. |
| **Service providers** | A full-width "Service Directory" `LedgerPanel` **below** the main grid (near the photo archive), table-style: label · name · phone. Rendered only when `kind = 'service'` rows exist. Visible to guests (a guest with a burst pipe should find the plumber). | Seventeen vendors don't belong in a sticky sidebar. Tables are Operations-mode native. |
| **Amenities panel** | Moves below Contacts on the Ground in the aside. | The Dan-specified order is emergency → Wi-Fi → ground contacts; amenities are the least reached-for. |
| **Fact rail** | `StatRow` may swap "Amenities count" for "Wi-Fi ✓/—" or stay as-is — builder's call, don't grow it. | Restraint. |
| **Credential guidance** | Edit-form hint under "Living Here" changes from suggesting Wi-Fi go there ("Trash schedule, WiFi, quirks…") to pointing Wi-Fi at its new field and warning account logins out entirely (e.g. "Wi-Fi has its own field above. Please don't put account passwords here; everyone signed in can read this page."). Sentence case, no em-dashes. | The current hint *causes* the anti-pattern. Copy is the cheapest guardrail; the vault comes later. |

## In scope

- **Migration (one, additive)**: `properties.wifi_network` + `properties.wifi_password`; `property_contacts.kind` with check constraint + default `'on_the_ground'`. No RLS changes (existing table policies cover the new columns); confirm the PRD-27 guard does not need to know about the Wi-Fi columns (member-editable is intended).
- **Edit page**: Wi-Fi fields in the Details panel (two plain inputs, sentence-case labels, network then password — password as visible text, not `type=password`; it's shared knowledge, not a secret being typed); `kind` select on the contact add/edit form (default On the Ground); `updateProperty` whitelist + `addPropertyContact` gain the new fields, revisions recorded as today.
- **Detail page**: aside reordered to Emergencies → Wi-Fi → Contacts on the Ground → Amenities; Wi-Fi panel = network name, password with Copy Password button (announced via the PRD-30 status idiom), QR code with a one-line caption ("Point a phone camera here to join"); Service Directory panel below the grid; the old single contacts panel splits by kind.
- **Copy**: the edit-form hint change above; panel headings Title Case where they're headings, ALL-CAPS where they're `Eyebrow`s per house rules.

## Out of scope

- **Any credentials vault or secret storage** — utility logins, alarm codes, camera passwords stay a human decision until PRD 07/08. This PRD only adds the steering copy.
- **Intake/AI changes** — the `contact` / `note` / `dictation` intents don't learn about `kind` or Wi-Fi here. PRD 37 does that deliberately, with its own parse whitelists and review UI.
- Cleaning up Dad's existing Loon-A-See blob — that's PRD 37's first real run (paste the doc, approve into the new fields, then trim the prose).
- Multiple networks per property, guest-network separation, per-building Wi-Fi (Loon-A-See vs Looney Bin can be two properties or one field with two lines — family's call later).
- Editing contacts' kind in bulk; internationalized emergency numbers.

## Verification recipe

1. **Migration** — applied to a dev DB: new columns present, existing contacts backfilled `on_the_ground`, check constraint rejects a bogus kind.
2. **Wi-Fi round trip** — enter network + password on edit → aside shows the panel; Copy Password works and announces; scanning the QR with a real phone joins the network (test with a home network before the live walk).
3. **QR escaping** — a password containing `;` or `:` produces a payload that still scans correctly.
4. **Kinds** — add one contact of each kind → each lands in the right panel (Emergencies after the fixed 911 row, ground contacts in the aside, service in the directory below); empty states: no service rows → no directory panel; zero emergency contacts → panel still shows 911.
5. **Guest view** — a granted guest sees Emergencies, Wi-Fi (with password + QR), ground contacts, and the directory; still no edit affordances anywhere.
6. **Write posture** — non-member paths unchanged; `updateProperty` with Wi-Fi fields records a revision; privileged columns still unreachable; `tsc`/`eslint`/`build` green.
7. **Copy check** — no em-dashes introduced; Title Case buttons ("Copy Password"); the Living Here hint no longer invites Wi-Fi into prose.

## Likely file layout

```
supabase/migrations/2026XXXXXXXXXX_property_key_info.sql   # wifi cols + contact kind
src/lib/db/schema.ts                                       # mirror the columns
src/app/(app)/properties/[slug]/page.tsx                   # aside reorder + panels + directory
src/app/(app)/properties/[slug]/wifi-panel.tsx             # panel + copy button (client leaf)
src/lib/wifi-qr.ts                                         # payload escaping + SVG generation
src/app/(app)/properties/[slug]/edit/property-edit-form.tsx  # wifi fields + hint copy
src/app/(app)/properties/[slug]/edit/page.tsx              # contact kind select
src/app/(app)/properties/[slug]/actions.ts                 # updateProperty whitelist + contact kind
```

## Reviewer sign-off (I check these)

- [ ] Migration is additive-only; existing rows backfilled; no RLS regression (`kind` and Wi-Fi columns covered by existing policies; Wi-Fi deliberately NOT privileged).
- [ ] QR payload escaping correct (`\` `;` `,` `:` `"`), `nopass` case handled, SVG inline with no external fetch (CSP report stays clean).
- [ ] Aside order is Emergencies → Wi-Fi → Ground → Amenities; 911 renders with zero contacts; no alarm-red styling.
- [ ] Guests see key info (intended) but gain no write path; revisions recorded on every new write.
- [ ] Intake untouched (parse whitelists identical before/after — this is 37's seam, not 36's).
- [ ] Credential-steering hint shipped; no em-dashes; Title Case buttons.
- [ ] Live walk on prod: enter Loon-A-See's real Wi-Fi, scan the QR from a phone, add one contact per kind from Dad's doc, confirm guest view.
