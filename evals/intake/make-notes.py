#!/usr/bin/env python3
"""Generate handwritten-style property notes for the slice 2 (note intent) eval.

Why synthetic notes at all, when real handwriting is the thing we're worried
about? Because ground truth has to be exact. A real scanned note tells us
whether the read *looks* plausible; a note we wrote tells us whether the phone
number came back digit-for-digit, whether a rules line landed in guidelines
instead of how-to, and whether a note with nobody in it produced nobody.

These are rendered in script fonts with per-line baseline and rotation jitter,
which is easier to read than genuine handwriting. So treat the numbers here as
an UPPER bound on real-world accuracy, and read them alongside the real
handwritten scans in the corpus (see README). What they measure well is the
thing that doesn't depend on stroke quality: routing, restraint, and whether an
unreadable value comes back null instead of invented.

Usage: python3 evals/intake/make-notes.py [outdir]   (default /tmp/evalset/clean)
"""

import json
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = {
    "print": "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf",
    "cursive": "/System/Library/Fonts/Supplemental/SnellRoundhand.ttc",
    "chalk": "/System/Library/Fonts/Supplemental/Chalkduster.ttf",
    "brush": "/System/Library/Fonts/Supplemental/Brush Script.ttf",
}

PAPER = (250, 247, 238)
INK = (28, 34, 62)

NOTES = {
    # Mixed note: rules, operating instructions, and one person with a number.
    "note_lakehouse": (
        "print",
        [
            "Loon-A-See - things to know",
            "",
            "Water shut off is at the road, green lid.",
            "Turn it off if you're the last one out in fall.",
            "Gate code is 4417, keypad round the back.",
            "",
            "No shoes upstairs please.",
            "Strip the beds before you leave.",
            "",
            "Plumber - Jim Farrow  207-555-0143",
        ],
    ),
    # Hard cursive, operating instructions only, no people named.
    "note_winter_cursive": (
        "cursive",
        [
            "Closing up for winter",
            "",
            "Drain the pipes, valve in the crawlspace.",
            "Leave the heat on 50 degrees, not off.",
            "Breaker for the dock lights is in the shed.",
            "Prop the fridge door open.",
        ],
    ),
    # Rules only. No phone, no email, nobody named: pure restraint test.
    "note_rules_only": (
        "chalk",
        [
            "House rules",
            "",
            "Quiet after 10.",
            "Dogs off the furniture.",
            "Take your rubbish to the transfer station,",
            "we don't have collection out here.",
            "Last one out locks the boathouse.",
        ],
    ),
    # Several people with numbers: multiple contacts, digit accuracy.
    "note_contacts_list": (
        "brush",
        [
            "Numbers for the cottage",
            "",
            "Caretaker - Ruth Mabry  207-555-0198",
            "Snow plow - Cyr & Sons  207-555-0267",
            "Electrician - Dale  207-555-0311",
            "",
            "Ruth has the spare key.",
        ],
    ),
}

# What we expect back, checked by eval-notes.mts. Kept here so the document and
# its ground truth can't drift apart.
TRUTH = {
    "note_lakehouse": {
        "transcription_must_contain": ["4417", "shut off", "shoes"],
        "guidelines_must_contain": ["shoes"],
        "howto_must_contain": ["4417"],
        "contact_phones": ["2075550143"],
    },
    "note_winter_cursive": {
        "transcription_must_contain": ["drain", "50"],
        "guidelines_must_contain": None,
        "howto_must_contain": ["crawlspace"],
        "contact_phones": [],
    },
    "note_rules_only": {
        "transcription_must_contain": ["quiet", "boathouse"],
        "guidelines_must_contain": ["quiet"],
        "howto_must_contain": None,
        "contact_phones": [],
    },
    "note_contacts_list": {
        "transcription_must_contain": ["ruth", "plow"],
        "guidelines_must_contain": None,
        "howto_must_contain": None,
        "contact_phones": ["2075550198", "2075550267", "2075550311"],
    },
}

W, H = 1500, 1900


def render(name, font_key, lines, outdir, seed):
    rng = random.Random(seed)
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)

    # Faint rules first, so the writing sits on top of them the way it would on
    # a legal pad.
    for gy in range(150, H, 96):
        draw.line([(110, gy), (W - 110, gy)], fill=(226, 224, 212), width=2)

    path = FONTS[font_key]
    size = 62 if font_key != "chalk" else 54
    try:
        font = ImageFont.truetype(path, size)
    except OSError:
        # .ttc collections sometimes need an explicit face index.
        font = ImageFont.truetype(path, size, index=0)

    y = 150
    for line in lines:
        if not line:
            y += 46
            continue
        # Per-line jitter: a hand doesn't start every line at the same x, and
        # baselines drift. Rendered onto a transparent strip so each line can be
        # rotated a little independently.
        strip = Image.new("RGBA", (W, size * 2), (0, 0, 0, 0))
        ImageDraw.Draw(strip).text((0, 0), line, font=font, fill=INK + (255,))
        strip = strip.rotate(
            rng.uniform(-0.9, 0.9), resample=Image.BICUBIC, expand=False
        )
        img.paste(strip, (140 + rng.randint(-12, 12), y), strip)
        y += int(size * 1.55) + rng.randint(-4, 4)

    img = img.crop((0, 0, W, min(H, y + 140)))
    out = os.path.join(outdir, f"{name}.jpg")
    img.save(out, "JPEG", quality=94)
    print(out)


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "/tmp/evalset/clean"
    os.makedirs(outdir, exist_ok=True)
    for i, (name, (font_key, lines)) in enumerate(NOTES.items()):
        render(name, font_key, lines, outdir, seed=4100 + i)

    # The eval reads its ground truth from here rather than keeping a second
    # copy, so the note text and what we expect back can't drift apart.
    truth_path = os.path.join(outdir, "note-truth.json")
    with open(truth_path, "w") as fh:
        json.dump(TRUTH, fh, indent=1)
    print(truth_path)


if __name__ == "__main__":
    main()
