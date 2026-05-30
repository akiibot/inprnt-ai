# Imprnt AI — Decision Log

> All design decisions made during this project are logged here.
> Decisions marked **FROZEN** cannot change without explicit user approval.

---

## Architecture

### AD-001 — Two-Stage AI Pipeline [FROZEN]
- **Decision**: Use two separate AI models in sequence:
  - AI "A": Gemini 2.5 Pro → strategic planning → blueprint.json
  - AI "B": Cloudflare Workers AI Flux 1 Schnell → background image only
- **Reason**: Separates strategic thinking (Gemini) from visual generation (Flux).
  Gemini's reasoning produces structured JSON; Flux generates a single background image.
- **Date**: 2026-05-30

### AD-002 — Hybrid Compositor [FROZEN]
- **Decision**: Flux generates ONLY the background. ALL text, logos, and CTAs are
  rendered by Puppeteer as HTML/CSS.
- **Reason**: AI image models cannot reliably render text (especially Bengali). 
  Puppeteer produces pixel-perfect, font-correct text every time.
- **Date**: 2026-05-30

### AD-003 — Source Field [FROZEN]
- **Decision**: Every blueprint layer has a `source` field:
  `"generated"` | `"rendered"` | `"uploaded"`
- **Reason**: This single field drives the entire compositor logic cleanly.
- **Date**: 2026-05-30

---

## Technology

### TD-001 — Stack [FROZEN]
- Frontend: Next.js 14 (App Router), TypeScript
- Backend: FastAPI, Python 3.14
- Database: Supabase PostgreSQL
- Storage: Supabase Storage
- **Date**: 2026-05-30

### TD-002 — Image Generation Provider [FROZEN]
- **Decision**: Cloudflare Workers AI (Flux 1 Schnell)
  Model: `@cf/black-forest-labs/flux-1-schnell`
  Auth: Bearer token + Account ID
- **Previous**: Together AI (rejected)
- **Reason**: User preference.
- **Date**: 2026-05-30

### TD-003 — Compositor HTML Template Strategy [FROZEN]
- **Decision**: Inline CSS within a single self-contained HTML template string.
  Defined as a function `build_html()` in `backend/compositor/template.py`.
  Google Fonts loaded via `@import` at the top. Bangla fonts loaded from day one.
  Position keywords map to CSS absolute positioning.
- **Reason**: No external file dependencies → easier to debug and deploy.
- **Date**: 2026-05-30

### TD-004 — Bangla Fonts [FROZEN]
- **Decision**: Load Hind Siliguri and Noto Sans Bengali via Google Fonts `@import`
  in the Puppeteer HTML template from Phase 1 day one. Never added later.
- **Reason**: Bangla support is mandatory from Phase 1. Verifying Bengali text
  rendering is a Phase 1 gate — Phase 2 does not start until confirmed.
- **Date**: 2026-05-30

### TD-005 — Gemini Fallback [FROZEN]
- **Decision**: Primary model: `gemini-2.5-pro`. Fallback on 429/503: `gemini-2.5-flash`.
- **Date**: 2026-05-30

---

## Demo Brand

### DB-001 — Volt BD [FROZEN]
- Name: Volt BD
- Type: Fictional Bangladeshi energy drink
- Colors: `#FF4B00` (orange), `#0D0D0D` (black), `#FFFFFF` (white)
- English font: Anton (headings), Inter (body)
- Bengali font: Hind Siliguri (headings), Noto Sans Bengali (body)
- Logo: Generated PNG (volt_bd_logo.png)
- Product image: Generated energy drink can (volt_bd_can.png)
- Demo campaign: Eid Special Edition Launch
- Demo headline (Bengali): ভোল্ট দিয়ে ঈদ জমাও!
- Demo headline (English): LIGHT UP EID WITH VOLT
- Demo CTA: এখনই অর্ডার করুন — voltbd.com
- **Date**: 2026-05-30

---

## Phase Gates

### PG-001 — Phase Gate Process [FROZEN]
Each phase requires a verification artifact (screenshot or screen recording) before
the next phase begins. User says "go" or "approved" to proceed.
No phase starts without explicit approval.

---

## What to Mock vs What Must Be Real

### MR-001 — Reality Requirements [FROZEN]
Real from day one:
- Compositor output (Phase 1 onwards)
- Bangla font rendering (Phase 1 onwards)
- Gemini API calls (Phase 2 onwards)
- Cloudflare Workers AI image generation (Phase 3 onwards)
- Supabase reads/writes (Phase 5 onwards)

Mocked:
- Brand data → `mock-data/brand_volt_bd.json`
- Blueprint data → `mock-data/blueprint_eid_*.json`
- Background in Phase 1 → solid `fallback_color` from blueprint
