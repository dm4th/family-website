-- PRD 36 verification — run as postgres against a Supabase DB that has had
-- 20260731000002_property_key_info.sql applied.
--
-- What this proves:
--   * the migration is additive and existing contacts backfill correctly
--   * `kind` is constrained to the three real values
--   * Wi-Fi is a WIKI field: an ordinary member may write it (unlike status,
--     max_guests, peak_period_ranges, hero_image_path — see prd27), while a
--     property guest may READ it and write nothing
--
-- Same idiom as prd27-direct-write-hardening.sql: assume a JWT via set_config
-- exactly as PostgREST does, run one statement, roll back.
\set ON_ERROR_STOP off
\set QUIET off

-- ---------------------------------------------------------------- fixtures
begin;
set local session_replication_role = replica;  -- skip triggers for fixtures
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'member-a@test.local'),
  ('dddddddd-0000-0000-0000-000000000001', 'guest-d@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'member-a@test.local', 'Member A', 'member'),
  ('dddddddd-0000-0000-0000-000000000001', 'guest-d@test.local', 'Guest D', 'guest')
on conflict (id) do update set role = excluded.role, deactivated_at = null;
commit;

select id as prop from public.properties order by slug limit 1 \gset

begin;
set local session_replication_role = replica;
insert into public.property_guests (property_id, profile_id)
  values (:'prop', 'dddddddd-0000-0000-0000-000000000001')
on conflict do nothing;
commit;

-- ------------------------------------------------------------ schema shape
\echo '=== T1 the new columns exist — EXPECT 3 rows (kind, wifi_network, wifi_password)'
select table_name, column_name, data_type, column_default
from information_schema.columns
where (table_name = 'properties' and column_name in ('wifi_network', 'wifi_password'))
   or (table_name = 'property_contacts' and column_name = 'kind')
order by table_name, column_name;

\echo '=== T2 every pre-existing contact backfilled to on_the_ground — EXPECT 0 rows'
select id, label, kind from public.property_contacts where kind <> 'on_the_ground';

\echo '=== T3 the check constraint rejects a bogus kind — EXPECT ERROR 23514'
begin;
set local session_replication_role = replica;
insert into public.property_contacts (property_id, label, kind)
values (:'prop', 'Bogus', 'plumber');
rollback;

\echo '=== T4 each real kind is accepted — EXPECT INSERT 3'
begin;
set local session_replication_role = replica;
insert into public.property_contacts (property_id, label, kind) values
  (:'prop', 'Hospital', 'emergency'),
  (:'prop', 'Caretaker', 'on_the_ground'),
  (:'prop', 'Plumber', 'service');
rollback;

\echo '=== T5 the default lands rows in the ground panel — EXPECT on_the_ground'
begin;
set local session_replication_role = replica;
insert into public.property_contacts (property_id, label)
values (:'prop', 'No kind given')
returning label, kind;
rollback;

-- --------------------------------------------------- Wi-Fi is a wiki field
\echo '=== T6 member writes wifi_network — EXPECT UPDATE 1 (deliberately NOT privileged)'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set wifi_network = 'Loon-A-See' where id = :'prop';
rollback;

\echo '=== T7 member writes wifi_password — EXPECT UPDATE 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set wifi_password = 'summer2026' where id = :'prop';
rollback;

\echo '=== T8 member still cannot touch status — EXPECT ERROR 42501 (prd27 guard intact)'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set status = 'inactive' where id = :'prop';
rollback;

-- ------------------------------------------------------------ guest posture
\echo '=== T9 granted guest READS the Wi-Fi columns — EXPECT 1 row (intended)'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}',true);
select slug, wifi_network, wifi_password from public.properties where id = :'prop';
rollback;

\echo '=== T10 granted guest WRITES the Wi-Fi columns — EXPECT UPDATE 0 (RLS)'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set wifi_password = 'guest was here' where id = :'prop';
rollback;

\echo '=== T11 granted guest inserts a contact — EXPECT UPDATE 0 / ERROR (RLS)'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.property_contacts (property_id, label, kind)
values (:'prop', 'Guest inserted', 'service');
rollback;

\echo '=== done — no fixture rows were committed beyond the two test profiles'
