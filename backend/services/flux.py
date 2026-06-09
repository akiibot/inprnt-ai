"""
Imprnt AI — Imagen 3 Background Generation Service
Calls Google Imagen 3 via the google-genai SDK to generate campaign backgrounds.
"""
import time as _time
from google.genai import types
from services.gemini import get_gemini

IMAGEN_MODEL = "imagen-3.0-generate-002"

_RETRY_WAITS = [5, 15, 30]


def _with_retry(fn):
    """Call fn(), retrying up to 3 times on Imagen 429/RESOURCE_EXHAUSTED."""
    last_exc = None
    for i, wait in enumerate([0] + _RETRY_WAITS):
        if wait:
            print(f"[flux] Quota hit; retrying in {wait}s (attempt {i + 1}/4)...")
            _time.sleep(wait)
        try:
            return fn()
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                last_exc = e
            else:
                raise
    raise last_exc


def _imagen_aspect_ratio(width: int, height: int) -> str:
    ratio = width / height
    if ratio > 1.5:
        return "16:9"
    if ratio < 0.7:
        return "9:16"
    return "1:1"


def generate_background(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    negative_prompt: str = "",
) -> bytes:
    """
    Generates a background image using Google Imagen 3.
    Automatically selects the correct aspect ratio from poster dimensions.
    Returns the image as bytes.
    """
    client = get_gemini()
    ar = _imagen_aspect_ratio(width, height)
    enhanced_prompt = f"{prompt}, no text, no letters, no words, no writing, no watermark, clean background"

    print(f"Calling Imagen 3 [{ar}] for background generation...")
    config = types.GenerateImagesConfig(
        aspect_ratio=ar,
        number_of_images=1,
    )
    if negative_prompt:
        config = types.GenerateImagesConfig(
            aspect_ratio=ar,
            number_of_images=1,
            negative_prompt=negative_prompt,
        )

    response = _with_retry(lambda: client.models.generate_images(
        model=IMAGEN_MODEL,
        prompt=enhanced_prompt,
        config=config,
    ))

    return response.generated_images[0].image.image_bytes
