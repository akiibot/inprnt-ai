# Imprnt AI — Implementation Plan (PLAN.md)

> **Project**: Imprnt AI — AI-powered brand intelligence & creative direction platform
> **Competition**: The Infinity AI BuildFest 2026 — Track 2: MarTech
> **Date**: 2026-05-30
> **Status**: APPROVED ✅ (Image gen: Cloudflare Workers AI)

---

## Table of Contents

1. [Environment Summary](#1-environment-summary)
2. [Frozen JSON Schemas](#2-frozen-json-schemas)
3. [Folder Structure](#3-folder-structure)
4. [Gemini System Prompts](#4-gemini-system-prompts)
5. [Puppeteer HTML Template Strategy](#5-puppeteer-html-template-strategy)
6. [API Endpoints](#6-api-endpoints)
7. [Phase Checklists](#7-phase-checklists)
8. [Golden-Path Demo Scenario](#8-golden-path-demo-scenario)
9. [Risk Register](#9-risk-register)

---

## 1. Environment Summary

| Item | Value |
|---|---|
| OS | macOS 14.0 (Sonoma) |
| Python | 3.14.0 |
| Node.js | v22.19.0 |
| npm | 10.9.3 |
| Chip | Apple Silicon (assumed — will verify on first Puppeteer install) |
| API Keys | All 4 ready (Google AI Studio, Cloudflare Workers AI, Remove.bg, Supabase) |
| Supabase Project | Not yet created — SQL migrations included in Phase 2 |

> [!NOTE]
> Python 3.14 is very new. FastAPI + Pydantic should work, but we'll pin dependency versions in `requirements.txt` to avoid compatibility surprises.

---

## 2. Frozen JSON Schemas

These two contracts are the spine of the entire system. **Do not modify without explicit user approval.**

### 2.1 `brand.json` Schema

```json
{
  "brand_id": "uuid-v4",
  "brand_name": "Volt BD",
  "tagline": "Stay Focused. Recharge.",
  "tagline_bn": "মনোযোগ রাখো। রিচার্জ হও।",
  "industry": "Beverages / Energy Drink",
  "target_audience": "Young adults 18-30, urban Bangladesh",
  "brand_personality": ["Bold", "Energetic", "Youthful", "Rebellious"],
  "colors": {
    "primary": "#FF4B00",
    "secondary": "#0D0D0D",
    "accent": "#FFFFFF",
    "palette": ["#FF4B00", "#0D0D0D", "#FFFFFF", "#1A1A1A", "#FF6B2C"]
  },
  "typography": {
    "heading_font": "Anton",
    "heading_font_bn": "Hind Siliguri",
    "body_font": "Inter",
    "body_font_bn": "Noto Sans Bengali"
  },
  "logo_url": "supabase-storage-url-or-local-path/volt_bd_logo.png",
  "product_image_url": null,
  "voice": {
    "tone": "High-energy, direct, motivational",
    "language": "both",
    "formality": "Informal / Street"
  },
  "do_not_use": ["Pastel colors", "Cursive fonts", "Soft imagery"],
  "created_at": "2026-05-30T07:00:00Z"
}
```

### 2.2 `blueprint.json` Schema

```json
{
  "blueprint_id": "uuid-v4",
  "brand_id": "uuid-v4",
  "campaign_name": "Eid Special Edition Launch",
  "campaign_strategy": "Leverage Eid celebrations to position Volt BD as the energy drink of festive gatherings. Combine cultural festivity with brand's rebellious energy.",
  "format": {
    "name": "Instagram Post",
    "width": 1080,
    "height": 1080,
    "aspect_ratio": "1:1"
  },
  "background": {
    "source": "generated",
    "prompt": "Abstract dark background with electric orange energy sparks and subtle crescent moon silhouette, Eid celebration theme, moody dramatic lighting, no text no letters no words",
    "fallback_color": "#0D0D0D"
  },
  "layers": [
    {
      "id": "bg-overlay",
      "type": "overlay",
      "source": "rendered",
      "style": {
        "background": "linear-gradient(180deg, rgba(13,13,13,0.0) 0%, rgba(13,13,13,0.85) 100%)"
      },
      "z_index": 1
    },
    {
      "id": "logo",
      "type": "image",
      "source": "uploaded",
      "asset_key": "logo_url",
      "position": "top-left",
      "size": { "width": 120, "height": "auto" },
      "margin": { "top": 40, "left": 40 },
      "z_index": 5
    },
    {
      "id": "headline-bn",
      "type": "text",
      "source": "rendered",
      "content": "ভোল্ট দিয়ে ঈদ জমাও!",
      "font_family": "Hind Siliguri",
      "font_size": 72,
      "font_weight": 700,
      "color": "#FF4B00",
      "text_transform": "none",
      "position": "center-left",
      "margin": { "left": 60, "bottom": 20 },
      "max_width": 700,
      "line_height": 1.2,
      "z_index": 10
    },
    {
      "id": "headline-en",
      "type": "text",
      "source": "rendered",
      "content": "LIGHT UP EID WITH VOLT",
      "font_family": "Anton",
      "font_size": 36,
      "font_weight": 400,
      "color": "#FFFFFF",
      "text_transform": "uppercase",
      "position": "center-left",
      "margin": { "left": 60, "top": 10 },
      "max_width": 700,
      "line_height": 1.3,
      "z_index": 10
    },
    {
      "id": "cta",
      "type": "text",
      "source": "rendered",
      "content": "এখনই অর্ডার করুন — voltbd.com",
      "font_family": "Noto Sans Bengali",
      "font_size": 22,
      "font_weight": 600,
      "color": "#0D0D0D",
      "background_color": "#FF4B00",
      "padding": { "top": 14, "right": 32, "bottom": 14, "left": 32 },
      "border_radius": 8,
      "position": "bottom-center",
      "margin": { "bottom": 60 },
      "z_index": 10
    },
    {
      "id": "product-hero",
      "type": "image",
      "source": "uploaded",
      "asset_key": "product_image_url",
      "position": "center-right",
      "size": { "width": 320, "height": "auto" },
      "margin": { "right": 60 },
      "z_index": 8,
      "optional": true
    }
  ],
  "metadata": {
    "adherence_level": "strict",
    "language": "both",
    "generated_at": "2026-05-30T07:00:00Z",
    "model_used": "gemini-2.5-pro",
    "retry_count": 0
  }
}
```

> [!IMPORTANT]
> Every `layer` has a `source` field: `"generated"` | `"rendered"` | `"uploaded"`.
> This single field drives the entire compositor logic:
> - `generated` → Flux background image placed as the base layer
> - `rendered` → Puppeteer renders as HTML/CSS (text, overlays, CTAs)
> - `uploaded` → User asset (logo, product image) placed directly

---

## 3. Folder Structure

```
Imprnt AI/
├── CONTEXT.md                          # Frozen schemas + project context
├── DECISIONS.md                        # Design decisions log
├── RULES.md                            # Execution rules
├── PLAN.md                             # This file (copied to project root)
├── .env                                # All API keys (git-ignored)
├── .env.example                        # Template with key names only
├── .gitignore
│
├── mock-data/
│   ├── brand_volt_bd.json              # Hand-written Volt BD brand.json
│   ├── blueprint_eid_1x1.json          # Mock blueprint — 1:1 format
│   ├── blueprint_eid_9x16.json         # Mock blueprint — 9:16 format
│   ├── blueprint_eid_16x9.json         # Mock blueprint — 16:9 format
│   └── assets/
│       ├── volt_bd_logo.png            # Generated logo
│       └── volt_bd_can.png             # Generated product image
│
├── frontend/                           # Next.js 14 App Router
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── public/
│   │   ├── fonts/                      # (if self-hosting fallback)
│   │   └── images/
│   │       └── imprnt-logo.svg
│   └── src/
│       ├── app/
│       │   ├── layout.tsx              # Root layout + Google Fonts
│       │   ├── page.tsx                # Landing / Dashboard
│       │   ├── globals.css             # Global styles
│       │   ├── create/
│       │   │   └── page.tsx            # Campaign creation form
│       │   └── campaign/
│       │       └── [id]/
│       │           └── page.tsx        # Campaign result view
│       ├── components/
│       │   ├── BrandUpload.tsx         # PDF + logo upload
│       │   ├── CampaignForm.tsx        # Prompt + format + adherence
│       │   ├── BlueprintPreview.tsx     # Blueprint preview card (Phase 7)
│       │   ├── PosterGallery.tsx        # Three-format gallery
│       │   ├── ProgressIndicator.tsx    # Live generation steps
│       │   ├── DemoButton.tsx           # Pre-load Volt BD demo (Phase 7)
│       │   └── ExportButton.tsx         # ZIP download
│       ├── lib/
│       │   ├── api.ts                  # API client (fetch wrappers)
│       │   └── types.ts               # TypeScript types for brand/blueprint
│       └── hooks/
│           └── useCampaign.ts          # Campaign generation hook
│
├── backend/                            # FastAPI
│   ├── requirements.txt
│   ├── main.py                         # FastAPI app entry + CORS
│   ├── config.py                       # Settings from .env
│   ├── models/
│   │   ├── brand.py                    # Pydantic model for brand.json
│   │   └── blueprint.py               # Pydantic model for blueprint.json
│   ├── routers/
│   │   ├── brands.py                   # POST /api/brands/upload
│   │   ├── campaigns.py               # POST /api/campaigns/plan
│   │   │                              # POST /api/campaigns/generate
│   │   │                              # GET  /api/campaigns/{id}
│   │   └── export.py                  # GET  /api/export/{campaign_id}
│   ├── services/
│   │   ├── gemini.py                  # Gemini API client (brand extract + campaign plan)
│   │   ├── flux.py                    # Cloudflare Workers AI Flux image gen
│   │   ├── compositor.py             # Orchestrates the hybrid pipeline
│   │   ├── removebg.py               # Remove.bg API client
│   │   ├── colorthief_service.py     # ColorThief wrapper
│   │   └── supabase_client.py        # Supabase DB + Storage client
│   ├── compositor/
│   │   ├── template.py               # build_html(blueprint, brand) → HTML string
│   │   ├── renderer.py               # Puppeteer screenshot logic
│   │   └── fallback_satori.py        # Satori fallback if Puppeteer fails
│   └── prompts/
│       ├── brand_extraction.py        # System prompt for PDF → brand.json
│       └── campaign_planning.py       # System prompt for brand + prompt → blueprint.json
│
└── scripts/
    ├── test_compositor.py             # Phase 1 verification script
    ├── test_gemini.py                 # Phase 2 API smoke test
    ├── test_flux.py                   # Phase 3 Cloudflare Workers AI smoke test
    └── seed_supabase.sql              # Phase 5 table creation
```

---

## 4. Gemini System Prompts

### 4.1 Brand Extraction Prompt (PDF → `brand.json`)

```python
BRAND_EXTRACTION_SYSTEM_PROMPT = """
You are a senior brand strategist. Your job is to read a brand identity 
document (PDF text) and a brand logo, then extract a structured brand 
identity profile.

TASK:
Analyze the provided brand document text and logo image. Extract the 
brand identity into the exact JSON schema below. If information is not 
explicitly stated in the document, infer it from context, tone, and 
visual cues in the logo.

RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no code fences.
2. All string values must be in the language they appear in the document.
   If the brand operates in Bangladesh, include both English and Bengali 
   fields where applicable.
3. For colors: use hex codes. The colors field will be OVERWRITTEN by 
   ColorThief analysis of the logo — but provide your best guess from 
   the document for validation.
4. For typography: suggest Google Fonts that match the brand personality.
   For Bengali text, choose from: "Hind Siliguri" or "Noto Sans Bengali".
   For English headings, choose from: "Anton", "Bebas Neue", "Oswald", 
   "Montserrat", "Poppins", "Inter".
5. brand_personality must be exactly 3-5 adjectives.
6. do_not_use must have at least 2 items — things that contradict the brand.
7. voice.language must be one of: "en", "bn", "both".

OUTPUT SCHEMA:
{
  "brand_name": "string",
  "tagline": "string (English)",
  "tagline_bn": "string (Bengali, or null if English-only brand)",
  "industry": "string",
  "target_audience": "string",
  "brand_personality": ["string", "string", "string"],
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "palette": ["#hex", "#hex", "#hex"]
  },
  "typography": {
    "heading_font": "Google Font name",
    "heading_font_bn": "Hind Siliguri or Noto Sans Bengali",
    "body_font": "Google Font name",
    "body_font_bn": "Hind Siliguri or Noto Sans Bengali"
  },
  "voice": {
    "tone": "string describing communication tone",
    "language": "en | bn | both",
    "formality": "string (Formal / Semi-formal / Informal / Street)"
  },
  "do_not_use": ["string", "string"],
  "created_at": "ISO 8601 timestamp"
}
"""
```

### 4.2 Campaign Planning Prompt (`brand.json` + user prompt → `blueprint.json`)

```python
CAMPAIGN_PLANNING_SYSTEM_PROMPT = """
You are an elite creative director at a top advertising agency. Your job 
is to take a brand identity profile and a campaign brief, then produce a 
complete design blueprint that a compositor engine can execute.

CONTEXT:
- The compositor renders text, logos, and CTAs using HTML/CSS (Puppeteer).
- Background images are generated by an AI image model (Flux).
- The image model CANNOT render text. ALL text must go in the layers array 
  with source: "rendered".
- Logos and product images are user uploads with source: "uploaded".
- The background has source: "generated" and needs an image generation prompt.




INPUT YOU WILL RECEIVE:
- brand_json: The complete brand identity object
- campaign_prompt: The user's natural language campaign description
- format: { name, width, height, aspect_ratio }
- adherence_level: "strict" | "moderate" | "creative"
- product_image_available: boolean

OUTPUT:
Return ONLY valid JSON matching this exact schema. No markdown, no code fences.

{
  "campaign_name": "string",
  "campaign_strategy": "string (2-3 sentence strategy explanation)",
  "format": { "name": "string", "width": number, "height": number, "aspect_ratio": "string" },
  "background": {
    "source": "generated",
    "prompt": "string (Flux image prompt — NO TEXT IN PROMPT)",
    "fallback_color": "#hex from brand secondary"
  },
  "layers": [
    {
      "id": "string (unique kebab-case identifier)",
      "type": "overlay | text | image",
      "source": "rendered | uploaded",
      "content": "string (for text layers)",
      "font_family": "string (for text layers)",
      "font_size": number,
      "font_weight": number,
      "color": "#hex",
      "text_transform": "none | uppercase | lowercase",
      "background_color": "#hex (optional, for CTA buttons)",
      "padding": { "top": number, "right": number, "bottom": number, "left": number },
      "border_radius": number,
      "position": "position keyword",
      "size": { "width": number, "height": number | "auto" },
      "margin": { "top": number, "right": number, "bottom": number, "left": number },
      "max_width": number,
      "line_height": number,
      "asset_key": "string (for uploaded images: logo_url | product_image_url)",
      "style": { "CSS properties for overlay layers" },
      "z_index": number,
      "optional": boolean
    }
  ],
  "metadata": {
    "adherence_level": "strict | moderate | creative",
    "language": "en | bn | both",
    "generated_at": "ISO 8601",
    "model_used": "gemini-2.5-pro",
    "retry_count": 0
  }
}
"""
```

---

## 5. Puppeteer HTML Template Strategy

### 5.1 Architecture

The compositor lives in `backend/compositor/template.py` as a single Python function:

```python
def build_html(blueprint: dict, brand: dict, assets: dict) -> str:
```

- **Input**: Parsed `blueprint.json`, `brand.json`, and a dict of resolved asset paths (`{ "logo_url": "/abs/path.png", "product_image_url": "/abs/path.png", "background_url": "/abs/path.png" }`)
- **Output**: A complete self-contained HTML string ready for Puppeteer screenshot
- **No external files**: All CSS is inline in `<style>` blocks. All images are embedded as `file://` URLs or base64 data URIs.

### 5.2 Font Loading

Fonts are loaded via Google Fonts `@import` at the very top of the `<style>` block:

```css
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Hind+Siliguri:wght@400;600;700&family=Inter:wght@400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap');
```

> [!IMPORTANT]
> **Bangla fonts (Hind Siliguri + Noto Sans Bengali) are loaded from day one — Phase 1.**
> The `@import` line never changes across phases. Bengali text rendering is verified before Phase 1 is marked complete.

### 5.3 Position Keyword → CSS Mapping

The 9 position keywords map to CSS via a `position: absolute` container with these rules:

| Position Keyword | CSS Properties |
|---|---|
| `top-left` | `top: 0; left: 0; align-items: flex-start; justify-content: flex-start;` |
| `top-center` | `top: 0; left: 50%; transform: translateX(-50%); text-align: center;` |
| `top-right` | `top: 0; right: 0; align-items: flex-start; justify-content: flex-end;` |
| `center-left` | `top: 50%; left: 0; transform: translateY(-50%);` |
| `center` | `top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;` |
| `center-right` | `top: 50%; right: 0; transform: translateY(-50%);` |
| `bottom-left` | `bottom: 0; left: 0;` |
| `bottom-center` | `bottom: 0; left: 50%; transform: translateX(-50%); text-align: center;` |
| `bottom-right` | `bottom: 0; right: 0;` |

Each layer becomes a `<div>` with `position: absolute` and the mapped CSS, plus margin offsets from the blueprint.

### 5.4 Layer Rendering Logic

```
for each layer in blueprint.layers (sorted by z_index):
    if layer.source == "rendered" and layer.type == "overlay":
        → <div> with full width/height, background style from layer.style
    if layer.source == "rendered" and layer.type == "text":
        → <div> with font, color, size from layer, positioned via keyword
        → If background_color exists, render as button (padding + border-radius)
    if layer.source == "uploaded" and layer.type == "image":
        → <img> with src from assets[layer.asset_key], sized per layer.size
```

### 5.5 Background Handling

- **Phase 1**: Background is `blueprint.background.fallback_color` as a CSS `background-color`.
- **Phase 3+**: Background is the Flux-generated image set as `background-image: url(...)` with `background-size: cover`.

### 5.6 Puppeteer Screenshot (`renderer.py`)

```python
async def render_poster(html: str, width: int, height: int, output_path: str) -> str:
    browser = await launch(headless=True, args=['--no-sandbox'])
    page = await browser.newPage()
    await page.setViewport({'width': width, 'height': height})
    await page.setContent(html, waitUntil='networkidle0')  # Wait for font loading
    await page.screenshot({'path': output_path, 'type': 'png', 'fullPage': False})
    await browser.close()
    return output_path
```

> `waitUntil='networkidle0'` is critical — it ensures Google Fonts finish loading before screenshot.

---

## 6. API Endpoints

### 6.1 Health Check

```
GET /api/health
Response: { "status": "ok", "version": "0.1.0" }
```

### 6.2 Brand Upload (Phase 2)

```
POST /api/brands/upload
Content-Type: multipart/form-data

Fields:
  - pdf: File (brand guideline PDF)
  - logo: File (brand logo PNG/JPG)

Response 200:
{
  "brand_id": "uuid",
  "brand": { ...brand.json schema... },
  "colors_source": "colorthief",
  "message": "Brand identity extracted successfully"
}

Response 422:
{ "detail": "PDF parsing failed: <reason>" }

Response 500:
{ "detail": "Gemini API error: <reason>" }
```

**Internal flow:**
1. Extract text from PDF (PyPDF2 or pdfplumber)
2. Send text + logo to Gemini 2.5 Pro with brand extraction prompt
3. Parse Gemini response as JSON
4. Run ColorThief on logo → extract top 5 hex colors
5. Overwrite `brand.colors` with ColorThief output
6. Validate against Pydantic `Brand` model
7. Save to Supabase `brands` table
8. Upload logo to Supabase Storage `brand-assets` bucket
9. Return `brand_id` + full `brand.json`

### 6.3 Campaign Plan (Phase 2)

```
POST /api/campaigns/plan
Content-Type: application/json

Body:
{
  "brand_id": "uuid",
  "prompt": "Create an Eid special edition launch poster with Bengali headline",
  "format": {
    "name": "Instagram Post",
    "width": 1080,
    "height": 1080,
    "aspect_ratio": "1:1"
  },
  "adherence_level": "strict",
  "product_image_available": false
}

Response 200:
{
  "blueprint": { ...blueprint.json schema... },
  "retries_used": 0
}

Response 422:
{ "detail": "Blueprint validation failed after 3 retries: <errors>" }
```

**Internal flow:**
1. Load `brand.json` from Supabase by `brand_id` (or from request body in Phase 1-2)
2. Build user message: `brand.json` + prompt + format + adherence_level + product_image_available
3. Send to Gemini 2.5 Pro with campaign planning system prompt
4. Parse response as JSON
5. Validate against Pydantic `Blueprint` model
6. If validation fails → append error to messages, retry (max 3)
7. Save blueprint to Supabase `campaigns` table
8. Return `blueprint.json`

### 6.4 Campaign Generate (Phase 3)

```
POST /api/campaigns/generate
Content-Type: application/json

Body:
{
  "blueprint": { ...blueprint.json... },
  "brand": { ...brand.json... }
}

Response 200:
{
  "campaign_id": "uuid",
  "poster_url": "supabase-storage-url/poster_1x1.png",
  "background_url": "supabase-storage-url/bg_1x1.png",
  "generation_time_seconds": 12.4
}
```

**Internal flow:**
1. Extract `background.prompt` from blueprint
2. Call Cloudflare Workers AI Flux 1 Schnell → receive background image bytes
3. Save background image locally
4. Resolve asset paths (logo, product image from Supabase Storage)
5. Call `build_html(blueprint, brand, assets)` → HTML string
6. Call `render_poster(html, width, height, output_path)` → PNG
7. Upload PNG to Supabase Storage `campaign-output` bucket
8. Return poster URL

### 6.5 Product Image Upload (Phase 4)

```
POST /api/products/upload
Content-Type: multipart/form-data

Fields:
  - image: File (product photo)
  - brand_id: string

Response 200:
{
  "product_image_url": "supabase-storage-url/product_cutout.png",
  "original_url": "supabase-storage-url/product_original.png"
}
```

**Internal flow:**
1. Upload original to Supabase Storage
2. Send to Remove.bg API → transparent PNG
3. Upload cutout to Supabase Storage
4. Update brand record with `product_image_url`
5. Return URLs

### 6.6 Multi-Format Generate (Phase 6)

```
POST /api/campaigns/generate-all
Content-Type: application/json

Body:
{
  "brand_id": "uuid",
  "prompt": "...",
  "adherence_level": "strict",
  "product_image_available": false
}

Response 200:
{
  "campaign_id": "uuid",
  "formats": [
    { "name": "Instagram Post", "aspect_ratio": "1:1", "poster_url": "..." },
    { "name": "Instagram Story", "aspect_ratio": "9:16", "poster_url": "..." },
    { "name": "Facebook Cover", "aspect_ratio": "16:9", "poster_url": "..." }
  ],
  "total_generation_time_seconds": 38.2
}
```

### 6.7 Export (Phase 6)

```
GET /api/export/{campaign_id}

Response 200:
Content-Type: application/zip
Content-Disposition: attachment; filename="campaign_{id}.zip"

Body: ZIP file containing three PNG posters
```

---

## 7. Phase Checklists

### Phase 0 — Scaffolding & Contracts

- [ ] Create project folder structure (all directories)
- [ ] Initialize Next.js 14 with App Router + TypeScript in `frontend/`
- [ ] Initialize FastAPI project in `backend/`
- [ ] Create `.env` with all API key placeholders
- [ ] Create `.env.example` (no real values)
- [ ] Create `.gitignore` (node_modules, __pycache__, .env, .next, etc.)
- [ ] Write `CONTEXT.md` with frozen brand.json and blueprint.json schemas
- [ ] Write `RULES.md` with execution rules
- [ ] Update `DECISIONS.md` with all decisions made so far
- [ ] Hand-write `mock-data/brand_volt_bd.json` for Volt BD
- [ ] Hand-write `mock-data/blueprint_eid_1x1.json` (1080×1080)
- [ ] Hand-write `mock-data/blueprint_eid_9x16.json` (1080×1920)
- [ ] Hand-write `mock-data/blueprint_eid_16x9.json` (1920×1080)
- [ ] Copy generated Volt BD logo to `mock-data/assets/volt_bd_logo.png`
- [ ] Copy generated product can to `mock-data/assets/volt_bd_can.png`
- [ ] Create FastAPI `main.py` with CORS + health endpoint
- [ ] Create Next.js landing page with basic layout
- [ ] Verify frontend ↔ backend communication (health check fetch)
- [ ] Create Pydantic models for `Brand` and `Blueprint`

**Verification**: Screenshot showing Next.js page successfully calling FastAPI `/api/health` and displaying `{ "status": "ok" }`.

---

### Phase 1 — Compositor (BUILD FIRST)

- [ ] Create `backend/compositor/template.py` with `build_html()` function
- [ ] Implement Google Fonts `@import` with all 4 fonts (Anton, Inter, Hind Siliguri, Noto Sans Bengali)
- [ ] Implement position keyword → CSS mapping (all 9 positions)
- [ ] Implement layer rendering: overlay layers (gradient)
- [ ] Implement layer rendering: text layers (with font, color, size)
- [ ] Implement layer rendering: CTA button layers (background_color + padding + border_radius)
- [ ] Implement layer rendering: image layers (logo, product image)
- [ ] Implement background: solid fallback_color from blueprint
- [ ] Install Puppeteer (pyppeteer or playwright)
- [ ] Create `backend/compositor/renderer.py` with `render_poster()`
- [ ] If Puppeteer fails to install within 30 min → switch to Satori fallback
- [ ] Create `scripts/test_compositor.py` that loads mock blueprint and renders PNG
- [ ] Run test against `mock-data/blueprint_eid_1x1.json` → output `test_output_1x1.png`
- [ ] **Verify Bengali text "ভোল্ট দিয়ে ঈদ জমাও!" renders correctly** (NOT boxes/tofu)
- [ ] Verify English text "LIGHT UP EID WITH VOLT" renders in Anton font
- [ ] Verify CTA button renders with orange background
- [ ] Verify Volt BD logo appears in top-left position
- [ ] Verify gradient overlay is visible
- [ ] Test 9:16 format with `blueprint_eid_9x16.json`
- [ ] Test 16:9 format with `blueprint_eid_16x9.json`

**Verification**: Three PNG poster outputs (1:1, 9:16, 16:9) with visible Bengali text, English text, logo, CTA button, and gradient overlay on a solid dark background.

> [!CAUTION]
> **Phase 1 is NOT complete until Bengali text renders correctly.** If you see □□□□ (tofu boxes), the font is not loading. Do not proceed to Phase 2.

---

### Phase 2 — Brand Intelligence + AI "A"

- [ ] Create `backend/services/gemini.py` with Gemini API client
- [ ] Implement brand extraction: PDF text + logo → Gemini → brand.json
- [ ] Install + integrate ColorThief (colorthief pip package)
- [ ] Create `backend/services/colorthief_service.py`
- [ ] ColorThief extracts top 5 colors from logo → overwrites brand.colors
- [ ] Create `backend/routers/brands.py` with `POST /api/brands/upload`
- [ ] Create `backend/prompts/brand_extraction.py` (system prompt)
- [ ] Create `backend/prompts/campaign_planning.py` (system prompt)
- [ ] Implement campaign planning: brand.json + prompt → Gemini → blueprint.json
- [ ] Implement JSON validation with retry (max 3, append error on retry)
- [ ] Create `backend/routers/campaigns.py` with `POST /api/campaigns/plan`
- [ ] Create `scripts/test_gemini.py` smoke test
- [ ] Test brand extraction with a sample PDF
- [ ] Test campaign planning with Volt BD brand + Eid prompt
- [ ] Verify Gemini output validates against Blueprint Pydantic model
- [ ] Setup Supabase project (create project, get URL + keys)
- [ ] Create `brands` table in Supabase (SQL migration)
- [ ] Create `campaigns` table in Supabase (SQL migration)
- [ ] Create Supabase Storage buckets: `brand-assets`, `campaign-output`
- [ ] Create `backend/services/supabase_client.py`
- [ ] Save brand to Supabase on upload
- [ ] Save blueprint to Supabase on plan

**Verification**: Screenshot showing Gemini successfully generating a valid blueprint.json from the Volt BD brand + Eid prompt, with the blueprint validating against the schema.

---

### Phase 3 — AI "B" Background Generation

- [ ] Create `backend/services/flux.py` with Cloudflare Workers AI client
- [ ] Implement: send background.prompt → Cloudflare Workers AI Flux 1 Schnell → save image
- [ ] Create `POST /api/campaigns/generate` endpoint
- [ ] Wire compositor: replace solid fallback_color with real Flux background
- [ ] Upload generated poster to Supabase Storage `campaign-output` bucket
- [ ] Create `scripts/test_flux.py` smoke test
- [ ] Test end-to-end: mock blueprint → Flux background → compositor → PNG
- [ ] Pre-generate 3 background variants for the Volt BD Eid prompt (cache as demo fallbacks)
- [ ] Save cached backgrounds to `mock-data/assets/cached_bg_*.png`

**Verification**: A complete poster with Flux-generated background + Puppeteer-rendered typography, Bengali text, logo, and CTA button.

---

### Phase 4 — Product Image Upload

- [ ] Create `backend/services/removebg.py` with Remove.bg API client
- [ ] Create `POST /api/products/upload` endpoint
- [ ] Implement: upload image → Remove.bg → transparent PNG → Supabase Storage
- [ ] Update AI "A" campaign planning prompt to handle `product_image_available: true`
- [ ] Update compositor to place product PNG as hero layer (z_index 5-8)
- [ ] Add product image upload field to frontend `CampaignForm.tsx`
- [ ] Test with Volt BD can image → remove bg → place in poster
- [ ] Verify product image appears between overlay and text layers

**Verification**: Poster with transparent product image (energy drink can) placed as hero element alongside text and logo.

---

### Phase 5 — Brand Persistence

- [ ] Supabase tables already created in Phase 2 (verify)
- [ ] Implement `GET /api/brands/{brand_id}` endpoint
- [ ] On campaign generation, load brand.json from Supabase by brand_id
- [ ] Frontend: store `brand_id` in `localStorage` after upload
- [ ] Frontend: on page load, if `brand_id` exists, pre-select that brand
- [ ] Skip re-parsing PDF on return visits — load from Supabase
- [ ] Test: upload brand → get brand_id → reload page → brand is pre-selected

**Verification**: Brand persists across page reloads; campaign generation works with stored brand_id.

---

### Phase 6 — Multi-Format Export

- [ ] Create `POST /api/campaigns/generate-all` endpoint
- [ ] For each format (1:1, 9:16, 16:9): call AI "A" → blueprint → compositor
- [ ] AI "A" reflows layout for each aspect ratio (font sizes, positions, margins)
- [ ] Compositor renders at correct pixel dimensions per format
- [ ] Create `GET /api/export/{campaign_id}` endpoint → ZIP download
- [ ] Frontend: `PosterGallery.tsx` displays all 3 formats side-by-side
- [ ] Frontend: `ExportButton.tsx` triggers ZIP download
- [ ] Test all three formats for the Volt BD Eid campaign

**Verification**: Three posters displayed side-by-side (1:1, 9:16, 16:9) with working ZIP download.

---

### Phase 7 — Demo Layer

- [ ] Create `DemoButton.tsx` — one click fills form with Volt BD + Eid prompt
- [ ] Create `BlueprintPreview.tsx` — card showing key blueprint fields
- [ ] Create `ProgressIndicator.tsx` — live named steps during generation
- [ ] Run full Volt BD Eid pipeline end-to-end → save all 3 format PNGs locally
- [ ] Add `DEMO_FALLBACK_MODE` env flag
- [ ] If flag is true, serve cached PNGs instead of live generation
- [ ] Test demo flow: click demo button → see progress → see blueprint → see 3 posters

**Verification**: Complete demo flow working with both live generation and fallback mode.

---

## 8. Golden-Path Demo Scenario

### Input

| Field | Value |
|---|---|
| Brand | Volt BD (uploaded via PDF + logo, or pre-loaded via demo button) |
| Campaign Prompt | "Create an Eid special edition launch poster. Bengali headline with English subheadline. Festive energy, celebration vibes." |
| Formats | 1:1 (1080×1080), 9:16 (1080×1920), 16:9 (1920×1080) |
| Adherence Level | Strict |
| Product Image | Volt BD can (transparent cutout) |

### Expected Output — Format 1: Instagram Post (1:1, 1080×1080)

```
┌─────────────────────────────────┐
│ [VOLT BD LOGO]                  │
│  (top-left, 120px wide)         │
│                                 │
│  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄           │
│  █ Flux-generated BG █           │
│  █ Dark, moody, electric█        │
│  █ orange energy sparks █        │
│  █ + crescent moon      █        │
│  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀           │
│                                 │
│  ভোল্ট দিয়ে ঈদ জমাও!            │
│  (Bengali headline, 72px,       │
│   Hind Siliguri, #FF4B00)       │
│                                 │
│  LIGHT UP EID WITH VOLT         │
│  (English sub, 36px,            │
│   Anton, #FFFFFF)       [CAN]   │
│                                 │
│  ┌─────────────────────────┐    │
│  │ এখনই অর্ডার করুন — voltbd.com │    │
│  └─────────────────────────┘    │
│   (CTA button, orange bg)       │
└─────────────────────────────────┘
```

### Expected Output — Format 2: Instagram Story (9:16, 1080×1920)

- Taller canvas — more vertical breathing room
- Bengali headline larger (84px), positioned at vertical center
- Product can image taller, positioned center-right with more height
- CTA button lower, more bottom margin
- Logo same top-left position but scaled to 100px wide

### Expected Output — Format 3: Facebook Cover (16:9, 1920×1080)

- Wider canvas — horizontal layout
- Bengali headline positioned center-left (max-width: 900px)
- English sub below it
- Product can on the right side (center-right)
- CTA bottom-center
- Logo top-left, scaled to 140px wide
- Font sizes slightly smaller to fit horizontal aspect

### Bangla Copy Used

| Element | Bengali | English |
|---|---|---|
| Headline | ভোল্ট দিয়ে ঈদ জমাও! | Light Up Eid With Volt |
| CTA | এখনই অর্ডার করুন — voltbd.com | Order Now — voltbd.com |
| Tagline | মনোযোগ রাখো। রিচার্জ হও। | Stay Focused. Recharge. |

---

## 9. Risk Register

### Phase 0 — Scaffolding

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Python 3.14 compatibility issues with FastAPI/Pydantic | Medium | High | Pin `fastapi==0.115.*`, `pydantic==2.9.*`. Test import immediately. If broken, create a `venv` with Python 3.12. |
| Next.js 14 + Node 22 issues | Low | Medium | Next.js 14 supports Node 22. If issues arise, use `--legacy-peer-deps`. |
| Frontend ↔ Backend CORS issues | Medium | Low | Explicitly configure CORS origins in FastAPI `main.py` for `http://localhost:3000`. |

### Phase 1 — Compositor

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Puppeteer fails to install on macOS** | Medium | **Critical** | Try `pyppeteer` first. If it fails within 30 minutes, switch to `playwright` (which has better Apple Silicon support). If both fail, switch to Satori (Node-based SVG→PNG). |
| Google Fonts fail to load in headless browser | Medium | High | Use `waitUntil='networkidle0'` in Puppeteer. If still failing, download font files and embed as base64 data URIs in the HTML. |
| **Bengali text renders as tofu (□□□□)** | Medium | **Critical** | Phase 1 BLOCKER. Fix by: (1) verifying the `@import` includes Bengali fonts, (2) adding `font-display: swap`, (3) adding explicit `lang="bn"` on Bengali elements, (4) if all fail, self-host font files via base64 embedding. |
| Puppeteer screenshot has wrong dimensions | Low | Medium | Explicitly set `page.setViewport({ width, height })` and use `clip` option matching exact dimensions. |

### Phase 2 — Brand Intelligence + AI "A"

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Gemini returns invalid JSON** | High | High | Retry up to 3 times. On each retry, append the validation error to the user message. If all retries fail, return error + last raw response for debugging. |
| Gemini 2.5 Pro rate limited or unavailable | Medium | High | Automatic fallback to `gemini-2.5-flash`. Implement in `gemini.py` with try/except on 429/503 status. |
| PDF text extraction fails (scanned PDF) | Medium | Medium | Use `pdfplumber` which handles most PDFs. If text is empty, return error asking user to upload a text-based PDF. |
| ColorThief returns wrong dominant colors | Low | Low | ColorThief returns top 5 colors. If the top color is near-white or near-black (likely background), skip it and use the next. |
| Supabase connection fails | Low | Medium | Graceful degradation: if Supabase is down, operate in "local mode" — save to disk, warn user. |

### Phase 3 — Background Generation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Cloudflare Workers AI Flux is slow (>30s)** | Medium | Medium | Set 60s timeout. Cache 3 pre-generated backgrounds for the Volt BD Eid demo prompt. Display a progress indicator during generation. |
| Cloudflare Workers AI returns error / rate limit | Medium | High | Retry once. If still failing, use `fallback_color` from blueprint as solid background. Log the error. |
| Flux generates text in the background image | Medium | Medium | The prompt explicitly includes "no text no letters no words". If text appears, re-generate with stronger negative prompt. |
| Background doesn't match brand aesthetic | Low | Medium | The background prompt is AI-generated from brand context. If poor quality, adherence_level "creative" gives more latitude. User can regenerate. |

### Phase 4 — Product Image Upload

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Remove.bg API exhausts 50 free calls | Medium | Medium | Track usage count. Warn user when approaching limit. For demo, use a pre-cutout image. |
| Remove.bg produces poor cutout | Low | Medium | Works well for product shots with clean backgrounds. If poor, allow user to upload a pre-cut PNG. |
| Product image z-index conflicts | Low | Low | Strictly follow the z-index ordering in the blueprint schema. |

### Phase 5 — Brand Persistence

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Supabase not set up yet | Medium | Medium | Phase 2 creates the tables. If delayed, use a local JSON file cache. |
| localStorage brand_id becomes stale | Low | Low | On load, verify brand_id exists in Supabase. If not, clear localStorage. |

### Phase 6 — Multi-Format Export

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI "A" produces bad layout for unusual aspect ratios | Medium | Medium | The system prompt includes explicit font size ranges per format. If layout is poor, adjust the prompt and retry. |
| ZIP generation fails on large files | Low | Low | Use Python `zipfile` module. Cap image resolution at 1920px max dimension. |
| Slow generation (3 formats × AI + compositor) | High | Medium | Run the 3 format generations in parallel using `asyncio.gather()`. Show progress for each format independently. |

### Phase 7 — Demo Layer

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Live demo fails during recording | Medium | **Critical** | `DEMO_FALLBACK_MODE=true` env flag serves pre-generated cached PNGs. Test the fallback path separately. |
| Pre-generated PNGs look different from live output | Low | Low | Generate the cached PNGs using the exact same pipeline. Only the background will differ (Flux is stochastic). |

---

## User Review Required

> [!IMPORTANT]
> **Please review the following items before I begin execution:**
>
> 1. **Frozen JSON schemas** (Section 2) — Are `brand.json` and `blueprint.json` structures correct and complete? Any fields to add/remove?
>
> 2. **Gemini prompts** (Section 4) — Do the system prompts cover all cases? Any brand-specific rules to add?
>
> 3. **Folder structure** (Section 3) — Any files or directories you want restructured?
>
> 4. **Bengali copy** (Section 8) — Is "ভোল্ট দিয়ে ঈদ জমাও!" (Light up Eid with Volt!) the right demo headline?
>
> 5. **Phase ordering** — Are you comfortable with the 8-phase sequence?

Say **"go"** or **"approved"** when you're ready for me to begin Phase 0.
