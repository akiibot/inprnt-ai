"""
Imprnt AI — Gemini Service
Handles interaction with Google's Gemini API for brand extraction and campaign planning.
Includes DEMO_FALLBACK_MODE for testing without real API keys.
"""
import json
from typing import Optional
from pathlib import Path

from google import genai
from google.genai import types

from config import settings
from prompts.brand_extraction import BRAND_EXTRACTION_SYSTEM_PROMPT
from prompts.campaign_planning import CAMPAIGN_PLANNING_SYSTEM_PROMPT
from models.brand import Brand
from models.blueprint import Blueprint

# Initialize Gemini Client
client: Optional[genai.Client] = None
if settings.GOOGLE_AI_API_KEY:
    try:
        client = genai.Client(api_key=settings.GOOGLE_AI_API_KEY)
    except Exception as e:
        print(f"Warning: Failed to initialize Gemini client: {e}")

# Models
PRIMARY_MODEL = "gemini-2.5-pro"
FALLBACK_MODEL = "gemini-2.5-flash"


def get_gemini() -> genai.Client:
    """Returns the Gemini client instance."""
    if not client:
        raise ValueError("Gemini client not initialized. Check GOOGLE_AI_API_KEY in .env")
    return client


def _get_mock_data(filename: str) -> dict:
    """Helper to load mock data for DEMO_FALLBACK_MODE."""
    # Assuming this runs with root context available relative to the backend dir
    mock_path = Path(__file__).parent.parent.parent / "mock-data" / filename
    if mock_path.exists():
        with open(mock_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _call_gemini_with_fallback(system_instruction: str, contents: list) -> tuple[str, str]:
    """
    Calls Gemini API, falling back to gemini-2.5-flash on specific errors.
    Returns a tuple of (response_text, model_used).
    """
    gemini = get_gemini()
    
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        temperature=0.2, # Keep it deterministic for structured extraction
    )
    
    try:
        # Try Primary Model
        response = gemini.models.generate_content(
            model=PRIMARY_MODEL,
            contents=contents,
            config=config,
        )
        return response.text, PRIMARY_MODEL
    except Exception as e:
        # Handle 429/503 or generic fallback
        print(f"Primary model {PRIMARY_MODEL} failed: {e}. Falling back to {FALLBACK_MODEL}...")
        try:
            response = gemini.models.generate_content(
                model=FALLBACK_MODEL,
                contents=contents,
                config=config,
            )
            return response.text, FALLBACK_MODEL
        except Exception as e_fallback:
             raise Exception(f"Both primary and fallback Gemini models failed. Error: {e_fallback}")


def extract_brand(pdf_text: str, logo_mime_type: str, logo_bytes: bytes) -> tuple[dict, str]:
    """
    Extracts brand identity from a PDF and logo using Gemini.
    """
    if settings.DEMO_FALLBACK_MODE:
        return _get_mock_data("brand_volt_bd.json"), "mock-demo-mode"

    # Create the contents payload (Text + Image)
    contents = [
        types.Part.from_text(text=f"Brand Document Text:\n{pdf_text}"),
        types.Part.from_bytes(data=logo_bytes, mime_type=logo_mime_type)
    ]
    
    response_text, model_used = _call_gemini_with_fallback(
        system_instruction=BRAND_EXTRACTION_SYSTEM_PROMPT,
        contents=contents
    )
    
    # Parse JSON
    try:
         brand_dict = json.loads(response_text)
    except json.JSONDecodeError:
         raise Exception(f"Gemini returned invalid JSON: {response_text}")
         
    return brand_dict, model_used


def plan_campaign(brand: dict, prompt: str, format_spec: dict, adherence_level: str, product_image_available: bool) -> tuple[dict, str, int]:
    """
    Plans a campaign, generating a blueprint from a brand profile and prompt.
    Includes retry logic for schema validation.
    """
    if settings.DEMO_FALLBACK_MODE:
        # Pick the right mock blueprint based on format aspect ratio
        ar = format_spec.get('aspect_ratio', '1:1')
        mock_file = "blueprint_eid_1x1.json"
        if ar == "9:16": mock_file = "blueprint_eid_9x16.json"
        if ar == "16:9": mock_file = "blueprint_eid_16x9.json"
        return _get_mock_data(mock_file), "mock-demo-mode", 0

    input_text = f"""
    Brand Profile:
    {json.dumps(brand, indent=2)}
    
    Campaign Brief:
    {prompt}
    
    Format Specs:
    {json.dumps(format_spec, indent=2)}
    
    Adherence Level: {adherence_level}
    Product Image Available: {str(product_image_available).lower()}
    """
    
    contents = [types.Part.from_text(text=input_text)]
    
    # Retry logic
    MAX_RETRIES = 3
    retries = 0
    last_error = None
    
    system_instruction = CAMPAIGN_PLANNING_SYSTEM_PROMPT
    
    while retries <= MAX_RETRIES:
        try:
            response_text, model_used = _call_gemini_with_fallback(
                system_instruction=system_instruction,
                contents=contents
            )
            
            blueprint_dict = json.loads(response_text)
            return blueprint_dict, model_used, retries
            
        except json.JSONDecodeError as e:
             last_error = f"Invalid JSON returned: {e}. Raw response: {response_text}"
        except Exception as e:
             last_error = f"Validation or API error: {e}"
             
        # Append error to system instruction for retry
        print(f"Campaign planning failed (attempt {retries + 1}). Retrying... Error: {last_error}")
        system_instruction = f"{CAMPAIGN_PLANNING_SYSTEM_PROMPT}\n\nPREVIOUS ERROR (FIX THIS):\n{last_error}"
        retries += 1
        
    raise Exception(f"Campaign planning failed after {MAX_RETRIES} retries. Last error: {last_error}")
