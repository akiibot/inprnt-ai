#!/usr/bin/env python3
"""
Download the four Google Fonts used by Imprnt AI as woff2 files into
backend/fonts/. Once present, template.py embeds them as base64 data URIs
so poster rendering is fully offline (no network dependency on Google Fonts).

Usage:
    cd inprnt-ai
    python scripts/download_fonts.py

Requires: pip install httpx
"""
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    sys.exit("Run: pip install httpx")

FONTS_DIR = Path(__file__).parent.parent / "backend" / "fonts"
FONTS_DIR.mkdir(parents=True, exist_ok=True)

# Each entry: (family query param, css_weight, local filename)
FONTS: list[tuple[str, str, str]] = [
    ("Anton",                   "400", "Anton-Regular.woff2"),
    ("Inter:wght@400",          "400", "Inter-Regular.woff2"),
    ("Inter:wght@500",          "500", "Inter-Medium.woff2"),
    ("Inter:wght@600",          "600", "Inter-SemiBold.woff2"),
    ("Inter:wght@700",          "700", "Inter-Bold.woff2"),
    ("Hind+Siliguri:wght@400",  "400", "HindSiliguri-Regular.woff2"),
    ("Hind+Siliguri:wght@600",  "600", "HindSiliguri-SemiBold.woff2"),
    ("Hind+Siliguri:wght@700",  "700", "HindSiliguri-Bold.woff2"),
    ("Noto+Sans+Bengali:wght@400", "400", "NotoSansBengali-Regular.woff2"),
    ("Noto+Sans+Bengali:wght@500", "500", "NotoSansBengali-Medium.woff2"),
    ("Noto+Sans+Bengali:wght@600", "600", "NotoSansBengali-SemiBold.woff2"),
    ("Noto+Sans+Bengali:wght@700", "700", "NotoSansBengali-Bold.woff2"),
]

# Google Fonts CSS2 API — send a Chrome UA to get woff2
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}


def _extract_woff2_url(css_text: str) -> str:
    """Pull the first woff2 src URL from a Google Fonts CSS snippet."""
    import re
    match = re.search(r"url\(([^)]+\.woff2[^)]*)\)", css_text)
    if not match:
        raise ValueError(f"No woff2 URL found in CSS:\n{css_text[:400]}")
    return match.group(1).strip("'\"")


def download_font(client: httpx.Client, family_query: str, weight: str, filename: str) -> None:
    out_path = FONTS_DIR / filename
    if out_path.exists():
        print(f"  skip  {filename} (already exists)")
        return

    css_url = f"https://fonts.googleapis.com/css2?family={family_query}&display=swap"
    css_resp = client.get(css_url, headers=HEADERS, follow_redirects=True)
    css_resp.raise_for_status()

    woff2_url = _extract_woff2_url(css_resp.text)
    font_resp = client.get(woff2_url, headers=HEADERS, follow_redirects=True)
    font_resp.raise_for_status()

    out_path.write_bytes(font_resp.content)
    print(f"  saved {filename} ({len(font_resp.content) // 1024} KB)")


def main() -> None:
    print(f"Downloading {len(FONTS)} font files into {FONTS_DIR} …\n")
    with httpx.Client(timeout=30) as client:
        for family_query, weight, filename in FONTS:
            try:
                download_font(client, family_query, weight, filename)
            except Exception as exc:
                print(f"  ERROR {filename}: {exc}")
    print("\nDone. Run the backend and fonts will be embedded automatically.")


if __name__ == "__main__":
    main()
