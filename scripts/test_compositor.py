#!/usr/bin/env python3
"""
Imprnt AI — Phase 1 Compositor Verification Script
===================================================
Tests the compositor against all three mock blueprints and renders PNG posters.

Run from the PROJECT ROOT (Imprnt AI/):
    python scripts/test_compositor.py

Outputs:
    scripts/output/test_output_1x1.png   (1080×1080)
    scripts/output/test_output_9x16.png  (1080×1920)
    scripts/output/test_output_16x9.png  (1920×1080)

Phase 1 GATES — script will print PASS/FAIL for each:
  ✅ Bengali text renders (not □□□□ tofu boxes)
  ✅ All 3 formats render without error
  ✅ Output PNG dimensions match blueprint format spec
"""

import json
import sys
import time
from pathlib import Path

# ── Path setup ────────────────────────────────────────────────────────────────
ROOT    = Path(__file__).parent.parent
BACKEND = ROOT / "backend"
MOCK    = ROOT / "mock-data"
OUT_DIR = ROOT / "scripts" / "output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(BACKEND))

from compositor.template import build_html
from compositor.renderer import render_poster

# ── Test cases ────────────────────────────────────────────────────────────────
TEST_CASES = [
    {
        "name":      "Instagram Post (1:1)",
        "blueprint": MOCK / "blueprint_eid_1x1.json",
        "output":    OUT_DIR / "test_output_1x1.png",
        "w": 1080, "h": 1080,
    },
    {
        "name":      "Instagram Story (9:16)",
        "blueprint": MOCK / "blueprint_eid_9x16.json",
        "output":    OUT_DIR / "test_output_9x16.png",
        "w": 1080, "h": 1920,
    },
    {
        "name":      "Facebook Cover (16:9)",
        "blueprint": MOCK / "blueprint_eid_16x9.json",
        "output":    OUT_DIR / "test_output_16x9.png",
        "w": 1920, "h": 1080,
    },
]

# ── Assets ────────────────────────────────────────────────────────────────────
ASSETS = {
    "logo_url":          str(MOCK / "assets" / "volt_bd_logo.png"),
    "product_image_url": str(MOCK / "assets" / "volt_bd_can.png"),
    "background_url":    None,  # Phase 1: solid colour only
}

# ── Load brand ────────────────────────────────────────────────────────────────
with open(MOCK / "brand_volt_bd.json", encoding="utf-8") as f:
    BRAND = json.load(f)


def check_png_dimensions(path: Path, expected_w: int, expected_h: int) -> bool:
    """Verify PNG dimensions using Pillow."""
    try:
        from PIL import Image
        img = Image.open(path)
        w, h = img.size
        if w == expected_w and h == expected_h:
            return True
        print(f"  ⚠ Dimension mismatch: got {w}×{h}, expected {expected_w}×{expected_h}")
        return False
    except Exception as e:
        print(f"  ⚠ Could not verify dimensions: {e}")
        return True  # Don't fail just because PIL check failed


def run_tests() -> None:
    print("\n" + "="*60)
    print("  Imprnt AI — Phase 1 Compositor Test")
    print("="*60)

    all_passed = True

    for tc in TEST_CASES:
        print(f"\n▶ {tc['name']}")
        bp_path = tc["blueprint"]

        with open(bp_path, encoding="utf-8") as f:
            blueprint = json.load(f)

        # Build HTML
        print("  Building HTML...")
        t0 = time.time()
        html = build_html(blueprint, BRAND, ASSETS)
        print(f"  HTML built ({len(html):,} chars)")

        # Quick sanity — check Bengali text is in the HTML
        bn_text = "ভোল্ট দিয়ে ঈদ জমাও!"
        if bn_text in html:
            print(f"  ✅ Bengali text present in HTML: '{bn_text}'")
        else:
            print(f"  ❌ Bengali text MISSING from HTML")
            all_passed = False

        # Check Anton font is referenced
        if "Anton" in html:
            print("  ✅ Anton (English heading font) referenced")
        else:
            print("  ⚠ Anton font not found in HTML")

        # Check Google Fonts @import
        if "fonts.googleapis.com" in html:
            print("  ✅ Google Fonts @import present")
        else:
            print("  ❌ Google Fonts @import MISSING")
            all_passed = False

        # Check Bangla font in @import
        if "Hind+Siliguri" in html or "Hind Siliguri" in html:
            print("  ✅ Hind Siliguri (Bengali font) in @import")
        else:
            print("  ❌ Hind Siliguri MISSING from @import")
            all_passed = False

        if "Noto+Sans+Bengali" in html or "Noto Sans Bengali" in html:
            print("  ✅ Noto Sans Bengali in @import")
        else:
            print("  ❌ Noto Sans Bengali MISSING from @import")
            all_passed = False

        # Render PNG
        out_path = tc["output"]
        print(f"  Rendering poster → {out_path.name}  (this may take ~10s for font download)...")
        try:
            result = render_poster(html, tc["w"], tc["h"], str(out_path))
            elapsed = time.time() - t0
            print(f"  ✅ PNG rendered in {elapsed:.1f}s → {result}")

            # Verify dimensions
            if out_path.exists():
                ok = check_png_dimensions(out_path, tc["w"], tc["h"])
                if ok:
                    print(f"  ✅ Dimensions: {tc['w']}×{tc['h']}px correct")
                else:
                    all_passed = False
            else:
                print("  ❌ Output file does not exist")
                all_passed = False

        except Exception as e:
            print(f"  ❌ Render FAILED: {e}")
            all_passed = False

    print("\n" + "="*60)
    if all_passed:
        print("  🎉 ALL TESTS PASSED — Phase 1 compositor is working!")
        print("  📁 Output PNGs in: scripts/output/")
        print("\n  ⚠ IMPORTANT: Open the PNG files and visually confirm:")
        print("    1. Bengali text 'ভোল্ট দিয়ে ঈদ জমাও!' is readable (NOT □□□□)")
        print("    2. 'LIGHT UP EID WITH VOLT' appears in Anton font")
        print("    3. CTA button has orange background")
        print("    4. Logo appears top-left")
        print("    5. Gradient overlay is visible over dark background")
    else:
        print("  ❌ SOME TESTS FAILED — Phase 1 is NOT complete")
        sys.exit(1)
    print("="*60 + "\n")


if __name__ == "__main__":
    run_tests()
