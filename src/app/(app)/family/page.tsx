import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
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

const GENERATION_LABEL: Record<number, string> = {
  1: "First generation",
  2: "Second generation",
  3: "Third generation",
  4: "Fourth generation",
  5: "Fifth generation",
};

export default async function FamilyDirectoryPage() {
  const supabase = await createClient();
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
  const avatarUrls = await resolveAvatarUrls(
    list.map((p) => ({ id: p.id, avatarUrl: p.avatar_url })),
  );

  const grouped = groupByGeneration(list);

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
                    ? GENERATION_LABEL[generation] ?? `Generation ${generation}`
                    : "Generation not set"}
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
                        name={p.full_name}
                        src={avatarUrls.get(p.id) ?? null}
                        size="lg"
                        variant="ring"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-lg leading-tight text-foreground transition-colors group-hover:text-accent-family">
                          {p.full_name ?? "Unnamed"}
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
        </div>
      )}
    </div>
  );
}

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
