"""
Imprnt AI — Compositor: HTML Template Builder
Phase 1 — Core implementation.

build_html(blueprint, brand, assets) → complete self-contained HTML string
ready for Puppeteer/Playwright screenshot.

Architecture:
- All CSS is inline in a single <style> block — no external files.
- Google Fonts loaded via @import at the top (all 4 fonts, from day one).
- Bangla fonts (Hind Siliguri + Noto Sans Bengali) loaded alongside Latin
  fonts (Anton + Inter) from Phase 1 day one — never added later.
- Each layer in blueprint.layers becomes an absolutely-positioned <div>
  or <img>, sorted by z_index.
- Position keywords map to CSS absolute positioning (9 positions).
- Background:
    Phase 1: solid fallback_color from blueprint.background.fallback_color
    Phase 3+: background_url passed in assets dict
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Optional


# ── Font loading ──────────────────────────────────────────────────────────────

_FONTS_DIR = Path(__file__).parent.parent / "fonts"

# Maps (font-family, weight) → filename in _FONTS_DIR
_FONT_FILES: list[tuple[str, str, str]] = [
    # Latin — display
    ("Anton",        "400", "Anton-Regular.woff2"),
    ("Bebas Neue",   "400", "BebasNeue-Regular.woff2"),
    ("Oswald",       "600", "Oswald-SemiBold.woff2"),
    ("Oswald",       "700", "Oswald-Bold.woff2"),
    # Latin — humanist / grotesque
    ("Montserrat",   "400", "Montserrat-Regular.woff2"),
    ("Montserrat",   "700", "Montserrat-Bold.woff2"),
    ("Poppins",      "500", "Poppins-Medium.woff2"),
    ("Poppins",      "700", "Poppins-Bold.woff2"),
    # Latin — UI / body
    ("Inter",        "400", "Inter-Regular.woff2"),
    ("Inter",        "500", "Inter-Medium.woff2"),
    ("Inter",        "600", "Inter-SemiBold.woff2"),
    ("Inter",        "700", "Inter-Bold.woff2"),
    # Bengali — display
    ("Hind Siliguri",     "400", "HindSiliguri-Regular.woff2"),
    ("Hind Siliguri",     "600", "HindSiliguri-SemiBold.woff2"),
    ("Hind Siliguri",     "700", "HindSiliguri-Bold.woff2"),
    # Bengali — body
    ("Noto Sans Bengali", "400", "NotoSansBengali-Regular.woff2"),
    ("Noto Sans Bengali", "500", "NotoSansBengali-Medium.woff2"),
    ("Noto Sans Bengali", "600", "NotoSansBengali-SemiBold.woff2"),
    ("Noto Sans Bengali", "700", "NotoSansBengali-Bold.woff2"),
]

_GOOGLE_FONTS_IMPORT = (
    "@import url('https://fonts.googleapis.com/css2?"
    "family=Anton"
    "&family=Bebas+Neue"
    "&family=Oswald:wght@600;700"
    "&family=Montserrat:wght@400;700"
    "&family=Poppins:wght@500;700"
    "&family=Inter:wght@400;500;600;700"
    "&family=Hind+Siliguri:wght@400;600;700"
    "&family=Noto+Sans+Bengali:wght@400;500;600;700"
    "&display=swap');"
)


# Embedded Latin families — any other font Gemini picks must be snapped to one
# of these or it renders as the browser default sans-serif (no @import offline).
_EMBEDDED_LATIN = {"Anton", "Bebas Neue", "Oswald", "Montserrat", "Poppins", "Inter"}
_EMBEDDED_BENGALI = {"Hind Siliguri", "Noto Sans Bengali"}

# Fallback map for non-embedded Latin fonts (closest aesthetic match)
_LATIN_SNAP: dict[str, str] = {
    # Condensed / tall display
    "Bebas Neue Pro": "Bebas Neue",
    "Barlow Condensed": "Oswald",
    "Fjalla One": "Oswald",
    # Geometric sans
    "Montserrat Alternates": "Montserrat",
    "Nunito": "Poppins",
    "Raleway": "Montserrat",
    "DM Sans": "Inter",
    "Plus Jakarta Sans": "Inter",
    # Slab / other
    "Roboto Condensed": "Oswald",
    "Roboto": "Inter",
    "Open Sans": "Inter",
    "Lato": "Inter",
    "Source Sans Pro": "Inter",
}


def _has_bengali(text: str) -> bool:
    """True if the string contains any Bengali-script codepoint (U+0980–U+09FF)."""
    return any("ঀ" <= ch <= "৿" for ch in text)


def _snap_font_family(font_family: str, font_size: int, content: str) -> str:
    """
    Map any requested font onto an embedded family so it always renders.
    - Bengali content → Hind Siliguri (display) or Noto Sans Bengali (body)
    - Latin content   → pass through if embedded; lookup snap map; else
                        Bebas Neue (display ≥44px) or Montserrat (body)
    Already-embedded families pass through unchanged.
    """
    if _has_bengali(content):
        if font_family in _EMBEDDED_BENGALI:
            return font_family
        return "Hind Siliguri" if font_size >= 44 else "Noto Sans Bengali"
    if font_family in _EMBEDDED_LATIN:
        return font_family
    if font_family in _LATIN_SNAP:
        return _LATIN_SNAP[font_family]
    # Unknown font — pick best embedded match by size
    return "Bebas Neue" if font_size >= 44 else "Montserrat"


def _build_fonts_css() -> str:
    """
    Return font CSS. Uses locally cached woff2 base64 data URIs when all four
    font families are present in backend/fonts/ — making renders fully offline.
    Falls back to the Google Fonts @import when any font file is missing.
    """
    if not _FONTS_DIR.exists():
        return _GOOGLE_FONTS_IMPORT

    blocks: list[str] = []
    for family, weight, filename in _FONT_FILES:
        fp = _FONTS_DIR / filename
        if not fp.exists():
            # At least one font missing — fall back to network import
            return _GOOGLE_FONTS_IMPORT
        b64 = base64.b64encode(fp.read_bytes()).decode("ascii")
        blocks.append(
            f"@font-face {{\n"
            f"  font-family: '{family}';\n"
            f"  font-weight: {weight};\n"
            f"  font-style: normal;\n"
            f"  font-display: block;\n"
            f"  src: url('data:font/woff2;base64,{b64}') format('woff2');\n"
            f"}}"
        )
    return "\n".join(blocks)


# ── Position keyword → CSS ────────────────────────────────────────────────────

POSITION_CSS: dict[str, str] = {
    "top-left":      "top:0; left:0;",
    "top-center":    "top:0; left:50%; transform:translateX(-50%);",
    "top-right":     "top:0; right:0;",
    "center-left":   "top:50%; left:0; transform:translateY(-50%);",
    "center":        "top:50%; left:50%; transform:translate(-50%,-50%);",
    "center-right":  "top:50%; right:0; transform:translateY(-50%);",
    "bottom-left":   "bottom:0; left:0;",
    "bottom-center": "bottom:0; left:50%; transform:translateX(-50%);",
    "bottom-right":  "bottom:0; right:0;",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _img_to_data_uri(path: str) -> str:
    """Encode a local image file as a base64 data URI for inline embedding."""
    p = Path(path)
    if not p.exists():
        return ""
    suffix = p.suffix.lower().lstrip(".")
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp"}.get(suffix, "image/png")
    data = base64.b64encode(p.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{data}"


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Parse '#RRGGBB' → (r, g, b). Falls back to black on bad input."""
    try:
        h = (hex_color or "").lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except Exception:
        return 0, 0, 0


