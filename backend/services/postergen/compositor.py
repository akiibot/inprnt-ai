from PIL import Image, ImageDraw, ImageFilter
import numpy as np

LOGO_WIDTH_RATIO = 0.15
PADDING_RATIO = 0.03

_LOGO_PLACEMENT_MAP = {
    "bottom-left":   lambda w, h, lw, lh, px, py: (px, h - lh - py),
    "bottom-right":  lambda w, h, lw, lh, px, py: (w - lw - px, h - lh - py),
    "top-left":      lambda w, h, lw, lh, px, py: (px, py),
    "top-right":     lambda w, h, lw, lh, px, py: (w - lw - px, py),
    "center-bottom": lambda w, h, lw, lh, px, py: ((w - lw) // 2, h - lh - py),
    "center-top":    lambda w, h, lw, lh, px, py: ((w - lw) // 2, py),
}

# Product anchor points (cx, cy as fractions of poster w/h)
_PRODUCT_ANCHOR = {
    "center":        (0.50, 0.50),
    "left-center":   (0.28, 0.50),
    "right-center":  (0.72, 0.50),
    "center-top":    (0.50, 0.32),
    "center-bottom": (0.50, 0.68),
}


def _remove_background(img: Image.Image, threshold: int = 230) -> Image.Image:
    """
    Make near-white or near-solid corner-color pixels transparent.
    Works well for clean studio shots. Images that already have an alpha
    channel pass through untouched.
    """
    img = img.convert("RGBA")
    if _has_real_alpha(img):
        return img

    arr = np.array(img, dtype=np.uint16)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]

    # Sample the four corners to determine background colour
    h, w = arr.shape[:2]
    corners = [
        arr[0, 0, :3], arr[0, w - 1, :3],
        arr[h - 1, 0, :3], arr[h - 1, w - 1, :3],
    ]
    bg = np.mean(corners, axis=0)

    # Mask pixels within `threshold` distance of the background colour
    dist = np.sqrt(((arr[..., :3].astype(float) - bg) ** 2).sum(axis=-1))
    mask = dist < (255 - threshold)        # close to bg → transparent
    arr[..., 3] = np.where(mask, 0, 255).astype(np.uint8)

    # Slightly feather the edges so the cutout blends naturally
    result = Image.fromarray(arr.astype(np.uint8), "RGBA")
    alpha = result.split()[3].filter(ImageFilter.GaussianBlur(radius=1))
    result.putalpha(alpha)
    return result


def _has_real_alpha(img: Image.Image) -> bool:
    """True if the image already has meaningful transparency."""
    if img.mode != "RGBA":
        return False
    alpha = np.array(img.split()[3])
    return bool((alpha < 250).any())


def _add_drop_shadow(
    product: Image.Image,
    offset: tuple[int, int] = (8, 12),
    blur: int = 18,
    opacity: int = 140,
) -> tuple[Image.Image, tuple[int, int]]:
    """
    Returns (composited image with shadow, top-left offset to account for shadow expansion).
    """
    pad = blur * 2
    shadow_canvas = Image.new(
        "RGBA",
        (product.width + pad * 2, product.height + pad * 2),
        (0, 0, 0, 0),
    )
    # Paint shadow using product's alpha
    shadow_color = Image.new("RGBA", product.size, (0, 0, 0, opacity))
    shadow_color.putalpha(product.split()[3])
    shadow_canvas.paste(shadow_color, (pad + offset[0], pad + offset[1]), shadow_color)
    shadow_canvas = shadow_canvas.filter(ImageFilter.GaussianBlur(radius=blur))

    # Composite product on top of its shadow
    shadow_canvas.paste(product, (pad, pad), product)
    return shadow_canvas, (pad, pad)


def composite_logo(
    poster: Image.Image,
    logo_path: str,
    placement: str,
) -> Image.Image:
    poster_rgba = poster.convert("RGBA")
    logo = Image.open(logo_path).convert("RGBA")

    target_w = int(poster_rgba.width * LOGO_WIDTH_RATIO)
    scale = target_w / logo.width
    logo = logo.resize((target_w, int(logo.height * scale)), Image.LANCZOS)

    w, h = poster_rgba.size
    lw, lh = logo.size
    px, py = int(w * PADDING_RATIO), int(h * PADDING_RATIO)

    pos_fn = _LOGO_PLACEMENT_MAP.get(placement, _LOGO_PLACEMENT_MAP["bottom-left"])
    pos = pos_fn(w, h, lw, lh, px, py)

    layer = Image.new("RGBA", poster_rgba.size, (0, 0, 0, 0))
    layer.paste(logo, pos, logo)
    return Image.alpha_composite(poster_rgba, layer).convert("RGB")


def composite_product(
    poster: Image.Image,
    product_path: str,
    placement: str,
    size_ratio: float,
) -> Image.Image:
    poster_rgba = poster.convert("RGBA")
    w, h = poster_rgba.size

    product = Image.open(product_path).convert("RGBA")
    product = _remove_background(product)

    # Resolve anchor fractions FIRST so we can compute a placement-aware size cap.
    cx_frac, cy_frac = _PRODUCT_ANCHOR.get(placement, (0.50, 0.50))

    # Scale so product height = size_ratio * poster height
    target_h = int(h * max(0.2, min(size_ratio, 0.85)))
    scale = target_h / product.height
    new_w = int(product.width * scale)
    new_h = target_h

    # Cap width so the product fits within the poster when centred at cx_frac.
    # For an anchor near an edge (e.g. "right-center" at 72%), the available
    # half-width on the tight side is only 28% of w, so the full width must be
    # ≤ 2 × 28% = 56% of w — otherwise the product gets clipped at the edge.
    # A small inset margin (4%) keeps the product visually clear of the border.
    MARGIN = 0.04
    placement_max_w = int(2 * min(cx_frac - MARGIN, 1.0 - cx_frac - MARGIN) * w)
    global_max_w    = int(w * 0.80)
    max_w = max(int(w * 0.20), min(placement_max_w, global_max_w))

    if new_w > max_w:
        scale = max_w / product.width
        new_w = max_w
        new_h = int(product.height * scale)

    product = product.resize((new_w, new_h), Image.LANCZOS)

    # Add drop shadow
    product_with_shadow, (shadow_pad, _) = _add_drop_shadow(product)
    pw, ph = product_with_shadow.size

    # Centre the composited image on the anchor point
    cx = int(w * cx_frac)
    cy = int(h * cy_frac)
    paste_x = cx - pw // 2 + shadow_pad  # align real product centre, not shadow
    paste_y = cy - ph // 2

    layer = Image.new("RGBA", poster_rgba.size, (0, 0, 0, 0))
    # Clip to poster bounds
    src_x = max(0, -paste_x)
    src_y = max(0, -paste_y)
    dst_x = max(0, paste_x)
    dst_y = max(0, paste_y)
    crop_w = min(pw - src_x, w - dst_x)
    crop_h = min(ph - src_y, h - dst_y)
    if crop_w > 0 and crop_h > 0:
        region = product_with_shadow.crop((src_x, src_y, src_x + crop_w, src_y + crop_h))
        layer.paste(region, (dst_x, dst_y), region)

    return Image.alpha_composite(poster_rgba, layer).convert("RGB")
