// Trust notebook eval — the fixture corpus (PRD 40 slice 3).
//
// EVERYTHING HERE IS INVENTED (the fictional Birchwater Family Trust again;
// the PRD 37 rule: real content never enters the repo). Unlike the taxonomy
// eval, this corpus cannot be synthesized end to end: handwriting is the
// thing under test, so a person must HANDWRITE each `groundTruth` text on
// paper and photograph it at realistic quality. The README carries the
// protocol; this file carries what to write and how each page is scored.
//
// Photograph naming: <id>.jpg (or .png) in the corpus directory
// (TRUST_NOTE_CORPUS env var, default /tmp/trust-note-corpus).

export type NotePage = {
  id: string;
  /** The text to handwrite, verbatim. Ground truth for scoring. */
  groundTruth: string;
  /** Terms an extracted key point should surface (recall, reported). */
  expectedPoints: { mustMention: string[] }[];
  /** True = the page holds no trust-relevant content; 0 key points gates. */
  noTrustContent?: boolean;
  /** Points from this page should map to this fixture document (reported). */
  plantedReference?: string;
  /**
   * Documents a mapping MAY defensibly target (permitted, not required).
   * The forced-mapping gate fires only on documents outside the planted +
   * allowed set — calibrated per the PR #54 review, where the original
   * any-mapping-is-forced rule would have failed a model for correctly
   * reading "the 2019 restatement" off the page.
   */
  allowedReferences?: string[];
  /** What this page is testing, for the report. */
  probe: string;
};

/**
 * Fixture digital-document pages the mapping pass sees as candidates. Small
 * on purpose: the mapping question is "does a note about Article IV find the
 * restatement", not retrieval at scale (that's PRD 07).
 */
export const FIXTURE_DOC_PAGES = [
  {
    documentId: "fixture-restatement",
    documentName: "restatement-2019.pdf",
    page: 4,
    text: "Article IV. Distributions. The Trustees shall distribute to each beneficiary who has attained the age of thirty years such amounts of income and principal as the Trustees deem advisable for health, education, maintenance and support. Discretionary distributions before age thirty require the concurrence of both Trustees.",
  },
  {
    documentId: "fixture-restatement",
    documentName: "restatement-2019.pdf",
    page: 9,
    text: "Article VII. Successor Trustees. Upon the death, resignation or incapacity of an individual Trustee, the remaining Trustee shall serve alone; if no individual Trustee remains, Granite Fiduciary Company shall serve as corporate trustee.",
  },
  {
    documentId: "fixture-ips",
    documentName: "investment-policy-statement-2022.pdf",
    page: 1,
    text: "Investment Policy Statement. Objectives: preservation of corpus in real terms; distribution support of 3.5 percent of trailing twelve-quarter average value. Asset allocation targets: 55 percent global equity, 35 percent fixed income, 10 percent real assets.",
  },
];

export const NOTE_PAGES: NotePage[] = [
  {
    id: "note-01-clear-print",
    probe: "Clear printed handwriting; two unambiguous trust facts.",
    groundTruth:
      "Call with M. Granger, March 3.\nDistributions before 30 need BOTH trustees to sign off. Article IV.\nEllen turns 30 next June - her share moves to single-trustee discretion then.",
    expectedPoints: [
      { mustMention: ["thirty", "both"] },
      { mustMention: ["Ellen", "June"] },
    ],
    plantedReference: "fixture-restatement",
  },
  {
    id: "note-02-cursive",
    probe: "Cursive; an amount and a deadline that must not be misread.",
    groundTruth:
      "Granger says file the 1041 by April 15 as usual. Estimated payment $14,750 due with it. Do NOT use the old accountant's worksheet - numbers changed after the 2019 restatement.",
    expectedPoints: [
      { mustMention: ["April", "1041"] },
      { mustMention: ["14,750"] },
    ],
    // The page names "the 2019 restatement" outright — linking it is reading
    // comprehension, not a forced mapping (PR #54 review).
    plantedReference: "fixture-restatement",
  },
  {
    id: "note-03-successor",
    probe: "Abbreviations + a crossed-out word; successor-trustee content.",
    groundTruth:
      "If I can't serve - Meredith serves alone. If neither of us - Granite Fiduciary steps in as corp. trustee. Confirmed w/ Granger this matches Art. VII. Ask about naming a backup anyway.",
    expectedPoints: [
      { mustMention: ["Meredith", "alone"] },
      { mustMention: ["Granite"] },
    ],
    plantedReference: "fixture-restatement",
  },
  {
    id: "note-04-no-trust-content",
    probe: "RESTRAINT: an everyday page with nothing trust-relevant on it.",
    groundTruth:
      "Saturday - dock boards arriving 9am. Pick up bird seed. Karen's flight lands 4:40, gate info to follow. Chili for dinner, double the beans.",
    expectedPoints: [],
    noTrustContent: true,
  },
  {
    id: "note-05-messy-numbers",
    probe:
      "Hurried writing with a genuinely ambiguous figure - [unclear] beats a confident wrong number.",
    groundTruth:
      "Rebalance target from the IPS: 55 equity / 35 fixed / 10 real assets. Spending rule 3.5% of trailing average. Granger thinks we drifted to 61 equity - check the Q3 statement.",
    expectedPoints: [
      { mustMention: ["3.5"] },
      { mustMention: ["55", "35"] },
    ],
    plantedReference: "fixture-ips",
  },
  {
    id: "note-06-margin-notes",
    probe: "Marginal note + underlines; instruction received from a person.",
    groundTruth:
      "Meeting w/ both kids re: education draws. Agreed: tuition invoices go straight to Granger's office. Margin: FOLLOW UP - get Whitman's 529 statement before year end.",
    expectedPoints: [
      { mustMention: ["tuition", "Granger"] },
      { mustMention: ["Whitman", "529"] },
    ],
    // Education draws brush against the restatement's HEMS language; a link
    // there is defensible, so it is permitted without being required.
    allowedReferences: ["fixture-restatement"],
  },
  {
    id: "note-07-unrelated-content",
    probe:
      "FORCED-MAPPING surface: real trust content that matches NO fixture document - any link at all is a forced mapping.",
    groundTruth:
      "Switched the trust checking acct to Lakeside Savings, ends 4417. Old First National acct closes end of month. Granger's office has the new deposit slips - tell Meredith before the next distribution run.",
    expectedPoints: [
      { mustMention: ["Lakeside", "4417"] },
    ],
  },
];
