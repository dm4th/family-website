# Smart Intake — extraction eval (PRD 32)

Answers one question: **which vision model should read a photographed bill**, given
that a family member reviews every field before anything is saved.

Re-run this before changing `INTAKE_MODEL`, and again when slice 2 (handwritten
notes) lands — the handwriting evidence here rests on a single document and is
the weakest part of the corpus.

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

Calls the real `extractContactFromDocument` wrapper, so it exercises the shipped
prompt and schema. Touches no database and writes nothing to Supabase. Costs
roughly $1 per full run.

## Results

See [results-2026-07-30.md](results-2026-07-30.md).
