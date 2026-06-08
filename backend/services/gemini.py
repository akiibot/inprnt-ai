"""
Imprnt AI — Gemini Service
Handles interaction with Google's Gemini API for brand extraction and campaign planning.
Includes DEMO_FALLBACK_MODE for testing without real API keys.
"""
import json
import re
import time
from typing import Optional
from pathlib import Path

from google import genai
from google.genai import types
from pydantic import ValidationError

from config import settings
from prompts.brand_extraction import BRAND_EXTRACTION_SYSTEM_PROMPT
from prompts.campaign_planning import CAMPAIGN_PLANNING_SYSTEM_PROMPT
from prompts.caption_generation import CAPTION_GENERATION_SYSTEM_PROMPT
from models.brand import Brand
from models.blueprint import Blueprint

# Initialize Gemini Client
# Priority: service account JSON key (Vertex AI) > API key (AI Studio)
client: Optional[genai.Client] = None
if settings.GOOGLE_SERVICE_ACCOUNT_PATH:
    try:
        import json as _json
        from google.oauth2 import service_account as _sa_module

        # Read only the non-secret project_id from the file
        with open(settings.GOOGLE_SERVICE_ACCOUNT_PATH) as _f:
            _sa_meta = _json.load(_f)
        _project_id = _sa_meta.get("project_id", "")

        _creds = _sa_module.Credentials.from_service_account_file(
            settings.GOOGLE_SERVICE_ACCOUNT_PATH,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        # Vertex AI endpoint accepts service account credentials natively
        client = genai.Client(
            vertexai=True,
            project=_project_id,
            location="us-central1",
            credentials=_creds,
        )
        print(f"Gemini: initialized via Vertex AI (project: {_project_id})")
    except Exception as e:
        print(f"Warning: Failed to initialize Gemini client with service account: {e}")
elif settings.GOOGLE_AI_API_KEY:
    try:
        client = genai.Client(api_key=settings.GOOGLE_AI_API_KEY)
        print("Gemini: initialized via AI Studio API key.")
    except Exception as e:
        print(f"Warning: Failed to initialize Gemini client with API key: {e}")

# gemini-2.5-flash:      confirmed working on this key — supports ThinkingConfig
# gemini-2.5-flash-lite: confirmed working on this key — lighter fallback
PRIMARY_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.5-flash-lite"


def get_gemini() -> genai.Client:
    """Returns the Gemini client instance."""
    if not client:
        raise ValueError(
            "Gemini client not initialized. Set either:\n"
            "  GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json  (Vertex AI)\n"
            "  GOOGLE_AI_API_KEY=AIza...  (AI Studio, from aistudio.google.com/app/apikey)"
        )
    return client


def _get_mock_data(filename: str) -> dict:
    """Helper to load mock data for DEMO_FALLBACK_MODE."""
    # Assuming this runs with root context available relative to the backend dir
    mock_path = Path(__file__).parent.parent / "mock-data" / filename
    if mock_path.exists():
        with open(mock_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _is_rate_limited(exc: Exception) -> bool:
    return "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc)


def _is_daily_quota_exhausted(exc: Exception) -> bool:
    """True if this is a per-day quota limit (retrying won't help until tomorrow)."""
    s = str(exc)
    return "PerDay" in s or "per_day" in s or "FreeTier" in s


def _blueprint_has_bengali(blueprint_dict: dict) -> bool:
    """True if any text layer contains Bengali-script characters (U+0980–U+09FF)."""
    for layer in blueprint_dict.get("layers", []):
        if layer.get("type") == "text":
            content = layer.get("content", "")
            if any("ঀ" <= ch <= "৿" for ch in content):
                return True
    return False


def _parse_retry_delay(exc: Exception) -> float:
    """Extract the server-suggested retryDelay seconds from a 429 error, default 15s."""
    m = re.search(r"retryDelay.*?(\d+(?:\.\d+)?)\s*s", str(exc))
    return float(m.group(1)) if m else 15.0


def _call_gemini_with_fallback(system_instruction: str, contents: list, thinking_budget: int = 0) -> tuple[str, str]:
    """
    Calls Gemini API, falling back to FALLBACK_MODEL on non-quota errors.
    On 429 the fallback is skipped — it shares the same daily quota bucket.

    thinking_budget=0 disables thinking entirely (saves 15-36s per call).
    thinking_budget=1024 allows limited thinking for creative planning tasks.
    """
    gemini = get_gemini()

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        temperature=0.2,
        thinking_config=types.ThinkingConfig(thinking_budget=thinking_budget),
    )

    try:
        response = gemini.models.generate_content(
            model=PRIMARY_MODEL,
            contents=contents,
            config=config,
        )
        return response.text, PRIMARY_MODEL
    except Exception as e:
        if _is_rate_limited(e):
            if _is_daily_quota_exhausted(e):
                raise Exception(
                    "Gemini daily quota exhausted. "
                    "If using Vertex AI (service account): enable billing at console.cloud.google.com. "
                    "If using AI Studio API key: enable billing at aistudio.google.com."
                )
            # Don't try the fallback — quota is per-project, not per-model slug.
            # Let the retry loop handle sleep + backoff.
            raise
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
        contents=contents,
        thinking_budget=0,
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

    # Expected language drives the bilingual requirement (rule 6).
    voice = brand.get("voice") if isinstance(brand, dict) else None
    expected_language = voice.get("language", "en") if isinstance(voice, dict) else "en"
    requires_bengali = expected_language in ("both", "bn")

    # Retry logic
    MAX_RETRIES = 3
    retries = 0
    last_error = None

    system_instruction = CAMPAIGN_PLANNING_SYSTEM_PROMPT
    
    while retries <= MAX_RETRIES:
        response_text = ""
        try:
            response_text, model_used = _call_gemini_with_fallback(
                system_instruction=system_instruction,
                contents=contents,
                thinking_budget=8192,
            )
            blueprint_dict = json.loads(response_text)
            # brand_id is injected by the caller (campaigns.py) after this returns,
            # so supply a placeholder here — we're only validating structure.
            Blueprint(**{**blueprint_dict, "brand_id": blueprint_dict.get("brand_id", "_validate")})

            # Enforce the bilingual requirement — Gemini sometimes drops the
            # Bengali headline to simplify. Reject and retry so it re-adds it.
            if requires_bengali and not _blueprint_has_bengali(blueprint_dict):
                raise ValueError(
                    f"Brand language is '{expected_language}' so the blueprint MUST include "
                    "at least one text layer with Bengali-script content (e.g. a Bengali "
                    "headline using font_family 'Hind Siliguri'). None was found. Add a "
                    "Bengali headline beneath the English one, spaced per rule 14."
                )

            return blueprint_dict, model_used, retries

        except json.JSONDecodeError as e:
            last_error = f"Invalid JSON: {e}. Raw: {response_text[:400]}"
        except ValidationError as e:
            last_error = f"Schema validation failed: {e}"
        except ValueError as e:
            last_error = f"Content requirement not met: {e}"
        except Exception as e:
            if _is_rate_limited(e):
                if _is_daily_quota_exhausted(e):
                    raise Exception(
                        "Gemini daily quota exhausted (gemini-2.5-flash). "
                        "If using Vertex AI (service account): enable billing at console.cloud.google.com. "
                        "If using AI Studio API key: enable billing at aistudio.google.com, or wait until tomorrow."
                    )
                delay = _parse_retry_delay(e)
                print(f"Campaign planning rate-limited (429). Waiting {delay:.0f}s before retry {retries + 1}...")
                time.sleep(delay)
                last_error = f"Rate limited (waited {delay:.0f}s): {e}"
            else:
                last_error = f"API error: {e}"

        print(f"Campaign planning attempt {retries + 1} failed: {last_error}. Retrying...")
        system_instruction = (
            f"{CAMPAIGN_PLANNING_SYSTEM_PROMPT}\n\nPREVIOUS ERROR — FIX THIS BEFORE RESPONDING:\n{last_error}"
        )
        retries += 1


def generate_captions(brand: dict, blueprint: dict) -> dict:
    """
    Generates platform-specific marketing captions from brand voice + campaign strategy.
    Returns captions dict or a safe fallback on failure — never breaks the main pipeline.
    """
    user_message = f"""
BRAND PROFILE:
- Name: {brand.get('brand_name')}
- Personality: {', '.join(brand.get('brand_personality', []))}
- Voice tone: {brand.get('voice', {}).get('tone')}
- Formality: {brand.get('voice', {}).get('formality')}
- Language: {brand.get('voice', {}).get('language')}
- Do NOT use: {', '.join(brand.get('do_not_use', []))}
- Tagline: {brand.get('tagline')}

CAMPAIGN:
- Name: {blueprint.get('campaign_name')}
- Strategy: {blueprint.get('campaign_strategy')}

Write marketing captions for this campaign following the system rules exactly.
"""

    try:
        raw, _ = _call_gemini_with_fallback(
            system_instruction=CAPTION_GENERATION_SYSTEM_PROMPT,
            contents=[{"role": "user", "parts": [{"text": user_message}]}],
            thinking_budget=0,
        )
        clean = raw.strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(clean)
    except Exception as e:
        print(f"Caption generation failed: {e}")
        return {
            "instagram": f"{blueprint.get('campaign_name')} ⚡ {brand.get('tagline')}",
            "facebook": f"{blueprint.get('campaign_name')} — {brand.get('tagline')}",
            "tiktok": f"{brand.get('tagline')} 🔥",
            "caption_bn": brand.get('tagline_bn', ''),
            "hashtags": [f"#{brand.get('brand_name', '').replace(' ', '')}"],
        }

    raise Exception(f"Campaign planning failed after {MAX_RETRIES} retries. Last error: {last_error}")
