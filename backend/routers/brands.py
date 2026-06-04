"""
Imprnt AI — Brands Router
GET  /api/brands
POST /api/brands/upload
POST /api/brands/manual
POST /api/brands/load-demo
GET  /api/brands/{brand_id}
DELETE /api/brands/{brand_id}
PATCH  /api/brands/{brand_id}
POST /api/brands/{brand_id}/product
"""
import json
import uuid
from pathlib import Path as FilePath
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Path
import pdfplumber
from pydantic import BaseModel

from models.brand import BrandUploadResponse, Brand
from services.gemini import extract_brand
from services.colorthief_service import extract_colors
from services.removebg import remove_background
from services.supabase_client import (
    upload_file_to_storage, save_brand, get_brand, supabase, get_supabase,
    _load_demo_brand, _MOCK_DATA_DIR,
    list_brands as _list_brands, delete_brand as _delete_brand, rename_brand as _rename_brand,
)

_DEMO_EID_PROMPT = (
    "Design an Eid Special Edition Launch campaign. Position Volt BD as the energy drink "
    "of festive gatherings. Use bold Eid motifs — crescents, stars, warm gold — against "
    "Volt's signature black-and-orange palette. Primary CTA in Bangla: "
    "'ঈদের শক্তি, Volt-এর সাথে'. English sub-copy: 'Power Your Eid.' "
    "High-energy, celebratory, unapologetically bold."
)

router = APIRouter(tags=["Brands"])


@router.get("/brands")
async def list_brands_endpoint():
    """Lists all saved brands (id, brand_name, logo_url, colors, created_at), newest first."""
    return _list_brands()


class RenameBrandRequest(BaseModel):
    brand_name: str


@router.delete("/brands/{brand_id}")
async def delete_brand_endpoint(brand_id: str = Path(...)):
    """Permanently removes a saved brand."""
    ok = _delete_brand(brand_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"deleted": True}


@router.patch("/brands/{brand_id}")
async def rename_brand_endpoint(brand_id: str = Path(...), body: RenameBrandRequest = ...):
    """Renames a saved brand."""
    updated = _rename_brand(brand_id, body.brand_name)
    if not updated:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"id": brand_id, "brand_name": body.brand_name}


