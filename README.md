# Imprnt AI

> **AI BuildFest 2026 — Track 2: MarTech**

AI-powered brand intelligence and creative direction platform. Upload your brand guidelines PDF + logo, describe your campaign in plain language, and get pixel-perfect on-brand posters in Bangla & English — across three social media formats — in under 60 seconds.

---

## How it works

```
Brand PDF + Logo
      │
      ▼
  AI "A" (Gemini 2.5)
  reads brand identity
  outputs blueprint.json
      │
      ▼
  AI "B" (Cloudflare Flux)         Supabase Storage
  generates background image  ────► uploads assets
      │
      ▼
  Hybrid Compositor (Playwright)
  renders text / logos / CTAs
  as pixel-perfect HTML/CSS
      │
      ▼
  Final PNG posters
  1:1 · 9:16 · 16:9
```

**Key design principle:** The image model (Flux) generates *only* the background. All text, logos, and CTAs are rendered as HTML/CSS by Playwright — so typography is always perfect, multilingual, and on-brand.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Framer Motion |
| Backend | Python 3.14, FastAPI, Uvicorn |
| AI Brand Extraction | Google Gemini 2.5 Flash |
| AI Background Generation | Cloudflare Workers AI — Flux 1 Schnell |
| HTML → PNG Rendering | Playwright (Chromium headless) |
| Background Removal | Remove.bg API |
| Color Extraction | ColorThief |
| Database & Storage | Supabase (PostgreSQL + Storage) |
| Fonts | Google Fonts (Anton, Inter, Hind Siliguri, Noto Sans Bengali) |

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11+ (tested on 3.14) |
| Node.js | 18+ (tested on v22) |
| npm | 9+ |

