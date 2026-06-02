"""
Imprnt AI — Phase 6: Multi-Format Export Router
POST /api/export
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import copy
import math
import uuid
import asyncio
from pathlib import Path

from models.blueprint import Blueprint
from services.supabase_client import get_brand, get_supabase, upload_file_to_storage
from compositor.template import build_html
from compositor.renderer import render_poster_async

router = APIRouter(tags=["Export"])


def _adapt_blueprint_to_format(blueprint_dict: dict, target_w: int, target_h: int) -> dict:
    """
    Reflow a blueprint planned for one canvas onto a different aspect ratio.

    The blueprint uses absolute px margins/sizes designed for the source format,
    so a naive re-render leaves everything crammed in the original region. We
    deep-copy and scale geometry to the target canvas:
      - vertical margins   scale by the height ratio  (spread content down)
      - horizontal margins scale by the width ratio   (spread content across)
      - font sizes / image sizes scale by the SMALLER ratio so nothing
        overflows the constrained axis
    """
    adapted = copy.deepcopy(blueprint_dict)
    src = adapted.get("format", {})
    src_w = src.get("width") or target_w
    src_h = src.get("height") or target_h

    w_ratio = target_w / src_w
    h_ratio = target_h / src_h
    scale = min(w_ratio, h_ratio)  # uniform scale for type/images

    adapted["format"] = {**src, "width": target_w, "height": target_h}

    for layer in adapted.get("layers", []):
        margin = layer.get("margin")
        if isinstance(margin, dict):
            for side in ("top", "bottom"):
                if isinstance(margin.get(side), (int, float)):
                    margin[side] = round(margin[side] * h_ratio)
            for side in ("left", "right"):
                if isinstance(margin.get(side), (int, float)):
                    margin[side] = round(margin[side] * w_ratio)

        if isinstance(layer.get("font_size"), (int, float)):
            layer["font_size"] = max(12, round(layer["font_size"] * scale))

        if isinstance(layer.get("max_width"), (int, float)):
            layer["max_width"] = round(layer["max_width"] * w_ratio)

        size = layer.get("size")
        if isinstance(size, dict):
            for dim in ("width", "height"):
                if isinstance(size.get(dim), (int, float)):
                    size[dim] = round(size[dim] * scale)

    return adapted

class ExportFormat(BaseModel):
    name: str
    width: int
    height: int
    aspect_ratio: str

class ExportRequest(BaseModel):
    campaign_id: str
    formats: List[ExportFormat]

class ExportResult(BaseModel):
    format_name: str
    url: str
    width: int
    height: int

class ExportResponse(BaseModel):
    campaign_id: str
    exports: List[ExportResult]

@router.post("/export", response_model=ExportResponse)
async def export_campaign_formats(request: ExportRequest):
    """
    Takes an existing campaign, adapts the blueprint for the requested formats,
    re-renders the HTML compositor with the new dimensions (auto-cropping the background),
    and returns URLs to the new PNGs.
    """
    client = get_supabase()
    
    # 1. Fetch Campaign
    campaign_res = client.table("campaigns").select("*").eq("id", request.campaign_id).execute()
    if not campaign_res.data:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    campaign = campaign_res.data[0]
    brand_id = campaign.get("brand_id")
    
    # 2. Fetch Brand
    brand_data = get_brand(brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail="Brand not found")
        
    # 3. Parse Blueprint
    try:
        blueprint_dict = campaign.get("blueprint")
        if not blueprint_dict:
            raise Exception("Campaign has no blueprint data")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid blueprint data: {e}")
        
    # Use the real background URL persisted on the campaign row during generation.
    # (get_public_url would always return a URL even if the object was never
    # uploaded — e.g. when Flux failed and we fell back to a solid colour.)
    bg_url = campaign.get("background_url")

    assets = {
        "logo_url": brand_data.get("logo_url"),
        "product_image_url": brand_data.get("product_image_url"),
        "background_url": bg_url
    }
    
    temp_dir = Path(f"/tmp/imprnt_export_{request.campaign_id}")
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    results = []
    
    try:
        # Process each format
        for fmt in request.formats:
            w = fmt.width
            h = fmt.height

            # Reflow the blueprint geometry onto this aspect ratio (deep copy +
            # proportional scaling) instead of cramming the 1:1 layout in place.
            format_blueprint = _adapt_blueprint_to_format(blueprint_dict, w, h)
            format_blueprint["format"] = fmt.model_dump()

            # Background still uses CSS cover for center-crop of the AI scene.
            html = build_html(format_blueprint, brand_data, assets)
            
            out_filename = f"export_{fmt.width}x{fmt.height}.png"
            out_path = temp_dir / out_filename
            
            # Render new poster (async — does not block the event loop)
            final_png_path = await render_poster_async(html, w, h, str(out_path))
            
            # Upload to Supabase
            with open(final_png_path, "rb") as f:
                final_bytes = f.read()
                
            storage_path = f"{request.campaign_id}/exports/{out_filename}"
            final_url = upload_file_to_storage("campaigns", storage_path, final_bytes, "image/png")
            
            results.append(ExportResult(
                format_name=fmt.name,
                url=final_url,
                width=w,
                height=h
            ))
            
        return ExportResponse(
            campaign_id=request.campaign_id,
            exports=results
        )
        
    finally:
        import shutil
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
