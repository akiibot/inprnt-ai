"""
Imprnt AI — PosterGen Engine: Generator

Generates a finished poster image (background + baked-in text) with Imagen 3 from
the brain's prompt, at a specific aspect ratio. When a product image is supplied,
it attempts Imagen 3 subject-reference (Vertex AI only) and falls back to plain
generation otherwise.

Reuses Imprnt's shared Gemini client (services.gemini.get_gemini).
"""
import io
import time as _time
from PIL import Image

from google.genai import types

from services.gemini import get_gemini

IMAGEN_MODEL = "imagen-3.0-generate-002"

# Imprnt aspect-ratio labels → Imagen aspect ratios (Imagen supports these natively)
_ASPECT_MAP = {"1:1": "1:1", "9:16": "9:16", "16:9": "16:9"}

_RETRY_WAITS = [5, 15, 30]


def _with_retry(fn):
    """Call fn(), retrying up to 3 times on Imagen 429/RESOURCE_EXHAUSTED."""
    last_exc = None
    for i, wait in enumerate([0] + _RETRY_WAITS):
        if wait:
            print(f"[postergen.generator] Quota hit; retrying in {wait}s (attempt {i + 1}/4)...")
            _time.sleep(wait)
        try:
            return fn()
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                last_exc = e
            else:
                raise
    raise last_exc


def _load_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def _to_pil(image_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")


def generate_poster(
    imagen_prompt: str,
    aspect_ratio: str,
    product_path: str | None = None,
) -> Image.Image:
    """Generate a single poster image at the given aspect ratio ("1:1"|"9:16"|"16:9")."""
    client = get_gemini()
    aspect = _ASPECT_MAP.get(aspect_ratio, "1:1")

    gen_config = types.GenerateImagesConfig(
        number_of_images=1,
        aspect_ratio=aspect,
        safety_filter_level="BLOCK_ONLY_HIGH",
        person_generation="ALLOW_ADULT",
    )

    if product_path:
        return _generate_with_subject_reference(client, imagen_prompt, gen_config, product_path)
    return _generate_plain(client, imagen_prompt, gen_config)


def _generate_plain(client, prompt: str, gen_config: types.GenerateImagesConfig) -> Image.Image:
    response = _with_retry(lambda: client.models.generate_images(
        model=IMAGEN_MODEL, prompt=prompt, config=gen_config
    ))
    return _to_pil(response.generated_images[0].image.image_bytes)


def _generate_with_subject_reference(client, prompt, gen_config, product_path: str) -> Image.Image:
    """Imagen 3 subject reference (Vertex AI). Falls back to plain generation if unsupported."""
    ref_cls = getattr(types, "ReferenceImage", None)
    if ref_cls is None:
        print("[postergen.generator] ReferenceImage unavailable in this SDK; plain generation.")
        return _generate_plain(client, prompt, gen_config)

    try:
        product_bytes = _load_bytes(product_path)
        reference_image = ref_cls(
            reference_id=1,
            reference_image=types.Image(image_bytes=product_bytes),
            reference_type=types.ReferenceType.SUBJECT,
            subject_image_config=types.SubjectImageConfig(subject_type=types.SubjectType.PRODUCT),
        )
        response = _with_retry(lambda: client.models.generate_images(
            model=IMAGEN_MODEL,
            prompt=prompt,
            config=types.GenerateImagesConfig(
                **{k: v for k, v in gen_config.__dict__.items() if v is not None},
                reference_images=[reference_image],
            ),
        ))
        return _to_pil(response.generated_images[0].image.image_bytes)
    except Exception as e:
        if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
            raise
        print(f"[postergen.generator] Subject reference failed ({e}); plain generation.")
        return _generate_plain(client, prompt, gen_config)
