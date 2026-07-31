"""Synthetic bills for the CALENDAR intent (PRD 32, slice 3).

Slice 1's make-samples.py already produces bills with due dates, and those are
reused. These six are different: each one is built to provoke a specific way the
date extraction can go wrong, because "reads a clearly printed due date" is the
easy case and not the one that decides whether this is safe to ship.

  cal_electric      a clean due date, and NOTHING that says it repeats
                    -> tests recurrence restraint, the most likely overreach
  cal_insurance     "Annual premium", due date printed
                    -> a repeat the document actually states
  cal_water         "Quarterly", due date printed
                    -> ditto, at a different cadence
  cal_receipt       a PAID receipt: statement date, payment received, NO due date
                    -> tests restraint. The right answer is nothing at all.
  cal_noyear        due printed as "08/14" with the year only on the statement
                    date elsewhere on the page
                    -> tests whether the year is inferred or invented
  cal_taxbill       two installment due dates on one notice
                    -> tests that both are found, not just the first

Ground truth is emitted alongside as cal-truth.json, generated from the same
dicts that draw the page, so the answer key cannot drift from the document.
"""

from PIL import Image, ImageDraw, ImageFont
import json
import os

W, H = 1700, 2200
FONTS = "/System/Library/Fonts/Supplemental/"


def f(name, size):
    for c in [FONTS + name, "/System/Library/Fonts/" + name]:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


# `due` is what the page shows; `truth_dates` is the answer key in ISO form.
# `truth_recurrence` is what the document ITSELF states, not what the charge
# probably does in real life — that distinction is the whole point of the
# restraint test.
BILLS = [
    dict(
        id="cal_electric",
        vendor="LAKESIDE ELECTRIC COOPERATIVE",
        sub="Member-Owned Since 1938",
        kind="ELECTRIC SERVICE STATEMENT",
        rows=[
            ("Account", "LEC-8842-77103"),
            ("Billing period", "May 3, 2026 - June 2, 2026"),
            ("Amount due", "$213.46"),
            ("Payment due by", "June 27, 2026"),
        ],
        svc=["Loon-A-See Camp", "418 Loon Lake Road", "Rangeley, ME 04970"],
        footer="Questions? Call (207) 555-0184.",
        truth_dates=["2026-06-27"],
        truth_amounts=["$213.46"],
        truth_recurrence=["none"],
    ),
    dict(
        id="cal_insurance",
        vendor="GRANITE MUTUAL INSURANCE",
        sub="Property & Casualty",
        kind="ANNUAL PREMIUM NOTICE",
        rows=[
            ("Policy", "HO-3319845"),
            ("Coverage term", "Annual premium 2026-2027"),
            ("Amount due", "$1,847.00"),
            ("Payment due by", "August 15, 2026"),
            ("Renews", "Annually on August 15"),
        ],
        svc=["Insured Location", "22 Birch Hollow Lane", "Bethel, ME 04217"],
        footer="This premium renews annually. Call 1-800-555-2291 to change coverage.",
        truth_dates=["2026-08-15"],
        truth_amounts=["$1,847.00"],
        truth_recurrence=["annually"],
    ),
    dict(
        id="cal_water",
        vendor="TOWN OF RANGELEY WATER DISTRICT",
        sub="Municipal Utility",
        kind="QUARTERLY WATER BILL",
        rows=[
            ("Account", "4471-B"),
            ("Billing period", "Quarter ending June 30, 2026"),
            ("Amount due", "$96.20"),
            ("Payment due by", "July 20, 2026"),
            ("Billed", "Quarterly"),
        ],
        svc=["Service Address", "418 Loon Lake Road", "Rangeley, ME 04970"],
        footer="Bills are issued quarterly. Late payments accrue 1.5% monthly.",
        truth_dates=["2026-07-20"],
        truth_amounts=["$96.20"],
        truth_recurrence=["quarterly"],
    ),
    dict(
        id="cal_receipt",
        vendor="LAKESIDE ELECTRIC COOPERATIVE",
        sub="Member-Owned Since 1938",
        kind="STATEMENT OF ACCOUNT - PAID",
        rows=[
            ("Account", "LEC-8842-77103"),
            ("Statement date", "June 30, 2026"),
            ("Payment received", "June 24, 2026"),
            ("Amount received", "$213.46"),
            ("Balance", "$0.00"),
        ],
        svc=["Loon-A-See Camp", "418 Loon Lake Road", "Rangeley, ME 04970"],
        footer="No payment is due. Thank you for your payment.",
        truth_dates=[],
        truth_amounts=[],
        truth_recurrence=[],
    ),
    dict(
        id="cal_noyear",
        vendor="BETHEL SEPTIC & DRAIN",
        sub="Service Since 1974",
        kind="SERVICE INVOICE",
        rows=[
            ("Invoice", "SD-20411"),
            ("Statement date", "July 18, 2026"),
            ("Work performed", "Tank pump-out and inspection"),
            ("Amount due", "$385.00"),
            ("Due", "08/14"),
        ],
        svc=["Service Address", "22 Birch Hollow Lane", "Bethel, ME 04217"],
        footer="Payment due 30 days from statement date.",
        truth_dates=["2026-08-14"],
        truth_amounts=["$385.00"],
        truth_recurrence=["none"],
    ),
    dict(
        id="cal_taxbill",
        vendor="TOWN OF RANGELEY",
        sub="Office of the Tax Collector",
        kind="REAL ESTATE TAX BILL 2026",
        rows=[
            ("Map / Lot", "R7-114"),
            ("Assessed value", "$412,000"),
            ("Total tax", "$4,326.00"),
            ("First installment due", "September 15, 2026"),
            ("Second installment due", "March 15, 2027"),
        ],
        svc=["Property", "418 Loon Lake Road", "Rangeley, ME 04970"],
        footer="Each installment is $2,163.00. Interest accrues after each due date.",
        truth_dates=["2026-09-15", "2027-03-15"],
        truth_amounts=["$2,163.00", "$2,163.00"],
        truth_recurrence=["none", "none"],
    ),
]


