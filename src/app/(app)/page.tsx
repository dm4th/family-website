import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Eyebrow, SectionRule } from "@/components/shell";
import { WelcomePanel } from "@/components/welcome-panel";
import { ProfileNudge } from "@/components/profile-nudge";

type Mode = "family" | "operations" | "advisory";

type Gateway = {
  mode: Mode;
  eyebrow: string;
  title: string;
  blurb: string;
  href: string;
  badge?: string | null;
};

type ComingSoon = {
  title: string;
  blurb: string;
  href: string;
  mode: Mode;
};

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

  // Two cheap counts so the gateways show signal instead of static copy, plus
  // the caller's name/branch so we can nudge an incomplete profile.
  const [{ count: memberCount }, { count: propertyCount }, ownProfile] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .is("deactivated_at", null),
      supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .neq("status", "inactive"),
      user
        ? supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // The welcome panel is the celebratory landing right after finishing the
  // guided flow (?welcome=1). The nudge is the gentle follow-up for someone who
  // chose "finish later" and still has no name — the real "Unnamed" case. We
  // gate on name only (not branch) so established members who were backfilled as
  // onboarded but never set a branch aren't nagged.
  const justOnboarded = (await searchParams)?.welcome === "1";
  const needsProfile = Boolean(user) && !ownProfile?.data?.full_name?.trim();

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "there";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // The three live gateways — one per page mode. New surfaces (booking,
  // documents, finances, timeline, messaging) join their matching mode's
  // group as they ship.
  const gateways: Gateway[] = [
    {
      mode: "family",
      eyebrow: "Family",
      title: "The Directory",
      blurb:
        "Profiles, generations, and the photo archive of everyone in the family.",
      href: "/family",
      badge:
        memberCount === null
          ? null
          : `${memberCount} ${memberCount === 1 ? "member" : "members"}`,
    },
    {
      mode: "operations",
      eyebrow: "Operations",
      title: "Properties",
      blurb:
        "Family-shared places: house rules, contacts, and photos. Anyone in the family can edit them.",
      href: "/properties",
      badge:
        propertyCount === null
          ? null
          : `${propertyCount} ${propertyCount === 1 ? "place" : "places"}`,
    },
    {
      mode: "operations",
      eyebrow: "Operations",
      title: "Calendar",
      blurb:
        "Reserve dates at the family properties, see who's where, and avoid double-bookings.",
      href: "/calendar",
      badge: null,
    },
  ];

  const comingSoon: ComingSoon[] = [
    {
      title: "Documents & AI",
      blurb: "Plain-language answers from trust documents.",
      href: "/coming-soon/documents",
      mode: "advisory",
    },
    {
      title: "Finances",
      blurb: "Trust performance and distributions, transparently.",
      href: "/coming-soon/finances",
      mode: "advisory",
    },
    {
      title: "Family Timeline",
      blurb: "Stories, milestones, history. Preserved.",
      href: "/coming-soon/timeline",
      mode: "family",
    },
    {
      title: "Messaging",
      blurb: "In-context comments and a what's-new feed.",
      href: "/coming-soon/messaging",
      mode: "family",
    },
  ];

  return (
    <div className="flex flex-col gap-16">
      {/* Just finished onboarding → celebratory orientation panel. */}
      {justOnboarded && <WelcomePanel firstName={firstName} />}

      {/* Skipped onboarding with a blank profile → soft, dismissible nudge. */}
      {!justOnboarded && needsProfile && <ProfileNudge />}

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

      {/* The three gateways. Each is presented as a large editorial link
          rather than a tiny SaaS card. */}
      <section className="flex flex-col gap-8">
        <SectionRule label="Where to" />
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
          {gateways.map((g) => (
            <GatewayBlock key={g.href} gateway={g} />
          ))}
        </div>
      </section>

      {/* Coming soon — smaller, set apart, never the dominant moment. */}
      <section className="flex flex-col gap-6">
        <SectionRule label="In flight" />
        <p className="max-w-2xl text-sm text-foreground-muted">
          What we&apos;re planning next. Click through to read what each one
          will do and why, and tell us what you&apos;d like sooner.
        </p>
        <ul className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {comingSoon.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="group flex flex-col gap-1 border-l border-border pl-4 transition-colors hover:border-accent-bronze"
              >
                <p
                  className={cn(
                    "eyebrow",
                    modeAccentText[c.mode]
                  )}
                >
                  Soon · {c.mode}
                </p>
                <h3 className="font-display text-lg leading-tight text-foreground transition-colors group-hover:text-accent-bronze">
                  {c.title}
                </h3>
                <p className="text-xs text-foreground-subtle">{c.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const modeAccentText: Record<Mode, string> = {
  family: "text-accent-family",
  operations: "text-accent-operations",
  advisory: "text-accent-advisory",
};

const modeRailColor: Record<Mode, string> = {
  family: "bg-accent-family",
  operations: "bg-accent-operations",
  advisory: "bg-accent-advisory",
};

function GatewayBlock({ gateway }: { gateway: Gateway }) {
  return (
    <Link
      href={gateway.href}
      className="group flex flex-col gap-3 border-l-2 border-border pl-6 transition-colors hover:border-foreground"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn("h-px w-6", modeRailColor[gateway.mode])}
        />
        <Eyebrow>{gateway.eyebrow}</Eyebrow>
        {gateway.badge && (
          <span className="ml-auto text-xs text-foreground-subtle">
            {gateway.badge}
          </span>
        )}
      </div>
      <h2 className="font-display text-[2rem] leading-[1.05] text-foreground transition-colors group-hover:text-accent-bronze sm:text-[2.25rem]">
        {gateway.title}
      </h2>
      <p className="max-w-md text-sm leading-relaxed text-foreground-muted">
        {gateway.blurb}
      </p>
    </Link>
  );
}
