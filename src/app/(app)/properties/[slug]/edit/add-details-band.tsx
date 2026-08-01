/**
 * The Smart Intake front door (PRD 34, slice 1).
 *
 * Before this, the only way into intake was a sentence inside the Contacts panel
 * header — findable only by someone already scrolling toward adding a contact.
 * That is the wrong place for the feature built specifically to spare the
 * family's slowest typist: he has to already be doing the typing to discover the
 * thing that saves him from it.
 *
 * So it sits first on the page, above Details, as two plain doors. Two buttons
 * rather than a menu or a mode switch, because both are complete acts a member
 * can name ("I have a bill", "I'd rather talk") and neither should require
 * discovering a control before you can start.
 *
 * Restraint is deliberate: this is Operations, so it's a panel with a rule and
 * two filled buttons, not a hero. First is prominent enough.
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Eyebrow, LedgerPanel } from "@/components/shell";
import { isDocsPickerConfigured } from "@/lib/google/docs-picker";

export function AddDetailsBand({ slug }: { slug: string }) {
  /*
   * With the Google picker configured, "Connect Google Doc" leads (PRD 38):
   * the family's house manual is a Google Doc, so the shortest path from what
   * they have to what's on the page starts there, and Photo steps back to
   * outline. Without it, the band is exactly what it was — three doors with
   * Photo filled. No dead buttons, and no environment where the most prominent
   * control on the band is the one that can't work.
   */
  const gdoc = isDocsPickerConfigured();

  return (
    <LedgerPanel className="max-w-3xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Eyebrow>Add Details</Eyebrow>
          <h2 className="font-display text-xl leading-tight text-foreground">
            Rather not type it?
          </h2>
          <p className="text-base text-foreground-muted">
            {gdoc
              ? "Read it straight out of a Google Doc, photograph a bill or a handwritten note, paste in something you already have, or just say what you want to add. We'll read it and walk you through what we found, so you only have to check it. Nothing is saved until you press Save."
              : "Photograph a bill or a handwritten note, paste in a document you already have, or just say what you want to add. We'll read it and walk you through what we found, so you only have to check it. Nothing is saved until you press Save."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {gdoc ? (
            <Button asChild>
              <Link href={`/properties/${slug}/edit/intake?mode=gdoc`}>
                Connect Google Doc
              </Link>
            </Button>
          ) : null}
          <Button asChild variant={gdoc ? "outline" : "default"}>
            <Link href={`/properties/${slug}/edit/intake`}>
              Add from a Photo
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/properties/${slug}/edit/intake?mode=paste`}>
              Paste Text
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/properties/${slug}/edit/intake?mode=voice`}>
              Add by Voice
            </Link>
          </Button>
        </div>
      </div>
    </LedgerPanel>
  );
}
