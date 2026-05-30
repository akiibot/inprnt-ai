#!/usr/bin/env python3
"""
Imprnt AI — Phase 2 Verification Script
===================================================
Tests brand extraction (PDF + logo → Gemini → brand.json)
and campaign planning (brand + prompt → Gemini → blueprint.json).

Run from the PROJECT ROOT:
    python scripts/test_intelligence.py
"""

import sys
import json
from pathlib import Path
import asyncio

ROOT = Path(__file__).parent.parent
BACKEND = ROOT / "backend"
MOCK = ROOT / "mock-data"
sys.path.insert(0, str(BACKEND))

from services.gemini import extract_brand, plan_campaign
from services.colorthief_service import extract_colors

# ── Mock PDF Text for Testing ────────────────────────────────────────────────
MOCK_PDF_TEXT = """
VOLT BD BRAND GUIDELINES
About Us: Volt BD is a high-energy beverage designed for the youthful, rebellious, and bold generation of urban Bangladesh.
Tagline: Stay Focused. Recharge. (মনোযোগ রাখো। রিচার্জ হও।)
Target Audience: Young adults 18-30.
Tone of Voice: High-energy, direct, motivational. Informal.
Languages: Both English and Bengali.
Typography:
- English Headings: Anton
- English Body: Inter
- Bengali Headings: Hind Siliguri
- Bengali Body: Noto Sans Bengali
Don't use: Pastel colors, cursive fonts, soft imagery, corporate tone.
"""

def run_tests():
    print("\n" + "="*60)
    print("  Imprnt AI — Phase 2 Intelligence Test")
    print("="*60)

    # 1. Test ColorThief
    print("\n▶ Testing ColorThief...")
    logo_path = MOCK / "assets" / "volt_bd_logo.png"
    if not logo_path.exists():
        print(f"❌ Logo not found at {logo_path}")
        return
        
    with open(logo_path, "rb") as f:
        logo_bytes = f.read()
        
    colors = extract_colors(logo_bytes)
    print(f"✅ Colors extracted: {colors}")

    # 2. Test Brand Extraction (Gemini)
    print("\n▶ Testing Gemini Brand Extraction...")
    try:
        brand_dict, model = extract_brand(MOCK_PDF_TEXT, "image/png", logo_bytes)
        print(f"✅ Brand extracted using {model}:")
        print(json.dumps(brand_dict, indent=2))
        
        # Merge colors as the router does
        brand_dict['colors'] = colors
    except Exception as e:
        print(f"❌ Brand extraction failed: {e}")
        return

    # 3. Test Campaign Planning (Gemini)
    print("\n▶ Testing Gemini Campaign Planning...")
    prompt = "Design a campaign for an Eid Special Edition Launch. It should leverage Eid celebrations to position Volt BD as the energy drink of festive gatherings. The Bengali headline anchors cultural resonance while the English sub reinforces brand recall."
    format_spec = {
        "name": "Instagram Post",
        "width": 1080,
        "height": 1080,
        "aspect_ratio": "1:1"
    }
    
    try:
        blueprint_dict, model, retries = plan_campaign(
            brand=brand_dict,
            prompt=prompt,
            format_spec=format_spec,
            adherence_level="strict",
            product_image_available=True
        )
        print(f"✅ Blueprint generated using {model} (retries: {retries}):")
        # Print just the metadata and a summary to save space
        print(f"  Campaign: {blueprint_dict.get('campaign_name')}")
        print(f"  Background Prompt: {blueprint_dict.get('background', {}).get('prompt')}")
        print(f"  Layers count: {len(blueprint_dict.get('layers', []))}")
        print(f"  Metadata: {blueprint_dict.get('metadata')}")
    except Exception as e:
         print(f"❌ Campaign planning failed: {e}")
         return

    print("\n" + "="*60)
    print("  🎉 Phase 2 Intelligence Tests Passed!")
    print("="*60 + "\n")

if __name__ == "__main__":
    run_tests()
