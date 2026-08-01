import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { cn } from "@/lib/utils";
import { Eyebrow, SectionRule } from "@/components/shell";
import { WelcomePanel } from "@/components/welcome-panel";
import { ProfileNudge, type ProfileGap } from "@/components/profile-nudge";
import {
  NAV_GROUPS,
  doorItemsForViewer,
  modeAccentRail,
  type NavCountKey,
  type NavGroupDef,
  type NavItem,
  type NavMode,
} from "@/components/app-shell/nav-config";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewer = await resolveViewer();
  const isAdmin = viewer?.isAdmin ?? false;

  // Cheap counts so each door shows signal instead of static copy, plus the
  // caller's name so we can nudge an incomplete profile.
  const [
    { count: memberCount },
    { count: propertyCount },
    { count: albumCount },
    { count: peopleCount },
    { count: eventCount },
    { count: storyCount },
    ownProfile,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deactivated_at", null),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .neq("status", "inactive"),
    supabase.from("albums").select("id", { count: "exact", head: true }),
    supabase.from("people").select("id", { count: "exact", head: true }),
    supabase.from("events").select("id", { count: "exact", head: true }),
    supabase.from("stories").select("id", { count: "exact", head: true }),
    user
      ? supabase
          .from("profiles")
          .select("full_name, family_branch, generation")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Is this member in the family tree yet? (PRD 39 — "finished" now includes
  // being placed.) Guests are excluded entirely: they aren't family, and the
  // tree is.
  const [{ data: isGuest }, { data: ownPerson }] = await Promise.all([
    user ? supabase.rpc("is_guest") : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("people")
          .select("id")
          .eq("profile_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const counts: Record<NavCountKey, number | null> = {
    members: memberCount,
    properties: propertyCount,
    albums: albumCount,
    people: peopleCount,
    events: eventCount,
    stories: storyCount,
  };

  // The welcome panel is the celebratory landing right after finishing the
  // guided flow (?welcome=1). The nudge is the gentle follow-up for someone who
  // chose "Finish Later".
  //
  // PRD 39 widened "finished" from "has a name" to "has a name, a generation,
  // and a place in the tree" — the old rule stopped nagging while the member
  // was still invisible in the tree and filed under "Generation not set", which
  // is how a half-finished profile stayed half-finished for weeks. Safe to
  // widen because the 2026-08-01 reset placed every existing member; nobody
  // established gets newly nagged. One gap is named at a time, worst first.
  const justOnboarded = (await searchParams)?.welcome === "1";
  const profileGap: ProfileGap | null = !user
    ? null
    : isGuest === true
      ? null
      : !ownProfile?.data?.full_name?.trim() || !ownProfile?.data?.family_branch
        ? "identity"
        : ownProfile?.data?.generation == null
          ? "generation"
          : !ownPerson
            ? "tree"
            : null;

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "there";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-16">
      {/* Just finished onboarding → celebratory orientation panel. */}
      {justOnboarded && <WelcomePanel firstName={firstName} />}

      {/* Unfinished profile → soft, dismissible nudge naming what's missing. */}
      {!justOnboarded && profileGap && <ProfileNudge gap={profileGap} />}

      {/* Opening statement — date, greeting, mood. Not a KPI wall. */}
      <header className="flex flex-col gap-3">
        <p className="eyebrow text-foreground-subtle">{today}</p>
        <h1 className="font-display text-[2.5rem] leading-[1.02] text-foreground sm:text-[3.25rem]">
          Welcome back, {firstName}.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-foreground-muted">
          A quiet place for the family, to share what we love, look after what
          we own, and steward what we&apos;ve inherited.
        </p>
      </header>

      {/* The three doors — one per page mode. Each is a calm, editorial gateway
          into its mode, not a wall of equal-weight links. */}
      <section className="flex flex-col gap-12">
        <SectionRule label="Where to" />
        {NAV_GROUPS.map((group) => (
          <ModeDoor
            key={group.mode}
            group={group}
            isAdmin={isAdmin}
            counts={counts}
          />
        ))}
      </section>
    </div>
  );
}

const modeHoverText: Record<NavMode, string> = {
  family: "group-hover:text-accent-family",
  operations: "group-hover:text-accent-operations",
  advisory: "group-hover:text-accent-advisory",
};

function badgeFor(
  item: NavItem,
  counts: Record<NavCountKey, number | null>
): string | null {
  if (!item.countKey || !item.unit) return null;
  const n = counts[item.countKey];
  if (n === null) return null;
  return `${n} ${n === 1 ? item.unit[0] : item.unit[1]}`;
}

function ModeDoor({
  group,
  isAdmin,
  counts,
}: {
  group: NavGroupDef;
  isAdmin: boolean;
  counts: Record<NavCountKey, number | null>;
}) {
  const items = doorItemsForViewer(group, isAdmin);
  // The door heading points at the mode's lead page — the first reachable one,
  // falling back to its first item so the heading is always a live target.
  const lead = items.find((item) => !item.soon) ?? items[0];

  return (
    <div className="grid gap-6 border-l-2 border-border pl-6 lg:grid-cols-[minmax(0,18rem)_1fr] lg:gap-12">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn("h-px w-6", modeAccentRail[group.mode])}
          />
          <Eyebrow>{group.label}</Eyebrow>
        </div>
        <Link href={lead.href} className="group w-fit">
          <h2
            className={cn(
              "font-display text-[2rem] leading-[1.05] text-foreground transition-colors sm:text-[2.25rem]",
              modeHoverText[group.mode]
            )}
          >
            {group.label}
          </h2>
        </Link>
        <p className="max-w-sm text-sm leading-relaxed text-foreground-muted">
          {group.blurb}
        </p>
      </div>

      <ul className="flex flex-col">
        {items.map((item) => {
          const badge = badgeFor(item, counts);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex items-baseline justify-between gap-4 border-t border-border/60 py-3.5 first:border-t-0 first:pt-0"
              >
                <span className="flex flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-base transition-colors",
                      item.soon ? "text-foreground-muted" : "text-foreground",
                      modeHoverText[group.mode]
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="text-xs text-foreground-subtle">
                    {item.description}
                  </span>
                </span>
                {item.soon ? (
                  <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.18em] text-foreground-subtle">
                    Soon
                  </span>
                ) : badge ? (
                  <span className="shrink-0 text-xs text-foreground-subtle">
                    {badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
