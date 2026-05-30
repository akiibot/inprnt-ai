"""
Imprnt AI — Remove.bg Service
Strips the background from product images using the Remove.bg API.
"""
import requests
from config import settings

def remove_background(image_bytes: bytes, image_content_type: str = "image/png") -> bytes:
    """
    Removes the background from an image.
    Returns the transparent PNG as bytes.
    """
    if not settings.REMOVEBG_API_KEY:
        raise ValueError("REMOVEBG_API_KEY is not configured in .env")

    # API Endpoint
    url = "https://api.remove.bg/v1.0/removebg"
    
    # Headers
    headers = {
        "X-Api-Key": settings.REMOVEBG_API_KEY
    }
    
    # Files payload (multipart/form-data)
    # Using 'image_file' field name as required by remove.bg API
    files = {
        'image_file': ('product_image', image_bytes, image_content_type)
    }
    
    # Optional data payload
    data = {
        'size': 'auto' # Let it determine best resolution (up to 50 MP for standard API)
    }
    
    print("Calling Remove.bg API to strip background...")
    response = requests.post(url, headers=headers, files=files, data=data, timeout=30)
    
    if response.status_code == requests.codes.ok:
        return response.content
    else:
        try:
            error_msg = response.json()
        except:
            error_msg = response.text
        raise Exception(f"Remove.bg API Error ({response.status_code}): {error_msg}")
