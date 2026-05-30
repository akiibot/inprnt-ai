"""
Imprnt AI — Flux Background Generation Service
Calls Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell) to generate campaign backgrounds.
"""
import base64
import requests
from config import settings

# The Cloudflare AI model
MODEL_ID = "@cf/black-forest-labs/flux-1-schnell"

def generate_background(prompt: str, width: int = 1024, height: int = 1024) -> bytes:
    """
    Generates a background image using Flux 1 Schnell on Cloudflare Workers AI.
    Returns the image as bytes.
    """
    if not settings.CLOUDFLARE_API_TOKEN or not settings.CLOUDFLARE_ACCOUNT_ID:
        raise ValueError(
            "Cloudflare API credentials missing. "
            "Please configure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env"
        )

    url = f"https://api.cloudflare.com/client/v4/accounts/{settings.CLOUDFLARE_ACCOUNT_ID}/ai/run/{MODEL_ID}"
    headers = {
        "Authorization": f"Bearer {settings.CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json"
    }

    # Format the prompt to strictly enforce "no text"
    enhanced_prompt = f"{prompt}, no text, no letters, no words, no writing, no watermark, clean background"

    payload = {
        "prompt": enhanced_prompt,
        "width": width,
        "height": height
    }

    print(f"Calling Cloudflare Workers AI: {MODEL_ID} for background generation...")
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    
    if response.status_code != 200:
        raise Exception(f"Cloudflare AI Error ({response.status_code}): {response.text}")

    result = response.json()
    
    # Cloudflare returns the image as a base64 encoded string in result['result']['image']
    if result.get("success") and "result" in result and "image" in result["result"]:
        image_b64 = result["result"]["image"]
        return base64.b64decode(image_b64)
    else:
        raise Exception(f"Unexpected response format from Cloudflare AI: {result}")
