"""
Run this on your local machine:
  pip install requests beautifulsoup4
  python fetch_og_images.py

It reads companies_optimized.csv, fetches the OG image for the 20 companies
that still have logos as their image_url, and writes companies_final.csv.
"""

import csv
import time
import requests
from bs4 import BeautifulSoup

INPUT  = "companies_optimized.csv"
OUTPUT = "companies_final.csv"

LOGO_SIGNALS = [
    "img.logo.dev",
    "logo.png", "logo.jpg", "logo.webp", "logo.jpeg",
    "brand-logo", "brand_logo", "_logo", "-logo",
    "favicon", "icon",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}

def needs_hero_image(image_url):
    url_lower = image_url.lower()
    return any(sig in url_lower for sig in LOGO_SIGNALS)

def fetch_og_image(site_url):
    try:
        r = requests.get(site_url, headers=HEADERS, timeout=12)
        soup = BeautifulSoup(r.text, "html.parser")

        # Try og:image first, then twitter:image
        for attr, name in [
            ("property", "og:image"),
            ("name",     "og:image"),
            ("name",     "twitter:image"),
            ("property", "twitter:image"),
        ]:
            tag = soup.find("meta", {attr: name})
            if tag and tag.get("content"):
                return tag["content"].strip()

    except Exception as e:
        print(f"  ERROR: {e}")
    return None

rows = []
with open(INPUT, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

fieldnames = list(rows[0].keys())
updated = 0

for row in rows:
    if needs_hero_image(row["image_url"]):
        site_url = row["url"]
        print(f"Fetching OG image for {row['name']} ({site_url}) ...")
        og = fetch_og_image(site_url)
        if og:
            print(f"  ✓ {og}")
            row["image_url"] = og
            updated += 1
        else:
            print(f"  ✗ Not found, keeping existing")
        time.sleep(0.5)  # be polite

with open(OUTPUT, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"\nDone. {updated}/20 image URLs updated → {OUTPUT}")
