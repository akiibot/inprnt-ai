# Imprnt AI — Rules

> These rules govern ALL development on this project.
> Violations require explicit user approval.

---

## Build Rules

1. **Complete one phase fully before starting the next.**
   A phase is complete only after the user reviews the verification artifact and says "go" or "approved".

2. **After each phase, produce a verification artifact** — a screenshot or screen recording
   showing the phase output working. Wait for approval before continuing.

3. **If a phase has a hard blocker, stop and ask** — never silently work around it.

4. **Puppeteer timeout**: If Puppeteer fails to install, switch to Satori immediately.
   Do not spend more than 30 minutes on Puppeteer install issues.

5. **Never hardcode any API key.** All secrets live in `.env` only.

## Data Rules

6. **The Volt BD demo brand must be present from Phase 0** — it is never added later.

7. **Bangla font loading must be in the Puppeteer HTML template from Phase 1.**
   Verify Bengali text renders before marking Phase 1 complete.
   If Bengali text shows □□□□ (tofu), Phase 1 is NOT complete.

8. **The `source` field on every blueprint layer is sacred.**
   - `"generated"` → only the background, always via Cloudflare Workers AI Flux
   - `"rendered"` → always via Puppeteer (text, CTAs, overlays)
   - `"uploaded"` → always from user assets (logo, product image)
   Never let the image model render text.

9. **The two JSON schemas (brand.json and blueprint.json) are frozen.**
   Defined in CONTEXT.md. Do not modify without explicit user approval.

## Commit Rules

10. **Commit after each completed and approved phase** with a message:
    `Phase N complete: <what was built>`

## API Rules

11. **Gemini JSON validation**: Retry up to 3 times on invalid JSON. Append the
    validation error to the prompt on each retry. If all retries fail, return the
    error to the user — never silently serve broken output.

12. **Cloudflare Workers AI**: Model is `@cf/black-forest-labs/flux-1-schnell`.
    Endpoint: `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL}`
    Auth: `Authorization: Bearer {CLOUDFLARE_API_TOKEN}`
    Returns image bytes directly (not a URL).

13. **Gemini fallback**: If Gemini 2.5 Pro returns 429 or 503, automatically
    retry once with `gemini-2.5-flash`. Log which model was used in metadata.

## Schema Rules

14. **Background prompt rule**: Every Flux background prompt must end with:
    "no text no letters no words no writing"
    The image model cannot render text — this rule prevents hallucinated text.

15. **z_index ordering** (mandatory, never change):
    - Background: 0 (implicit)
    - Gradient overlay: 1
    - Product image: 5–8
    - Logo: 5
    - Text/Headlines: 10
    - CTA: 10
