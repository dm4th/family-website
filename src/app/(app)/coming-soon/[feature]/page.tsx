import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
  mode: PageMode;
};

const FEATURES: Record<string, FeatureInfo> = {
  documents: {
    title: "Trust Documents & AI",
    tagline: "Ask plain-language questions about trust documents.",
    description:
      "Upload trust and estate documents, then ask things like \"When can I access my trust funds?\" and get cited answers without paging a lawyer for routine questions.",
    rationale:
      "Trust documents are sensitive, so we want to settle how they're protected before anything goes online: how they're encrypted, what an AI assistant is allowed to keep, and where the search runs. That conversation comes first.",
    mode: "advisory",
  },
  finances: {
    title: "Finances",
    tagline: "Trust performance and distributions, transparently.",
    description:
      "Per-beneficiary balance, distribution history, family-wide aggregate metrics. Manual entry by trustees first; automated feeds later.",
    rationale:
      "Held to the same care as the trust documents. We also want to agree together on which numbers belong here versus in the family's existing financial tools.",
    mode: "advisory",
  },
  messaging: {
    title: "Family Messaging",
    tagline: "In-context comments and a what's-new feed.",
    description:
      "Comments on property pages and profiles, plus a daily/weekly digest email summarizing what's been added or changed.",
    rationale:
      "Worth building once the family is using the site day-to-day; otherwise it's an empty room. We'll revisit once everyone's settled in.",
    mode: "family",
  },
  timeline: {
    title: "Family Timeline",
    tagline: "A digital family history with stories and photos.",
    description:
      "Browsable chronological timeline of family events. AI-assisted photo tagging by year and people. Record short stories from the older generation.",
    rationale:
      "This is the long-arc \"legacy\" feature. It gets richer as the photo collection grows, so we're letting that fill in first.",
    mode: "family",
  },
};

export default async function ComingSoonPage({
  params,
}: {
  params: Params;
}) {
  const { feature } = await params;
  // Property booking has shipped — send anyone on its old "coming soon" link
  // straight to the live calendar.
  if (feature === "booking") redirect("/calendar");
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
            Want this one sooner, or have ideas for how it should work? Let us
            know. The family&apos;s priorities shape what gets built next.
          </div>
        </div>
      </BriefingPanel>

      <div>
        <Link
          href="/"
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
