from PIL import Image, ImageFilter, ImageEnhance
import sys, os, math, random

def _solve(A, B):
    """Gaussian elimination with partial pivoting — avoids a numpy dependency."""
    n = len(B)
    M = [row[:] + [B[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        pv = M[c][c]
        if abs(pv) < 1e-12: continue
        for r in range(n):
            if r == c: continue
            fct = M[r][c] / pv
            for k in range(c, n + 1):
                M[r][k] -= fct * M[c][k]
    return [M[i][i] and M[i][n] / M[i][i] or 0.0 for i in range(n)]

def perspective(img, mag):
    w, h = img.size
    dx, dy = int(w*mag), int(h*mag)
    r = lambda n: random.randint(-n, n)
    src = [(0,0),(w,0),(w,h),(0,h)]
    dst = [(r(dx),r(dy)),(w+r(dx),r(dy)),(w+r(dx),h+r(dy)),(r(dx),h+r(dy))]
    A, B = [], []
    for (x,y),(u,v) in zip(dst, src):
        A.append([x,y,1,0,0,0,-u*x,-u*y]); B.append(u)
        A.append([0,0,0,x,y,1,-v*x,-v*y]); B.append(v)
    coeff = _solve(A, B)
    return img.transform((w,h), Image.PERSPECTIVE, coeff, Image.BICUBIC, fillcolor=(245,244,240))

def lighting(img, strength):
    """Uneven light: a soft bright gradient across the page, like a window or flash."""
    w, h = img.size
    grad = Image.new("L", (w, h))
    px = grad.load()
    cx, cy = random.uniform(0.2,0.8)*w, random.uniform(0.2,0.8)*h
    maxd = math.hypot(w, h)
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            d = math.hypot(x-cx, y-cy)/maxd
            v = int(255*(1 - strength*d))
            for yy in range(y, min(y+4,h)):
                for xx in range(x, min(x+4,w)):
                    px[xx,yy] = max(0, min(255, v))
    grad = grad.filter(ImageFilter.GaussianBlur(40))
    dark = ImageEnhance.Brightness(img).enhance(0.55)
    return Image.composite(img, dark, grad)

def apply(src, dst, cond, seed):
    random.seed(seed)
    img = Image.open(src).convert("RGB")
    if cond == "phone":        # a decent handheld phone photo
        img = perspective(img, 0.012)
        img = img.rotate(random.uniform(-2.5, 2.5), expand=False, fillcolor=(245,244,240), resample=Image.BICUBIC)
        img = lighting(img, 0.45)
        img = img.filter(ImageFilter.GaussianBlur(0.8))
        img.thumbnail((1500,1500)); q = 62
    elif cond == "poor":       # dim room, shaky hands, tighter crop
        img = perspective(img, 0.03)
        img = img.rotate(random.uniform(-6, 6), expand=False, fillcolor=(230,228,224), resample=Image.BICUBIC)
        img = lighting(img, 0.75)
        img = ImageEnhance.Brightness(img).enhance(0.8)
        img = ImageEnhance.Contrast(img).enhance(0.85)
        img = img.filter(ImageFilter.GaussianBlur(1.9))
        img.thumbnail((900,900)); q = 34
    elif cond == "brutal":     # the harsh case that triggered the original alarm
        img = perspective(img, 0.04)
        img = img.rotate(random.uniform(-8, 8), expand=False, fillcolor=(220,218,214), resample=Image.BICUBIC)
        img = lighting(img, 0.85)
        img = ImageEnhance.Brightness(img).enhance(0.7)
        img = img.filter(ImageFilter.GaussianBlur(2.6))
        img.thumbnail((420,420)); q = 18
    else:
        img.thumbnail((1500,1500)); q = 82
    img.save(dst, quality=q)

if __name__ == "__main__":
    apply(*sys.argv[1:4], int(sys.argv[4]))
