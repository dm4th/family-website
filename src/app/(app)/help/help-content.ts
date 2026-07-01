/**
 * The /help "How This Works" guide (PRD 13), as structured data rather than one
 * Markdown blob (PRD 20 follow-up: list every feature by site section, plus what
 * we're considering next). Kept as data so the family can suggest edits without
 * touching JSX, and so the page can render it with the shell's mode panels
 * instead of a plain renderer.
 *
 * House rules:
 *  - Written for the eldest generation first: short sentences, no jargon, warm.
 *  - Be honest about what exists today. `status: "soon"` / `"exploring"` clearly
 *    mark what isn't built yet, so nothing implies it works when it doesn't.
 *  - Copy conventions: Title Case feature names, sentence-case descriptions,
 *    ALL-CAPS eyebrows, no em-dashes.
 */

export type FeatureStatus = "live" | "soon" | "exploring";

export type HelpFeature = {
  /** Title Case feature name. */
  name: string;
  /** Optional nav path hint, e.g. "Family -> Directory". */
  where?: string;
  /** Plain-language description, sentence case. */
  description: string;
  /** Defaults to "live" when omitted. */
  status?: FeatureStatus;
};

export type HelpSection = {
  tone: "salon" | "ledger" | "briefing";
  mode: "family" | "operations" | "advisory";
  /** ALL-CAPS eyebrow. */
  eyebrow: string;
  /** Fraunces section title. */
  title: string;
  /** One-line intro under the title. */
  blurb: string;
  features: HelpFeature[];
};

/** A short orientation shown under the page title, before the sections. */
export const HELP_INTRO =
  "This is a private place for our family, somewhere to keep up with each other, look after the homes we share, and remember where we come from. Only invited family can see it. There are no passwords: you sign in with your email. Everything is grouped into a few areas in the menu at the top. Come back to this page any time from the top-right menu.";

