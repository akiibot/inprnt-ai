"""
Imprnt AI — Campaigns Router
POST /api/campaigns/plan
POST /api/campaigns/generate
POST /api/campaigns/generate-all
"""
import shutil
import time
import traceback
import uuid
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.blueprint import (
    Blueprint,
    CampaignGenerateResponse,
    CampaignPlanRequest,
    CampaignPlanResponse,
)
from services.gemini import plan_campaign
from services.supabase_client import get_brand, get_supabase, upload_file_to_storage
from services.flux import generate_background
from compositor.template import build_html
from compositor.renderer import render_poster_async

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
    Generate the background (Flux), render the poster (Playwright), upload both,
    and return (poster_url, background_url, elapsed_seconds). Does NOT touch the DB.
    """
    start = time.time()
    label = _ar_label(blueprint.format.aspect_ratio)

    # 1. Background (best-effort — fall back to solid colour on failure)
    bg_url: Optional[str] = None
    bg_prompt = blueprint.background.prompt if blueprint.background else None
    if bg_prompt:
        try:
            bg_bytes = generate_background(prompt=bg_prompt, width=1024, height=1024)
            bg_url = upload_file_to_storage(
                "assets", f"{campaign_id}/background_{label}.png", bg_bytes, "image/png"
            )
        except Exception as e:
            print(f"Warning: Background generation failed: {e}")

    # 2. Compose + render
    assets = {
        "logo_url": brand_data.get("logo_url"),
        "product_image_url": brand_data.get("product_image_url"),
        "background_url": bg_url,
    }
    html = build_html(blueprint.model_dump(), brand_data, assets)
    out_path = temp_dir / f"poster_{label}.png"
    final_png_path = await render_poster_async(
        html, blueprint.format.width, blueprint.format.height, str(out_path)
    )

    # 3. Upload final poster
    with open(final_png_path, "rb") as f:
        final_bytes = f.read()
    poster_url = upload_file_to_storage(
        "campaigns", f"{campaign_id}/poster_{label}.png", final_bytes, "image/png"
    )

    return poster_url, bg_url, time.time() - start


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
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)


class GenerateAllRequest(BaseModel):
    brand_id: str
    prompt: str
    adherence_level: Literal["strict", "moderate", "creative"] = "strict"
    product_image_available: bool = False


@router.post("/campaigns/generate-all")
async def generate_all_endpoint(request: GenerateAllRequest):
    """
    Plan and render all three canonical formats (1:1, 9:16, 16:9) for a brand
    and persist them as a single campaign row.
    """
    brand_data = get_brand(request.brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail=f"Brand {request.brand_id} not found")

    campaign_id = str(uuid.uuid4())
    temp_dir = Path(f"/tmp/imprnt_all_{campaign_id}")
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        formats_out = []
        poster_urls: dict[str, str] = {}
        first_blueprint: Optional[Blueprint] = None
        first_bg_url: Optional[str] = None
        total_elapsed = 0.0

        for fmt in _ALL_FORMATS:
            blueprint, _ = _plan_blueprint(
                brand_id=request.brand_id,
                brand_data=brand_data,
                prompt=request.prompt,
                format_spec=fmt,
                adherence_level=request.adherence_level,
                product_image_available=request.product_image_available,
            )
            poster_url, bg_url, elapsed = await _render_blueprint(
                blueprint, brand_data, campaign_id, temp_dir
            )
            total_elapsed += elapsed
            poster_urls[fmt["aspect_ratio"]] = poster_url

            if first_blueprint is None:
                first_blueprint = blueprint
                first_bg_url = bg_url

            formats_out.append({
                "name": fmt["name"],
                "aspect_ratio": fmt["aspect_ratio"],
                "poster_url": poster_url,
            })

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
        get_supabase().table("campaigns").insert(db_payload).execute()

        return {
            "campaign_id": campaign_id,
            "formats": formats_out,
            "total_generation_time_seconds": round(total_elapsed, 2),
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
