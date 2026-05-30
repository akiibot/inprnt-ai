"""
Imprnt AI — Phase 6: Multi-Format Export Router
POST /api/export
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid
import asyncio
from pathlib import Path

from models.blueprint import Blueprint
from services.supabase_client import get_brand, get_supabase, upload_file_to_storage
from compositor.template import build_html
from compositor.renderer import render_poster_async

router = APIRouter(tags=["Export"])

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
            # Create a localized copy of the blueprint for this format
            format_blueprint = dict(blueprint_dict)
            format_blueprint["format"] = fmt.model_dump()
            
            w = fmt.width
            h = fmt.height
            
            # The HTML template automatically adapts using CSS absolute positioning
            # and background-size: cover, which achieves center-cropping automatically!
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
