"""
Imprnt AI — Phase 3+ stub: Cloudflare Workers AI client
Sends background.prompt → Cloudflare Workers AI Flux 1 Schnell → returns image bytes.
Full implementation in Phase 3.

Endpoint: POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell
Auth: Authorization: Bearer {CLOUDFLARE_API_TOKEN}
Request: { "prompt": "string" }
Response: Raw image bytes (save directly as PNG)
"""
