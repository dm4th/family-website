# Smart Intake — extraction eval (PRD 32)

Answers one question: **which vision model should read a photographed bill**, given
that a family member reviews every field before anything is saved.

Re-run this before changing `INTAKE_MODEL`.

**There are two evals here.** This one settles the model. The second,
[eval-notes.mts](eval-notes.mts), asks whether slice 2's handwritten-note intent
is safe to ship — different question, different scoring, same wrapper. See
[results-notes-2026-07-30.md](results-notes-2026-07-30.md). Run both after any
change to a prompt, a schema, or the model.

## Why the obvious metric is the wrong one

Overall accuracy doesn't decide this. A field the model leaves **null** costs the
reviewer a few seconds of typing. A field the model fills in with something
plausible and **wrong** is the one that can get saved. So every scored field
lands in one of four buckets:

| Outcome | Meaning | Cost to us |
|---|---|---|
| `correct` | matches the document | none |
| `restraint` | null, and the document genuinely has no such value | none — this is good behaviour |
| `missed` | null, but the document does have a value | small: the member types it |
| `fabricated` | non-null and wrong | **the failure mode that matters** |

Every outcome is also cross-tabbed against the model's own stated confidence, so
we can measure the specific thing that would break the design: *how often does it
say `high` and get it wrong.*

## The corpus

Six documents × four conditions × two runs per model.

**Synthetic** (`make-samples.py`) — three US household bills with exact known
ground truth: an electric co-op, an insurance premium notice, and a municipal
water bill. The water bill prints **no email address**, so the correct answer for
that field is null.

**Real** — three public-domain scans from Wikimedia Commons: a 1972 Italian ENEL
electricity bill, a 1929 Chichester property rates demand, and an 1860
handwritten US lighthouse repair bill. **None of the three carries a phone number
or an email**, which makes them pure fabrication tests: the only correct answer
is null, and any value at all is invented. The 1860 bill is also the only
handwriting sample.

**Conditions** (`degrade.py`) simulate how the photo actually arrives:

| Condition | What it models |
|---|---|
| `clean` | a flatbed scan — 1500px, light JPEG |
| `phone` | a decent handheld photo — keystone, ±2.5° rotation, uneven lighting, mild blur, q62 |
| `poor` | dim room, shaky hands — stronger warp, ±6°, heavy vignette, q34, 900px |
| `brutal` | the failure boundary — 420px, heavy blur, q18 |

`brutal` exists to find where each model breaks rather than to represent a real
upload. Nobody should be photographing bills that badly.

## Running it

```bash
pip3 install pillow          # only dependency; numpy deliberately avoided
python3 evals/intake/make-samples.py
# download the Commons scans into /tmp/evalset/clean/ (see results file for the
# exact File: names), then:
for f in /tmp/evalset/clean/*.jpg; do
  b=$(basename "$f" .jpg)
  for c in clean phone poor brutal; do
    python3 evals/intake/degrade.py "$f" "/tmp/evalset/out/${b}__${c}.jpg" "$c" $RANDOM
  done
done
npx tsx --env-file=.env.local evals/intake/eval.mts
```

Calls the real `extractFromDocument` wrapper, so it exercises the shipped
prompt and schema. Touches no database and writes nothing to Supabase. Costs
roughly $1 per full run.

## Results

See [results-2026-07-30.md](results-2026-07-30.md).

## The dictation eval (PRD 34)

```bash
npx tsx --env-file=.env.local evals/intake/eval-dictation.mts
```

No image pipeline: the input to the `dictation` intent is *text*, because the
phone has already done the speech-to-text. So the corpus is 22 hand-written
transcripts in `dictation-samples.ts` — unpunctuated, full of filler and false
starts — and the eval reads them straight through the shipped
`extractFromDictation`. Under a dollar for a full run (~$0.15).

Sixteen of the twenty-two name nobody reachable and thirteen name no day, on
purpose: invention is only measurable on inputs whose correct answer is
"nothing". Results in
[results-dictation-2026-07-31.md](results-dictation-2026-07-31.md).

## The paste eval (PRD 37)

```bash
npx tsx evals/intake/paste-parser-check.mts            # free, no API key
npx tsx --env-file=.env.local evals/intake/eval-paste.mts   # ~$0.17 a run
```

Text again, like dictation, but a different risk. A pasted house manual is the
first input that routinely contains **things that must not be published**: the
family's real document has three plaintext utility logins in it, and the page it
would be saved onto is readable by property guests.

So this eval has a **gated metric**: every secret planted in a fixture must be
absent from every proposal, in every run. One survivor exits non-zero. The other
outcomes (fabrication, restraint, preservation, routing) are scored the same way
as the other evals; contact `kind` accuracy is recorded but never gated, because
a plumber filed under the wrong panel is a one-click fix rather than a wrong
fact.

Sixteen samples in `paste-samples.ts`, weighted toward restraint: several name
no date, no network, or nobody reachable. **Every credential, phone number,
email, and network key in them is invented.** The lead fixture matches the
*shape* of the family's real document — section order, `●`/`○` bullets, logins
sharing a line with account numbers — and none of its content. The real document
is not in this repo and must not be.

`paste-parser-check.mts` is the other half, and it needs no API key: it feeds
`parsePasteExtraction` hand-written hostile responses (a password smuggled into
a tidied paragraph, a credential hidden in an advisory hint, a date resolved
from "they bill in April") and asserts the parser removes them whatever the
model did. Run it on every change to the redactor; run the full eval before
changing the paste prompt or the model.

Both caught real bugs on their first run. The parser check found the Wi-Fi
exception failing on "Wi-Fi Password:" (the hyphen kept the qualifier out of the
match) and "alarm code" missing from the credential labels. The eval found an
all-lowercase username surviving into a tidied document, and "they bill in
April" becoming 1 April — which is why a paste reminder must now quote the words
it read the day from. Results in
[results-paste-2026-08-01.md](results-paste-2026-08-01.md).