def _px(value: Optional[int | str]) -> str:
    """Convert an int to px string, or pass through 'auto'."""
    if value is None or value == "auto":
        return "auto"
    return f"{value}px"


def _margin_css(margin: Optional[dict]) -> str:
    if not margin:
        return ""
    parts = []
    for side in ("top", "right", "bottom", "left"):
        v = margin.get(side)
        if v is not None and v != 0:
            parts.append(f"margin-{side}:{v}px;")
    return " ".join(parts)


def _scale_layer(layer: dict, sx: float, sy: float) -> dict:
    """
    Return a deep copy of a blueprint layer with all numeric pixel values
    scaled proportionally to the target canvas size.

    sx = canvas_width  / 1080  (horizontal scale — text width, image width, x-margins)
    sy = canvas_height / 1080  (vertical scale   — image height, y-margins)

    Blueprints are authored for a 1080×1080 reference canvas.  This function
    lets the same design look proportionally identical on 1080×1920 or 1920×1080.
    Non-numeric values ("auto", None, strings) are left untouched.
    """
    import copy as _copy
    l = _copy.deepcopy(layer)

    def _s(v, factor):
        """Scale v by factor only when v is a real number."""
        return round(v * factor) if isinstance(v, (int, float)) else v

    # ── Text properties ───────────────────────────────────────────
    if "font_size" in l:
        l["font_size"] = _s(l["font_size"], sx)
    if "max_width" in l:
        l["max_width"] = _s(l["max_width"], sx)
    if "letter_spacing" in l and l["letter_spacing"] is not None:
        l["letter_spacing"] = round(l["letter_spacing"] * sx, 1)
    if "border_radius" in l:
        l["border_radius"] = _s(l["border_radius"], min(sx, sy))

    # ── Image / element size ──────────────────────────────────────
    size = l.get("size")
    if isinstance(size, dict):
        if isinstance(size.get("width"), (int, float)):
            size["width"] = _s(size["width"], sx)
        if isinstance(size.get("height"), (int, float)):
            size["height"] = _s(size["height"], sy)

    # ── Margins (top/bottom → sy, left/right → sx) ───────────────
    margin = l.get("margin")
    if isinstance(margin, dict):
        for side, factor in (("top", sy), ("bottom", sy), ("left", sx), ("right", sx)):
            if isinstance(margin.get(side), (int, float)):
                margin[side] = _s(margin[side], factor)

    # ── Padding (top/bottom → sy, left/right → sx) ───────────────
    padding = l.get("padding")
    if isinstance(padding, dict):
        for side, factor in (("top", sy), ("bottom", sy), ("left", sx), ("right", sx)):
            if isinstance(padding.get(side), (int, float)):
                padding[side] = _s(padding[side], factor)

    return l


