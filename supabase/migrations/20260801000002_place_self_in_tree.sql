-- PRD 39, slice B — "onboarding places you in the tree".
--
-- Finishing the welcome flow's tree step writes a person row for the new member
-- plus their parent/spouse edges. That has to be ALL-OR-NOTHING: a half-applied
-- save would leave a stub parent with no edge attached to it, and the next
-- attempt would create a second stub for the same person. supabase-js issues one
-- statement per call and cannot roll back across them, so the whole placement
-- lives here instead, where the function body is a single transaction.
--
-- SECURITY INVOKER (the default) is deliberate: this must run as the calling
-- member so the existing RLS policies on `people` and `relationships` remain the
-- authority. It grants nothing a member could not already do one row at a time
-- from the tree pages; it only makes the group of writes atomic. Guests are
-- rejected outright as a second line of defense behind RLS.
--
-- Idempotent by construction, because the welcome step can be retried: an
-- existing linked person is reused rather than duplicated, and every edge insert
-- is ON CONFLICT DO NOTHING against relationships_edge_key.
--
-- Note: the number of inline stubs is NOT capped here (the welcome UI offers at
-- most four). That is deliberate and consistent with what a member can already
-- do from the tree pages, where person creation is likewise unlimited — this
-- function is not the place to invent a restriction the rest of the app doesn't
-- have. If people-row spam ever becomes real, cap it there and here together.

