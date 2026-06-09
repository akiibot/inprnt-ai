"""
Imprnt AI — PosterGen Engine: Pydantic schemas

PosterBrandDetails is the flat brand shape the brain prompt consumes. It is
adapted from Imprnt's richer Brand model by brand_adapter.to_poster_brand().
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal


class PosterBrandDetails(BaseModel):
    brand_name: str
    tagline: str
    primary_color: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_color: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color: Optional[str] = None
    tone: str
    industry: str
    target_audience: str
    language: Optional[str] = "english"          # english | bengali | bilingual

    # Extra brand context carried over from Imprnt's richer Brand schema so the
    # brain can stay on-brand. These are optional and ignored by older prompts.
    tagline_bn: Optional[str] = None
    brand_personality: Optional[list[str]] = None
    color_palette: Optional[list[str]] = None
    do_not_use: Optional[list[str]] = None


class BrainOutput(BaseModel):
    imagen_prompt: str
    logo_placement: Literal[
        "bottom-left", "bottom-right", "top-left", "top-right",
        "center-bottom", "center-top",
    ]
    logo_zone_hint: str
    product_placement: str = "center"     # center | left-center | right-center | center-top | center-bottom
    product_size_ratio: float = 0.55      # fraction of poster height the product should occupy

    # Display metadata — used to populate the campaign row / results panel.
    # Optional so an older brain response without them still validates.
    campaign_name: Optional[str] = None
    campaign_strategy: Optional[str] = None