def _padding_css(padding: Optional[dict]) -> str:
    if not padding:
        return ""
    t = padding.get("top", 0)
    r = padding.get("right", 0)
    b = padding.get("bottom", 0)
    l = padding.get("left", 0)
    return f"padding:{t}px {r}px {b}px {l}px;"


# ── Layer renderers ───────────────────────────────────────────────────────────

def _render_overlay(layer: dict) -> str:
    """Render a full-canvas gradient overlay div."""
    style_obj = layer.get("style", {})
    bg = style_obj.get("background", "transparent")
    z = layer.get("z_index", 1)
    return (
        f'<div style="position:absolute; top:0; left:0; width:100%; height:100%; '
        f'background:{bg}; z-index:{z};"></div>'
    )


def _text_luminance(hex_color: str) -> float:
    """
    Return perceptual relative luminance (0–1) for a hex color.
    Uses the sRGB linearisation from WCAG 2.1.
    """
    r, g, b = _hex_to_rgb(hex_color)
    def lin(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def _auto_text_align(position: str) -> str:
    """Derive a sensible text-align from the 9-point position keyword."""
    if "center" in position:
        return "center"
    if "right" in position:
        return "right"
    return "left"


def _render_text(layer: dict) -> str:
    """Render a text layer — either plain text or a CTA button."""
    content        = layer.get("content", "")
    font_family    = layer.get("font_family", "Inter")
    font_size      = layer.get("font_size", 24)
    font_weight    = layer.get("font_weight", 400)
    color          = layer.get("color", "#FFFFFF")
    transform      = layer.get("text_transform", "none")
    max_width      = layer.get("max_width")
    line_height    = layer.get("line_height", 1.4)
    z              = layer.get("z_index", 10)
    position       = layer.get("position", "top-left")
    margin         = layer.get("margin", {})
    bg_color       = layer.get("background_color")
    border_r       = layer.get("border_radius", 0)
    padding        = layer.get("padding")
    letter_spacing = layer.get("letter_spacing")  # float | None, in px
    # text_align: explicit from blueprint, else auto-derived from position
    text_align = layer.get("text_align") or _auto_text_align(position)

    pos_css = POSITION_CSS.get(position, POSITION_CSS["top-left"])
    margin_css = _margin_css(margin)
    max_w_css = f"max-width:{max_width}px;" if max_width else ""
    ls_css = f"letter-spacing:{letter_spacing}px;" if letter_spacing is not None else ""

    # Snap to an embedded font so it never falls back to browser default.
    is_bn = _has_bengali(content)
    font_family = _snap_font_family(font_family, font_size, content)
    lang_attr = 'lang="bn"' if is_bn else 'lang="en"'

    # CTA button variant
    if bg_color:
        pad_css = _padding_css(padding) if padding else "padding:12px 24px;"
        _r, _g, _b = _hex_to_rgb(bg_color)
        box_shadow = (
            f"box-shadow: 0 4px 24px rgba({_r},{_g},{_b},0.55), "
            f"0 2px 8px rgba(0,0,0,0.40);"
        )
        return (
            f'<div {lang_attr} style="position:absolute; {pos_css} {margin_css} z-index:{z}; '
            f'text-align:{text_align};">'
            f'<span style="display:inline-block; font-family:\'{font_family}\', sans-serif; '
            f'font-size:{font_size}px; font-weight:{font_weight}; color:{color}; '
            f'background:{bg_color}; {pad_css} border-radius:{border_r}px; '
            f'text-transform:{transform}; line-height:{line_height}; {ls_css} '
            f'{box_shadow} white-space:nowrap;">'
            f'{content}</span></div>'
        )

    # Adaptive drop shadow: dark shadow for light text, light shadow for dark text.
    # This prevents black-on-black when a brand uses dark-colored headlines.
    lum = _text_luminance(color)
    if lum > 0.4:
        # Light text on dark/busy background — deep dark shadow
        shadow = (
            "text-shadow: 0 4px 24px rgba(0,0,0,0.70), 0 2px 6px rgba(0,0,0,0.60);"
            if font_size >= 44
            else "text-shadow: 0 2px 10px rgba(0,0,0,0.60);"
        )
    else:
        # Dark text — use a soft white halo for legibility over light areas
        shadow = (
            "text-shadow: 0 2px 12px rgba(255,255,255,0.80), 0 1px 4px rgba(255,255,255,0.60);"
            if font_size >= 44
            else "text-shadow: 0 1px 6px rgba(255,255,255,0.70);"
        )

    return (
        f'<div {lang_attr} style="position:absolute; {pos_css} {margin_css} {max_w_css} z-index:{z}; '
        f'font-family:\'{font_family}\', sans-serif; font-size:{font_size}px; '
        f'font-weight:{font_weight}; color:{color}; text-transform:{transform}; '
        f'line-height:{line_height}; text-align:{text_align}; {ls_css} '
        f'word-break:keep-all; {shadow}">'
        f'{content}</div>'
    )


def _render_image(layer: dict, asset_uri: str, accent: str = "#000000", canvas_width: int = 1080) -> str:
    """Render an image layer (logo or product image)."""
    if not asset_uri:
        return ""
    size   = layer.get("size", {})
    w      = size.get("width", "auto")
    h      = size.get("height", "auto")
    z      = layer.get("z_index", 5)
    pos    = layer.get("position", "top-left")
    margin = layer.get("margin", {})
    asset_key = layer.get("asset_key", "")

    # Safety net for product images: enforce a minimum hero size regardless of
    # what Gemini specifies. The minimum is 38% of canvas width (~410px on 1080).
    # This catches two failure modes:
    #   1. auto+auto  — image renders at intrinsic file size (typically ~200px)
    #   2. explicit but undersized — Gemini sets e.g. width:220 despite the prompt
    if asset_key == "product_image_url":
        min_w = int(canvas_width * 0.38)
        if w == "auto" and h == "auto":
            # No size specified at all — use 42% as the default
            w = int(canvas_width * 0.42)
        elif isinstance(w, (int, float)) and w < min_w:
            # Explicit width is set but too small — clamp up to minimum
            w = min_w

    pos_css    = POSITION_CSS.get(pos, POSITION_CSS["top-left"])
    margin_css = _margin_css(margin)
    w_css = f"width:{_px(w)};" if w != "auto" else "width:auto;"
    h_css = f"height:{_px(h)};" if h != "auto" else "height:auto;"

    # Product images get a grounding drop-shadow plus a soft accent glow so they
    # read as composited into the scene instead of pasted flat on top.
    if asset_key == "product_image_url":
        _r, _g, _b = _hex_to_rgb(accent)
        filter_css = (
            f"filter: drop-shadow(0 28px 36px rgba(0,0,0,0.65)) "
            f"drop-shadow(0 0 60px rgba({_r},{_g},{_b},0.45));"
        )
    elif asset_key == "logo_url":
        # Subtle shadow keeps the logo legible over busy/light backgrounds.
        filter_css = "filter: drop-shadow(0 2px 6px rgba(0,0,0,0.45));"
    else:
        filter_css = ""

    return (
        f'<img src="{asset_uri}" '
        f'style="position:absolute; {pos_css} {margin_css} {w_css} {h_css} '
        f'z-index:{z}; object-fit:contain; {filter_css}" />'
    )


# ── Main builder ──────────────────────────────────────────────────────────────

def build_html(blueprint: dict, brand: dict, assets: dict) -> str:
    """
    Build a complete self-contained HTML string for Playwright screenshot.

    Args:
        blueprint: Parsed blueprint.json dict
        brand:     Parsed brand.json dict
        assets:    Dict of resolved absolute file paths:
                   {
                     "logo_url":          "/abs/path/volt_bd_logo.png",
                     "product_image_url": "/abs/path/volt_bd_can.png",
                     "background_url":    "/abs/path/bg.png" or None
                   }

    Returns:
        Complete HTML string, ready for page.set_content().
    """
    fmt    = blueprint.get("format", {})
    width  = fmt.get("width", 1080)
    height = fmt.get("height", 1080)
    bg     = blueprint.get("background", {})
    layers = blueprint.get("layers", [])

    # ── Background ────────────────────────────────────────────────
    bg_url  = assets.get("background_url")
    bg_css  = (
        f"background-image: url('{bg_url}'); background-size: cover; background-position: center;"
        if bg_url else
        f"background-color: {bg.get('fallback_color', '#0D0D0D')};"
    )

    # ── Resolve logo/product assets ───────────────────────────────
    # Remote (http/https) URLs are passed straight through — the headless
    # browser fetches them. Only local file paths are base64-encoded as
    # data URIs to avoid file:// path issues in headless browsers.
    asset_uris: dict[str, str] = {}
    for key in ("logo_url", "product_image_url"):
        path = assets.get(key, "")
        if not path:
            continue
        if str(path).startswith("http"):
            asset_uris[key] = path
        else:
            asset_uris[key] = _img_to_data_uri(path)

    # Also embed background as data URI if it's a local file
    if bg_url and not bg_url.startswith("http"):
        bg_encoded = _img_to_data_uri(bg_url)
        if bg_encoded:
            bg_css = (
                f"background-image: url('{bg_encoded}'); "
                f"background-size: cover; background-position: center;"
            )

    # ── Sort layers by z_index ────────────────────────────────────
    sorted_layers = sorted(layers, key=lambda l: l.get("z_index", 0))

    # ── Scale all layer values to match the actual canvas size ────
    # Blueprints are authored for a 1080×1080 reference canvas.
    # Scaling ensures text, images, and margins look proportionally
    # identical on 1080×1920 (9:16) and 1920×1080 (16:9) formats.
    _REF = 1080
    sx = width  / _REF   # horizontal scale (font-size, widths, x-margins)
    sy = height / _REF   # vertical scale   (heights, y-margins)
    if sx != 1.0 or sy != 1.0:
        sorted_layers = [_scale_layer(l, sx, sy) for l in sorted_layers]

    # Brand accent used for the product-image glow (falls back to primary/white).
    brand_colors = brand.get("colors", {}) if isinstance(brand, dict) else {}
    accent = brand_colors.get("accent") or brand_colors.get("primary") or "#FFFFFF"

    # ── Render each layer ─────────────────────────────────────────
    layer_html_parts: list[str] = []
    for layer in sorted_layers:
        source = layer.get("source")
        ltype  = layer.get("type")
        optional = layer.get("optional", False)

        if source == "rendered":
            if ltype == "overlay":
                layer_html_parts.append(_render_overlay(layer))
            elif ltype == "text":
                layer_html_parts.append(_render_text(layer))

        elif source == "uploaded":
            if ltype == "image":
                asset_key = layer.get("asset_key", "")
                uri = asset_uris.get(asset_key, "")
                if not uri and optional:
                    continue  # skip optional layers with missing assets
                layer_html_parts.append(_render_image(layer, uri, accent, canvas_width=width))

    layers_html = "\n    ".join(layer_html_parts)

    # ── Assemble HTML ─────────────────────────────────────────────
    fonts_css = _build_fonts_css()

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={width}, initial-scale=1.0" />
<style>
  /* ── Fonts (embedded base64 when backend/fonts/ exists, else Google Fonts) ── */
  {fonts_css}

  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }}

  html, body {{
    width: {width}px;
    height: {height}px;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }}

  .canvas {{
    position: relative;
    width: {width}px;
    height: {height}px;
    overflow: hidden;
    {bg_css}
  }}
</style>
</head>
<body>
  <div class="canvas">
    {layers_html}
  </div>
</body>
</html>"""

    return html
