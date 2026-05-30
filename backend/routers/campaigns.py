"""
Imprnt AI — Phase 2: Campaigns Router
POST /api/campaigns/plan
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from models.blueprint import CampaignPlanRequest, CampaignPlanResponse, Blueprint
from services.gemini import plan_campaign
from services.supabase_client import get_brand, supabase, upload_file_to_storage, get_supabase
from services.flux import generate_background
from compositor.template import build_html
from compositor.renderer import render_poster

import uuid
import os
from pathlib import Path

router = APIRouter(tags=["Campaigns"])

@router.post("/campaigns/plan", response_model=CampaignPlanResponse)
async def plan_campaign_endpoint(request: CampaignPlanRequest):
    """
    Plans a campaign, generating a blueprint from a brand profile and prompt.
    """
    # 1. Fetch Brand
    brand_data = get_brand(request.brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail=f"Brand {request.brand_id} not found")
        
    # Format brand data for prompt (strip out DB-specific fields like raw_data, created_at)
    brand_profile = {
        "brand_name": brand_data.get("brand_name"),
        "tagline": brand_data.get("tagline"),
        "tagline_bn": brand_data.get("tagline_bn"),
        "industry": brand_data.get("industry"),
        "target_audience": brand_data.get("target_audience"),
        "brand_personality": brand_data.get("brand_personality"),
        "colors": brand_data.get("colors"),
        "typography": brand_data.get("typography"),
        "voice": brand_data.get("voice"),
        "do_not_use": brand_data.get("do_not_use")
    }

    # 2. Call Gemini
    try:
        blueprint_dict, model_used, retries = plan_campaign(
            brand=brand_profile,
            prompt=request.prompt,
            format_spec=request.format.model_dump(),
            adherence_level=request.adherence_level,
            product_image_available=request.product_image_available
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    # 3. Add Metadata and Validate
    blueprint_dict['brand_id'] = request.brand_id
    
    # Ensure metadata is present
    if 'metadata' not in blueprint_dict:
         blueprint_dict['metadata'] = {}
         
    blueprint_dict['metadata'].update({
         "adherence_level": request.adherence_level,
         "model_used": model_used,
         "retry_count": retries,
         "language": brand_data.get("voice", {}).get("language", "en")
    })
    
    try:
        blueprint = Blueprint(**blueprint_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generated blueprint failed schema validation: {e}")
        
    # We do NOT save the blueprint to the DB yet. It's returned to the frontend.
    # The frontend will call /campaigns/generate with the finalized blueprint,
    # and THAT endpoint will save the campaign to the DB.
    
    return CampaignPlanResponse(
        blueprint=blueprint,
        retries_used=retries
    )


@router.post("/campaigns/generate")
async def generate_campaign_endpoint(blueprint: Blueprint):
    """
    Executes a finalized blueprint.
    Generates background via Flux, renders HTML via Playwright, and saves to Supabase.
    """
    # 1. Fetch the brand
    brand_id = blueprint.brand_id
    brand_data = get_brand(brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail=f"Brand {brand_id} not found")
        
    campaign_id = str(uuid.uuid4())
    
    # We need a temp directory for rendering
    temp_dir = Path(f"/tmp/imprnt_{campaign_id}")
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # 2. Generate Background with Flux
        bg_prompt = blueprint.background.get('prompt')
        bg_url = None
        if bg_prompt:
            try:
                # Get dimensions from format
                w = blueprint.format.get('width', 1080)
                h = blueprint.format.get('height', 1080)
                
                # Cloudflare Flux prefers multiples of 8, usually max 1024x1024 for free tier,
                # but we'll try to pass actual dimensions and let it handle it.
                # If it fails due to dimensions, we can crop/scale it later.
                bg_bytes = generate_background(prompt=bg_prompt, width=1024, height=1024)
                
                # Save temp
                bg_path = temp_dir / "bg.png"
                with open(bg_path, "wb") as f:
                    f.write(bg_bytes)
                    
                # Upload to Supabase
                bg_filename = f"{campaign_id}/background.png"
                bg_url = upload_file_to_storage("assets", bg_filename, bg_bytes, "image/png")
            except Exception as e:
                # If Flux fails, we log it and proceed with fallback color
                print(f"Warning: Background generation failed: {e}")
                
        # 3. Assemble Assets
        # In a real scenario, we'd download the logo from Supabase Storage.
        # For this execution, we'll assume logo_url is a public URL we can pass directly,
        # or we just let the compositor use the URL (which we updated in Phase 1 to support).
        # We need to make sure the compositor handles external HTTP URLs correctly for data URI embedding if needed,
        # but Playwright can render HTTP images fine if they have CORS.
        # Let's pass the remote URLs.
        assets = {
            "logo_url": brand_data.get("logo_url"),
            "product_image_url": brand_data.get("product_image_url"),
            "background_url": bg_url
        }
        
        # 4. Render Poster
        w = blueprint.format.get('width', 1080)
        h = blueprint.format.get('height', 1080)
        
        html = build_html(blueprint.model_dump(), brand_data, assets)
        out_path = temp_dir / "final_poster.png"
        
        final_png_path = render_poster(html, w, h, str(out_path))
        
        # 5. Upload Final Poster to Supabase
        with open(final_png_path, "rb") as f:
            final_bytes = f.read()
            
        final_filename = f"{campaign_id}/final_poster.png"
        final_url = upload_file_to_storage("campaigns", final_filename, final_bytes, "image/png")
        
        # 6. Save Campaign to Database
        db_payload = {
            "id": campaign_id,
            "brand_id": brand_id,
            "campaign_name": blueprint.campaign_name,
            "prompt": blueprint.metadata.get("prompt", ""),
            "blueprint": blueprint.model_dump(mode='json'),
            "final_image_url": final_url,
            "status": "completed"
        }
        
        client = get_supabase()
        res = client.table("campaigns").insert(db_payload).execute()
        
        return {
            "campaign_id": campaign_id,
            "final_image_url": final_url,
            "blueprint": blueprint,
            "background_url": bg_url,
            "status": "success"
        }
        
    finally:
        # Cleanup temp files
        import shutil
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
