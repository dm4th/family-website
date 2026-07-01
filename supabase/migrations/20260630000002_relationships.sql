-- Family Legacy — Family Tree (PRD 11, slice 2).
--
-- The `people` keystone already exists (every recorded human, living or not).
-- This slice adds the GRAPH connecting them: a single `relationships` edge
-- table from which the whole tree is derived. No new person table is needed.
--
--   * `parent`  — DIRECTIONAL: `person_a` is a parent of `person_b`.
--   * `spouse`  — UNDIRECTED: `person_a` and `person_b` are partners.
--
-- Siblings, grandparents, cousins, etc. are DERIVED from parent/spouse edges at
-- read time, never stored — that keeps the graph minimal and consistent.
--
-- Privacy posture mirrors the Photo Archive slice: family-only, hidden from
-- guests (`not public.is_guest()`), wiki-style edits, deletes admin-only
-- (removing an edge silently rewrites the tree, so it's the one destructive op).
-- NOTE: the pre-existing `people` table predates guest access and is readable by
-- any authenticated user; `relationships` intentionally takes the stricter
-- family-only posture the archive established. Tightening `people` to match is a
-- documented follow-up, out of scope for this additive slice.

create table public.relationships (
  id         uuid primary key default gen_random_uuid(),
  person_a   uuid not null references public.people(id) on delete cascade,
  person_b   uuid not null references public.people(id) on delete cascade,
  type       text not null check (type in ('parent', 'spouse')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- No self-edges.
  constraint relationships_no_self check (person_a <> person_b),
  -- Spouse edges are undirected: store them canonically (person_a < person_b)
  -- so (X,Y) and (Y,X) can't both exist. `parent` stays directional and is
  -- exempt. The Server Action sorts spouse pairs before insert to satisfy this.
  constraint relationships_spouse_canonical
    check (type <> 'spouse' or person_a < person_b)
);

-- Exact-duplicate edges are meaningless; block them. For `spouse` the canonical
-- check above means the unordered pair is unique too; for `parent` this makes
-- the directed edge unique.
create unique index relationships_edge_key
  on public.relationships (person_a, person_b, type);

-- Traversal reads hit both endpoints ("who are B's parents" = person_b lookup;
-- "who are A's children" = person_a lookup), so index both columns with type.
create index relationships_person_a_idx on public.relationships (person_a, type);
create index relationships_person_b_idx on public.relationships (person_b, type);

-- ----------------------------------------------------------------------------
-- RLS — family-only (hidden from guests), wiki-style edits, admin-only delete.
-- ----------------------------------------------------------------------------
alter table public.relationships enable row level security;

create policy "relationships: family read"
  on public.relationships for select
  to authenticated
  using (not public.is_guest());

create policy "relationships: family insert"
  on public.relationships for insert
  to authenticated
  with check (not public.is_guest());

create policy "relationships: family update"
  on public.relationships for update
  to authenticated
  using (not public.is_guest())
  with check (not public.is_guest());

-- Deleting an edge rewrites the tree for everyone; narrow to site admins,
-- matching the `people` delete posture (a person's removal orphans tags/edges).
create policy "relationships: admin delete"
  on public.relationships for delete
  to authenticated
  using (not public.is_guest() and public.is_admin());
