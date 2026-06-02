"""
Imprnt AI — Supabase Client
Handles database operations and storage buckets.
"""
import json
from pathlib import Path
from supabase import create_client, Client
from config import settings

_MOCK_DATA_DIR = Path(__file__).parent.parent.parent / "mock-data"
_DEMO_BRAND_ID = "volt-bd-demo-001"

# Initialize Supabase client globally
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
    
    # Upload file
    res = client.storage.from_(bucket_name).upload(
        path=file_path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "true"}
    )
    
    # Get public URL
    url_info = client.storage.from_(bucket_name).get_public_url(file_path)
    return url_info

def save_brand(brand_data: dict) -> dict:
    """Saves a brand to the database."""
    client = get_supabase()
    response = client.table("brands").insert(brand_data).execute()
    return response.data[0] if response.data else None

def _load_demo_brand() -> dict:
    """Load the Volt BD demo brand from mock-data, fixing asset paths."""
    brand_path = _MOCK_DATA_DIR / "brand_volt_bd.json"
    with open(brand_path, "r", encoding="utf-8") as f:
        brand = json.load(f)
    assets_dir = _MOCK_DATA_DIR / "assets"
    brand["logo_url"] = str(assets_dir / "volt_bd_logo.png")
    brand["product_image_url"] = str(assets_dir / "volt_bd_can.png")
    brand["id"] = _DEMO_BRAND_ID
    return brand


def get_brand(brand_id: str) -> dict:
    """Retrieves a brand from the database. Falls back to mock data for the demo brand."""
    if brand_id == _DEMO_BRAND_ID:
        return _load_demo_brand()
    client = get_supabase()
    response = client.table("brands").select("*").eq("id", brand_id).execute()
    return response.data[0] if response.data else None
