#!/usr/bin/env python3
"""Rebuild the compact Pleiades typeahead index from the GIS CSV package.

Source: https://atlantides.org/downloads/pleiades/gis/pleiades_gis_data.zip
License: CC BY 3.0 — Pleiades (https://pleiades.stoa.org) © Contributors
Cadence: GIS package updates several times a week; re-run when you want a
newer snapshot. The committed gzip is the runtime index.

    python3 scripts/pleiades-index.py
    python3 scripts/pleiades-index.py --from-dir /path/to/data/gis
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import shutil
import sys
import unicodedata
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GIS_URL = "https://atlantides.org/downloads/pleiades/gis/pleiades_gis_data.zip"
UA = "echidna/0.1 (pleiades index rebuild)"
OUT = ROOT / "src/lib/search/data/pleiades-index.json.gz"
CACHE = ROOT / ".cache/pleiades"
WKT_NUM = re.compile(r"[-+]?\d+(?:\.\d+)?")


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


def bbox_from_wkt(wkt: str) -> list[float] | None:
    if not wkt:
        return None
    nums = [float(x) for x in WKT_NUM.findall(wkt)]
    if len(nums) < 4:
        return None
    lons = nums[0::2]
    lats = nums[1::2]
    if not lons or not lats:
        return None
    west, east = min(lons), max(lons)
    south, north = min(lats), max(lats)
    if west == east and south == north:
        return None
    return [round(west, 6), round(south, 6), round(east, 6), round(north, 6)]


def strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()


def download_zip(dest: Path) -> None:
    print(f"Downloading {GIS_URL}", file=sys.stderr)
    req = urllib.request.Request(GIS_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as res, dest.open("wb") as out:
        shutil.copyfileobj(res, out)


def resolve_gis_dir(extract_root: Path) -> Path:
    for cand in (
        extract_root / "data/gis",
        extract_root / "gis",
        extract_root,
    ):
        if (cand / "places.csv").is_file():
            return cand
    raise SystemExit(f"places.csv not found under {extract_root}")


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def build(gis_dir: Path) -> dict:
    types_by_place: dict[str, list[str]] = {}
    for row in read_csv(gis_dir / "places_place_types.csv"):
        pid = (row.get("place_id") or "").strip()
        t = (row.get("place_type") or "").strip()
        if pid and t:
            types_by_place.setdefault(pid, []).append(t)

    names_by_place: dict[str, list[str]] = {}
    for row in read_csv(gis_dir / "names.csv"):
        pid = (row.get("place_id") or "").strip()
        if not pid:
            continue
        bucket = names_by_place.setdefault(pid, [])
        for k in (
            "title",
            "attested_form",
            "romanized_form_1",
            "romanized_form_2",
            "romanized_form_3",
        ):
            v = (row.get(k) or "").strip()
            if v:
                bucket.append(v)

    places: list[dict] = []
    skipped = 0
    for row in read_csv(gis_dir / "places.csv"):
        pid = (row.get("id") or "").strip()
        lat_raw = (row.get("representative_latitude") or "").strip()
        lng_raw = (row.get("representative_longitude") or "").strip()
        try:
            lat = float(lat_raw)
            lng = float(lng_raw)
        except ValueError:
            skipped += 1
            continue
        if not pid or not (-90 <= lat <= 90 and -180 <= lng <= 180):
            skipped += 1
            continue
        title = (row.get("title") or "").strip() or pid
        desc = strip_html(row.get("description") or "")[:160]
        seen: set[str] = set()
        names: list[str] = []
        for n in [title, *names_by_place.get(pid, [])]:
            n = n.strip()
            if not n:
                continue
            k = fold(n)
            if not k or k in seen:
                continue
            seen.add(k)
            names.append(n)
        rec: dict = {
            "id": pid,
            "title": title,
            "names": names,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "types": types_by_place.get(pid, []),
        }
        bbox = bbox_from_wkt(row.get("bounding_box_wkt") or "")
        if bbox:
            rec["bbox"] = bbox
        if desc:
            rec["description"] = desc
        places.append(rec)

    print(f"{len(places)} places, skipped {skipped} without coords", file=sys.stderr)
    return {
        "source": GIS_URL,
        "license": "CC-BY-3.0",
        "attribution": "Pleiades (https://pleiades.stoa.org) © Contributors",
        "builtFrom": "places.csv + names.csv + places_place_types.csv",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "placeCount": len(places),
        "places": places,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-dir", type=Path, default=None)
    args = parser.parse_args()

    gis_dir = args.from_dir
    if gis_dir is None:
        CACHE.mkdir(parents=True, exist_ok=True)
        zip_path = CACHE / "pleiades_gis_data.zip"
        download_zip(zip_path)
        extract_root = CACHE / "extract"
        if extract_root.exists():
            shutil.rmtree(extract_root)
        extract_root.mkdir(parents=True)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_root)
        gis_dir = resolve_gis_dir(extract_root)

    payload = build(gis_dir)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    with gzip.open(OUT, "wb", compresslevel=9) as f:
        f.write(raw)
    print(f"Wrote {OUT} ({payload['placeCount']} places, {len(raw)} json bytes)")


if __name__ == "__main__":
    main()
