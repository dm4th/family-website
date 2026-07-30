# Note-intent eval — 2026-07-30

Run against `claude-haiku-4-5` (the shipped default). 30 extractions: five
documents × three photo conditions × two runs. Mean **$0.0041** and **4.4s** per
note, which is the same cost and latency as slice 1's bill reading.

Question being answered: **is the note intent safe to ship?** The model choice
was already settled by [results-2026-07-30.md](results-2026-07-30.md); this asks
whether handwriting, which is the least reliable input this feature accepts, can
be trusted to pre-fill a form.

## The corpus

Four synthetic notes from [make-notes.py](make-notes.py), each with exact ground
truth, plus the 1860 handwritten Gay Head Light repair bill from the slice 1
corpus, read as a note.

| Document | What it tests |
|---|---|
| `note_lakehouse` | mixed note: rules, instructions, and one person with a number |
| `note_winter_cursive` | hard cursive, instructions only, nobody named |
| `note_rules_only` | rules only, no phone, no email, nobody named |
| `note_contacts_list` | three people with three phone numbers |
| `1860_Gay_Head_Light_repair_bill` | genuine 19th-century handwriting, names people, **no phone or email anywhere** |

The synthetic notes are rendered in script fonts, which are more legible than a
real hand. They are an **upper bound** on transcription accuracy, and they are
not what the numbers below are for. What they measure honestly is the part that
doesn't depend on stroke quality: whether a phone number comes back digit-exact,
whether a note with nobody in it produces nobody, and where each line gets filed.
The 1860 bill is the genuine-handwriting sample.

## Results

| check | n | correct | restraint | missed | misrouted | FABRICATED |
|---|---|---|---|---|---|---|
| transcription | 24 | 100% | 0% | 0% | 0% | **0%** |
| guidelines | 30 | 40% | 40% | 0% | 20% | **0%** |
| how_to | 30 | 40% | 40% | 0% | 20% | **0%** |
| contact_phone | 24 | 100% | 0% | 0% | 0% | **0%** |
| contacts_empty | 18 | – | 100% | 0% | 0% | **0%** |

**Zero fabrications in 126 scored fields.** Every expected phone number came back
digit-exact, and no phone number came back that wasn't on the page. Nothing
degraded between `clean`, `phone`, and `poor` — the three conditions score
identically, which says the failure boundary for these documents is past the
worst photo we simulate.

`misrouted` is its own bucket rather than part of `fabricated`, because the two
are not the same event. All twelve misroutes are real lines from the note filed
under the heading we didn't expect:

- "Prop the fridge door open" filed as a guideline rather than a how-to (6×)
- "Ruth has the spare key" filed as a how-to rather than left out (6×)

Both are defensible, and on the second one the model is arguably right and the
ground truth is wrong. They're deterministic across runs. The member sees each
one as editable text in a labelled box and can move or delete it before saving,
so the cost is a moment's judgement, not a bad record.

## Two things this eval caught

**1. The note intent was completely broken.** The first run failed 30/30 with a
400: `output_config.format.schema: For 'array' type, property 'maxItems' is not
supported`. The contact schema has no arrays, so slice 1 never hit this. Without
this eval it would have shipped as a feature that failed on every single upload.
The cap now lives in the description (for the model) and in
`parseNoteExtraction` (for real).

**2. Contacts were being invented off names with no phone number.** On the 1860
bill the model returned confident contacts named "Lieut. Charles N Trumlodge",
"Charles K. Brimblade", and "George J Bellamy" — four different readings of the
same surname across runs, each offered as a record worth saving, off a document
with no way to contact anyone on it. A suggested contact now requires a phone
number or an email, asked for in the prompt and enforced in
`parseNoteExtraction`. That took `contacts_empty` from 33% fabricated to 100%
restraint, and cost nothing: a name you can't ring isn't a contact record.

## The confidence signal doesn't work on this intent

**All 126 fields came back `high`.** Not one `medium`, not one `low` — including
on the 1860 bill while the model was reading the same name four different ways.

After the fixes above none of those confident answers are wrong, so the signal is
uninformative rather than actively misleading. But the review UI cannot lean on
it. A "please check this" flag conditioned on `confidence !== "high"` would never
render, and its absence would read to a member as reassurance we haven't earned.

So on the note review screen the "please check this against the photo" warning is
**unconditional**, and the phone field carries a standing "handwritten numbers
are easy to misread" hint. Confidence is still collected and still flags
individual fields where it fires; it is simply not what the safety of the screen
rests on.

Worth re-testing if the prompt or model changes: this is a property of the
model's calibration on this task, not a permanent fact.

## Running it

```bash
pip3 install pillow
python3 evals/intake/make-notes.py           # writes notes + note-truth.json
for b in note_lakehouse note_winter_cursive note_rules_only note_contacts_list; do
  for c in clean phone poor; do
    python3 evals/intake/degrade.py "/tmp/evalset/clean/$b.jpg" \
      "/tmp/evalset/out/${b}__${c}.jpg" "$c" 77
  done
done
npx tsx --env-file=.env.local evals/intake/eval-notes.mts
```

Calls the real `extractFromDocument` wrapper, so it exercises the shipped prompt
and schema. Touches no database. Roughly $0.12 per full run.
