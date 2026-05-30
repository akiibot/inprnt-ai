"""
Imprnt AI — Phase 2: Campaigns Router
POST /api/campaigns/plan
"""
from fastapi import APIRouter, HTTPException
from models.blueprint import CampaignPlanRequest, CampaignPlanResponse, Blueprint
from services.gemini import plan_campaign
from services.supabase_client import get_brand, supabase

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
