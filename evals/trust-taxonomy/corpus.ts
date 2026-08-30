// Trust taxonomy eval — the fixture corpus (PRD 40 slice 2).
//
// EVERYTHING HERE IS INVENTED. The trust is the fictional "Birchwater Family
// Trust"; every name, date, parcel, and dollar figure is made up. No real
// trust content ever enters this repo (the PRD 37 fixture rule). The corpus is
// shaped like a real family-trust Dropbox folder anyway: governing
// instruments, tax filings, property records, one investment document, and a
// couple of deliberately awkward fits.
//
// `themes` is the grader's tolerance: the proposal passes for a document when
// it lands in a category whose NAME matches any theme pattern. `ambiguous`
// documents pass wherever they land (including unassigned) — they exist to
// see what the model does with a genuinely unclear fit, not to punish either
// answer.

export type FixtureDoc = {
  id: string;
  name: string;
  firstPageText: string;
  /** Category-name patterns that count as a correct placement. */
  themes: RegExp[];
  /** Correct to leave unassigned. */
  unassignedOk?: boolean;
  /** No wrong answer; reported, never scored. */
  ambiguous?: boolean;
};

export const BASE_CORPUS: FixtureDoc[] = [
  {
    id: "doc-01",
    name: "birchwater-family-trust-1998.pdf",
    firstPageText:
      "DECLARATION OF TRUST. The Birchwater Family Trust, dated March 12, 1998. Harold R. Birchwater, Grantor. Article I: Trust Estate. The Grantor hereby transfers to the Trustees the property described in Schedule A, to be held, administered and distributed as provided herein for the benefit of the Grantor's descendants.",
    themes: [/trust/i, /govern/i, /instrument/i, /agreement/i, /founding/i, /core/i],
  },
  {
    id: "doc-02",
    name: "restatement-2019.pdf",
    firstPageText:
      "AMENDED AND RESTATED DECLARATION OF TRUST of the Birchwater Family Trust, executed September 4, 2019, superseding in its entirety the Declaration dated March 12, 1998, as previously amended. Article IV governs distributions to beneficiaries who have attained the age of thirty.",
    themes: [/trust/i, /govern/i, /instrument/i, /agreement/i, /amend/i, /restat/i, /core/i],
  },
  {
    id: "doc-03",
    name: "first-amendment-2021.pdf",
    firstPageText:
      "FIRST AMENDMENT to the Amended and Restated Declaration of Trust of the Birchwater Family Trust. The undersigned Trustees, acting under Article XI, hereby amend Section 4.2 to substitute the successor trustee provisions set forth below. Executed June 30, 2021.",
    themes: [/trust/i, /govern/i, /amend/i, /instrument/i, /agreement/i, /core/i],
  },
  {
    id: "doc-04",
    name: "form-1041-2023.pdf",
    firstPageText:
      "Form 1041, U.S. Income Tax Return for Estates and Trusts, tax year 2023. Name of estate or trust: Birchwater Family Trust. EIN 04-7315982. Total income line 9: $184,220. Fiduciary: Meredith Birchwater, Trustee.",
    themes: [/tax/i, /1041/i, /filing/i, /return/i],
  },
  {
    id: "doc-05",
    name: "form-1041-2024.pdf",
    firstPageText:
      "Form 1041, U.S. Income Tax Return for Estates and Trusts, tax year 2024. Name of estate or trust: Birchwater Family Trust. EIN 04-7315982. Total income line 9: $201,875. Fiduciary: Meredith Birchwater, Trustee.",
    themes: [/tax/i, /1041/i, /filing/i, /return/i],
  },
  {
    id: "doc-06",
    name: "schedule-k1-thomas-2024.pdf",
    firstPageText:
      "Schedule K-1 (Form 1041), 2024. Beneficiary's Share of Income, Deductions, Credits, etc. Beneficiary: Thomas A. Birchwater. Interest income: $6,410. Net long-term capital gain: $12,030. Trust: Birchwater Family Trust, EIN 04-7315982.",
    themes: [/tax/i, /k-?1/i, /filing/i, /return/i, /benefici/i],
  },
  {
    id: "doc-07",
    name: "cedar-point-deed-1987.pdf",
    firstPageText:
      "WARRANTY DEED. Harold R. Birchwater and Eleanor J. Birchwater, for consideration paid, grant to the Birchwater Family Trust the certain parcel of land with buildings thereon situated on Cedar Point Road, Grafton County, New Hampshire, described in Book 1412, Page 87, containing 2.6 acres more or less.",
    themes: [/propert/i, /deed/i, /real estate/i, /land/i, /title/i],
  },
  {
    id: "doc-08",
    name: "ridgeline-title-insurance-policy.pdf",
    firstPageText:
      "OWNER'S POLICY OF TITLE INSURANCE. Policy No. RT-88-104522. Insured: Birchwater Family Trust. Land: the parcel known as Ridgeline Camp, Gallatin County, Montana, as described in Exhibit A. Amount of insurance: $940,000.",
    themes: [/propert/i, /insur/i, /title/i, /deed/i, /real estate/i],
  },
  {
    id: "doc-09",
    name: "investment-policy-statement-2022.pdf",
    firstPageText:
      "INVESTMENT POLICY STATEMENT for the Birchwater Family Trust, adopted by the Trustees November 2022. Objectives: preservation of corpus in real terms; distribution support of 3.5% of trailing twelve-quarter average value. Asset allocation targets: 55% global equity, 35% fixed income, 10% real assets.",
    themes: [/invest/i, /financ/i, /polic/i],
  },
  {
    id: "doc-10",
    name: "dock-repair-invoice-cedar-point.pdf",
    // The awkward fit, on purpose: a household maintenance invoice that
    // happens to sit in the trust folder because the trust owns the property.
    // Unassigned-with-a-reason and property-filed are both defensible.
    firstPageText:
      "INVOICE. Lakeside Marine Services LLC. Bill to: Birchwater Family, Cedar Point Road. Re-deck and re-pile east dock section, replace 14 boards, labor and materials: $3,180. Payment due on receipt. Thank you for your business.",
    themes: [/propert/i, /maint/i, /invoice/i, /expense/i],
    unassignedOk: true,
    ambiguous: true,
  },
];

