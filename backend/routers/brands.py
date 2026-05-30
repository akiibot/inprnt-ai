"""
Imprnt AI — Phase 2: Brands Router
POST /api/brands/upload
GET  /api/brands/{brand_id}
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
import pdfplumber

from models.brand import BrandUploadResponse, Brand
from services.gemini import extract_brand
from services.colorthief_service import extract_colors
from services.supabase_client import upload_file_to_storage, save_brand, get_brand

router = APIRouter(tags=["Brands"])

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
