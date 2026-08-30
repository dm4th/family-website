# Trust taxonomy — proposal eval (PRD 40 slice 2)

Answers two questions before the Organize button touches the real corpus:

1. **First run** — cold corpus in, is the proposed organization sane?
2. **Re-run** — approved structure + new documents in, does the proposal
   **extend** the taxonomy instead of reshuffling it? This is the behavior
   that matters most over time: Dad adds thirty documents next spring and the
   family's approved categories must not churn.

Run it before the first real "Propose an Organization" press, and re-run it
before changing `TRUST_TAXONOMY_MODEL` or the prompt in
`src/lib/trust/taxonomy.ts`.

## The corpus is entirely invented

`corpus.ts` describes the fictional **Birchwater Family Trust** — every name,
date, parcel and dollar figure is made up (the PRD 37 fixture rule: real
content never enters the repo). It is shaped like a real trust folder anyway:
governing instruments, 1041s and a K-1, deeds and title insurance, an
investment policy statement, and two deliberately awkward fits (a dock-repair
invoice, a letter of wishes) that are scored as acceptable wherever they land,
because forcing a confident answer there is exactly the failure we don't want.

## What gates and what doesn't

| Check | Gates? | Why |
|---|---|---|
| Structural invariants (every document accounted for once, no empty or duplicate categories, no invented ids, 2–8 categories) | **Yes** | These break the review screen's whole-register promise. The parser enforces most of them; the eval proves the parser + model together hold. |
| Re-run preservation (existing categories kept, not renamed, ≤1 already-placed document moved) | **Yes** | Reshuffling an approved taxonomy destroys the family's mental map. |
| Theme placement (each unambiguous document lands in a category whose name matches its expected themes) | No — reported | A miss costs the manager one dropdown selection in the review screen. Judge the pattern by eye; a systematic miss means the prompt needs work. |

## Running it

```bash
npx tsx --env-file=.env.local evals/trust-taxonomy/eval.mts
```

Needs `ANTHROPIC_API_KEY` in `.env.local` (same as the intake evals — this
does not run from environments without the key). Touches no database. Three
paired first-run + re-run calls; roughly $0.15 at the Sonnet 5 default.

Record each dated run in a `results-YYYY-MM-DD.md` beside this file, the
intake convention.

## Results

_None recorded yet — the eval was authored in the slice 2 build session,
which had no API key. Run it before the first real Organize press._
