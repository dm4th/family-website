import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { PageIntro } from "@/components/shell";
import type { TreeEdge, TreePerson } from "@/lib/family-tree";
import { FamilyTreeView } from "./family-tree-view";
import { PersonCreate } from "./person-create";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ focus?: string }>;

export default async function FamilyTreePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { focus } = await searchParams;

  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: peopleRows }, { data: edgeRows }] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, display_name, given_name, family_name, birth_date, birth_circa, death_date, death_circa, family_branch, profile_id",
      )
      .order("display_name", { ascending: true }),
    supabase.from("relationships").select("id, person_a, person_b, type"),
  ]);

  const people: TreePerson[] = (peopleRows ?? []).map((r) => ({
    id: r.id as string,
    displayName: r.display_name as string,
    givenName: (r.given_name as string | null) ?? null,
    familyName: (r.family_name as string | null) ?? null,
    birthDate: (r.birth_date as string | null) ?? null,
    birthCirca: (r.birth_circa as string | null) ?? null,
    deathDate: (r.death_date as string | null) ?? null,
    deathCirca: (r.death_circa as string | null) ?? null,
    familyBranch: (r.family_branch as string | null) ?? null,
    profileId: (r.profile_id as string | null) ?? null,
  }));

  const edges: TreeEdge[] = (edgeRows ?? []).map((r) => ({
    id: r.id as string,
    personA: r.person_a as string,
    personB: r.person_b as string,
    type: r.type as "parent" | "spouse",
  }));

  // Open the tree centered on: an explicit ?focus (from a person's page), else
  // the viewer if they're recorded, else the first person alphabetically — a
  // familiar starting point rather than an ancestor.
  const focusFromQuery =
    focus && people.some((p) => p.id === focus) ? focus : null;
  const initialFocusId =
    focusFromQuery ??
    (user && people.find((p) => p.profileId === user.id)?.id) ??
    people[0]?.id ??
    "";

  return (
    <div className="flex flex-col gap-10">
      <PageIntro
        mode="family"
        eyebrow="Family · Legacy"
        title="The Family Tree"
        context="Everyone in the family, and how they connect across the generations. Click any name to recenter; open a page to add parents, children, or a spouse."
        action={<PersonCreate />}
      />

      {people.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-surface px-8 py-16 text-center">
          <p className="font-display text-xl text-foreground">
            No one recorded yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground-muted">
            Start the tree by adding a person. Living members and ancestors alike
            belong here; ancestors don&rsquo;t need an account.
          </p>
        </div>
      ) : (
        <>
          <FamilyTreeView
            people={people}
            edges={edges}
            initialFocusId={initialFocusId}
          />
          <p className="text-sm text-foreground-muted">
            Missing someone? Use{" "}
            <span className="text-foreground">Add a Person</span>{" "}
            above, then open
            their page to connect them. You can also add a relative directly from
            anyone&rsquo;s page.{" "}
            <Link
              href="/family/archive"
              className="text-accent-family underline-offset-4 hover:underline"
            >
              The Archive
            </Link>{" "}
            holds the family&rsquo;s historical photos.
          </p>
        </>
      )}
    </div>
  );
}
