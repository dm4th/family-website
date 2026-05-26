import Link from "next/link";
import { notFound } from "next/navigation";

import {
  BriefingPanel,
  Eyebrow,
  PageIntro,
  type PageMode,
} from "@/components/shell";

type Params = Promise<{ feature: string }>;

type FeatureInfo = {
  title: string;
  tagline: string;
  description: string;
  rationale: string;
  prd: string;
  mode: PageMode;
};

const FEATURES: Record<string, FeatureInfo> = {
  booking: {
    title: "Property booking",
    tagline:
      "Reserve dates at the family properties without scheduling collisions.",
    description:
      "Interactive calendar per property, conflict detection, admin approval for peak periods, ICS export so bookings show up in your personal calendar.",
    rationale:
      "We're shipping the read-only side of the portal first so the family has a place to live before we add coordination on top.",
    prd: "prds/06-property-booking.md",
    mode: "operations",
  },
  documents: {
    title: "Trust documents & AI",
    tagline: "Ask plain-language questions about trust documents.",
    description:
      "Upload trust and estate documents, then ask things like \"When can I access my trust funds?\" and get cited answers — without paging a lawyer for routine questions.",
    rationale:
      "Trust docs are sensitive, so we haven't made the security-posture decisions yet (encryption-at-rest, LLM data agreement, vector DB choice). That conversation happens before this feature ships.",
    prd: "prds/07-trust-doc-rag.md",
    mode: "advisory",
  },
  finances: {
    title: "Finances",
    tagline: "Trust performance and distributions, transparently.",
    description:
      "Per-beneficiary balance, distribution history, family-wide aggregate metrics. Manual entry by trustees first; automated feeds later.",
    rationale:
      "Same security gating as trust documents. We also need a real conversation about which numbers belong in-app vs. in your existing family-office tools.",
    prd: "prds/08-financial-dashboard.md",
    mode: "advisory",
  },
  messaging: {
    title: "Family messaging",
    tagline: "In-context comments and a what's-new feed.",
    description:
      "Comments on property pages and profiles, plus a daily/weekly digest email summarizing what's been added or changed.",
    rationale:
      "Only worth building once people are genuinely using the portal day-to-day — otherwise it's an empty room. Revisit after the first slice has been in family hands for a while.",
    prd: "prds/09-family-messaging.md",
    mode: "family",
  },
  timeline: {
    title: "Family timeline",
    tagline: "A digital family history with stories and photos.",
    description:
      "Browsable chronological timeline of family events. AI-assisted photo tagging by year and people. Record short stories from the older generation.",
    rationale:
      "This is the long-arc \"legacy\" feature. It gets more valuable as the photo collection grows, so we're letting that fill in first.",
    prd: "prds/10-family-timeline.md",
    mode: "family",
  },
};

export default async function ComingSoonPage({
  params,
}: {
  params: Params;
}) {
  const { feature } = await params;
  const info = FEATURES[feature];
  if (!info) notFound();

  return (
    <div className="flex flex-col gap-10">
      <PageIntro
        mode={info.mode}
        eyebrow="In flight"
        title={info.title}
        context={info.tagline}
      />

      <BriefingPanel className="max-w-3xl">
        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-3">
            <Eyebrow>What it&apos;ll do</Eyebrow>
            <p className="text-base leading-relaxed text-foreground">
              {info.description}
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <Eyebrow>Why it&apos;s not built yet</Eyebrow>
            <p className="text-base leading-relaxed text-foreground-muted">
              {info.rationale}
            </p>
          </section>

          <div className="border-t border-border pt-5 text-xs text-foreground-subtle">
            Plans live in{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-foreground-muted">
              {info.prd}
            </code>
            . Edit them anytime to push for priority changes.
          </div>
        </div>
      </BriefingPanel>

      <div>
        <Link
          href="/"
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
