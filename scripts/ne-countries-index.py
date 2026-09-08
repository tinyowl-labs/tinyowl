#!/usr/bin/env python3
"""Rebuild the Natural Earth 50m country typeahead + polygon index.

Source: Natural Earth 50m admin-0 (public domain)
https://github.com/nvkelso/natural-earth-vector

    python3 scripts/ne-countries-index.py
"""

from __future__ import annotations

import gzip
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER = ROOT.parent / "tinyowl-server"
NE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_50m_admin_0_countries.geojson"
)
UA = "echidna/0.1 (natural earth country index)"
OUT = ROOT / "src/lib/search/data/ne-countries-50m.json.gz"
SERVER_OUT = SERVER / "internal/gazetteer/ne-countries-50m.json.gz"
NDIGITS = 3

# Extra aliases (folded later). Keys are ISO A2.
ALIASES: dict[str, list[str]] = {
    "GB": ["UK", "United Kingdom", "Great Britain", "Britain"],
    "US": ["USA", "United States", "America", "United States of America"],
    "NL": ["Holland", "The Netherlands"],
    "TR": ["Turkiye", "Türkiye"],
    "CZ": ["Czechia", "Czech Republic"],
    "CD": ["DRC", "Congo-Kinshasa", "Democratic Republic of the Congo"],
    "CG": ["Congo-Brazzaville", "Republic of the Congo"],
    "MM": ["Burma"],
    "TL": ["East Timor"],
    "SZ": ["Swaziland"],
    "CI": ["Ivory Coast", "Cote d'Ivoire"],
    "KR": ["South Korea"],
    "KP": ["North Korea"],
    "AE": ["UAE", "U.A.E."],
    "RU": ["Russia"],
    "SY": ["Syria"],
    "IR": ["Iran", "Persia"],
    "GR": ["Hellas"],
    "PS": ["Palestine", "West Bank", "Gaza"],
}


def round_geom(geom: dict) -> dict | None:
    def round_ring(ring: list) -> list:
        out = []
        last = None
        for pt in ring:
            if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                continue
            xy = (round(float(pt[0]), NDIGITS), round(float(pt[1]), NDIGITS))
            if xy == last:
                continue
            out.append([xy[0], xy[1]])
            last = xy
        if len(out) >= 4 and out[0] != out[-1]:
            out.append(out[0])
        return out if len(out) >= 4 else []

    gtype = geom.get("type")
    coords = geom.get("coordinates")
    if gtype == "Polygon" and isinstance(coords, list):
        rings = [round_ring(r) for r in coords]
        rings = [r for r in rings if r]
        if not rings:
            return None
        return {"type": "Polygon", "coordinates": rings}
    if gtype == "MultiPolygon" and isinstance(coords, list):
        polys = []
        for poly in coords:
            rings = [round_ring(r) for r in poly]
            rings = [r for r in rings if r]
            if rings:
                polys.append(rings)
        if not polys:
            return None
        if len(polys) == 1:
            return {"type": "Polygon", "coordinates": polys[0]}
        return {"type": "MultiPolygon", "coordinates": polys}
    return None


def bbox_of(geom: dict) -> list[float] | None:
    xs: list[float] = []
    ys: list[float] = []

    def walk(c) -> None:
        if not isinstance(c, list) or not c:
            return
        if isinstance(c[0], (int, float)):
            xs.append(float(c[0]))
            ys.append(float(c[1]))
            return
        for item in c:
            walk(item)

    walk(geom.get("coordinates"))
    if not xs:
        return None
    return [min(xs), min(ys), max(xs), max(ys)]


def iso_a2(props: dict) -> str | None:
    for key in ("ISO_A2_EH", "ISO_A2", "WB_A2"):
        raw = str(props.get(key) or "").strip().upper()
        if len(raw) == 2 and raw.isalpha():
            return raw
    return None


def collect_names(props: dict, cc: str) -> tuple[str, list[str]]:
    title = (
        str(props.get("NAME_EN") or props.get("NAME") or props.get("ADMIN") or cc).strip()
    )
    seen: set[str] = set()
    names: list[str] = []
    for key in (
        "NAME_EN",
        "NAME",
        "NAME_LONG",
        "ADMIN",
        "FORMAL_EN",
        "NAME_SORT",
        "ABBREV",
        "BRK_NAME",
        "GEOUNIT",
    ):
        v = str(props.get(key) or "").strip()
        if not v:
            continue
        k = v.casefold()
        if k in seen:
            continue
        seen.add(k)
        names.append(v)
    for extra in ALIASES.get(cc, []):
        k = extra.casefold()
        if k in seen:
            continue
        seen.add(k)
        names.append(extra)
    if title.casefold() not in seen:
        names.insert(0, title)
    return title, names


def download() -> dict:
    print(f"Downloading {NE_URL}", file=sys.stderr)
    req = urllib.request.Request(NE_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)


def build(fc: dict) -> dict:
    countries = []
    skipped = 0
    seen_cc: set[str] = set()
    for feat in fc.get("features") or []:
        props = feat.get("properties") or {}
        cc = iso_a2(props)
        geom_in = feat.get("geometry")
        if not cc or not isinstance(geom_in, dict):
            skipped += 1
            continue
        if cc in seen_cc:
            skipped += 1
            continue
        geom = round_geom(geom_in)
        if not geom:
            skipped += 1
            continue
        box = bbox_of(geom)
        if not box:
            skipped += 1
            continue
        title, names = collect_names(props, cc)
        seen_cc.add(cc)
        countries.append(
            {
                "cc": cc,
                "title": title,
                "names": names,
                "bbox": [round(x, 4) for x in box],
                "geom": geom,
            }
        )
    countries.sort(key=lambda c: c["title"])
    print(f"{len(countries)} countries, skipped {skipped}", file=sys.stderr)
    return {
        "source": NE_URL,
        "license": "public-domain",
        "attribution": "Made with Natural Earth",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "countryCount": len(countries),
        "countries": countries,
    }


def write_gz(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(raw)
    print(f"Wrote {path} ({payload['countryCount']} countries, {len(raw)} json bytes)")


def main() -> None:
    payload = build(download())
    write_gz(OUT, payload)
    write_gz(SERVER_OUT, payload)


if __name__ == "__main__":
    main()
