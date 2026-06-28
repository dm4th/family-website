-- Rename the Big Sky property: "Mumford's Motel" → "Moosedraw" (family decision).
--
-- The slug changes too (`mumfords-motel` → `moosedraw`) so the URL
-- (/properties/moosedraw) and the ICS feed scope match the new name. Safe
-- because the site is brand new — no durable bookmarks or calendar
-- subscriptions to the old slug yet.
--
-- Keyed on the old slug, so re-running after the rename matches no rows and is
-- a no-op (idempotent). Photos and bookings reference the property by id, not
-- slug, so they're unaffected.
update public.properties
set name       = 'Moosedraw',
    slug       = 'moosedraw',
    updated_at = now()
where slug = 'mumfords-motel';
