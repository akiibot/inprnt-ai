#!/usr/bin/env python3
"""
Imprnt AI — Phase 4 Verification Script
===================================================
Tests Remove.bg API integration for stripping product backgrounds.

Run from the PROJECT ROOT:
    python scripts/test_product_upload.py
"""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
BACKEND = ROOT / "backend"
MOCK = ROOT / "mock-data"
OUT_DIR = ROOT / "scripts" / "output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(BACKEND))

from services.removebg import remove_background

def run_tests():
    print("\n" + "="*60)
    print("  Imprnt AI — Phase 4 Product Upload Test")
    print("="*60)

    print("\n▶ Testing Remove.bg API integration...")
    
    # We will just test with the Volt BD logo for now, as it has a background
    # (or we can use a dummy image if we had one. Let's use the volt_bd_can.png 
    # assuming it might have a background, or logo.png)
    # Actually, volt_bd_can.png is supposed to be the product.
    product_path = MOCK / "assets" / "volt_bd_can.png"
    if not product_path.exists():
        print(f"❌ Product image not found at {product_path}")
        return
        
    out_path = OUT_DIR / "product_transparent.png"
    
    with open(product_path, "rb") as f:
        image_bytes = f.read()
        
    t0 = time.time()
    try:
        transparent_bytes = remove_background(image_bytes, "image/png")
        with open(out_path, "wb") as f:
            f.write(transparent_bytes)
        print(f"✅ Background removed in {time.time() - t0:.1f}s -> {out_path}")
    except Exception as e:
        print(f"❌ Background removal failed: {e}")
        return

    print("\n" + "="*60)
    print("  🎉 Phase 4 Product Upload Test Complete!")
    print("="*60 + "\n")

if __name__ == "__main__":
    run_tests()