def draw(b):
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 240], fill=(238, 240, 236))
    d.text((70, 60), b["vendor"], font=f("Helvetica.ttc", 54), fill=(20, 30, 25))
    d.text((70, 140), b["sub"], font=f("Helvetica.ttc", 32), fill=(90, 95, 90))
    d.line([60, 270, W - 60, 270], fill=(60, 60, 60), width=3)
    d.text((70, 300), b["kind"], font=f("Helvetica.ttc", 40), fill=(20, 20, 20))

    y = 420
    for label, val in b["rows"]:
        d.text((70, y), label, font=f("Helvetica.ttc", 30), fill=(110, 110, 110))
        d.text((720, y), val, font=f("Helvetica.ttc", 34), fill=(10, 10, 10))
        y += 72

    y += 60
    d.line([60, y, W - 60, y], fill=(180, 180, 180), width=2)
    y += 40
    for line in b["svc"]:
        d.text((70, y), line, font=f("Helvetica.ttc", 30), fill=(40, 40, 40))
        y += 46

    d.text((70, H - 200), b["footer"], font=f("Helvetica.ttc", 28), fill=(90, 90, 90))
    img.save(f"{b['id']}.jpg", quality=92)


truth = {}
for b in BILLS:
    draw(b)
    truth[b["id"]] = {
        "dates": b["truth_dates"],
        "amounts": b["truth_amounts"],
        "recurrence": b["truth_recurrence"],
    }
    print(f"wrote {b['id']}.jpg  dates={b['truth_dates'] or 'NONE (restraint)'}")

with open("cal-truth.json", "w") as fh:
    json.dump(truth, fh, indent=2)
print("wrote cal-truth.json")
