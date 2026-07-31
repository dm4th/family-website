# Calendar intent — eval results (2026-07-30)

**Question:** is it safe to let Smart Intake put dates on the family's calendar?

**Corpus:** 6 synthetic documents ([make-bills-dated.py](make-bills-dated.py)) × 3
photo qualities (clean / photo / poor) × 2 runs = **36 extractions**, model
`claude-haiku-4-5`. Ground truth is emitted by the generator itself, so the
answer key can't drift from the page.

**Cost:** $0.1203 total, **~$0.0033 per document**, median **3.4s**. In line with
the contact intent, and cheap enough that the "also check this bill for a due
date" re-read costs a third of a cent.

## Why these six documents

Reading a clearly printed due date is the easy case and doesn't decide anything.
Each document provokes a specific failure:

| Document | What it tests |
|---|---|
| `cal_electric` | a clean due date with **nothing** saying it repeats → recurrence restraint |
| `cal_insurance` | "Annual premium", stated → a repeat the document really claims |
| `cal_water` | "Quarterly", stated → same, different cadence |
| `cal_receipt` | a **paid** statement: no deadline at all → the right answer is nothing |
| `cal_noyear` | due printed as `08/14`, year only in the statement date elsewhere |
| `cal_taxbill` | two installment dates on one notice → both must be found |

## Headline

| Bucket | n | % of date rows |
|---|---|---|
| correct | 35 | 81% |
| restraint | 6 | 14% |
| missed | 1 | 2% |
| **fabricated** | **1** | **2%** |

Both installment dates on the tax bill were found in all six runs. Restraint was
perfect: the paid receipt produced **zero** reminders in all six runs, at every
photo quality. That is PRD 32's "no due date found → no event offered", measured
rather than asserted.

## The one fabrication, and what it changed

`cal_noyear`, poor quality, run 1: returned **2025**-08-14 where the page means
2026-08-14. The invoice prints `Due: 08/14` and carries the year only in the
statement date (July 18, 2026); at "poor" quality that line stopped being legible
and the model supplied a year instead of returning null as the prompt instructs.

This is the worst shape a date error can take. The day and month are right, so
the entry reads as correct at a glance, and the year is the one component nobody
re-checks. It is invisible in a way a misread phone number never is.

**Fix shipped:** the review form flags any proposed date that has already passed
("This date has already passed. If the bill only printed the day and month, check
that the year is right."). It is flagged, never dropped or silently corrected —
entering a bill that is genuinely overdue is a real thing a member does.

Note the prompt already forbids guessing a year, and that instruction held in 5
of 6 runs on this document and everywhere else. A prompt is a request; the UI
flag is the guarantee.

## Confidence is informative here — unlike slice 2

| Confidence | rows | wrong |
|---|---|---|
| high | 36 | **0** |
| medium | 7 | 2 |

Every error landed on a "medium" row, and all 36 "high" rows were right. This is
the opposite of the slice 2 finding, where the model answered "high" on all 126
handwriting fields including on a document it read four different ways. So on
this intent the review form's confidence-gated wording is meaningful rather than
decorative, and it's kept.

Re-check this whenever the prompt or model changes. The two intents behave
differently enough that neither result transfers to the other.

## Recurrence overreach (3 rows, all the tax bill)

The property-tax notice was labelled "annually" three times, on a page that never
says it repeats. That's real-world true and textually unsupported — exactly the
inference the prompt forbids ("a water bill merely looking like a water bill is
not evidence").

Left as-is, deliberately. The harm is bounded: the review form states the
proposed repeat in words and tells the member how to drop it, and a wrong repeat
is one click to fix before anything is saved. Tightening the prompt further
against a single synthetic document risks making the model refuse the repeats it
gets right (insurance and water were both correct in all six runs).

## Amounts (2 rows)

The tax bill at poor quality reported `$4,326.00` (the total tax, printed on the
page) where truth expected the `$2,163.00` per-installment figure. The scoring is
strict here and the read is defensible — both numbers are on the document. The
amount lands in the reminder's free-text notes, not a money column, so nothing
computes on it.

## Verdict

Safe to ship. Restraint is perfect, both multi-date cases were found every time,
the single fabrication is a known class with a shipped mitigation, and confidence
is a usable signal on this intent.
