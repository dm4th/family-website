import type { Metadata } from "next";

import { PageIntro, SalonPanel } from "@/components/shell";
import { Markdown } from "@/components/markdown";
import { HELP_MARKDOWN } from "./help-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How this works",
};

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageIntro
        mode="family"
        eyebrow="Welcome"
        title="How this works"
        context="A short, plain-language guide to everything on the site. Come back any time."
      />
      <SalonPanel>
        <Markdown source={HELP_MARKDOWN} tone="salon" />
      </SalonPanel>
    </div>
  );
}