@router.post("/brands/upload", response_model=BrandUploadResponse)
async def upload_brand_files(
    pdf: Annotated[UploadFile, File(...)],
    logo: Annotated[UploadFile, File(...)],
):
    """
    Handles PDF and logo upload, extracts brand profile using Gemini,
    extracts colors from logo using ColorThief, and saves to Supabase.
    """
    if not pdf.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Document must be a PDF")
    
    # Read files
    try:
        pdf_bytes = await pdf.read()
        logo_bytes = await logo.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded files: {e}")
        
    # 1. Parse PDF text
    try:
        pdf_text = ""
        # Need to save bytes temporarily or use io.BytesIO for pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as p:
            for page in p.pages:
                text = page.extract_text()
                if text:
                    pdf_text += text + "\n"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract text from PDF: {e}")
        
    if not pdf_text.strip():
         raise HTTPException(status_code=400, detail="PDF contains no readable text")
         
    # 2. Extract Colors from Logo (ColorThief)
    extracted_colors = extract_colors(logo_bytes)
    
    # 3. Extract Brand Identity (Gemini)
    try:
         brand_dict, model_used = extract_brand(pdf_text, logo.content_type, logo_bytes)
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"AI extraction failed: {e}")
         
    # 4. Merge Colors (ColorThief overwrites Gemini's guesses)
    brand_dict['colors'] = extracted_colors
    
    # 5. Upload Assets to Supabase Storage
    brand_id = str(uuid.uuid4())
    logo_filename = f"{brand_id}/logo_{logo.filename}"
    pdf_filename = f"{brand_id}/guidelines_{pdf.filename}"
    
    try:
        # Assuming buckets 'logos' and 'pdfs' exist. We'll use 'assets' bucket for both to simplify.
        logo_url_info = upload_file_to_storage("assets", logo_filename, logo_bytes, logo.content_type)
        # Uploading PDF is optional for display, but good for persistence
        upload_file_to_storage("assets", pdf_filename, pdf_bytes, pdf.content_type)
        
        # In supabase-py v2, get_public_url returns a string directly
        brand_dict['logo_url'] = logo_url_info
    except Exception as e:
        print(f"Warning: Failed to upload assets to Supabase: {e}")
        # Don't fail the whole request if storage fails, just log it.
        # In a production app we'd want this to be robust.
        
    # Set brand ID explicitly to match our generated one
    brand_dict['brand_id'] = brand_id
        
    # Validate against Pydantic model to ensure strict schema adherence
    try:
        brand = Brand(**brand_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extracted brand data failed schema validation: {e}")
        
    # 6. Save to Supabase DB
    try:
        # Convert Pydantic model to dict for Supabase insertion.
        # raw_data field holds the raw JSON.
        db_payload = brand.model_dump(mode='json')
        db_payload['id'] = brand_id # Map brand_id to id for DB
        db_payload['raw_data'] = brand.model_dump(mode='json')
        # Remove fields that don't match DB schema directly if needed,
        # but our schema matches the JSON structure well.
        # We need to map 'brand_id' to 'id' for the DB schema
        del db_payload['brand_id']
        
        saved_brand = save_brand(db_payload)
        if not saved_brand:
            raise Exception("Failed to insert into database")
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Database save failed: {e}")
         
    return BrandUploadResponse(
        brand_id=brand_id,
        brand=brand,
        colors_source="colorthief",
        message=f"Brand extracted successfully using {model_used}"
    )

@router.get("/brands/{brand_id}", response_model=Brand)
async def get_brand_endpoint(brand_id: str):
    """Retrieves a saved brand by ID."""
    brand_data = get_brand(brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail="Brand not found")
        
    # Reconstruct brand_id from id
    brand_data['brand_id'] = brand_data.pop('id', brand_id)
    
    # We can reconstruct the Brand object from raw_data if we stored it,
    # or map DB fields back. Mapping DB fields back:
    try:
        return Brand(**brand_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse database record: {e}")


@router.post("/brands/load-demo")
async def load_demo_brand():
    """
    Load the Volt BD demo brand from mock-data without requiring PDF/logo upload.
    Returns brand_id + the Eid campaign prompt so the frontend can skip the wizard.
    """
    brand_data = _load_demo_brand()
    try:
        brand = Brand(**{**brand_data, "brand_id": brand_data.get("id", "volt-bd-demo-001")})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Demo brand schema error: {e}")

    # Load the pre-set Eid prompt from cached_posters.json if available
    try:
        cached_path = _MOCK_DATA_DIR / "cached_posters.json"
        prompt = _DEMO_EID_PROMPT
        if cached_path.exists():
            cached = json.loads(cached_path.read_text(encoding="utf-8"))
            prompt = cached.get("prompt", _DEMO_EID_PROMPT)
    except Exception:
        prompt = _DEMO_EID_PROMPT

    return {"brand_id": "volt-bd-demo-001", "brand": brand, "prompt": prompt}


class ManualBrandRequest(BaseModel):
    """Request body for manual brand creation — mirrors brand.json exactly."""
    brand_name: str
    tagline: str
    tagline_bn: str | None = None
    industry: str
    target_audience: str
    brand_personality: list[str]
    colors: dict
    typography: dict
    voice: dict
    do_not_use: list[str]
    logo_base64: str | None = None
    logo_content_type: str = "image/png"
    product_image_url: str | None = None


@router.post("/brands/manual", response_model=BrandUploadResponse)
async def create_brand_manually(request: ManualBrandRequest):
    """
    Create a brand profile manually (without PDF upload).
    Accepts JSON matching the frozen brand.json schema + optional base64 logo.
    """
    import base64

    brand_id = str(uuid.uuid4())
    logo_url = None

    # Handle logo base64 → Supabase Storage upload
    if request.logo_base64:
        try:
            logo_bytes = base64.b64decode(request.logo_base64)
            ext = "png" if "png" in request.logo_content_type else "jpg"
            logo_filename = f"{brand_id}/logo_manual.{ext}"
            logo_url = upload_file_to_storage(
                "assets", logo_filename, logo_bytes, request.logo_content_type
            )
        except Exception as e:
            print(f"Warning: Failed to upload manual logo: {e}")

    # Build brand dict matching frozen schema
    brand_dict = {
        "brand_id": brand_id,
        "brand_name": request.brand_name,
        "tagline": request.tagline,
        "tagline_bn": request.tagline_bn,
        "industry": request.industry,
        "target_audience": request.target_audience,
        "brand_personality": request.brand_personality,
        "colors": request.colors,
        "typography": request.typography,
        "logo_url": logo_url,
        "product_image_url": request.product_image_url,
        "voice": request.voice,
        "do_not_use": request.do_not_use,
    }

    # Validate against frozen Brand model
    try:
        brand = Brand(**brand_dict)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Brand data failed schema validation: {e}",
        )

    # Save to Supabase DB (same path as upload flow)
    try:
        db_payload = brand.model_dump(mode="json")
        db_payload["id"] = brand_id
        db_payload["raw_data"] = brand.model_dump(mode="json")
        del db_payload["brand_id"]
        saved = save_brand(db_payload)
        if not saved:
            raise Exception("Insert returned no data")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database save failed: {e}")

    return BrandUploadResponse(
        brand_id=brand_id,
        brand=brand,
        colors_source="manual",
        message="Brand created manually",
    )


@router.post("/brands/{brand_id}/product")
async def upload_product_image(
    brand_id: str = Path(...),
    product_image: UploadFile = File(...)
):
    """
    Uploads a product image, strips the background using Remove.bg,
    saves the transparent PNG to Supabase Storage, and updates the Brand record.
    """
    # 1. Verify Brand Exists
    brand_data = get_brand(brand_id)
    if not brand_data:
        raise HTTPException(status_code=404, detail="Brand not found")
        
    try:
        image_bytes = await product_image.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read image: {e}")
        
    # 2. Strip Background (best-effort — fall back to original if credits exhausted)
    bg_removed = False
    try:
        transparent_bytes = remove_background(image_bytes, product_image.content_type)
        bg_removed = True
    except Exception as e:
        print(f"Warning: Remove.bg failed ({e}). Uploading original image without background removal.")
        transparent_bytes = image_bytes

    # 3. Upload to Supabase Storage
    filename = f"{brand_id}/product_transparent.png"
    content_type = "image/png" if bg_removed else (product_image.content_type or "image/png")
    try:
        url_info = upload_file_to_storage("assets", filename, transparent_bytes, content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload to storage: {e}")

    # 4. Update Brand Record in Database
    try:
        client = get_supabase()
        res = client.table("brands").update({"product_image_url": url_info}).eq("id", brand_id).execute()
        if not res.data:
            raise Exception("No record updated")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database update failed: {e}")

    return {
        "message": "Product image uploaded" + (" with background removed" if bg_removed else " (background removal skipped — no credits)"),
        "product_image_url": url_info,
        "background_removed": bg_removed,
    }

