from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1700, 2200
FONTS = "/System/Library/Fonts/Supplemental/"
def f(name, size):
    for c in [FONTS+name, "/System/Library/Fonts/"+name]:
        if os.path.exists(c): return ImageFont.truetype(c, size)
    return ImageFont.load_default()

BILLS = [
  dict(id="synth_electric", vendor="LAKESIDE ELECTRIC COOPERATIVE",
       sub="Member-Owned Since 1938", addr_v="PO Box 4120, Augusta, ME 04332",
       phone="(207) 555-0184", email="service@lakesideelectric.com",
       acct="LEC-8842-77103", period="May 3, 2026 - June 2, 2026",
       amount="$213.46", due="June 27, 2026",
       svc=["Loon-A-See Camp", "418 Loon Lake Road", "Rangeley, ME 04970"],
       kind="ELECTRIC SERVICE STATEMENT"),
  dict(id="synth_insurance", vendor="GRANITE MUTUAL INSURANCE",
       sub="Property & Casualty", addr_v="One Granite Plaza, Concord, NH 03301",
       phone="1-800-555-2291", email="claims@granitemutual.com",
       acct="Policy HO-3319845", period="Annual premium 2026-2027",
       amount="$1,847.00", due="August 15, 2026",
       svc=["Insured Location", "22 Birch Hollow Lane", "Bethel, ME 04217"],
       kind="ANNUAL PREMIUM NOTICE"),
  dict(id="synth_water", vendor="TOWN OF RANGELEY WATER DISTRICT",
       sub="Municipal Utility", addr_v="15 School Street, Rangeley, ME 04970",
       phone="207-555-0110", email="",
       acct="Account 4471-B", period="Quarter ending June 30, 2026",
       amount="$96.20", due="July 20, 2026",
       svc=["Service Address", "418 Loon Lake Road", "Rangeley, ME 04970"],
       kind="QUARTERLY WATER BILL"),
]

for b in BILLS:
    img = Image.new("RGB", (W, H), "white"); d = ImageDraw.Draw(img)
    d.rectangle([0,0,W,240], fill=(238,240,236))
    d.text((70,60), b["vendor"], font=f("Helvetica.ttc", 58), fill=(20,30,25))
    d.text((70,140), b["sub"], font=f("Helvetica.ttc", 32), fill=(90,95,90))
    d.text((70,185), b["addr_v"], font=f("Helvetica.ttc", 28), fill=(90,95,90))
    d.line([60,270,W-60,270], fill=(60,60,60), width=3)
    d.text((70,300), b["kind"], font=f("Helvetica.ttc", 40), fill=(20,20,20))

    y = 400
    for label, val in [("Account", b["acct"]), ("Billing period", b["period"]),
                       ("Amount due", b["amount"]), ("Payment due by", b["due"])]:
        d.text((70,y), label, font=f("Helvetica.ttc", 30), fill=(110,110,110))
        d.text((620,y), val, font=f("Helvetica.ttc", 34), fill=(10,10,10)); y += 70

    y += 40
    d.rectangle([60,y,W-60,y+230], outline=(140,140,140), width=2)
    d.text((90,y+25), "SERVICE ADDRESS", font=f("Helvetica.ttc", 26), fill=(110,110,110))
    yy = y+70
    for line in b["svc"]:
        d.text((90,yy), line, font=f("Helvetica.ttc", 34), fill=(10,10,10)); yy += 48

    y += 300
    d.text((70,y), "Customer service: " + b["phone"], font=f("Helvetica.ttc", 32), fill=(10,10,10)); y += 55
    if b["email"]:
        d.text((70,y), "Billing questions: " + b["email"], font=f("Helvetica.ttc", 32), fill=(10,10,10)); y += 55
    y += 40
    d.line([60,y,W-60,y], fill=(180,180,180), width=2); y += 40
    for line in ["Previous balance .................. $0.00",
                 "Current charges ................ " + b["amount"],
                 "TOTAL DUE ...................... " + b["amount"]]:
        d.text((70,y), line, font=f("Courier.ttc", 34), fill=(10,10,10)); y += 52
    d.text((70,H-120), "Please remit payment to the address above. Do not send cash.",
           font=f("Helvetica.ttc", 26), fill=(120,120,120))
    img.save("/tmp/evalset/clean/%s.jpg" % b["id"], quality=92)
    print("wrote", b["id"])
