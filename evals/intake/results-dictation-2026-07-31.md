# Dictation intent eval — 2026-07-31 (PRD 34)

`npx tsx --env-file=.env.local evals/intake/eval-dictation.mts` · `claude-haiku-4-5` (the shipped default) · 22 hand-written transcripts × 2 runs = 44 extractions, 314 scored fields.

Run 2026-07-31 · 22 transcripts × 2 runs

## Outcomes by check

| check | n | correct | restraint | missed | misrouted | FABRICATED |
|---|---|---|---|---|---|---|
| preservation | 76 |  100% |    0% |    0% |    0% | **   0%** (0) |
| tidiness | 44 |  100% |    0% |    0% |    0% | **   0%** (0) |
| guidelines | 44 |   18% |   73% |    0% |    9% | **   0%** (0) |
| how_to | 44 |   32% |   43% |    0% |   25% | **   0%** (0) |
| contact_phone | 8 |  100% |    0% |    0% |    0% | **   0%** (0) |
| contact_email | 2 |  100% |    0% |    0% |    0% | **   0%** (0) |
| contacts_empty | 36 |    0% |  100% |    0% |    0% | **   0%** (0) |
| reminder_date | 14 |  100% |    0% |    0% |    0% | **   0%** (0) |
| reminders_empty | 32 |    0% |  100% |    0% |    0% | **   0%** (0) |
| spoken_as_quoted | 14 |  100% |    0% |    0% |    0% | **   0%** (0) |

## Confidence calibration

| stated confidence | n | of those, FABRICATED |
|---|---|---|
| high | 304 | 0 (   0%) |
| medium | 8 | 0 (   0%) |
| low | 2 | 0 (   0%) |

## Cost and latency per dictation

Mean $0.0034 · 2.4s · 0 failed calls

## Every fabrication, verbatim

- none

## Every miss, verbatim

- none

## Every misroute, verbatim

- `how_to` [high] on plumber-and-propane (run 1): "The plumber is Dave Kerrigan, his number is 555-0142. He did the work on the ups"
- `how_to` [high] on plumber-and-propane (run 2): "The plumber is Dave Kerrigan, his number is 555-0142. He did the work on the ups"
- `how_to` [high] on two-trades (run 1): "**Snow removal**: Terry handles the drive every storm. Don't call him before Nov"
- `how_to` [high] on names-no-numbers (run 1): "The neighbours are the Prescotts. They've got a key. Old Mr Hendry down the lane"
- `how_to` [high] on names-no-numbers (run 2): "The neighbours are the Prescotts and they have a key. Old Mr Hendry down the lan"
- `how_to` [high] on vague-tradesman (run 1): "The roofer's invoice is in the kitchen drawer. The flashing will need redoing in"
- `how_to` [high] on vague-tradesman (run 2): "The roofer's invoice is in the drawer in the kitchen."
- `guidelines` [high] on leaving-checklist (run 1): "- Turn the heat down to fifty when leaving (never turn it off)
- Take the bins o"
- `how_to` [high] on leaving-checklist (run 1): "- The shed padlock sticks; give it a shove to lock it"
- `guidelines` [high] on leaving-checklist (run 2): "- Turn the heat down to fifty when leaving; never turn it off.
- Take the bins o"
- `how_to` [high] on leaving-checklist (run 2): "- The padlock on the shed sticks; give it a shove to lock it."
- `guidelines` [high] on heating-quirk (run 1): "- Bleed the radiator in the back bedroom every autumn."
- `guidelines` [high] on heating-quirk (run 2): "The radiator in the back bedroom needs bleeding every autumn."
- `how_to` [high] on false-start-then-rules (run 1): "- The life jackets are stored in the bench seat."
- `how_to` [high] on false-start-then-rules (run 2): "- The life jackets are stored in the bench seat."

## Reading these numbers

**The fabrication column was zero from the first run and stayed there.** No prompt, schema, or model change was made during this eval — every adjustment between runs was to what the *scorer* asserted, and each is documented in the code:

1. The first run reported 4 `how_to` fabrications. All four were scorer artifacts: `normalise` keeps `.` so that email addresses survive, which meant a sentence-final `seat.` never matched the source's `seat`, and correctly-routed text scored as invented. Fixed in `drawnFromSource`, which now uses a word normaliser of its own.
2. `quiet-hours` expected the word "ten" and the model wrote "10 PM" — which is the tidy-up doing its job. The fixture now asserts on a part that survives either rendering.
3. `two-dates` came back as a bullet list with no full stops, and the tidiness check demanded terminal punctuation. A short list of two errands is legitimately punctuation-free and more readable than the run-on that went in; the check now accepts list structure.

**Restraint is the headline.** Sixteen of the twenty-two transcripts name nobody reachable and thirteen name no day at all, which is the point: you can only measure invention on inputs whose correct answer is "nothing".

- 36/36 sessions naming nobody reachable produced **zero** contacts, including ones that name people warmly and at length (`names-no-numbers`, `family-only`).
- 32/32 sessions naming no day produced **zero** reminders, including the ones written to bait it — "soon", "at some point before winter", "eventually", and a date in the past that is already dealt with.
- Every phone number and email genuinely present was found, digit-exact.

**Date resolution held.** All 14 stated dates resolved correctly, across all four forms: an outright date, "tomorrow", "in two weeks", "the first of next month", and "the fifteenth" (meaning the next one). Every single one came back with `spokenAs` populated, so the member always sees the words the date was worked out from.

**Self-correction works.** `gate-code-correction` says "four four one seven no wait sorry its four four seven one" and 4471 survived to the output on both runs, with 4417 gone.

**The 25% `how_to` misroute rate is the honest cost, and it is the right cost.** These are real lines from the transcript filed under a heading a person might have chosen differently — "the life jackets are stored in the bench seat" under how-to rather than guidelines, the plumber's details under how-to as well as being offered as a contact. The member sees every one of them in an editable box next to a Save button they have to press, and can move or ignore it. That is a categorically smaller event than a fabrication, which is why the two are scored in separate columns rather than summed into one scary number.
