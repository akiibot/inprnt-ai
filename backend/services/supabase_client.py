"""
Imprnt AI — Supabase Client
Handles database operations and storage buckets.
"""
import json
from pathlib import Path
from supabase import create_client, Client
from config import settings

_MOCK_DATA_DIR = Path(__file__).parent.parent / "mock-data"
_DEMO_BRAND_ID = "volt-bd-demo-001"  # kept for backward compat

# ── Demo brand registry ───────────────────────────────────────────────────────

_DEMO_BRANDS: dict[str, dict] = {
    "volt-bd-demo-001": {
        "slug":              "volt_bd",
        "filename_patterns": ["volt", "voltbd", "volt_bd", "volt-bd"],
        "name_patterns":     ["volt bd", "voltbd", "volt"],
    },
    "livana-demo-001": {
        "slug":              "livana",
        "filename_patterns": ["livana"],
        "name_patterns":     ["livana"],
    },
    "aether-demo-001": {
        "slug":              "aether",
        "filename_patterns": ["aether"],
        "name_patterns":     ["aether"],
    },
}


def detect_demo_brand_by_filename(pdf_filename: str, logo_filename: str) -> str | None:
    """Return demo brand_id if either filename contains a known demo brand pattern."""
    needle = (pdf_filename + " " + logo_filename).lower()
    for brand_id, meta in _DEMO_BRANDS.items():
        for pat in meta["filename_patterns"]:
            if pat in needle:
                return brand_id
    return None


def detect_demo_brand_by_name(brand_name: str) -> str | None:
    """Return demo brand_id if extracted brand name matches a known demo brand."""
    needle = brand_name.lower()
    for brand_id, meta in _DEMO_BRANDS.items():
        for pat in meta["name_patterns"]:
            if pat in needle:
                return brand_id
    return None


def is_demo_brand(brand_id: str) -> bool:
    return brand_id in _DEMO_BRANDS


def load_demo_brand_data(brand_id: str) -> dict:
    """Load a demo brand profile from mock-data/brands/{slug}.json."""
    slug = _DEMO_BRANDS[brand_id]["slug"]
    brand_path = _MOCK_DATA_DIR / "brands" / f"{slug}.json"
    with open(brand_path, "r", encoding="utf-8") as f:
        brand = json.load(f)
    # Patch local asset paths only when not already set to a real URL
    assets_dir = _MOCK_DATA_DIR / "assets"
    if not brand.get("logo_url") or brand["logo_url"].startswith("/Users"):
        logo_path = assets_dir / f"{slug}_logo.png"
        brand["logo_url"] = str(logo_path) if logo_path.exists() else ""
    if not brand.get("product_image_url") or brand["product_image_url"].startswith("/Users"):
        prod_path = assets_dir / f"{slug}_product.png"
        brand["product_image_url"] = str(prod_path) if prod_path.exists() else None
    brand["id"] = brand_id
    return brand


def load_cached_results(brand_id: str) -> dict | None:
    """Return cached demo results for a brand, or None if poster URLs are missing."""
    if not is_demo_brand(brand_id):
        return None
    slug = _DEMO_BRANDS[brand_id]["slug"]
    path = _MOCK_DATA_DIR / "cached_results" / f"{slug}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        posters = data.get("posters", {})
        if all(posters.get(ar) for ar in ("1:1", "9:16", "16:9")):
            return data
    except Exception:
        pass
    return None


def load_demo_prompt(brand_id: str) -> str:
    """Return the campaign prompt for a demo brand regardless of whether posters are ready."""
    if not is_demo_brand(brand_id):
        return ""
    slug = _DEMO_BRANDS[brand_id]["slug"]
    path = _MOCK_DATA_DIR / "cached_results" / f"{slug}.json"
    if not path.exists():
        return ""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("prompt", "")
    except Exception:
        return ""


# ── Backward-compat shim ─────────────────────────────────────────────────────

def _load_demo_brand() -> dict:
    """Legacy shim — used by brands.py load-demo endpoint."""
    return load_demo_brand_data(_DEMO_BRAND_ID)


# ── Supabase client ──────────────────────────────────────────────────────────

supabase: Client = None

if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
    try:
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    except Exception as e:
        print(f"Warning: Failed to initialize Supabase client: {e}")

def get_supabase() -> Client:
    """Returns the Supabase client instance."""
    if not supabase:
        raise ValueError("Supabase client not initialized. Check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
    return supabase

def upload_file_to_storage(bucket_name: str, file_path: str, file_bytes: bytes, content_type: str) -> str:
    """
    Uploads a file to a Supabase Storage bucket and returns its public URL.
    """
    client = get_supabase()
    client.storage.from_(bucket_name).upload(
        path=file_path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "true"}
    )
    url_info = client.storage.from_(bucket_name).get_public_url(file_path)
    return url_info

def save_brand(brand_data: dict) -> dict:
    """Saves a brand to the database."""
    client = get_supabase()
    response = client.table("brands").insert(brand_data).execute()
    return response.data[0] if response.data else None


def get_brand(brand_id: str) -> dict:
    """Retrieves a brand from the database. Returns demo brand data for known demo IDs."""
    if is_demo_brand(brand_id):
        return load_demo_brand_data(brand_id)
    client = get_supabase()
    response = client.table("brands").select("*").eq("id", brand_id).execute()
    return response.data[0] if response.data else None


def list_brands() -> list[dict]:
    """Returns id, brand_name, logo_url, colors, created_at for all brands, newest first."""
    client = get_supabase()
    response = (
        client.table("brands")
        .select("id, brand_name, logo_url, colors, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def delete_brand(brand_id: str) -> bool:
    """Deletes a brand record. Returns True if a row was deleted."""
    client = get_supabase()
    response = client.table("brands").delete().eq("id", brand_id).execute()
    return bool(response.data)


def rename_brand(brand_id: str, brand_name: str) -> dict | None:
    """Updates brand_name for a brand. Returns the updated row or None."""
    client = get_supabase()
    response = (
        client.table("brands")
        .update({"brand_name": brand_name})
        .eq("id", brand_id)
        .execute()
    )
    return response.data[0] if response.data else None
