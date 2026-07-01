import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { withSignedUrls } from "@/lib/photos";
import { Markdown } from "@/components/markdown";
import { Eyebrow } from "@/components/shell";
import { InlineEditable } from "@/components/authoring/inline-editable";
import {
  isInMemoriam,
  isMember,
  lifespan,
  type TreePerson,
} from "@/lib/family-tree";
import { updatePerson } from "../actions";
import { PersonFields } from "../person-fields";
import { AddRelative } from "../add-relative";
import { RelativeChips, type RelativeChip } from "../relative-chips";

export const dynamic = "force-dynamic";

type Params = Promise<{ personId: string }>;

type PersonRow = {
  id: string;
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  birth_date: string | null;
  birth_circa: string | null;
  death_date: string | null;
  death_circa: string | null;
  family_branch: string | null;
  bio: string | null;
  profile_id: string | null;
};

function toTreePerson(r: PersonRow): TreePerson {
  return {
    id: r.id,
    displayName: r.display_name,
    givenName: r.given_name,
    familyName: r.family_name,
    birthDate: r.birth_date,
    birthCirca: r.birth_circa,
    deathDate: r.death_date,
    deathCirca: r.death_circa,
    familyBranch: r.family_branch,
    profileId: r.profile_id,
  };
}

function toChip(r: PersonRow, edgeId?: string): RelativeChip {
  const tp = toTreePerson(r);
  return {
    id: r.id,
    displayName: r.display_name,
    span: lifespan(tp),
    inMemoriam: isInMemoriam(tp),
    edgeId,
  };
}