You'll also need accounts (all have free tiers) for:
- [Google AI Studio](https://aistudio.google.com) — Gemini API key
- [Cloudflare](https://dash.cloudflare.com) — Workers AI API token + Account ID
- [Remove.bg](https://www.remove.bg/api) — API key
- [Supabase](https://supabase.com) — project URL + service role key

---

## Setup

### 1. Clone

```bash
git clone https://github.com/akiibot/inprnt-ai.git
cd inprnt-ai
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in your keys in `.env`:

```env
GOOGLE_AI_API_KEY=your_google_ai_studio_api_key
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
REMOVEBG_API_KEY=your_removebg_api_key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
APP_ENV=development
DEMO_FALLBACK_MODE=false
```

> **Note:** `gemini-2.5-pro` requires a paid Google AI Studio plan. The app automatically uses `gemini-2.5-flash` (free tier, 1500 req/day) — no config change needed.

### 3. Supabase database

In your Supabase project's **SQL Editor**, run the migration file:

```bash
# Copy the contents of scripts/seed_supabase.sql and paste into
# Supabase → SQL Editor → Run
```

Then create two **Storage buckets** (set to Public):
- `assets` — logos, product images, background images
- `campaigns` — final rendered posters

### 4. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

pip install -r requirements.txt

# Install Playwright browser (one-time)
playwright install chromium

# Start the server
uvicorn main:app --reload --port 8000
```

Backend runs at **http://localhost:8000**
API docs (Swagger) at **http://localhost:8000/docs**

### 5. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**

---

## Usage

### Full flow (browser)

1. Open **http://localhost:3000**
2. Click **Start Creating**
3. **Step 1 — Upload Brand:** Upload your brand guidelines PDF and logo PNG
4. **Step 2 — Campaign Brief:** Write your campaign prompt in plain English (or Bengali)
5. **Step 3 — Generate:** Choose adherence level and click Generate
6. Your posters appear — 1:1, 9:16, and 16:9 formats

### Demo mode (no API keys needed)

Set `DEMO_FALLBACK_MODE=true` in `.env` and restart the backend. This uses the pre-built Volt BD (fictional energy drink) mock data — no Gemini calls made. Good for testing the compositor and UI without using API quota.

The demo brand is **Volt BD** — a fictional Bangladeshi energy drink with a Eid Special Edition campaign. Mock files are in `mock-data/`.

---

## API reference

Full interactive docs at `http://localhost:8000/docs` when the backend is running.

### Key endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/brands/upload` | Upload PDF + logo, extract brand identity |
| `GET` | `/api/brands/{brand_id}` | Fetch saved brand |
| `POST` | `/api/brands/{brand_id}/product` | Upload product image (removes background) |
| `POST` | `/api/campaigns/plan` | Plan a campaign — returns `blueprint.json` |
| `POST` | `/api/campaigns/generate` | Render a blueprint → PNG poster |
| `POST` | `/api/campaigns/generate-all` | Plan + render all 3 formats at once |
| `POST` | `/api/export` | Re-render an existing campaign in new formats |

### Example: upload a brand

```bash
curl -X POST http://localhost:8000/api/brands/upload \
  -F "pdf=@brand_guidelines.pdf;type=application/pdf" \
  -F "logo=@logo.png;type=image/png"
```

Response:
```json
{
  "brand_id": "uuid",
  "brand": { "brand_name": "...", "colors": { ... }, ... },
  "message": "Brand extracted successfully using gemini-2.5-flash"
}
```

### Example: plan a campaign

```bash
curl -X POST http://localhost:8000/api/campaigns/plan \
  -H "Content-Type: application/json" \
  -d '{
    "brand_id": "your-brand-uuid",
    "prompt": "Eid special edition launch. Bengali headline, dark background, festive energy.",
    "adherence_level": "moderate",
    "product_image_available": false,
    "format": { "name": "Instagram Post", "width": 1080, "height": 1080, "aspect_ratio": "1:1" }
  }'
```

### Example: generate all 3 formats at once

```bash
curl -X POST http://localhost:8000/api/campaigns/generate-all \
  -H "Content-Type: application/json" \
  -d '{
    "brand_id": "your-brand-uuid",
    "prompt": "Eid special edition launch. Bold. Electric.",
    "adherence_level": "strict",
    "product_image_available": false
  }'
```

---

## Project structure

```
inprnt-ai/
├── backend/
│   ├── main.py                     # FastAPI app, CORS, router registration
│   ├── config.py                   # Pydantic settings (loads .env)
│   ├── requirements.txt
│   ├── models/
│   │   ├── brand.py                # brand.json Pydantic schema (frozen)
│   │   └── blueprint.py            # blueprint.json Pydantic schema (frozen)
│   ├── routers/
│   │   ├── brands.py               # /api/brands/*
│   │   ├── campaigns.py            # /api/campaigns/*
│   │   └── export.py               # /api/export
│   ├── services/
│   │   ├── gemini.py               # Gemini API client + fallback logic
│   │   ├── flux.py                 # Cloudflare Workers AI (background gen)
│   │   ├── supabase_client.py      # Supabase DB + Storage helpers
│   │   ├── removebg.py             # Remove.bg background removal
│   │   └── colorthief_service.py   # Logo color extraction
│   ├── compositor/
│   │   ├── template.py             # blueprint.json → HTML string
│   │   └── renderer.py             # HTML → PNG via Playwright
│   └── prompts/
│       ├── brand_extraction.py     # Gemini system prompt: PDF → brand.json
│       └── campaign_planning.py    # Gemini system prompt: brand + brief → blueprint.json
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx            # Landing page
│       │   ├── create/page.tsx     # 5-step campaign wizard
│       │   └── campaign/[id]/      # Campaign result viewer
│       └── lib/
│           ├── api.ts              # Typed fetch wrappers for all endpoints
│           └── types.ts            # TypeScript types matching backend schemas
├── mock-data/
│   ├── brand_volt_bd.json          # Demo brand: Volt BD (energy drink)
│   ├── blueprint_eid_1x1.json      # Demo blueprint: Eid campaign (1:1)
│   ├── blueprint_eid_9x16.json     # Demo blueprint: Eid campaign (9:16)
│   ├── blueprint_eid_16x9.json     # Demo blueprint: Eid campaign (16:9)
│   └── assets/
│       ├── volt_bd_logo.png
│       └── volt_bd_can.png
├── scripts/
│   ├── seed_supabase.sql           # Database migration
│   ├── test_compositor.py          # Test HTML rendering locally
│   └── test_generation.py          # End-to-end generation test
├── .env.example                    # Environment variable template
└── CONTEXT.md                      # Frozen JSON schemas reference
```

---

## The `blueprint.json` schema

The blueprint is the core contract between Gemini (planning) and the compositor (rendering). Each layer has a `source` field that drives everything:

| `source` | Meaning | Rendered by |
|---|---|---|
| `"generated"` | Background image | Cloudflare Flux |
| `"rendered"` | Text, CTAs, gradient overlays | Playwright (HTML/CSS) |
| `"uploaded"` | Logo, product image | Placed directly from Supabase Storage |

See `CONTEXT.md` for the full frozen schemas.

---

## Troubleshooting

**`RESOURCE_EXHAUSTED` from Gemini**
The free tier for `gemini-2.5-pro` has 0 quota. The app uses `gemini-2.5-flash` (1500 req/day free). If you hit flash limits too, enable `DEMO_FALLBACK_MODE=true` in `.env` and restart.

**Playwright / Chromium not found**
Run `playwright install chromium` inside your activated virtualenv.

**Supabase storage upload fails**
Make sure both `assets` and `campaigns` buckets exist and are set to **Public** in your Supabase dashboard.

**`.env` not loading**
The backend resolves `.env` from the project root (one level above `backend/`). You don't need a separate `backend/.env`.

**Port already in use**
```bash
lsof -ti:8000 | xargs kill -9   # backend
lsof -ti:3000 | xargs kill -9   # frontend
```

---

## License

MIT
