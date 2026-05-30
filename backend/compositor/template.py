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


def _render_text(layer: dict) -> str:
    """Render a text layer — either plain text or a CTA button."""
    content      = layer.get("content", "")
    font_family  = layer.get("font_family", "Inter")
    font_size    = layer.get("font_size", 24)
    font_weight  = layer.get("font_weight", 400)
    color        = layer.get("color", "#FFFFFF")
    transform    = layer.get("text_transform", "none")
    max_width    = layer.get("max_width")
    line_height  = layer.get("line_height", 1.4)
    z            = layer.get("z_index", 10)
    position     = layer.get("position", "top-left")
    margin       = layer.get("margin", {})
    bg_color     = layer.get("background_color")
    border_r     = layer.get("border_radius", 0)
    padding      = layer.get("padding")

    pos_css = POSITION_CSS.get(position, POSITION_CSS["top-left"])
    margin_css = _margin_css(margin)
    max_w_css = f"max-width:{max_width}px;" if max_width else ""

    # Determine if Bengali font — set lang attribute accordingly
    is_bn = any(bn in font_family for bn in ["Siliguri", "Bengali", "Noto Sans Bengali"])
    lang_attr = 'lang="bn"' if is_bn else 'lang="en"'

    # CTA button variant
    if bg_color:
        pad_css = _padding_css(padding) if padding else "padding:12px 24px;"
        return (
            f'<div {lang_attr} style="position:absolute; {pos_css} {margin_css} z-index:{z};">'
            f'<span style="display:inline-block; font-family:\'{font_family}\', sans-serif; '
            f'font-size:{font_size}px; font-weight:{font_weight}; color:{color}; '
            f'background:{bg_color}; {pad_css} border-radius:{border_r}px; '
            f'text-transform:{transform}; line-height:{line_height}; white-space:nowrap;">'
            f'{content}</span></div>'
        )

    # Plain text variant
    return (
        f'<div {lang_attr} style="position:absolute; {pos_css} {margin_css} {max_w_css} z-index:{z}; '
        f'font-family:\'{font_family}\', sans-serif; font-size:{font_size}px; '
        f'font-weight:{font_weight}; color:{color}; text-transform:{transform}; '
        f'line-height:{line_height}; word-break:keep-all;">'
        f'{content}</div>'
    )


def _render_image(layer: dict, asset_uri: str) -> str:
    """Render an image layer (logo or product image)."""
    if not asset_uri:
        return ""
    size   = layer.get("size", {})
    w      = size.get("width", "auto")
    h      = size.get("height", "auto")
    z      = layer.get("z_index", 5)
    pos    = layer.get("position", "top-left")
    margin = layer.get("margin", {})

    pos_css    = POSITION_CSS.get(pos, POSITION_CSS["top-left"])
    margin_css = _margin_css(margin)
    w_css = f"width:{_px(w)};" if w != "auto" else "width:auto;"
    h_css = f"height:{_px(h)};" if h != "auto" else "height:auto;"

    return (
        f'<img src="{asset_uri}" '
        f'style="position:absolute; {pos_css} {margin_css} {w_css} {h_css} '
        f'z-index:{z}; object-fit:contain;" />'
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
                layer_html_parts.append(_render_image(layer, uri))

    layers_html = "\n    ".join(layer_html_parts)

    # ── Assemble HTML ─────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={width}, initial-scale=1.0" />
<style>
  /* ── Google Fonts — ALL 4 FONTS LOADED FROM PHASE 1 DAY ONE ── */
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Hind+Siliguri:wght@400;600;700&family=Inter:wght@400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap');

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