export const HELP_SECTIONS: HelpSection[] = [
  {
    tone: "salon",
    mode: "family",
    eyebrow: "THE BASICS",
    title: "Getting started",
    blurb: "The handful of things everyone does first.",
    features: [
      {
        name: "Signing In",
        description:
          "No passwords to remember. Enter your email and we send you a link to tap. The link only works for you, and only for a little while, so if it expires just ask for a new one. You can also sign in with Google.",
      },
      {
        name: "Your Profile",
        where: "top-right menu -> Edit Profile",
        description:
          "How the rest of the family sees you. Add a photo, a short bio, your generation and family branch, and a note on how you're related. Nothing is final; change it whenever you like.",
      },
      {
        name: "Getting Help",
        where: "top-right menu -> How This Works",
        description:
          "This page. It explains everything on the site in plain language.",
      },
      {
        name: "Sending Feedback",
        where: "Feedback button, top of every page",
        description:
          "Have an idea, or hit something confusing? Tap Feedback and tell us in a sentence or two. Anyone can do it, family and guests alike.",
      },
    ],
  },
  {
    tone: "salon",
    mode: "family",
    eyebrow: "FAMILY",
    title: "The people and our history",
    blurb:
      "The heart of the site: who we are, where we come from, and the stories that connect us.",
    features: [
      {
        name: "Directory",
        where: "Family -> Directory",
        description:
          "Everyone in the family, with their photo, generation, and branch. Tap anyone to see their profile. The easiest way to put names to faces as the family grows.",
      },
      {
        name: "Photo Archive",
        where: "Family -> Archive",
        description:
          "Albums of family photographs, old and new. You can date a scan even when you only know the decade (\"circa 1968\"), and tag the people in it, including relatives who were never on the site. Upload a whole zip of scans at once.",
      },
      {
        name: "Family Tree",
        where: "Family -> Family Tree",
        description:
          "A tree you move through: tap a person to center the tree on them, drag to pan, zoom in and out. Add ancestors without creating accounts for them, and connect parents, children, and spouses. People who have passed are remembered gently. You can even import a spreadsheet of relatives all at once.",
      },
      {
        name: "Timeline",
        where: "Family -> Timeline",
        description:
          "The family story, year by year, weaving together milestones and dated photos. Jump straight to a decade, or filter down to one person or one branch.",
      },
      {
        name: "Stories & Remembrances",
        where: "Family -> Stories",
        description:
          "Written memories tied to the people, albums, and moments they're about. A story shows up on the relevant profile, album, and timeline event, so it's found where it belongs.",
      },
    ],
  },
  {
    tone: "ledger",
    mode: "operations",
    eyebrow: "OPERATIONS",
    title: "The homes we share",
    blurb: "Keeping our shared places running, and sharing time at them fairly.",
    features: [
      {
        name: "Properties",
        where: "Operations -> Properties",
        description:
          "House notes, who to call, how things work, amenities, and photos for each of our homes. Anyone can help keep them up to date: open a property, tap Edit, make your change. Every edit is saved, so nothing is ever truly lost.",
      },
      {
        name: "Calendar & Bookings",
        where: "Operations -> Calendar",
        description:
          "Request time at a property without double-booking. Tap your arrival day, then your last night. If dates are taken you'll be warned before you send. Busy times of year wait for approval. Everyone involved gets an email, and you can subscribe the family calendar into the calendar app on your phone or computer.",
      },
      {
        name: "Guest Access",
        description:
          "Invite someone staying at one of the homes as a guest. They see just that property's information and a simple busy or free calendar, and nothing else about the family.",
      },
    ],
  },
  {
    tone: "briefing",
    mode: "advisory",
    eyebrow: "ADVISORY",
    title: "Stewardship",
    blurb:
      "The family's financial and governance side. Not built yet; here's what's planned.",
    features: [
      {
        name: "Documents & AI",
        status: "soon",
        description:
          "Plain-language answers drawn from the family's trust documents, so you can ask a question instead of hunting through paperwork.",
      },
      {
        name: "Finances",
        status: "soon",
        description:
          "Trust performance and distributions, shared with the family transparently.",
      },
    ],
  },
  {
    tone: "ledger",
    mode: "operations",
    eyebrow: "GOOD TO KNOW",
    title: "How it all works",
    blurb: "A few things that are true across the whole site.",
    features: [
      {
        name: "Editing Is Shared",
        description:
          "Almost everything here is a shared, living set of notes: any family member can add or fix content. Every change is recorded, so we can always see what changed and undo it if needed. Don't worry about getting it perfect.",
      },
      {
        name: "Photos Stay Fast",
        description:
          "Pictures are tidied up automatically when you add them, so pages stay quick to open even when the originals are large.",
      },
      {
        name: "Your Privacy",
        description:
          "Only invited family can see the site. Guests are limited to the single property they're given. What you share here stays in the family.",
      },
    ],
  },
];

/** The roadmap block at the bottom: what we're thinking about adding next. */
export const HELP_EXPLORING: HelpFeature[] = [
  {
    name: "Bulk Ways to Add Content",
    status: "exploring",
    description:
      "Easier tools for loading lots of people and photos at once, so filling in the archive and the tree is quick.",
  },
  {
    name: "Messaging & Comments",
    status: "exploring",
    description:
      "Comments next to the thing they're about, and a simple what's-new feed, so conversations don't get lost in text threads.",
  },
  {
    name: "A Guestbook",
    status: "exploring",
    description:
      "A place for guests staying at a property to leave a note about their visit.",
  },
  {
    name: "Trip Updates",
    status: "exploring",
    description:
      "Link everyone on a stay together and send the group a note or a reminder.",
  },
  {
    name: "An Assistant You Can Ask",
    status: "exploring",
    description:
      "A helper built into the site that can answer questions and take care of small tasks for you.",
  },
  {
    name: "Documents & Finances",
    status: "exploring",
    description:
      "The Advisory area above, once the family decides what belongs there.",
  },
];
