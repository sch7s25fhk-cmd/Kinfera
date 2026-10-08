#!/usr/bin/env python3
"""Erzeugt js/data/world.js aus Natural-Earth-Daten (gemeinfrei).

Quellen (1:50m):
  https://github.com/nvkelso/natural-earth-vector/raw/master/geojson/ne_50m_admin_0_countries.geojson
  https://github.com/nvkelso/natural-earth-vector/raw/master/geojson/ne_50m_populated_places_simple.geojson

Aufruf:
  python3 tools/build_data.py <countries.geojson> <places.geojson> > js/data/world.js
"""
import json
import sys

TOL = 0.035      # Douglas-Peucker-Toleranz in Grad
Q = 100          # Koordinaten werden als ganze Zahlen (Grad * 100) gespeichert


def dp(pts, tol):
    """Douglas-Peucker, iterativ."""
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        ln = (dx * dx + dy * dy) ** 0.5 or 1e-12
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / ln
            if d > best:
                best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def dp_ring(ring, tol):
    """Geschlossene Ringe an der Mitte teilen, sonst fällt Start = Ende zusammen."""
    if len(ring) < 8:
        return ring
    m = len(ring) // 2
    return dp(ring[:m + 1], tol) + dp(ring[m:], tol)[1:]


def ring_area(r):
    s = 0.0
    for i in range(len(r)):
        x1, y1 = r[i]
        x2, y2 = r[(i + 1) % len(r)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def encode(r):
    out = []
    lx = ly = None
    for x, y in r:
        qx, qy = round(x * Q), round(y * Q)
        if (qx, qy) == (lx, ly):
            continue
        out += [qx, qy]
        lx, ly = qx, qy
    return out


def main():
    cfile, pfile = sys.argv[1], sys.argv[2]
    countries = json.load(open(cfile, encoding="utf-8"))["features"]
    places = json.load(open(pfile, encoding="utf-8"))["features"]

    by_country = {}
    for f in places:
        p = f["properties"]
        if p["featurecla"] == "Scientific station":
            continue
        cap = 1 if p["featurecla"] in ("Admin-0 capital",) else 0
        by_country.setdefault(p["adm0_a3"], []).append(
            [" ".join(p["name"].split()), round(p["longitude"], 2), round(p["latitude"], 2), int(p["pop_max"] or 0), cap])

    out = []
    for f in countries:
        p = f["properties"]
        iso = p["ADM0_A3"]
        if iso == "ATA":
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        total = sum(ring_area(poly[0]) for poly in polys)
        ctol = min(TOL, max(0.004, total ** 0.5 / 70))  # kleine Länder detaillierter
        rings = []
        for poly in polys:
            outer = poly[0]  # Löcher (Enklaven) werden ignoriert
            tol = ctol
            s = dp_ring(outer, tol)
            while len(s) < 5 and tol > 0.002 and len(outer) >= 5:
                tol /= 2
                s = dp_ring(outer, tol)
            if len(s) < 4:
                continue
            rings.append((ring_area(outer), encode(s)))
        if not rings:
            continue
        rings.sort(key=lambda r: -r[0])
        # sehr kleine Inseln weglassen, wenn das Land sonst groß genug ist
        big = rings[0][0]
        rings = [r for r in rings if r[0] >= big * 0.0004 or r[0] > 0.05][:60]
        cities = sorted(by_country.get(iso, []), key=lambda c: (-c[4], -c[3]))[:12]
        out.append({
            "id": iso,
            "n": p.get("NAME_DE") or p["NAME"],
            "en": p["NAME"],
            "pop": int(p["POP_EST"] or 0),
            "gdp": int(p["GDP_MD"] or 0),
            "inc": int(str(p["INCOME_GRP"])[0]),
            "cont": p["CONTINENT"],
            "c": p["MAPCOLOR7"],
            "r": [r[1] for r in rings],
            "pl": cities,
        })
    out.sort(key=lambda c: c["n"])
    sys.stdout.write("/* Generiert von tools/build_data.py aus Natural Earth (public domain). */\n")
    sys.stdout.write("window.WORLD_DATA=")
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write(";\n")


if __name__ == "__main__":
    main()
