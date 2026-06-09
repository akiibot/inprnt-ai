"""
Imprnt AI — PosterGen Engine: Brand adapter

Maps Imprnt's rich Brand record (frozen schema — colors/typography/voice/etc.)
onto the flat PosterBrandDetails shape the brain prompt consumes. Carries the
extra brand context (personality, palette, do_not_use, Bengali tagline) through
so the AI poster stays on-brand.
"""
from __future__ import annotations

from .schemas import PosterBrandDetails

# Imprnt brand.voice.language → PosterGen language vocabulary
_LANGUAGE_MAP = {
    "en": "english",
    "bn": "bengali",
    "both": "bilingual",
}

_FALLBACK_HEX = "#000000"


def _hex_or(value: object, fallback: str) -> str:
    """Return value if it looks like a #RRGGBB hex string, else fallback."""
    if isinstance(value, str) and len(value) == 7 and value.startswith("#"):
        return value
    return fallback


def to_poster_brand(brand_data: dict) -> PosterBrandDetails:
    """Convert an Imprnt brand dict (DB row or mock) → PosterBrandDetails."""
    colors = brand_data.get("colors") or {}
    voice = brand_data.get("voice") or {}

    primary = _hex_or(colors.get("primary"), "#FF4B00")
    secondary = _hex_or(colors.get("secondary"), _FALLBACK_HEX)
    accent = _hex_or(colors.get("accent"), None) if colors.get("accent") else None

    language = _LANGUAGE_MAP.get(str(voice.get("language", "en")).lower(), "english")

    palette = colors.get("palette") if isinstance(colors.get("palette"), list) else None
    personality = brand_data.get("brand_personality") if isinstance(brand_data.get("brand_personality"), list) else None
    do_not_use = brand_data.get("do_not_use") if isinstance(brand_data.get("do_not_use"), list) else None

    return PosterBrandDetails(
        brand_name=brand_data.get("brand_name", "Brand"),
        tagline=brand_data.get("tagline", ""),
        primary_color=primary,
        secondary_color=secondary,
        accent_color=accent,
        tone=str(voice.get("tone") or "bold"),
        industry=brand_data.get("industry", "general"),
        target_audience=brand_data.get("target_audience", "general audience"),
        language=language,
        tagline_bn=brand_data.get("tagline_bn"),
        brand_personality=personality,
        color_palette=palette,
        do_not_use=do_not_use,
    )
