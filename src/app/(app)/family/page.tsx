import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { ProfileAvatar } from "@/components/profile-avatar";

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
  1: "Generation 1",
  2: "Generation 2",
  3: "Generation 3",
  4: "Generation 4",
  5: "Generation 5",
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
      <div className="text-sm text-destructive">
        Could not load directory: {error.message}
      </div>
    );
  }

  const list = (profiles ?? []) as DirectoryProfile[];
  const avatarUrls = await resolveAvatarUrls(
    list.map((p) => ({ id: p.id, avatarUrl: p.avatar_url })),
  );

  const grouped = groupByGeneration(list);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Family Directory
        </h1>
        <p className="text-muted-foreground mt-1">
          Everyone signed in to the portal.
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-10">
          {grouped.map(({ generation, members }) => (
            <section key={generation ?? "unknown"} className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {generation
                  ? GENERATION_LABEL[generation] ?? `Generation ${generation}`
                  : "Generation not set"}
                <span className="ml-2 text-muted-foreground/70">
                  ({members.length})
                </span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/family/${p.id}`}
                      className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/30"
                    >
                      <ProfileAvatar
                        name={p.full_name}
                        src={avatarUrls.get(p.id) ?? null}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {p.full_name ?? "Unnamed"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
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
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
      No family members have signed in yet. Invite people from the{" "}
      <Link href="/admin" className="underline">
        admin page
      </Link>{" "}
      (coming in chunk 6).
    </div>
  );
}
