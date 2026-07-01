import type { Metadata } from "next";

import {
  PageIntro,
  Panel,
  PanelHeader,
  PanelEyebrow,
  PanelTitle,
  PanelDescription,
  PanelBody,
} from "@/components/shell";
import { cn } from "@/lib/utils";
import {
  HELP_INTRO,
  HELP_SECTIONS,
  HELP_EXPLORING,
  type HelpFeature,
  type HelpSection,
} from "./help-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How This Works",
};

const modeRail: Record<HelpSection["mode"], string> = {
  family: "bg-accent-family",
  operations: "bg-accent-operations",
  advisory: "bg-accent-advisory",
};

function StatusTag({ status }: { status: "soon" | "exploring" }) {
  return (
    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-foreground-subtle">
      {status === "soon" ? "Soon" : "Exploring"}
    </span>
  );
}

function FeatureRow({ feature }: { feature: HelpFeature }) {
  const upcoming =
    feature.status === "soon" || feature.status === "exploring"
      ? feature.status
      : null;
  return (
    <li className="border-t border-border/60 py-4 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <h3
          className={cn(
            "text-[0.95rem] font-medium",
            upcoming ? "text-foreground-muted" : "text-foreground"
          )}
        >
          {feature.name}
        </h3>
        {upcoming ? <StatusTag status={upcoming} /> : null}
      </div>
      {feature.where ? (
        <p className="mt-0.5 text-xs text-foreground-subtle">
          {feature.where.replace(/->/g, "→")}
        </p>
      ) : null}
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-foreground-muted">
        {feature.description}
      </p>
    </li>
  );
}

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageIntro
        mode="family"
        eyebrow="Guide"
        title="How This Works"
        context="Everything on the site, in plain language, grouped by area. Come back any time."
      />

      <p className="mb-10 max-w-prose text-sm leading-relaxed text-foreground-muted sm:text-[0.95rem]">
        {HELP_INTRO}
      </p>

      <div className="flex flex-col gap-6">
        {HELP_SECTIONS.map((section) => (
          <Panel key={section.title} tone={section.tone} as="section">
            <PanelHeader>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn("h-px w-8", modeRail[section.mode])}
                />
                <PanelEyebrow>{section.eyebrow}</PanelEyebrow>
              </div>
              <PanelTitle>{section.title}</PanelTitle>
              <PanelDescription>{section.blurb}</PanelDescription>
            </PanelHeader>
            <PanelBody>
              <ul className="flex flex-col">
                {section.features.map((feature) => (
                  <FeatureRow key={feature.name} feature={feature} />
                ))}
              </ul>
            </PanelBody>
          </Panel>
        ))}

        {/* What's next: a deliberately lighter, dashed card so it reads as
            "ideas, not promises" rather than a shipped section. */}
        <section className="rounded-2xl border border-dashed border-border bg-surface px-6 py-8 sm:px-10 sm:py-10">
          <header className="mb-6 flex flex-col gap-1.5 sm:mb-8">
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-px w-8 bg-accent-bronze" />
              <p className="eyebrow text-accent-bronze">WHAT&rsquo;S NEXT</p>
            </div>
            <h2 className="font-display text-2xl leading-[1.1] text-foreground sm:text-[1.75rem]">
              What we&rsquo;re exploring
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-foreground-muted">
              Ideas we&rsquo;re considering, in rough order. Nothing here is
              promised, and your feedback is what shapes the list.
            </p>
          </header>
          <ul className="flex flex-col">
            {HELP_EXPLORING.map((feature) => (
              <FeatureRow key={feature.name} feature={feature} />
            ))}
          </ul>
        </section>

        <p className="max-w-prose text-sm leading-relaxed text-foreground-muted">
          Not sure how to do something, or something isn&rsquo;t working? Use the
          Feedback button at the top of any page, or ask whoever invited you.
        </p>
      </div>
    </div>
  );
}
