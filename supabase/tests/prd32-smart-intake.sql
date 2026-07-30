-- PRD 32 verification (slice 1) — run as postgres against the local Supabase DB.
-- Same shape as prd27-direct-write-hardening.sql: each test opens a
-- transaction, assumes an authenticated JWT via set_config (exactly what
-- PostgREST does), runs ONE statement, and rolls back.
--
-- What this covers: the RLS half of "guests are locked out" and "the source
-- document store is private". The application half (the `extractIntake` action
-- rejecting guests, the intake page 404ing for them) is checked by hand.
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

-- Grant the guest read access to the property, so the only thing standing
-- between them and the intake trail is the intake policies themselves.
begin;
set local session_replication_role = replica;
insert into public.property_guests (property_id, profile_id)
  values (:'prop', 'dddddddd-0000-0000-0000-000000000001')
on conflict do nothing;
delete from public.intake_documents where property_id = :'prop';
commit;

\echo '=== T1 member records a read document — EXPECT INSERT 0 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.intake_documents
  (property_id, storage_path, content_type, byte_size, intent, uploaded_by)
values
  (:'prop', 'ab/11111111-1111-1111-1111-111111111111.jpg', 'image/jpeg', 12345,
   'contact', 'aaaaaaaa-0000-0000-0000-000000000001');
rollback;

\echo '=== T2 guest records a read document — EXPECT ERROR 42501'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.intake_documents
  (property_id, storage_path, content_type, byte_size, intent, uploaded_by)
values
  (:'prop', 'ab/22222222-2222-2222-2222-222222222222.jpg', 'image/jpeg', 12345,
   'contact', 'dddddddd-0000-0000-0000-000000000001');
rollback;

\echo '=== T3 member attributes a document to someone else — EXPECT ERROR 42501'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.intake_documents
  (property_id, storage_path, content_type, byte_size, intent, uploaded_by)
values
  (:'prop', 'ab/33333333-3333-3333-3333-333333333333.jpg', 'image/jpeg', 12345,
   'contact', 'dddddddd-0000-0000-0000-000000000001');
rollback;

-- Seed one row as the member so the read tests have something to find.
begin;
set local session_replication_role = replica;
insert into public.intake_documents
  (property_id, storage_path, content_type, byte_size, intent, uploaded_by)
values
  (:'prop', 'ab/44444444-4444-4444-4444-444444444444.jpg', 'image/jpeg', 12345,
   'contact', 'aaaaaaaa-0000-0000-0000-000000000001')
on conflict (storage_path) do nothing;
commit;

\echo '=== T4 member reads the intake trail — EXPECT 1'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
select count(*) from public.intake_documents where property_id = :'prop';
rollback;

\echo '=== T5 guest reads the intake trail — EXPECT 0'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}',true);
select count(*) from public.intake_documents where property_id = :'prop';
rollback;

\echo '=== T6 guest reads a source object in the intake bucket — EXPECT 0'
begin;
select set_config('role','authenticated',true),
       set_config('request.jwt.claims','{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}',true);
select count(*) from storage.objects where bucket_id = 'intake';
rollback;

\echo '=== T7 intake bucket is private — EXPECT f'
select public from storage.buckets where id = 'intake';

-- ---------------------------------------------------------------- cleanup
begin;
set local session_replication_role = replica;
delete from public.intake_documents where property_id = :'prop';
delete from public.property_guests
  where profile_id = 'dddddddd-0000-0000-0000-000000000001';
commit;