export default async function PersonDetailPage({ params }: { params: Params }) {
  const { personId } = await params;

  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();

  const { data: person, error } = await supabase
    .from("people")
    .select(
      "id, display_name, given_name, family_name, birth_date, birth_circa, death_date, death_circa, family_branch, bio, profile_id",
    )
    .eq("id", personId)
    .single<PersonRow>();
  if (error || !person) notFound();

  // The full graph is tiny — load all edges + people and resolve relatives in JS.
  const [{ data: edgeRows }, { data: peopleRows }] = await Promise.all([
    supabase.from("relationships").select("id, person_a, person_b, type"),
    supabase
      .from("people")
      .select(
        "id, display_name, given_name, family_name, birth_date, birth_circa, death_date, death_circa, family_branch, bio, profile_id",
      ),
  ]);

  const byId = new Map<string, PersonRow>(
    (peopleRows ?? []).map((r) => [r.id as string, r as PersonRow]),
  );
  const edges = (edgeRows ?? []) as {
    id: string;
    person_a: string;
    person_b: string;
    type: "parent" | "spouse";
  }[];

  // Direct relatives (with their edge id so admins can unlink them).
  const parents: RelativeChip[] = [];
  const children: RelativeChip[] = [];
  const spouses: RelativeChip[] = [];
  const parentIds: string[] = [];
  for (const e of edges) {
    if (e.type === "parent" && e.person_b === personId) {
      parentIds.push(e.person_a);
      const r = byId.get(e.person_a);
      if (r) parents.push(toChip(r, e.id));
    } else if (e.type === "parent" && e.person_a === personId) {
      const r = byId.get(e.person_b);
      if (r) children.push(toChip(r, e.id));
    } else if (e.type === "spouse" && (e.person_a === personId || e.person_b === personId)) {
      const otherId = e.person_a === personId ? e.person_b : e.person_a;
      const r = byId.get(otherId);
      if (r) spouses.push(toChip(r, e.id));
    }
  }

  // Siblings are derived (shared parent), so they carry no removable edge here.
  const siblingIds = new Set<string>();
  const parentSet = new Set(parentIds);
  for (const e of edges) {
    if (e.type === "parent" && parentSet.has(e.person_a) && e.person_b !== personId) {
      siblingIds.add(e.person_b);
    }
  }
  const siblings: RelativeChip[] = [...siblingIds].flatMap((id) => {
    const r = byId.get(id);
    return r ? [toChip(r)] : [];
  });

  // Their archive photos (tagged via photo_people — members and ancestors alike).
  const { data: photoLinks } = await supabase
    .from("photo_people")
    .select("photo_id, photos!inner(id, storage_path, caption)")
    .eq("person_id", personId);
  type RawPhoto = { id: string; storage_path: string; caption: string | null };
  const rawPhotos: RawPhoto[] = (photoLinks ?? []).flatMap((row) => {
    const p = (row as { photos: RawPhoto | RawPhoto[] | null }).photos;
    if (!p) return [];
    return Array.isArray(p) ? p : [p];
  });
  const signedPhotos = await withSignedUrls(
    rawPhotos.map((p) => ({
      id: p.id,
      storagePath: p.storage_path,
      caption: p.caption,
    })),
    "thumb",
  );

  const tp = toTreePerson(person);
  const span = lifespan(tp);
  const memoriam = isInMemoriam(tp);
  const member = isMember(tp);
  const contextLine = [person.family_branch, member ? "Family member" : "Ancestor"]
    .filter(Boolean)
    .join(" · ");

  const hasRelatives =
    parents.length + children.length + spouses.length + siblings.length > 0;

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-2">
        <Link
          href={`/family/tree?focus=${person.id}`}
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← The Family Tree
        </Link>

        <InlineEditable
          label="details"
          editLabel="Edit details"
          action={updatePerson.bind(null, person.id)}
          display={
            <div className="flex flex-col gap-3">
              <Eyebrow>{memoriam ? "In memoriam" : "Family"}</Eyebrow>
              <h1 className="font-display text-[2.25rem] leading-[1.05] text-foreground sm:text-[2.75rem]">
                {person.display_name}
              </h1>
              {(span || contextLine) && (
                <p className="text-sm text-foreground-muted">
                  {[span, contextLine].filter(Boolean).join(" · ")}
                </p>
              )}
              {member && person.profile_id && (
                <Link
                  href={`/family/${person.profile_id}`}
                  className="w-fit text-sm text-accent-family underline-offset-4 hover:underline"
                >
                  View their directory profile →
                </Link>
              )}
              {person.bio && (
                <div className="mt-2 max-w-prose">
                  <Markdown source={person.bio} tone="salon" />
                </div>
              )}
            </div>
          }
        >
          <PersonFields
            defaults={{
              displayName: person.display_name,
              givenName: person.given_name,
              familyName: person.family_name,
              birthDate: person.birth_date,
              birthCirca: person.birth_circa,
              deathDate: person.death_date,
              deathCirca: person.death_circa,
              familyBranch: person.family_branch,
              bio: person.bio,
            }}
          />
        </InlineEditable>
      </div>

      {/* Relatives */}
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
            Family
          </h2>
          <p className="text-sm text-foreground-muted">
            How {person.display_name.split(/\s+/)[0]} connects to the rest of the
            tree. Add a relative below, or{" "}
            <Link
              href={`/family/tree?focus=${person.id}`}
              className="text-accent-family underline-offset-4 hover:underline"
            >
              see them in the tree
            </Link>
            .
          </p>
        </header>

        {hasRelatives ? (
          <div className="flex flex-col gap-5">
            <RelativeChips
              label="Parents"
              relatives={parents}
              focusPersonId={person.id}
              canRemove={viewer?.isAdmin ?? false}
            />
            <RelativeChips
              label="Spouse"
              relatives={spouses}
              focusPersonId={person.id}
              canRemove={viewer?.isAdmin ?? false}
            />
            <RelativeChips
              label="Children"
              relatives={children}
              focusPersonId={person.id}
              canRemove={viewer?.isAdmin ?? false}
            />
            <RelativeChips
              label="Siblings"
              relatives={siblings}
              focusPersonId={person.id}
              canRemove={false}
            />
          </div>
        ) : (
          <p className="text-sm italic text-foreground-subtle">
            No connections yet. Add a parent, child, or spouse to place{" "}
            {person.display_name.split(/\s+/)[0]} in the tree.
          </p>
        )}

        <div className="flex flex-col gap-2 border-t border-border/70 pt-5">
          <p className="eyebrow text-foreground-subtle">Add a connection</p>
          <AddRelative focusPersonId={person.id} />
        </div>
      </section>

      {/* Their archive photos */}
      {signedPhotos.length > 0 && (
        <section className="flex flex-col gap-5">
          <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
            In the Archive
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {signedPhotos.map((photo) => (
              <li
                key={photo.id}
                className="overflow-hidden rounded-lg border border-border/70 bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.signedUrl}
                  alt={photo.caption ?? "Family archive photo"}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