create or replace function public.place_self_in_tree(
  p_claim_person_id uuid default null,
  p_display_name text default null,
  p_family_branch text default null,
  p_parent_ids uuid[] default '{}',
  p_parent_names text[] default '{}',
  p_spouse_id uuid default null,
  p_spouse_name text default null
)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_self uuid;
  v_existing uuid;
  v_claim_profile uuid;
  v_parent uuid;
  v_name text;
  v_created_people uuid[] := '{}';
  v_created_edges jsonb := '[]'::jsonb;
  v_edge_id uuid;
  v_lo uuid;
  v_hi uuid;
  v_claimed boolean := false;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- The tree is for family. Guests never see this step; belt and braces.
  if public.is_guest() then
    raise exception 'Guests cannot be placed in the family tree'
      using errcode = '42501';
  end if;

  -- ---------------------------------------------------------------------
  -- 1. Resolve "me" — reuse, claim, or create. Never silently claim.
  -- ---------------------------------------------------------------------
  select id into v_existing from public.people where profile_id = v_uid;

  if v_existing is not null then
    -- Already placed (a retry, or they were seeded and linked earlier).
    v_self := v_existing;

  elsif p_claim_person_id is not null then
    -- Claiming a hand-seeded row. Only an UNLINKED row may be claimed; if
    -- someone else got there first we fail loudly rather than stealing it.
    select profile_id into v_claim_profile
      from public.people where id = p_claim_person_id;
    if not found then
      raise exception 'That person no longer exists' using errcode = 'P0002';
    end if;
    if v_claim_profile is not null then
      raise exception 'That person is already linked to another account'
        using errcode = '23505';
    end if;

    -- Re-check the null inside the UPDATE, not just in the SELECT above: two
    -- same-named people claiming the same row concurrently would both pass the
    -- SELECT, and the second write would silently steal the first one's link.
    -- The partial unique index on people(profile_id) does not catch this (it
    -- stops one profile owning two rows, not two profiles racing for one).
    update public.people
       set profile_id = v_uid,
           -- Only fill blanks; never overwrite what the family recorded.
           family_branch = coalesce(family_branch, p_family_branch),
           updated_by = v_uid,
           updated_at = now()
     where id = p_claim_person_id
       and profile_id is null;
    if not found then
      raise exception 'That person is already linked to another account'
        using errcode = '23505';
    end if;
    v_self := p_claim_person_id;
    v_claimed := true;

  else
    if coalesce(btrim(p_display_name), '') = '' then
      raise exception 'A name is required to join the tree'
        using errcode = '22023';
    end if;
    insert into public.people (display_name, family_branch, profile_id,
                               created_by, updated_by)
    values (btrim(p_display_name), p_family_branch, v_uid, v_uid, v_uid)
    returning id into v_self;
    v_created_people := v_created_people || v_self;
  end if;

  -- ---------------------------------------------------------------------
  -- 2. Parents — existing picks first, then inline stubs.
  -- ---------------------------------------------------------------------
  foreach v_parent in array coalesce(p_parent_ids, '{}'::uuid[])
  loop
    if v_parent is null or v_parent = v_self then
      continue;  -- nobody is their own parent
    end if;
    -- Refuse an edge that would invert an existing one (A parent of B and
    -- B parent of A is a cycle, not a family).
    if exists (
      select 1 from public.relationships
       where person_a = v_self and person_b = v_parent and type = 'parent'
    ) then
      raise exception 'That person is already recorded as your child'
        using errcode = '23514';
    end if;

    insert into public.relationships (person_a, person_b, type,
                                      created_by, updated_by)
    values (v_parent, v_self, 'parent', v_uid, v_uid)
    on conflict (person_a, person_b, type) do nothing
    returning id into v_edge_id;

    if v_edge_id is not null then
      v_created_edges := v_created_edges || jsonb_build_object(
        'id', v_edge_id, 'person_a', v_parent, 'person_b', v_self,
        'type', 'parent');
    end if;
    v_edge_id := null;
  end loop;

  foreach v_name in array coalesce(p_parent_names, '{}'::text[])
  loop
    if coalesce(btrim(v_name), '') = '' then
      continue;
    end if;
    insert into public.people (display_name, created_by, updated_by)
    values (btrim(v_name), v_uid, v_uid)
    returning id into v_parent;
    v_created_people := v_created_people || v_parent;

    insert into public.relationships (person_a, person_b, type,
                                      created_by, updated_by)
    values (v_parent, v_self, 'parent', v_uid, v_uid)
    on conflict (person_a, person_b, type) do nothing
    returning id into v_edge_id;

    if v_edge_id is not null then
      v_created_edges := v_created_edges || jsonb_build_object(
        'id', v_edge_id, 'person_a', v_parent, 'person_b', v_self,
        'type', 'parent');
    end if;
    v_edge_id := null;
  end loop;

  -- ---------------------------------------------------------------------
  -- 3. Spouse — one, stored undirected with person_a < person_b so the
  --    unique index catches the edge no matter which way it is offered.
  -- ---------------------------------------------------------------------
  if p_spouse_id is not null and p_spouse_id <> v_self then
    v_lo := least(p_spouse_id, v_self);
    v_hi := greatest(p_spouse_id, v_self);
  elsif coalesce(btrim(p_spouse_name), '') <> '' then
    insert into public.people (display_name, created_by, updated_by)
    values (btrim(p_spouse_name), v_uid, v_uid)
    returning id into v_parent;
    v_created_people := v_created_people || v_parent;
    v_lo := least(v_parent, v_self);
    v_hi := greatest(v_parent, v_self);
  end if;

  -- ON CONFLICT only catches the canonical ordering. App-written spouse edges
  -- are always canonical, but hand-seeded rows predate that rule, so check both
  -- directions explicitly before inserting rather than creating a mirror edge.
  if v_lo is not null and not exists (
    select 1 from public.relationships
     where type = 'spouse'
       and ((person_a = v_lo and person_b = v_hi)
         or (person_a = v_hi and person_b = v_lo))
  ) then
    insert into public.relationships (person_a, person_b, type,
                                      created_by, updated_by)
    values (v_lo, v_hi, 'spouse', v_uid, v_uid)
    on conflict (person_a, person_b, type) do nothing
    returning id into v_edge_id;

    if v_edge_id is not null then
      v_created_edges := v_created_edges || jsonb_build_object(
        'id', v_edge_id, 'person_a', v_lo, 'person_b', v_hi,
        'type', 'spouse');
    end if;
  end if;

  return jsonb_build_object(
    'person_id', v_self,
    'claimed', v_claimed,
    'created_people', to_jsonb(v_created_people),
    'created_edges', v_created_edges
  );
end;
$$;

comment on function public.place_self_in_tree is
  'PRD 39: atomically place the calling member in the family tree — claim or create their own people row, create any inline parent/spouse stubs, and insert the parent/spouse edges. SECURITY INVOKER so RLS on people/relationships still governs; guests rejected. Idempotent: reuses an existing linked person and skips duplicate edges.';

revoke all on function public.place_self_in_tree(
  uuid, text, text, uuid[], text[], uuid, text) from public, anon;
grant execute on function public.place_self_in_tree(
  uuid, text, text, uuid[], text[], uuid, text) to authenticated;
