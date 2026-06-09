"""
Imprnt AI — PosterGen Engine: Pipeline

Orchestrates the engine for one campaign across the three social formats:

  1. brain writes ONE Imagen prompt + placement plan (shared by all formats)
  2. for each aspect ratio: Imagen renders the full poster, then PIL composites
     the real product (behind) and logo (on top) at the planned placements

The brain runs once; only the Imagen generation + compositing repeats per format.
"""
from __future__ import annotations

import io

from . import brain, generator, compositor
from .brand_adapter import to_poster_brand
from .schemas import BrainOutput


def plan_campaign(
    brand_data: dict,
    campaign_prompt: str,
    logo_path: str,
    product_path: str | None = None,
) -> BrainOutput:
    """Run the brain once for a campaign. Returns the shared Imagen prompt + plan."""
    poster_brand = to_poster_brand(brand_data)
    return brain.generate_prompt(
        brand=poster_brand,
        campaign_prompt=campaign_prompt,
        logo_path=logo_path,
        product_path=product_path,
    )


def render_format(
    brain_output: BrainOutput,
    aspect_ratio: str,
    logo_path: str,
    product_path: str | None = None,
) -> bytes:
    """Generate + composite a single poster for one aspect ratio. Returns PNG bytes."""
    poster = generator.generate_poster(
        brain_output.imagen_prompt, aspect_ratio, product_path
    )

    # Product first (sits behind the logo)
    if product_path:
        poster = compositor.composite_product(
            poster,
            product_path,
            brain_output.product_placement,
            brain_output.product_size_ratio,
        )

    # Logo on top
    final = compositor.composite_logo(poster, logo_path, brain_output.logo_placement)

    buf = io.BytesIO()
    final.save(buf, "PNG")
    return buf.getvalue()
