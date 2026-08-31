// Trust notebook eval — the fabrication scorer (PRD 40 slice 3, PR #55).
//
// Extracted from eval.mts and recalibrated after the first real wild-corpus
// run (PR #55 review) mechanically reproduced three scorer artifacts:
//
//   * edge punctuation kept tokens from ever matching ("side." vs "side,"),
//   * the >=4-char filter DROPPED every short number (500, 144, 36) — the
//     exact tokens the zero-fabrication rule exists to protect,
//   * paraphrased point text was scored by raw word overlap against the
//     original's spelling ("stakes" vs "staiks"), flagging honest summaries.
//
// The scorer now works quote-first: groundedness is measured on the
// sourceQuote (contractually verbatim) when present, falling back to the
// point text — and separately, EVERY digit-bearing token in the point text
// must appear in the ground truth, so a fabricated number in the paraphrase
// still gates even when the quote is clean.

/**
 * Tokenize for matching: lowercase, split on everything outside
 * [a-z0-9.,%$], strip LEADING/TRAILING punctuation from each token (interior
 * kept, so 439.18.6 / 3.5 / 14,750 survive as units), keep a token when it
 * is >=4 chars OR carries a digit — numbers are always scored, never
 * length-filtered.
 */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.,%$]+/)
    .map((w) => w.replace(/^[.,%$]+/, "").replace(/[.,%$]+$/, ""))
    .filter((w) => w.length >= 4 || /\d/.test(w));
}

/**
 * Digits-only support check (second wild run, PR #55): the same number is
 * often shaped differently on the page and in the point — "£439. 18. 6" vs
 * "439.18.6", "M115" vs "115". A digit-bearing token is supported when its
 * digits-only form equals a digit run in the reference, or a concatenation of
 * ADJACENT reference digit runs (so 439.18.6 matches the spaced 439 18 6).
 * A genuinely wrong number (149 for 144, 1826 for 1816) still finds no
 * support — the check changes shape tolerance, not teeth.
 */
export function digitSupported(token: string, reference: string): boolean {
  const digits = token.replace(/\D/g, "");
  if (!digits) return false;
  const runs = reference.match(/\d+/g) ?? [];
  for (let i = 0; i < runs.length; i++) {
    let joined = "";
    for (let j = i; j < runs.length; j++) {
      joined += runs[j];
      if (joined === digits) return true;
      if (joined.length >= digits.length) break;
    }
  }
  return false;
}

/** Share of a candidate string's scoreable tokens present in the reference. */
export function groundedness(candidate: string, reference: string): number {
  const ref = new Set(tokens(reference));
  const cand = tokens(candidate);
  if (cand.length === 0) return 1;
  let hit = 0;
  for (const w of cand) {
    if (ref.has(w) || (/\d/.test(w) && digitSupported(w, reference))) hit += 1;
  }
  return hit / cand.length;
}

export type KeyPointScore = {
  /** Quote-first groundedness of the point in the ground truth. */
  grounded: number;
  /** Digit-bearing tokens in the point text that the ground truth lacks. */
  missingNumbers: string[];
  /** True when the point should count as fabricated. */
  fabricated: boolean;
};

/**
 * Score one extracted key point against the page's ground truth. Fabricated
 * when the quote-first groundedness is under 0.7 OR any number in the point
 * text has no support in the truth.
 */
export function scoreKeyPoint(
  point: { text: string; sourceQuote: string | null },
  groundTruth: string,
): KeyPointScore {
  const grounded = groundedness(point.sourceQuote ?? point.text, groundTruth);
  const truth = new Set(tokens(groundTruth));
  const missingNumbers = tokens(point.text).filter(
    (w) => /\d/.test(w) && !truth.has(w) && !digitSupported(w, groundTruth),
  );
  return {
    grounded,
    missingNumbers,
    fabricated: grounded < 0.7 || missingNumbers.length > 0,
  };
}
