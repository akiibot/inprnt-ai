"""
Imprnt AI — ColorThief Service
Extracts the dominant color and palette from an image file (e.g., brand logo).
"""
import io
from pathlib import Path
from typing import Union

from colorthief import ColorThief
from PIL import Image

def _rgb_to_hex(r: int, g: int, b: int) -> str:
    """Convert RGB tuple to hex color string."""
    return f"#{r:02x}{g:02x}{b:02x}".upper()

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
        
        # Get dominant color
        dominant_rgb = color_thief.get_color(quality=1)
        primary = _rgb_to_hex(*dominant_rgb)
        
        # Get palette
        palette_rgb = color_thief.get_palette(color_count=palette_size + 2, quality=1)
        
        # We need at least 3 distinct colors. If palette is too small, fallback.
        hex_palette = [_rgb_to_hex(*rgb) for rgb in palette_rgb]
        
        # Ensure unique colors in palette (ColorThief sometimes returns very similar ones)
        unique_palette = []
        for color in hex_palette:
            if color not in unique_palette:
                unique_palette.append(color)
        
        # Fallbacks if image is monochromatic
        if not unique_palette:
            unique_palette = [primary, "#000000", "#FFFFFF"]
        
        secondary = unique_palette[1] if len(unique_palette) > 1 else "#000000"
        accent = unique_palette[2] if len(unique_palette) > 2 else "#FFFFFF"
        
        return {
            "primary": primary,
            "secondary": secondary,
            "accent": accent,
            "palette": unique_palette[:palette_size]
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
