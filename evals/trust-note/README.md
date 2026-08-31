# Trust notebook — handwriting eval (PRD 40 slice 3)

**This is the ship gate for the notebook flow.** The intake eval's
handwriting evidence rested on a single 1860 document and said so; this
feature's entire input is handwriting, so it does not ship into real use
until this eval passes on real handwriting. It also cannot be fully
synthesized: the photos must be handwritten and photographed by a person.

## The protocol (the one step only the family can do)

1. Open [corpus.ts](corpus.ts). For each of the seven entries, **handwrite
   the `groundTruth` text on paper, verbatim** — real pen, real paper,
   natural speed. The texts are entirely invented (the fictional Birchwater
   Family Trust); nothing real is ever written down. Honor the per-page
   probes: print for `note-01`, cursive for `note-02`, hurried writing for
   `note-05`, an actual crossed-out word in `note-03`, a margin note in
   `note-06`, ordinary handwriting for `note-07`.
2. **Photograph each page the way Dad actually would** — handheld phone
   photo, ordinary room light. No flatbed-perfect scans; the pipeline must
   work on realistic input.
3. Save as `<id>.jpg` (or `.png`) in one directory.
4. **Ideally, have Dad handwrite at least two of the pages.** The notebook is
   in his hand; an eval that never saw it is measuring the wrong writer.
   Re-run with more of his pages before trusting the real notebook if the
   first corpus was mostly someone else's writing.

## The wild corpus: strangers' handwriting (optional, recommended)

The Birchwater pages are written by family members, which risks writer bias
in the other direction: an eval that only ever sees the household's hands.
The harness also scores an optional **`wild/` subdirectory** of the corpus —
handwriting by people nobody here knows, from openly licensed sources that
pair images with vetted transcriptions:

- **GNHK — GoodNotes Handwriting Kollection** ([goodnotes.com/gnhk](https://goodnotes.com/gnhk),
  [github.com/GoodNotes/GNHK-dataset](https://github.com/GoodNotes/GNHK-dataset),
  **CC-BY-4.0**): camera-captured modern English handwriting from many
  writers worldwide — notes, lists, the exact shape of a notebook photo.
  Download the set, pick 3–5 varied pages, and build each ground-truth `.txt`
  from the dataset's own annotations.
- **Library of Congress — By the People** ([crowd.loc.gov](https://crowd.loc.gov),
  **public domain**, transcriptions included): digitized letters and papers
  with completed, reviewed transcriptions downloadable per image. Historical
  cursive — deliberately harder than Dad's hand, so treat it as a stress
  extension, not a representative sample.

Setup: for each chosen page save `wild/<id>.jpg` (or `.png`/`.webp`) plus
`wild/<id>.txt` holding its transcription, in the same corpus directory. The
harness picks them up automatically and skips the section cleanly when the
directory is absent.

Wild pages score: transcription accuracy (reported), **fabrication (gates —
same zero rule)**, and **forced mappings (gates)** — wild content is by
construction unrelated to the fixture documents, so any proposed link at all
is a forced mapping. Expected-point recall isn't scored (the pages weren't
written to contain trust facts), and extracted points are fine as long as
they're grounded.

Both halves matter and neither replaces the other: the wild corpus removes
writer bias; the pages in Dad's hand keep the eval representative of the one
notebook this feature will actually read.

## Running it

```bash
TRUST_NOTE_CORPUS=/path/to/photos npx tsx --env-file=.env.local evals/trust-note/eval.mts
```

Needs `ANTHROPIC_API_KEY` in `.env.local`. Calls the shipped
`readTrustScan` / `proposeScanMappings` wrappers; touches no database.
Seven read calls + up to six mapping calls per run; low single-digit
dollars at the Sonnet 5 default.

## What gates and what doesn't

| Check | Gates? | Why |
|---|---|---|
| **Fabricated points** — a key point whose words aren't in the ground truth (scored against ground truth, so OCR hallucinations that feed points count too) | **Yes — zero tolerated** | A plausible invented "fact" about a trust is the failure shape that survives a human skim. This is the metric every intake eval existed to hold at zero. |
| **Restraint** — the no-trust-content page (`note-04`) must yield zero points | **Yes** | The reader must know when there is nothing to say. |
| **Forced mappings** — a link to any document outside a page's planted + allowed set (calibrated per the PR #54 review: `note-02` names the restatement outright, `note-06` may defensibly touch it, and `note-07` exists so the gate has content that matches nothing) | **Yes** | A manager will be asked to approve every link; a confident wrong link is worse than none — but a gate that punishes correct reading would invite weakening the real feature to satisfy it. |
| Transcription accuracy + `[unclear]` usage | Reported | Judge by eye: a low score with honest `[unclear]` marks is workable (the review screen shows the original); a high score achieved by guessing is not — cross-check misread words against the fabrication lines. |
| Expected-point recall + planted-reference mapping | Reported | A miss costs the manager reading the transcription themselves; systematic misses mean the prompt needs work. |

Re-run before changing `TRUST_NOTE_MODEL` or either prompt in
`src/lib/trust/notebook.ts`. Record each dated run in a
`results-YYYY-MM-DD.md` beside this file (intake convention).

## Results

_None recorded yet. The corpus requires photographed handwriting the build
session could not produce, and the session had no API key. **The notebook
flow is not cleared for the real notebook until a run passes here** — the
UI works, but its readings should be treated as untested until then._
