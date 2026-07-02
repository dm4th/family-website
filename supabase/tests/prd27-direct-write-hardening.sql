-- PRD 27 verification — run as postgres against the local Supabase DB.
-- Each test opens a transaction, assumes an authenticated JWT via set_config
-- (exactly what PostgREST does), runs ONE statement, and rolls back.
\set ON_ERROR_STOP off
\set QUIET off

-- ---------------------------------------------------------------- fixtures
begin;
set local session_replication_role = replica;  -- skip triggers for fixtures
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'member-a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'padmin-b@test.local'),
  ('cccccccc-0000-0000-0000-000000000001', 'siteadmin-c@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'member-a@test.local', 'Member A', 'member'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'padmin-b@test.local', 'PAdmin B', 'member'),
  ('cccccccc-0000-0000-0000-000000000001', 'siteadmin-c@test.local', 'Admin C', 'admin')
on conflict (id) do update set role = excluded.role, deactivated_at = null;
commit;

-- pick a property and make B its property admin; set known peak windows
select id as prop from public.properties order by slug limit 1 \gset
begin;
set local session_replication_role = replica;
insert into public.property_admins (property_id, profile_id)
  values (:'prop', 'bbbbbbbb-0000-0000-0000-000000000001')
on conflict do nothing;
update public.properties
  set peak_period_ranges =
    '[{"start":"07-10","end":"07-20"},{"start":"12-22","end":"01-02"}]'::jsonb
  where id = :'prop';
delete from public.bookings where property_id = :'prop';
commit;

\echo '=== T1 member updates status — EXPECT ERROR 42501'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set status = 'inactive' where id = :'prop';
rollback;

\echo '=== T2 member updates description (wiki field) — EXPECT UPDATE 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set description = 'wiki edit ok' where id = :'prop';
rollback;

\echo '=== T3 member updates peak_period_ranges — EXPECT ERROR 42501'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set peak_period_ranges = '[]'::jsonb where id = :'prop';
rollback;

\echo '=== T4 member updates max_guests — EXPECT ERROR 42501'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set max_guests = 99 where id = :'prop';
rollback;

\echo '=== T5 member updates hero_image_path — EXPECT ERROR 42501'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set hero_image_path = 'evil.jpg' where id = :'prop';
rollback;

\echo '=== T6 property admin updates status — EXPECT UPDATE 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set status = 'maintenance' where id = :'prop';
rollback;

\echo '=== T7 site admin updates peak_period_ranges — EXPECT UPDATE 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set peak_period_ranges = '[]'::jsonb where id = :'prop';
rollback;

\echo '=== T8 member self-approves booking ON peak (Jul 12-14) — EXPECT ERROR peak'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.bookings (property_id, requested_by, start_date, end_date, status, approved_by, approved_at)
values (:'prop', 'aaaaaaaa-0000-0000-0000-000000000001', '2027-07-12', '2027-07-14', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001', now());
rollback;

\echo '=== T9 member self-approves booking OFF peak (Mar 10-12) — EXPECT INSERT 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.bookings (property_id, requested_by, start_date, end_date, status, approved_by, approved_at)
values (:'prop', 'aaaaaaaa-0000-0000-0000-000000000001', '2027-03-10', '2027-03-12', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001', now());
rollback;

\echo '=== T10 member requests PENDING booking on peak — EXPECT INSERT 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.bookings (property_id, requested_by, start_date, end_date, status)
values (:'prop', 'aaaaaaaa-0000-0000-0000-000000000001', '2027-07-12', '2027-07-14', 'pending');
rollback;

\echo '=== T11 wrap-around peak (Dec 30 - Jan 3 vs 12-22→01-02) — EXPECT ERROR peak'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.bookings (property_id, requested_by, start_date, end_date, status, approved_by, approved_at)
values (:'prop', 'aaaaaaaa-0000-0000-0000-000000000001', '2027-12-30', '2028-01-03', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001', now());
rollback;

\echo '=== T12 checkout ON peak start day (Jul 5-10, nights end Jul 9) — EXPECT INSERT 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.bookings (property_id, requested_by, start_date, end_date, status, approved_by, approved_at)
values (:'prop', 'aaaaaaaa-0000-0000-0000-000000000001', '2027-07-05', '2027-07-10', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001', now());
rollback;

\echo '=== T13 double-booking guard intact — 2nd overlapping approved EXPECT ERROR exclusion'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.bookings (property_id, requested_by, start_date, end_date, status, approved_by, approved_at)
values (:'prop', 'aaaaaaaa-0000-0000-0000-000000000001', '2027-03-10', '2027-03-14', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001', now());
insert into public.bookings (property_id, requested_by, start_date, end_date, status, approved_by, approved_at)
values (:'prop', 'aaaaaaaa-0000-0000-0000-000000000001', '2027-03-12', '2027-03-16', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001', now());
rollback;

\echo '=== T14 property admin inserts APPROVED booking on peak — EXPECT INSERT 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.bookings (property_id, requested_by, start_date, end_date, status, approved_by, approved_at)
values (:'prop', 'bbbbbbbb-0000-0000-0000-000000000001', '2027-07-12', '2027-07-14', 'approved', 'bbbbbbbb-0000-0000-0000-000000000001', now());
rollback;

\echo '=== T15 member updates status to SAME value (server-action no-op path) — EXPECT UPDATE 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
update public.properties set status = status, description = 'no-op privileged, wiki edit' where id = :'prop';
rollback;

\echo '=== done'
