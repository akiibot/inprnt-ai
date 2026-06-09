"""
Imprnt AI — Campaigns Router
POST /api/campaigns/plan
POST /api/campaigns/generate
POST /api/campaigns/generate-all
POST /api/campaigns/{id}/plan-video
POST /api/campaigns/{id}/generate-video
"""
import asyncio
import base64
import json
import shutil
import time
import traceback
import uuid
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from models.blueprint import (
    Blueprint,
    CampaignGenerateResponse,
    CampaignPlanRequest,
    CampaignPlanResponse,
)
from models.video import VeoPlan, VideoGenerateResponse
from services.gemini import plan_campaign, generate_captions
from services.video_planner import plan_video
from services.veo_generator import generate_and_upload_veo_video
from services.supabase_client import get_brand, get_supabase, upload_file_to_storage
from services.flux import generate_background
from services.removebg import remove_background as strip_bg
from compositor.template import build_html
from compositor.renderer import render_poster_async
from services.postergen import pipeline as pg_pipeline, brain as pg_brain

_MOCK_DATA_DIR = Path(__file__).parent.parent / "mock-data"


def _read_image(url_or_path: str) -> bytes:
    """
    Read image bytes from a local file path or URL.
    For Supabase storage URLs, uses the Supabase client (handles auth correctly).
    For other HTTP URLs, falls back to plain requests with apikey header.
    """
    import requests as _requests

    if not url_or_path.startswith("http"):
        return Path(url_or_path).read_bytes()

    # Supabase storage URL → parse bucket + path and use the SDK client
    if settings.SUPABASE_URL and url_or_path.startswith(settings.SUPABASE_URL):
        try:
            # URL shape: .../storage/v1/object/public/{bucket}/{file_path}
            #        or: .../storage/v1/object/{bucket}/{file_path}
            marker = "/object/public/"
            alt_marker = "/object/"
            if marker in url_or_path:
                rest = url_or_path.split(marker, 1)[1]
            elif alt_marker in url_or_path:
                rest = url_or_path.split(alt_marker, 1)[1]
            else:
                raise ValueError("Unrecognised Supabase storage URL format")
            bucket, file_path = rest.split("/", 1)
            from services.supabase_client import get_supabase
            data = get_supabase().storage.from_(bucket).download(file_path)
            return data
        except Exception as e:
            print(f"Supabase download failed ({e}), retrying with HTTP...")

    # Generic HTTP fallback — add apikey header for Supabase in case bucket needs it
    headers = {}
    if settings.SUPABASE_URL and url_or_path.startswith(settings.SUPABASE_URL):
        headers["apikey"] = settings.SUPABASE_SERVICE_KEY
    resp = _requests.get(url_or_path, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.content


def _load_cached_posters() -> Optional[dict]:
    """Return cached demo poster response if all three URLs are populated."""
    cached_path = _MOCK_DATA_DIR / "cached_posters.json"
    if not cached_path.exists():
        return None
    try:
        data = json.loads(cached_path.read_text(encoding="utf-8"))
        urls = data.get("formats", {})
        if all(urls.get(ar) for ar in ("1:1", "9:16", "16:9")):
            return {
                "campaign_id": "volt-bd-demo-cached",
                "formats": [
                    {"name": "Instagram Post", "aspect_ratio": "1:1", "poster_url": urls["1:1"]},
                    {"name": "Instagram Story", "aspect_ratio": "9:16", "poster_url": urls["9:16"]},
                    {"name": "Facebook Cover", "aspect_ratio": "16:9", "poster_url": urls["16:9"]},
                ],
                "total_generation_time_seconds": 0.0,
            }
    except Exception:
        pass
    return None

router = APIRouter(tags=["Campaigns"])

# Aspect ratio → (poster column, storage-safe label)
_POSTER_COLUMN = {"1:1": "poster_1x1_url", "9:16": "poster_9x16_url", "16:9": "poster_16x9_url"}

# Canonical formats used by /campaigns/generate-all
_ALL_FORMATS = [
    {"name": "Instagram Post", "width": 1080, "height": 1080, "aspect_ratio": "1:1"},
    {"name": "Instagram Story", "width": 1080, "height": 1920, "aspect_ratio": "9:16"},
    {"name": "Facebook Cover", "width": 1200, "height": 675, "aspect_ratio": "16:9"},
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ar_label(aspect_ratio: str) -> str:
    """Storage-safe label for an aspect ratio, e.g. '1:1' -> '1x1'."""
    return aspect_ratio.replace(":", "x")


def _brand_profile(brand_data: dict) -> dict:
    """Strip DB-specific fields, leaving only what the planner prompt needs."""
    return {
        key: brand_data.get(key)
        for key in (
            "brand_name", "tagline", "tagline_bn", "industry", "target_audience",
            "brand_personality", "colors", "typography", "voice", "do_not_use",
        )
    }


def _plan_blueprint(
    brand_id: str,
    brand_data: dict,
    prompt: str,
    format_spec: dict,
    adherence_level: str,
    product_image_available: bool,
) -> tuple[Blueprint, int]:
    """Plan a campaign with Gemini and return a validated Blueprint + retry count."""
    blueprint_dict, model_used, retries = plan_campaign(
        brand=_brand_profile(brand_data),
        prompt=prompt,
        format_spec=format_spec,
        adherence_level=adherence_level,
        product_image_available=product_image_available,
    )

    blueprint_dict["brand_id"] = brand_id

    voice = brand_data.get("voice")
    language = voice.get("language", "en") if isinstance(voice, dict) else "en"

    metadata = blueprint_dict.setdefault("metadata", {})
    metadata.update({
        "adherence_level": adherence_level,
        "model_used": model_used,
        "retry_count": retries,
        "language": language,
        "prompt": prompt,  # persist the original brief inside the blueprint
    })

    return Blueprint(**blueprint_dict), retries


async def _render_blueprint(
    blueprint: Blueprint,
    brand_data: dict,
    campaign_id: str,
    temp_dir: Path,
) -> tuple[str, Optional[str], float]:
    """
    Generate the background (Flux), render the poster (Playwright), upload both.
    Sync I/O (Flux + Supabase uploads) runs in a thread-pool executor so it
    doesn't block the event loop and can overlap with other concurrent renders.
    """
    start = time.time()
    label = _ar_label(blueprint.format.aspect_ratio)
    loop = asyncio.get_running_loop()

    # 1. Background — run sync HTTP in executor so other renders proceed in parallel
    bg_url: Optional[str] = None
    bg_prompt = blueprint.background.prompt if blueprint.background else None
    negative_prompt = ", ".join(brand_data.get("do_not_use", []))
    if bg_prompt:
        try:
            bg_bytes = await loop.run_in_executor(
                None, lambda: generate_background(
                    prompt=bg_prompt,
                    width=1024,
                    height=1024,
                    negative_prompt=negative_prompt,
                )
            )
            bg_url = await loop.run_in_executor(
                None, lambda: upload_file_to_storage(
                    "assets", f"{campaign_id}/background_{label}.png", bg_bytes, "image/png"
                )
            )
        except Exception as e:
            print(f"Warning: Background generation failed ({label}): {e}")

    # 2. Compose HTML + Playwright render (truly async — overlaps with other renders)
    product_image_url = brand_data.get("product_image_url")
    if product_image_url and settings.REMOVEBG_API_KEY:
        try:
            import mimetypes
            content_type = mimetypes.guess_type(str(product_image_url))[0] or "image/png"
            _purl = product_image_url  # capture for lambda
            _ct = content_type
            img_bytes = await loop.run_in_executor(None, lambda: _read_image(_purl))
            stripped = await loop.run_in_executor(None, lambda: strip_bg(img_bytes, _ct))
            nobg_path = temp_dir / f"product_nobg_{label}.png"
            await loop.run_in_executor(None, lambda: nobg_path.write_bytes(stripped))
            product_image_url = str(nobg_path)
            print(f"Remove.bg: product background stripped for {label} ({content_type})")
        except Exception as e:
            import traceback
            print(f"ERROR: Remove.bg failed ({label}): {e}")
            traceback.print_exc()

    assets = {
        "logo_url": brand_data.get("logo_url"),
        "product_image_url": product_image_url,
        "background_url": bg_url,
    }
    html = build_html(blueprint.model_dump(), brand_data, assets)
    out_path = temp_dir / f"poster_{label}.png"
    final_png_path = await render_poster_async(
        html, blueprint.format.width, blueprint.format.height, str(out_path)
    )

    # 3. Upload poster — executor again so upload doesn't block the loop
    with open(final_png_path, "rb") as f:
        final_bytes = f.read()
    poster_url = await loop.run_in_executor(
        None, lambda: upload_file_to_storage(
            "campaigns", f"{campaign_id}/poster_{label}.png", final_bytes, "image/png"
        )
    )

    return poster_url, bg_url, time.time() - start


async def _plan_and_render_format(
    brand_id: str,
    brand_data: dict,
    prompt: str,
    fmt: dict,
    adherence_level: str,
    product_image_available: bool,
    campaign_id: str,
    temp_dir: Path,
) -> dict:
    """
    Plan (Gemini, sync → executor) + render (Playwright, async) one format.
    Designed to be run concurrently via asyncio.gather for all three formats.
    """
    loop = asyncio.get_running_loop()
    blueprint, _ = await loop.run_in_executor(
        None,
        lambda: _plan_blueprint(
            brand_id=brand_id,
            brand_data=brand_data,
            prompt=prompt,
            format_spec=fmt,
            adherence_level=adherence_level,
            product_image_available=product_image_available,
        ),
    )
    poster_url, bg_url, elapsed = await _render_blueprint(
        blueprint, brand_data, campaign_id, temp_dir
    )
    return {
        "blueprint": blueprint,
        "fmt": fmt,
        "poster_url": poster_url,
        "bg_url": bg_url,
        "elapsed": elapsed,
    }


# ── PosterGen engine (default) ─────────────────────────────────────────────────

def _derive_campaign_name(prompt: str) -> str:
    """Cheap fallback campaign title from the brief — first few words, title-cased."""
    words = prompt.strip().split()
    snippet = " ".join(words[:6]) if words else "AI Poster Campaign"
    return (snippet[:60] + "…") if len(snippet) > 60 else snippet


async def _resolve_asset_to_path(url_or_path: Optional[str], dest: Path, loop) -> Optional[str]:
    """Download a logo/product asset (Supabase URL or local path) to a temp file."""
    if not url_or_path:
        return None
    data = await loop.run_in_executor(None, lambda: _read_image(url_or_path))
    await loop.run_in_executor(None, lambda: dest.write_bytes(data))
    return str(dest)


async def _postergen_generate_all(
    brand_data: dict,
    request: "GenerateAllRequest",
    campaign_id: str,
    temp_dir: Path,
) -> tuple:
    """
    Default engine: Gemini brain writes one Imagen prompt, Imagen renders the full
    poster (text baked in) per format, PIL composites the real logo + product.
    Returns (brain_output, results) where results is a list of per-format dicts.
    """
    loop = asyncio.get_running_loop()

    # 1. Resolve logo (required) + product (optional) to local file paths.
    logo_path = await _resolve_asset_to_path(brand_data.get("logo_url"), temp_dir / "logo.png", loop)
    if not logo_path:
        raise HTTPException(status_code=400, detail="Brand has no logo image; PosterGen requires a logo.")

    product_path = None
    product_url = brand_data.get("product_image_url")
    if request.product_image_available and product_url:
        try:
            raw_bytes = await loop.run_in_executor(None, lambda: _read_image(product_url))
            # Ensure a clean cutout for compositing. Uploaded products are already
            # transparent (Remove.bg at upload), but demo/raw assets may have a
            # studio background — strip it here when an API key is configured.
            final_bytes = raw_bytes
            if settings.REMOVEBG_API_KEY:
                try:
                    import mimetypes
                    ct = mimetypes.guess_type(str(product_url))[0] or "image/png"
                    final_bytes = await loop.run_in_executor(
                        None, lambda: strip_bg(raw_bytes, ct)
                    )
                except Exception as e:
                    print(f"Warning: PosterGen Remove.bg failed, using original: {e}")
            ppath = temp_dir / "product.png"
            await loop.run_in_executor(None, lambda: ppath.write_bytes(final_bytes))
            product_path = str(ppath)
        except Exception as e:
            print(f"Warning: PosterGen product fetch failed: {e}")

    # 2. Brain once (shared across all formats).
    brain_output = await loop.run_in_executor(
        None,
        lambda: pg_pipeline.plan_campaign(brand_data, request.prompt, logo_path, product_path),
    )

    # 3. Render the 3 formats concurrently (Imagen + compositing run in executor).
    async def _render_one(fmt: dict) -> dict:
        start = time.time()
        png = await loop.run_in_executor(
            None,
            lambda: pg_pipeline.render_format(
                brain_output, fmt["aspect_ratio"], logo_path, product_path
            ),
        )
        label = _ar_label(fmt["aspect_ratio"])
        url = await loop.run_in_executor(
            None,
            lambda: upload_file_to_storage(
                "campaigns", f"{campaign_id}/poster_{label}.png", png, "image/png"
            ),
        )
        return {"fmt": fmt, "poster_url": url, "elapsed": time.time() - start}

    results = await asyncio.gather(*[_render_one(fmt) for fmt in _ALL_FORMATS])
    return brain_output, results


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/campaigns/plan", response_model=CampaignPlanResponse)
async def plan_campaign_endpoint(request: CampaignPlanRequest):
    """Plan a campaign, generating a blueprint from a brand profile and prompt."""
    brand_data = get_brand(request.brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail=f"Brand {request.brand_id} not found")

    try:
        blueprint, retries = _plan_blueprint(
            brand_id=request.brand_id,
            brand_data=brand_data,
            prompt=request.prompt,
            format_spec=request.format.model_dump(),
            adherence_level=request.adherence_level,
            product_image_available=request.product_image_available,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Campaign planning failed: {e}")

    # The blueprint is returned to the frontend; it is NOT saved here. The
    # finalized blueprint is sent to /campaigns/generate, which persists it.
    return CampaignPlanResponse(blueprint=blueprint, retries_used=retries)


@router.post("/campaigns/generate", response_model=CampaignGenerateResponse)
async def generate_campaign_endpoint(blueprint: Blueprint):
    """
    Execute a finalized blueprint: Flux background, Playwright render,
    upload to Supabase, and persist the campaign row.
    """
    brand_data = get_brand(blueprint.brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail=f"Brand {blueprint.brand_id} not found")

    campaign_id = str(uuid.uuid4())
    temp_dir = Path(f"/tmp/imprnt_{campaign_id}")
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        poster_url, bg_url, elapsed = await _render_blueprint(
            blueprint, brand_data, campaign_id, temp_dir
        )

        captions = generate_captions(brand_data, blueprint.model_dump())

        ar = blueprint.format.aspect_ratio
        db_payload = {
            "id": campaign_id,
            "brand_id": blueprint.brand_id,
            "campaign_name": blueprint.campaign_name,
            "campaign_strategy": blueprint.campaign_strategy,
            "adherence_level": blueprint.metadata.adherence_level,
            "language": blueprint.metadata.language,
            "blueprint": blueprint.model_dump(mode="json"),
            _POSTER_COLUMN.get(ar, "poster_1x1_url"): poster_url,
            "background_url": bg_url,
            "generation_time_seconds": round(elapsed, 2),
            "model_used": blueprint.metadata.model_used,
            "retry_count": blueprint.metadata.retry_count,
        }
        get_supabase().table("campaigns").insert(db_payload).execute()

        return CampaignGenerateResponse(
            campaign_id=campaign_id,
            poster_url=poster_url,
            background_url=bg_url,
            generation_time_seconds=round(elapsed, 2),
            captions=captions,
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)


class GenerateAllRequest(BaseModel):
    brand_id: str
    prompt: str
    adherence_level: Literal["strict", "moderate", "creative"] = "moderate"
    product_image_available: bool = False
    # "postergen" — Imagen renders the full poster (default).
    # "blueprint" — legacy Gemini-plan + HTML/Playwright engine (fully editable).
    engine: Literal["postergen", "blueprint"] = "postergen"


@router.post("/campaigns/generate-all")
async def generate_all_endpoint(request: GenerateAllRequest):
    """
    Plan and render all three canonical formats (1:1, 9:16, 16:9) for a brand
    and persist them as a single campaign row.
    """
    # Demo shortcut: serve cached posters instantly, skip Flux + Playwright entirely
    if settings.DEMO_FALLBACK_MODE:
        cached = _load_cached_posters()
        if cached:
            return cached

    brand_data = get_brand(request.brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail=f"Brand {request.brand_id} not found")

    campaign_id = str(uuid.uuid4())
    temp_dir = Path(f"/tmp/imprnt_all_{campaign_id}")
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # ── Default engine: PosterGen (Imagen renders the full poster) ──────────
        if request.engine == "postergen":
            brain_output, pg_results = await _postergen_generate_all(
                brand_data, request, campaign_id, temp_dir
            )

            formats_out = []
            poster_urls: dict[str, str] = {}
            total_elapsed = max(r["elapsed"] for r in pg_results)
            for r in pg_results:
                ar = r["fmt"]["aspect_ratio"]
                poster_urls[ar] = r["poster_url"]
                formats_out.append({
                    "name": r["fmt"]["name"],
                    "aspect_ratio": ar,
                    "poster_url": r["poster_url"],
                })

            campaign_name = brain_output.campaign_name or _derive_campaign_name(request.prompt)
            strategy = brain_output.campaign_strategy or request.prompt
            voice = brand_data.get("voice") if isinstance(brand_data.get("voice"), dict) else {}
            language = voice.get("language", "en")

            # Lightweight record (NO layers) — the editor detects the absence of
            # layers and falls back to overlay-on-flat-poster mode for this engine.
            blueprint_record = {
                "engine": "postergen",
                "campaign_name": campaign_name,
                "campaign_strategy": strategy,
                "imagen_prompt": brain_output.imagen_prompt,
                "logo_placement": brain_output.logo_placement,
                "product_placement": brain_output.product_placement,
                "product_size_ratio": brain_output.product_size_ratio,
            }

            db_payload = {
                "id": campaign_id,
                "brand_id": request.brand_id,
                "campaign_name": campaign_name,
                "campaign_strategy": strategy,
                "adherence_level": request.adherence_level,
                "language": language,
                "blueprint": blueprint_record,
                "poster_1x1_url": poster_urls.get("1:1"),
                "poster_9x16_url": poster_urls.get("9:16"),
                "poster_16x9_url": poster_urls.get("16:9"),
                "background_url": None,
                "generation_time_seconds": round(total_elapsed, 2),
                "model_used": f"postergen/{pg_brain.PRIMARY_MODEL}",
                "retry_count": 0,
            }
            if not settings.DEMO_FALLBACK_MODE:
                get_supabase().table("campaigns").insert(db_payload).execute()

            captions = generate_captions(
                brand_data, {"campaign_name": campaign_name, "campaign_strategy": strategy}
            )

            return {
                "campaign_id": campaign_id,
                "formats": formats_out,
                "captions": captions,
                "total_generation_time_seconds": round(total_elapsed, 2),
            }

        # ── Legacy engine: blueprint + HTML/Playwright (fully editable) ─────────
        # All 3 formats planned + rendered in parallel — wall-clock time = longest single format
        results = await asyncio.gather(*[
            _plan_and_render_format(
                brand_id=request.brand_id,
                brand_data=brand_data,
                prompt=request.prompt,
                fmt=fmt,
                adherence_level=request.adherence_level,
                product_image_available=request.product_image_available,
                campaign_id=campaign_id,
                temp_dir=temp_dir,
            )
            for fmt in _ALL_FORMATS
        ])

        formats_out = []
        poster_urls: dict[str, str] = {}
        first_blueprint: Optional[Blueprint] = None
        first_bg_url: Optional[str] = None
        total_elapsed = max(r["elapsed"] for r in results)  # wall-clock, not sum

        for r in results:
            ar = r["fmt"]["aspect_ratio"]
            poster_urls[ar] = r["poster_url"]
            formats_out.append({
                "name": r["fmt"]["name"],
                "aspect_ratio": ar,
                "poster_url": r["poster_url"],
            })
            if first_blueprint is None:
                first_blueprint = r["blueprint"]
                first_bg_url = r["bg_url"]

        db_payload = {
            "id": campaign_id,
            "brand_id": request.brand_id,
            "campaign_name": first_blueprint.campaign_name,
            "campaign_strategy": first_blueprint.campaign_strategy,
            "adherence_level": first_blueprint.metadata.adherence_level,
            "language": first_blueprint.metadata.language,
            "blueprint": first_blueprint.model_dump(mode="json"),
            "poster_1x1_url": poster_urls.get("1:1"),
            "poster_9x16_url": poster_urls.get("9:16"),
            "poster_16x9_url": poster_urls.get("16:9"),
            "background_url": first_bg_url,
            "generation_time_seconds": round(total_elapsed, 2),
            "model_used": first_blueprint.metadata.model_used,
            "retry_count": first_blueprint.metadata.retry_count,
        }
        if not settings.DEMO_FALLBACK_MODE:
            get_supabase().table("campaigns").insert(db_payload).execute()

        captions = generate_captions(brand_data, first_blueprint.model_dump())

        return {
            "campaign_id": campaign_id,
            "formats": formats_out,
            "captions": captions,
            "total_generation_time_seconds": round(total_elapsed, 2),
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)


@router.get("/campaigns/{campaign_id}")
async def get_campaign_endpoint(campaign_id: str):
    """Retrieve a campaign row (including blueprint JSON) by ID."""
    res = get_supabase().table("campaigns").select("*").eq("id", campaign_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return res.data[0]


# ── Video endpoints ───────────────────────────────────────────────────────────

class PlanVideoRequest(BaseModel):
    aspect_ratio: Literal["1:1", "9:16", "16:9"] = "1:1"


class GenerateVideoRequest(BaseModel):
    veo_plan: dict
    aspect_ratio: Literal["1:1", "9:16", "16:9"] = "1:1"


@router.post("/campaigns/{campaign_id}/plan-video")
async def plan_video_endpoint(campaign_id: str, body: PlanVideoRequest):
    """
    Asks Gemini to write a cinematic motion prompt for Veo 3.1.
    Returns veo_plan with motion_prompt, aspect_ratio, duration_seconds.
    """
    db = get_supabase()
    row = db.table("campaigns").select("brand_id").eq("id", campaign_id).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Campaign not found")

    brand_id = row.data[0].get("brand_id")
    brand_data = get_brand(brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail=f"Brand {brand_id} not found")

    try:
        loop = asyncio.get_running_loop()
        veo_plan: VeoPlan = await loop.run_in_executor(
            None,
            lambda: plan_video(
                brand=_brand_profile(brand_data),
                aspect_ratio=body.aspect_ratio,
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video planning failed: {e}")

    return {"veo_plan": veo_plan.model_dump()}


@router.post("/campaigns/{campaign_id}/generate-video", response_model=VideoGenerateResponse)
async def generate_video_endpoint(campaign_id: str, body: GenerateVideoRequest):
    """
    Fetches the stored poster for the requested aspect ratio, sends it to Veo 3.1
    as the first frame with the motion prompt, uploads the resulting MP4, and saves
    a row to the videos table.
    """
    db = get_supabase()
    row = db.table("campaigns").select("*").eq("id", campaign_id).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Campaign not found")

    campaign = row.data[0]
    ar = body.aspect_ratio

    # Resolve poster URL for this aspect ratio
    poster_url = campaign.get(_POSTER_COLUMN.get(ar, "poster_1x1_url"))
    if not poster_url:
        raise HTTPException(
            status_code=400,
            detail=f"No poster found for aspect ratio {ar}. Generate posters first.",
        )

    # Download poster bytes (uses Supabase SDK path for Supabase URLs)
    try:
        loop = asyncio.get_running_loop()
        poster_bytes: bytes = await loop.run_in_executor(
            None, lambda: _read_image(poster_url)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch poster image: {e}")

    # Patch aspect_ratio in the veo_plan to the Veo-mapped value
    veo_plan = dict(body.veo_plan)
    _VEO_AR_MAP = {"1:1": "9:16", "9:16": "9:16", "16:9": "16:9"}
    veo_plan["aspect_ratio"] = _VEO_AR_MAP.get(ar, "9:16")

    try:
        video_url, elapsed = await generate_and_upload_veo_video(
            campaign_id=campaign_id,
            poster_bytes=poster_bytes,
            veo_plan=veo_plan,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Veo video generation failed: {e}")

    # Persist to videos table (best-effort — don't fail the response if table missing)
    video_id = str(uuid.uuid4())
    try:
        db.table("videos").insert({
            "id": video_id,
            "campaign_id": campaign_id,
            "video_plan": veo_plan,
            "video_url": video_url,
            "duration_sec": veo_plan.get("duration_seconds", 6),
            "aspect_ratio": ar,
        }).execute()
    except Exception as e:
        print(f"Warning: failed to save video row: {e}")

    return VideoGenerateResponse(
        video_id=video_id,
        video_url=video_url,
        generation_time_seconds=round(elapsed, 2),
    )


# ── Editor save ───────────────────────────────────────────────────────────────

class SaveEditRequest(BaseModel):
    image_data: str                          # "data:image/png;base64,..."
    format: Literal["1:1", "9:16", "16:9"]


@router.post("/campaigns/{campaign_id}/save-edit")
async def save_campaign_edit(campaign_id: str, body: SaveEditRequest):
    """Accept a Fabric.js canvas export, upload it to Supabase, update the campaign row."""
    db = get_supabase()
    if not db.table("campaigns").select("id").eq("id", campaign_id).execute().data:
        raise HTTPException(status_code=404, detail="Campaign not found")

    prefix = "data:image/png;base64,"
    b64 = body.image_data[len(prefix):] if body.image_data.startswith(prefix) else body.image_data
    try:
        png_bytes = base64.b64decode(b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image_data: {exc}") from exc

    label = _ar_label(body.format)
    # Unique filename per save so the public URL always changes — otherwise the
    # browser serves a stale cached thumbnail after a re-edit.
    storage_path = f"{campaign_id}/poster_{label}_edited_{int(time.time())}.png"

    loop = asyncio.get_running_loop()
    new_url = await loop.run_in_executor(
        None,
        lambda: upload_file_to_storage("campaigns", storage_path, png_bytes, "image/png"),
    )

    column = _POSTER_COLUMN[body.format]
    db.table("campaigns").update({column: new_url}).eq("id", campaign_id).execute()

    return {"url": new_url, "format": body.format}
