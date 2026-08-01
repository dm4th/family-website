-- Property key info (PRD 36) — structured homes for the facts a family
-- actually reaches for at a house: the Wi-Fi, and who to call.
--
-- WHY THIS EXISTS
--   Today the only place to record any of this is the free-text "Living Here"
--   field, so it arrives as a 4,000-character blob of bullets while the
--   structured property_contacts table sits empty. Prose can't be ordered,
--   can't be surfaced first, and can't be handed to a phone camera. These two
--   additive changes give the highest-value facts a shape the page can lead
--   with.
--
-- WI-FI IS DELIBERATELY NOT A PRIVILEGED COLUMN
--   guard_property_privileged_columns() (20260702000003) keeps status,
--   max_guests, peak_period_ranges and hero_image_path to property admins.
--   The Wi-Fi columns are intentionally left out: they're wiki facts any
--   non-guest member should be able to maintain, exactly like how_to. Guests
--   still cannot write anything (RLS), but they CAN read the Wi-Fi — a guest
--   standing in the kitchen is precisely who needs it. That is the line this
--   PRD draws: the network password is shared knowledge; utility account
--   logins are not, and get no home here at all.
--
-- CONTACT KINDS
--   'on_the_ground' is the default so every existing row backfills into the
--   panel it is already rendered in (headed "On the Ground" today). No data
--   migration needed beyond the default.

alter table public.properties
  add column if not exists wifi_network text,
  add column if not exists wifi_password text;

comment on column public.properties.wifi_network is
  'Guest-visible Wi-Fi SSID. Wiki field: any non-guest member may edit.';
comment on column public.properties.wifi_password is
  'Guest-visible Wi-Fi passphrase. Shared knowledge, not an account credential — never store utility/alarm logins here.';

alter table public.property_contacts
  add column if not exists kind text not null default 'on_the_ground';

alter table public.property_contacts
  drop constraint if exists property_contacts_kind_check;

alter table public.property_contacts
  add constraint property_contacts_kind_check
  check (kind in ('emergency', 'on_the_ground', 'service'));

comment on column public.property_contacts.kind is
  'Which panel this contact renders in: emergency (top of the aside), on_the_ground (aside), service (the directory below the page grid).';

-- The detail page reads contacts grouped by kind, in sort order.
create index if not exists property_contacts_property_kind_idx
  on public.property_contacts (property_id, kind, sort_order);
