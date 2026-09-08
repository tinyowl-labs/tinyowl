#!/usr/bin/env python3
"""Rebuild the GeoNames cities15000 typeahead index (CC BY 4.0).

    python3 scripts/geonames-cities-index.py
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://download.geonames.org/export/dump/cities15000.zip"
UA = "echidna/0.1 (geonames cities index)"
OUT = ROOT / "src/lib/search/data/geonames-cities15000.json.gz"


def download_zip() -> bytes:
    print(f"Downloading {URL}", file=sys.stderr)
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as res:
        return res.read()


def build(raw_zip: bytes) -> dict:
    zf = zipfile.ZipFile(io.BytesIO(raw_zip))
    name = next(n for n in zf.namelist() if n.endswith(".txt") and not n.startswith("__"))
    cities = []
    with zf.open(name) as fh:
        text = io.TextIOWrapper(fh, encoding="utf-8")
        reader = csv.reader(text, delimiter="\t")
        for row in reader:
            if len(row) < 15:
                continue
            gid, name, ascii_name, alts, lat_s, lng_s = row[0], row[1], row[2], row[3], row[4], row[5]
            cc = (row[8] or "").strip().upper()
            fcode = (row[7] or "").strip()
            try:
                lat = float(lat_s)
                lng = float(lng_s)
                pop = int(row[14] or 0)
            except ValueError:
                continue
            if len(cc) != 2 or not cc.isalpha():
                continue
            seen: set[str] = set()
            names: list[str] = []
            for n in [name, ascii_name, *alts.split(",")[:8]]:
                n = n.strip()
                if not n:
                    continue
                k = n.casefold()
                if k in seen:
                    continue
                seen.add(k)
                names.append(n)
            title = name.strip() or ascii_name.strip() or gid
            cities.append(
                {
                    "id": gid,
                    "title": title,
                    "names": names,
                    "lat": round(lat, 5),
                    "lng": round(lng, 5),
                    "cc": cc,
                    "fcode": fcode,
                    "pop": pop,
                }
            )
    cities.sort(key=lambda c: (-c["pop"], c["title"]))
    print(f"{len(cities)} cities", file=sys.stderr)
    return {
        "source": URL,
        "license": "CC-BY-4.0",
        "attribution": "GeoNames (https://www.geonames.org)",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "cityCount": len(cities),
        "cities": cities,
    }


def main() -> None:
    payload = build(download_zip())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    with gzip.open(OUT, "wb", compresslevel=9) as f:
        f.write(raw)
    print(f"Wrote {OUT} ({payload['cityCount']} cities, {len(raw)} json bytes)")


if __name__ == "__main__":
    main()
