"""
Imprnt AI — Video Composition Template Builder
build_video_html(blueprint, brand, assets, video_plan) → HyperFrames composition HTML

Extends the static poster template (template.py) with:
- Stable id="layer-{id}" on every element (for GSAP targeting)
- data-start / data-duration / data-track-index timing attributes
- data-composition-id / data-width / data-height on the stage div
- GSAP 3 CDN script + window.__timelines registration
"""
from __future__ import annotations

import json
from typing import Optional

from compositor.template import (
    _build_fonts_css,
    _snap_font_family,
    _has_bengali,
    _hex_to_rgb,
    _img_to_data_uri,
    _margin_css,
    _padding_css,
    _px,
    POSITION_CSS,
)


# ── Timing helpers ────────────────────────────────────────────────────────────

def _build_timing_map(video_plan: dict) -> dict[str, tuple[float, float]]:
    """
    Returns {layer_id: (data_start, data_duration)} from video_plan.animations.
    data_duration = total_duration - start_sec so each element stays visible
    until the end.
    """
    total = float(video_plan.get("duration_sec", 6.0))
    mapping: dict[str, tuple[float, float]] = {}
    for anim in video_plan.get("animations", []):
        lid = anim.get("layer_id", "")
        start = float(anim.get("start_sec", 0.0))
        mapping[lid] = (start, max(0.1, total - start))
    return mapping


def _timing_attrs(layer_id: str, timing_map: dict, track_index: int, total_duration: float) -> str:
    """Return the HyperFrames data-* timing attributes for one layer."""
    start, duration = timing_map.get(layer_id, (0.0, total_duration))
    return (
        f'data-start="{start:.2f}" '
        f'data-duration="{duration:.2f}" '
        f'data-track-index="{track_index}"'
    )


# ── Layer renderers (video-aware) ─────────────────────────────────────────────

def _render_overlay_video(layer: dict, timing_map: dict, track_index: int, total: float) -> str:
    style_obj = layer.get("style", {})
    bg = style_obj.get("background", "transparent")
    z = layer.get("z_index", 1)
    lid = layer.get("id", f"overlay-{track_index}")
    timing = _timing_attrs(lid, timing_map, track_index, total)
    return (
        f'<div id="layer-{lid}" {timing} '
        f'style="position:absolute; top:0; left:0; width:100%; height:100%; '
        f'background:{bg}; z-index:{z};"></div>'
    )


def _render_text_video(layer: dict, timing_map: dict, track_index: int, total: float) -> str:
    content     = layer.get("content", "")
    font_family = layer.get("font_family", "Inter")
    font_size   = layer.get("font_size", 24)
    font_weight = layer.get("font_weight", 400)
    color       = layer.get("color", "#FFFFFF")
    transform   = layer.get("text_transform", "none")
    max_width   = layer.get("max_width")
    line_height = layer.get("line_height", 1.4)
    z           = layer.get("z_index", 10)
    position    = layer.get("position", "top-left")
    margin      = layer.get("margin", {})
    bg_color    = layer.get("background_color")
    border_r    = layer.get("border_radius", 0)
    padding     = layer.get("padding")
    lid         = layer.get("id", f"text-{track_index}")

    pos_css    = POSITION_CSS.get(position, POSITION_CSS["top-left"])
    margin_css = _margin_css(margin)
    max_w_css  = f"max-width:{max_width}px;" if max_width else ""
    lang_attr  = 'lang="bn"' if _has_bengali(content) else 'lang="en"'
    font_family = _snap_font_family(font_family, font_size, content)
    timing = _timing_attrs(lid, timing_map, track_index, total)

    if bg_color:
        pad_css = _padding_css(padding) if padding else "padding:12px 24px;"
        return (
            f'<div id="layer-{lid}" {timing} {lang_attr} '
            f'style="position:absolute; {pos_css} {margin_css} z-index:{z};">'
            f'<span style="display:inline-block; font-family:\'{font_family}\', sans-serif; '
            f'font-size:{font_size}px; font-weight:{font_weight}; color:{color}; '
            f'background:{bg_color}; {pad_css} border-radius:{border_r}px; '
            f'text-transform:{transform}; line-height:{line_height}; white-space:nowrap;">'
            f'{content}</span></div>'
        )

    shadow = (
        "text-shadow: 0 4px 24px rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.55);"
        if font_size >= 44 else
        "text-shadow: 0 2px 10px rgba(0,0,0,0.55);"
    )
    return (
        f'<div id="layer-{lid}" {timing} {lang_attr} '
        f'style="position:absolute; {pos_css} {margin_css} {max_w_css} z-index:{z}; '
        f'font-family:\'{font_family}\', sans-serif; font-size:{font_size}px; '
        f'font-weight:{font_weight}; color:{color}; text-transform:{transform}; '
        f'line-height:{line_height}; word-break:keep-all; {shadow}">'
        f'{content}</div>'
    )


def _render_image_video(layer: dict, asset_uri: str, accent: str, timing_map: dict, track_index: int, total: float) -> str:
    if not asset_uri:
        return ""
    size      = layer.get("size", {})
    w         = size.get("width", "auto")
    h         = size.get("height", "auto")
    z         = layer.get("z_index", 5)
    pos       = layer.get("position", "top-left")
    margin    = layer.get("margin", {})
    asset_key = layer.get("asset_key", "")
    lid       = layer.get("id", f"image-{track_index}")

    pos_css    = POSITION_CSS.get(pos, POSITION_CSS["top-left"])
    margin_css = _margin_css(margin)
    w_css = f"width:{_px(w)};" if w != "auto" else "width:auto;"
    h_css = f"height:{_px(h)};" if h != "auto" else "height:auto;"
    timing = _timing_attrs(lid, timing_map, track_index, total)

    if asset_key == "product_image_url":
        _r, _g, _b = _hex_to_rgb(accent)
        filter_css = (
            f"filter: drop-shadow(0 28px 36px rgba(0,0,0,0.65)) "
            f"drop-shadow(0 0 60px rgba({_r},{_g},{_b},0.45));"
        )
    elif asset_key == "logo_url":
        filter_css = "filter: drop-shadow(0 2px 6px rgba(0,0,0,0.45));"
    else:
        filter_css = ""

    return (
        f'<img id="layer-{lid}" {timing} src="{asset_uri}" '
        f'style="position:absolute; {pos_css} {margin_css} {w_css} {h_css} '
        f'z-index:{z}; object-fit:contain; {filter_css}" />'
    )


