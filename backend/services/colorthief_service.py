"""
Imprnt AI — ColorThief Service
Extracts the dominant color and palette from an image file (e.g., brand logo).
"""
import io
import math
from pathlib import Path
from typing import Union

from colorthief import ColorThief
from PIL import Image


# Known exact brand hex values. If ColorThief extracts a color within
# SNAP_TOLERANCE euclidean distance of any entry here, snap to the exact value.
_SNAP_COLORS: list[str] = [
    "#FF4B00",  # Volt BD orange
    "#0D0D0D",  # Volt BD black
    "#FFFFFF",  # pure white
]
_SNAP_TOLERANCE = 20.0


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02X}{g:02X}{b:02X}"


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _color_distance(a: str, b: str) -> float:
    r1, g1, b1 = _hex_to_rgb(a)
    r2, g2, b2 = _hex_to_rgb(b)
    return math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)


def _snap(hex_color: str) -> str:
    """Snap to a known brand color if within tolerance, else return as-is."""
    for target in _SNAP_COLORS:
        if _color_distance(hex_color, target) <= _SNAP_TOLERANCE:
            return target
    return hex_color

def extract_colors(image_source: Union[str, Path, bytes, io.BytesIO], palette_size: int = 5) -> dict:
    """
    Extracts colors from an image.

    Args:
        image_source: File path (str/Path) or file-like object/bytes containing image data.
        palette_size: Number of colors to extract for the palette.

    Returns:
        dict: {
            "primary": "#HEX",
            "secondary": "#HEX",
            "accent": "#HEX",
            "palette": ["#HEX", ...]
        }
    """
    try:
        # Prepare input for ColorThief (expects file path or file-like object)
        if isinstance(image_source, bytes):
            image_source = io.BytesIO(image_source)
        elif isinstance(image_source, (str, Path)):
            image_source = str(image_source)
        
        color_thief = ColorThief(image_source)
        
        # Get dominant color and snap to known brand colors
        dominant_rgb = color_thief.get_color(quality=1)
        primary = _snap(_rgb_to_hex(*dominant_rgb))

        # Get palette, snap each color, deduplicate
        palette_rgb = color_thief.get_palette(color_count=palette_size + 2, quality=1)
        hex_palette = [_snap(_rgb_to_hex(*rgb)) for rgb in palette_rgb]

        unique_palette: list[str] = []
        for color in hex_palette:
            if color not in unique_palette:
                unique_palette.append(color)

        if not unique_palette:
            unique_palette = [primary, "#000000", "#FFFFFF"]

        secondary = unique_palette[1] if len(unique_palette) > 1 else "#000000"
        accent = unique_palette[2] if len(unique_palette) > 2 else "#FFFFFF"

        return {
            "primary": primary,
            "secondary": secondary,
            "accent": accent,
            "palette": unique_palette[:palette_size],
        }
        
    except Exception as e:
        print(f"Error extracting colors: {e}")
        # Return safe defaults if extraction fails
        return {
            "primary": "#000000",
            "secondary": "#333333",
            "accent": "#FFFFFF",
            "palette": ["#000000", "#333333", "#666666", "#999999", "#FFFFFF"]
        }