/** Phase-2 additions: what arrives after a taxonomy is already approved. */
export const ADDITION_CORPUS: FixtureDoc[] = [
  {
    id: "doc-11",
    name: "form-1041-2025.pdf",
    firstPageText:
      "Form 1041, U.S. Income Tax Return for Estates and Trusts, tax year 2025. Name of estate or trust: Birchwater Family Trust. EIN 04-7315982. Total income line 9: $196,340. Fiduciary: Meredith Birchwater, Trustee.",
    themes: [/tax/i, /1041/i, /filing/i, /return/i],
  },
  {
    id: "doc-12",
    name: "second-amendment-2026.pdf",
    firstPageText:
      "SECOND AMENDMENT to the Amended and Restated Declaration of Trust of the Birchwater Family Trust. Section 7.1 is amended to add a corporate co-trustee upon the resignation or incapacity of the last individual trustee. Executed February 9, 2026.",
    themes: [/trust/i, /govern/i, /amend/i, /instrument/i, /agreement/i, /core/i],
  },
  {
    id: "doc-13",
    name: "crummey-notices-2024.pdf",
    firstPageText:
      "NOTICE OF RIGHT OF WITHDRAWAL. To the beneficiaries of the Birchwater Family Trust: you are hereby notified that a contribution of $17,000 per beneficiary was made to the trust on December 2, 2024, and that you hold a right of withdrawal exercisable for thirty days from the date of this notice.",
    themes: [/benefici/i, /notice/i, /letter/i, /correspond/i, /withdraw/i, /trust/i, /distribut/i],
    ambiguous: true,
  },
  {
    id: "doc-14",
    name: "letter-of-wishes-2020.pdf",
    firstPageText:
      "To my Trustees. This letter is not legally binding, but I ask that you read it whenever you exercise discretion under the trust. It matters to me that the lake properties stay available to every branch of the family, and that distributions favor education first. Harold R. Birchwater, January 2020.",
    themes: [/wish/i, /letter/i, /guidance/i, /correspond/i, /intent/i, /govern/i, /trust/i],
    unassignedOk: true,
    ambiguous: true,
  },
];
