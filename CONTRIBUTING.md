# Contributing to Imprnt AI

## Frozen contracts

Two schemas are **frozen** and must not be changed without explicit discussion:

- `brand.json` — defined in `backend/models/brand.py` and `CONTEXT.md`
- `blueprint.json` — defined in `backend/models/blueprint.py` and `CONTEXT.md`

Any change to these schemas requires a matching migration in `scripts/seed_supabase.sql`.

## Development setup

Follow the full setup in `README.md`. For backend-only work you don't need to run the frontend, and vice versa.

## Key files to know

| File | What it does |
|---|---|
| `backend/compositor/template.py` | `blueprint.json` → HTML string |
| `backend/compositor/renderer.py` | HTML string → PNG via Playwright |
| `backend/services/gemini.py` | All Gemini API calls with primary/fallback model logic |
| `backend/prompts/campaign_planning.py` | The system prompt that drives Gemini's blueprint output |
| `frontend/src/lib/api.ts` | All typed API calls from the frontend |
| `frontend/src/lib/types.ts` | TypeScript types — must stay in sync with Pydantic models |

## Adding a new layer type

1. Add it to `BlueprintLayer` in `backend/models/blueprint.py`
2. Add a renderer function in `backend/compositor/template.py`
3. Wire it into `build_html()` in the same file
4. Update the Gemini system prompt in `backend/prompts/campaign_planning.py` so it knows about the new type

## Environment

Never commit `.env`. Use `.env.example` as the template. All secrets go in `.env` only.

## Demo mode

Set `DEMO_FALLBACK_MODE=true` to develop without consuming API quota. Mock data lives in `mock-data/`.
