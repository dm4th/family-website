import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { resolveViewer } from "@/lib/guest";
import { displayName } from "@/lib/display-name";
import { isInMemoriam, lifespan, type TreePerson } from "@/lib/family-tree";
import {
  generationLabel,
  GENERATION_UNSET_LABEL,
} from "@/lib/generations";
import { ProfileAvatar } from "@/components/profile-avatar";
import { PageIntro, SectionRule } from "@/components/shell";

export const dynamic = "force-dynamic";

type DirectoryProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  family_branch: string | null;
  generation: number | null;
  relationship_notes: string | null;
  bio: string | null;
};

export default async function FamilyDirectoryPage() {
  const supabase = await createClient();
  const viewer = await resolveViewer();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, family_branch, generation, relationship_notes, bio, avatar_url, deactivated_at",
    )
    .is("deactivated_at", null)
    .order("generation", { ascending: true, nullsFirst: false })
    .order("full_name", { ascending: true });

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Could not load directory: {error.message}
      </p>
    );
  }

  const list = (profiles ?? []) as DirectoryProfile[];
  // The directory paints many small avatars — request the thumb rendition.
  const avatarUrls = await resolveAvatarUrls(
    list.map((p) => ({ id: p.id, avatarUrl: p.avatar_url })),
    "thumb",
  );

  const grouped = groupByGeneration(list);

  // Family recorded in the tree who have no login — ancestors, in-laws, kids.
  // They belong in the directory too (Dan, 2026-08-01): Bibi and Drew should be
  // findable next to their descendants, not only by traversing the tree. Their
  // pages live under /family/tree/, where anyone can add dates, a bio, or a
  // story. Members only: the tree is family-scoped and its pages 404 for
  // guests, so a guest directory shows just the portal members they can reach.
  const treeOnly: TreeOnlyPerson[] = [];
  if (viewer && !viewer.isGuest) {
    const { data: people } = await supabase
      .from("people")
      .select(
        "id, display_name, family_branch, birth_date, birth_circa, death_date, death_circa",
      )
      .is("profile_id", null)
      .order("display_name", { ascending: true });
    for (const p of people ?? []) {
      const tp: TreePerson = {
        id: p.id as string,
        displayName: p.display_name as string,
        givenName: null,
        familyName: null,
        birthDate: (p.birth_date as string | null) ?? null,
        birthCirca: (p.birth_circa as string | null) ?? null,
        deathDate: (p.death_date as string | null) ?? null,
        deathCirca: (p.death_circa as string | null) ?? null,
        familyBranch: (p.family_branch as string | null) ?? null,
        profileId: null,
      };
      treeOnly.push({
        id: tp.id,
        name: tp.displayName,
        lifespan: lifespan(tp),
        familyBranch: tp.familyBranch,
        memoriam: isInMemoriam(tp),
      });
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <PageIntro
        mode="family"
        eyebrow="Family"
        title="The Directory"
        context={
          list.length > 0
            ? `${list.length} ${list.length === 1 ? "person" : "people"} signed into the portal, sorted by generation.`
            : "An archive of everyone who calls this family home."
        }
      />

      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-14">
          {grouped.map(({ generation, members }, idx) => (
            <section key={generation ?? "unknown"} className="flex flex-col gap-6">
              {idx > 0 && <SectionRule ornament className="-mt-2" />}
              <header className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
                  {generation
                    ? generationLabel(generation)
                    : GENERATION_UNSET_LABEL}
                </h2>
                <span className="eyebrow text-foreground-subtle">
                  {members.length} {members.length === 1 ? "Member" : "Members"}
                </span>
              </header>
              <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/family/${p.id}`}
                      className="group flex items-center gap-4 rounded-md py-2 transition-colors hover:bg-surface/60"
                    >
                      <ProfileAvatar
                        name={displayName(p.full_name)}
                        src={avatarUrls.get(p.id)?.url ?? null}
                        fallbackSrc={avatarUrls.get(p.id)?.fallbackUrl ?? null}
                        size="lg"
                        variant="ring"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-lg leading-tight text-foreground transition-colors group-hover:text-accent-family">
                          {displayName(p.full_name)}
                        </div>
                        <div className="mt-1 truncate text-xs text-foreground-subtle">
                          {[p.family_branch, p.relationship_notes]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {treeOnly.length > 0 && (
            <section className="flex flex-col gap-6">
              <SectionRule ornament className="-mt-2" />
              <header className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
                    In the Family Tree
                  </h2>
                  <span className="eyebrow text-foreground-subtle">
                    {treeOnly.length}{" "}
                    {treeOnly.length === 1 ? "Person" : "People"}
                  </span>
                </div>
                <p className="text-sm text-foreground-muted">
                  Family recorded in the tree who aren&apos;t signed into the
                  portal. Open anyone&apos;s page to add dates, a bio, or their
                  story.
                </p>
              </header>
              <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {treeOnly.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/family/tree/${p.id}`}
                      className="group flex items-baseline gap-2 rounded-md py-1.5 transition-colors hover:bg-surface/60"
                    >
                      {p.memoriam && (
                        <span
                          aria-label="In memoriam"
                          title="In memoriam"
                          className="text-foreground-muted"
                        >
                          &dagger;
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="font-display text-base leading-tight text-foreground transition-colors group-hover:text-accent-family">
                          {p.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-foreground-subtle">
                          {[p.lifespan, p.familyBranch]
                            .filter(Boolean)
                            .join(" · ") || "In the tree"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

type TreeOnlyPerson = {
  id: string;
  name: string;
  lifespan: string;
  familyBranch: string | null;
  memoriam: boolean;
};

function groupByGeneration(profiles: DirectoryProfile[]) {
  const buckets = new Map<number | null, DirectoryProfile[]>();
  for (const p of profiles) {
    const key = p.generation ?? null;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    })
    .map(([generation, members]) => ({ generation, members }));
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/60 px-10 py-14 text-center">
      <p className="eyebrow text-accent-bronze">Awaiting members</p>
      <p className="mt-3 text-sm text-foreground-muted">
        No family members have signed in yet. Invite people from the{" "}
        <Link href="/admin" className="text-foreground underline-offset-4 hover:underline">
          admin page
        </Link>
        .
      </p>
    </div>
  );
}
