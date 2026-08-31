# Wild-corpus run — 2026-08-30 (reviewer, Sonnet 5 default)

The first real wild run (PR #55), on four public-domain pages with human
transcriptions from their Wikimedia Commons file pages, all renamed to the
**stress tier** (archival cursive, 1816-1912 — fabrication reported, not
gated):

| page | source | accuracy | flags |
|---|---|---|---|
| `stress-vanwart-1816` | [Van Wart bill of exchange](https://commons.wikimedia.org/wiki/File:Bill_and_Promissory_Note,_each_signed_by_Henry_van_Wart.jpg) (cropped to the transcribed document) | 29/37 | 3 (misread docket years, "Van Mart") |
| `stress-bragg-1857` | [Braggville milk receipt](https://commons.wikimedia.org/wiki/File:ReceiptbraggJune1_1857.JPG) | 10/14 | 1 ("June 11" for June 1) |
| `stress-sayers-1859` | [Tom Sayers fight letter](https://commons.wikimedia.org/wiki/File:Tom_Sayers_1859_Handwritten_Letter.jpg) | 12/15 | 3 (paraphrase drift vs auction transcription) |
| `stress-gilbert-1912` | [Alfred Gilbert testimonial](https://commons.wikimedia.org/wiki/File:Alfred_Gilbert_handwritten_note_re_Francis_Petrus_Paulus--The_Studio_March_1912.jpg) | 78/81 | 0 (and 0 key points — correct restraint on non-trust content) |

**Gated counts: 0 fabricated · 0 restraint violations · 0 forced mappings.**
Forced-mapping restraint held on every run of this corpus (three runs across
the PR #55 iterations), despite finance-soaked vocabulary on three of the
four pages.

The 7 stress flags are real model behavior worth knowing: on very hard
archival cursive, confident misreads of numbers and names appear with
`[unclear]` under-used (1-3 marks per run across four pages). This is why
the tier reports rather than gates — and why the family-photographed
Birchwater corpus in modern hands remains the sole ship gate for the
notebook flow. The product-side mitigation is the review screen showing the
original beside every point.

This run also drove the scorer recalibration recorded in `scoring.ts`
(edge-punctuation normalization, digit tokens always scored, quote-first
groundedness, `digitSupported()` shape-tolerant number matching) — earlier
runs produced 13 false FABRICATED flags from the original tokenizer;
`scoring-check.mts` pins the regression cases.

Still open for a **gating** wild tier: modern-hand pages (GNHK requires a
human-submitted request form) or pages handwritten by non-family friends.

Full transcript: PR #55 review comments.