# ── GSAP script builder ───────────────────────────────────────────────────────

def _build_gsap_script(video_plan: dict, composition_id: str) -> str:
    """
    Build the inline <script> block that creates a paused GSAP timeline
    and registers it on window.__timelines for HyperFrames to seek.
    """
    animations = video_plan.get("animations", [])
    lines = ["const tl = gsap.timeline({ paused: true });"]

    for anim in animations:
        lid = anim.get("layer_id", "")
        gsap_from = anim.get("gsap_from", {"opacity": 0})
        gsap_to = anim.get("gsap_to", {"duration": 0.6, "ease": "power2.out"})
        start = float(anim.get("start_sec", 0.0))

        from_json = json.dumps(gsap_from)
        to_json = json.dumps(gsap_to)
        lines.append(f'tl.from("#layer-{lid}", {from_json}, {to_json}, {start:.2f});')

    comp_id_js = json.dumps(composition_id)
    lines += [
        "window.__timelines = window.__timelines || {};",
        f"window.__timelines[{comp_id_js}] = tl;",
    ]
    body = "\n  ".join(lines)
    return f"""<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script>
  {body}
</script>"""


# ── Main builder ──────────────────────────────────────────────────────────────

def build_video_html(blueprint: dict, brand: dict, assets: dict, video_plan: dict) -> str:
    """
    Build a complete HyperFrames composition HTML string.

    Args:
        blueprint:  blueprint.json dict (layers, format, background)
        brand:      brand.json dict
        assets:     { "logo_url": str, "product_image_url": str, "background_url": str }
        video_plan: validated video_plan dict (duration_sec, fps, canvas, animations)

    Returns:
        Full HTML string ready for HyperFrames to render.
    """
    fmt    = blueprint.get("format", {})
    width  = fmt.get("width", 1080)
    height = fmt.get("height", 1080)
    bg     = blueprint.get("background", {})
    layers = blueprint.get("layers", [])

    composition_id = blueprint.get("blueprint_id", "imprnt-video")
    total_duration = float(video_plan.get("duration_sec", 6.0))

    timing_map = _build_timing_map(video_plan)

    # ── Background ────────────────────────────────────────────────
    bg_url = assets.get("background_url")
    bg_css = (
        f"background-image: url('{bg_url}'); background-size: cover; background-position: center;"
        if bg_url else
        f"background-color: {bg.get('fallback_color', '#0D0D0D')};"
    )

    # ── Resolve assets ────────────────────────────────────────────
    asset_uris: dict[str, str] = {}
    for key in ("logo_url", "product_image_url"):
        path = assets.get(key, "")
        if not path:
            continue
        if str(path).startswith("http"):
            asset_uris[key] = path
        else:
            asset_uris[key] = _img_to_data_uri(path)

    if bg_url and not bg_url.startswith("http"):
        bg_encoded = _img_to_data_uri(bg_url)
        if bg_encoded:
            bg_css = (
                f"background-image: url('{bg_encoded}'); "
                f"background-size: cover; background-position: center;"
            )

    # ── Brand accent ──────────────────────────────────────────────
    brand_colors = brand.get("colors", {}) if isinstance(brand, dict) else {}
    accent = brand_colors.get("accent") or brand_colors.get("primary") or "#FFFFFF"

    # ── Render layers ─────────────────────────────────────────────
    sorted_layers = sorted(layers, key=lambda l: l.get("z_index", 0))
    layer_html_parts: list[str] = []

    for track_index, layer in enumerate(sorted_layers):
        source   = layer.get("source")
        ltype    = layer.get("type")
        optional = layer.get("optional", False)

        if source == "rendered":
            if ltype == "overlay":
                layer_html_parts.append(_render_overlay_video(layer, timing_map, track_index, total_duration))
            elif ltype == "text":
                layer_html_parts.append(_render_text_video(layer, timing_map, track_index, total_duration))

        elif source == "uploaded" and ltype == "image":
            asset_key = layer.get("asset_key", "")
            uri = asset_uris.get(asset_key, "")
            if not uri and optional:
                continue
            layer_html_parts.append(_render_image_video(layer, uri, accent, timing_map, track_index, total_duration))

    layers_html = "\n    ".join(layer_html_parts)
    fonts_css = _build_fonts_css()
    gsap_script = _build_gsap_script(video_plan, composition_id)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={width}, initial-scale=1.0" />
<style>
  {fonts_css}

  * {{ box-sizing: border-box; margin: 0; padding: 0; }}

  html, body {{
    width: {width}px;
    height: {height}px;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }}

  .stage {{
    position: relative;
    width: {width}px;
    height: {height}px;
    overflow: hidden;
    {bg_css}
  }}
</style>
</head>
<body>
  <div class="stage"
    data-composition-id="{composition_id}"
    data-width="{width}"
    data-height="{height}"
    data-start="0"
    data-duration="{total_duration:.1f}">
    {layers_html}
  </div>
  {gsap_script}
</body>
</html>"""
