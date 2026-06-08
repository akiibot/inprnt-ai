"""
Imprnt AI — Veo 3.1 Video Generator Service
Downloads poster PNG → calls Veo image-to-video API → polls → uploads MP4.

Mirrors the pattern from VeoTest (veo-3.1-generate-001):
  - Combined prompt: "{motion_prompt}\n\nAudio: {audio_prompt}"
  - config: generateAudio=True when audio_prompt is set
  - Video retrieval: check video.uri first (Vertex AI GCS path),
    fall back to video.video_bytes (AI Studio)
"""
from __future__ import annotations

import asyncio
import time

from google.genai import types

from services.gemini import get_gemini
from services.supabase_client import upload_file_to_storage

_VEO_MODEL = "veo-3.1-lite-generate-001"
_MAX_POLLS = 36   # 36 × 10s = 6-minute hard cap


def _build_prompt(veo_plan: dict) -> str:
    """Combine motion and audio prompts exactly as VeoTest does."""
    motion = veo_plan["motion_prompt"]
    audio = veo_plan.get("audio_prompt") or ""
    if audio.strip():
        return f"{motion}\n\nAudio: {audio.strip()}"
    return motion


def _download_from_uri(client, uri: str) -> bytes:
    """
    Download video bytes from a URI.
    - gs://bucket/path  → converted to HTTPS + downloaded with service account auth
    - https://...       → downloaded with service account auth (for Vertex AI signed URLs)
    - falls back to unauthenticated for public URLs
    """
    if uri.startswith("gs://"):
        http_url = "https://storage.googleapis.com/" + uri[5:]
    else:
        http_url = uri

    # Use service account credentials if on Vertex AI
    if client._api_client.vertexai:
        from google.auth.transport.requests import AuthorizedSession
        session = AuthorizedSession(client._api_client._credentials)
        resp = session.get(http_url, timeout=120)
        resp.raise_for_status()
        return resp.content

    # AI Studio — plain request (signed URL or public)
    import httpx
    resp = httpx.get(http_url, timeout=120, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def _get_video_bytes(client, video: types.Video) -> bytes:
    """
    Retrieve MP4 bytes from a generated Video object.
    Priority order (mirrors VeoTest):
      1. video.uri   — Vertex AI stores to GCS; download with auth
      2. video.video_bytes — AI Studio embeds bytes directly
    """
    if video.uri:
        return _download_from_uri(client, video.uri)

    if video.video_bytes:
        return video.video_bytes

    raise Exception(
        "Veo returned a video with neither a URI nor embedded bytes. "
        "The generation may have been filtered or failed silently."
    )


def _generate_veo_video_sync(
    poster_bytes: bytes,
    veo_plan: dict,
    campaign_id: str,
) -> bytes:
    """
    Calls Veo 3.1 with the poster as the first frame and the combined prompt,
    polls until the operation completes, and returns the MP4 bytes.
    Intended to run in an executor (blocking I/O).
    """
    client = get_gemini()

    prompt = _build_prompt(veo_plan)
    has_audio = bool((veo_plan.get("audio_prompt") or "").strip())

    operation = client.models.generate_videos(
        model=_VEO_MODEL,
        prompt=prompt,
        image=types.Image(image_bytes=poster_bytes, mime_type="image/png"),
        config=types.GenerateVideosConfig(
            aspect_ratio=veo_plan["aspect_ratio"],
            duration_seconds=veo_plan["duration_seconds"],
            generate_audio=has_audio,
        ),
    )

    polls = 0
    while not operation.done:
        if polls >= _MAX_POLLS:
            raise TimeoutError(
                f"Veo generation timed out after {_MAX_POLLS * 10}s "
                f"for campaign {campaign_id}"
            )
        time.sleep(10)
        operation = client.operations.get(operation)
        polls += 1

    if not operation.response or not operation.response.generated_videos:
        raise Exception(
            "Veo returned no generated videos. "
            "The request may have been filtered or failed silently."
        )

    video = operation.response.generated_videos[0].video
    return _get_video_bytes(client, video)


async def generate_and_upload_veo_video(
    campaign_id: str,
    poster_bytes: bytes,
    veo_plan: dict,
) -> tuple[str, float]:
    """
    Runs Veo generation in an executor (keeps FastAPI event loop free),
    then uploads the resulting MP4 to Supabase.
    Returns (supabase_video_url, elapsed_seconds).
    """
    start = time.time()
    loop = asyncio.get_running_loop()

    video_bytes: bytes = await loop.run_in_executor(
        None,
        lambda: _generate_veo_video_sync(poster_bytes, veo_plan, campaign_id),
    )

    ar_label = veo_plan.get("aspect_ratio", "9:16").replace(":", "x")
    storage_key = f"{campaign_id}/video_{ar_label}.mp4"

    video_url: str = await loop.run_in_executor(
        None,
        lambda: upload_file_to_storage(
            "campaigns", storage_key, video_bytes, "video/mp4"
        ),
    )

    return video_url, time.time() - start
