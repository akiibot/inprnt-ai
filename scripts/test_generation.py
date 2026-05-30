#!/usr/bin/env python3
"""
Imprnt AI — Phase 3 Verification Script
===================================================
Tests end-to-end Background Generation (Cloudflare AI) -> Compositor -> PNG

Run from the PROJECT ROOT:
    python scripts/test_generation.py
"""

import sys
import json
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
BACKEND = ROOT / "backend"
MOCK = ROOT / "mock-data"
OUT_DIR = ROOT / "scripts" / "output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(BACKEND))

from services.flux import generate_background
from compositor.template import build_html
from compositor.renderer import render_poster

def run_tests():
    print("\n" + "="*60)
    print("  Imprnt AI — Phase 3 Generation Test")
    print("="*60)

    # 1. Load Mocks
    print("\n▶ Loading mock data...")
    with open(MOCK / "brand_volt_bd.json", encoding="utf-8") as f:
        brand = json.load(f)
        
    with open(MOCK / "blueprint_eid_1x1.json", encoding="utf-8") as f:
        blueprint = json.load(f)

    # 2. Generate Background via Flux
    print("\n▶ Testing Cloudflare Workers AI (Flux Schnell)...")
    bg_prompt = blueprint.get("background", {}).get("prompt", "A dark cinematic background")
    bg_path = OUT_DIR / "flux_background.png"
    
    t0 = time.time()
    try:
        # Flux Schnell usually supports 1024x1024 or 512x512
        bg_bytes = generate_background(prompt=bg_prompt, width=1024, height=1024)
        with open(bg_path, "wb") as f:
            f.write(bg_bytes)
        print(f"✅ Background generated in {time.time() - t0:.1f}s -> {bg_path}")
    except Exception as e:
        print(f"❌ Background generation failed: {e}")
        print("⚠ Proceeding with compositor test without AI background...")
        bg_path = None

    # 3. Test Compositor Pipeline with the new background
    print("\n▶ Testing Compositor Stitching...")
    
    # Pre-populate assets
    assets = {
        "logo_url": str(MOCK / "assets" / "volt_bd_logo.png"),
        "product_image_url": str(MOCK / "assets" / "volt_bd_can.png"),
        "background_url": str(bg_path) if bg_path else None
    }
    
    out_poster = OUT_DIR / "final_poster_with_ai_bg.png"
    
    t1 = time.time()
    try:
        html = build_html(blueprint, brand, assets)
        result = render_poster(html, 1080, 1080, str(out_poster))
        print(f"✅ Full poster rendered in {time.time() - t1:.1f}s -> {result}")
    except Exception as e:
        print(f"❌ Compositor rendering failed: {e}")
        return

    print("\n" + "="*60)
    print("  🎉 Phase 3 Generation Test Complete!")
    print("="*60 + "\n")

if __name__ == "__main__":
    run_tests()
