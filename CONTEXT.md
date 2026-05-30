# Imprnt AI — Context & Frozen Schemas

> **These schemas are frozen. Do not modify without explicit user approval in chat.**
> Last updated: 2026-05-30

---

## Project Overview

Imprnt AI is an AI-powered brand intelligence and creative direction platform.
It takes a brand guideline PDF + logo and a plain-language campaign prompt,
and produces complete on-brand campaign posters in under 60 seconds.

**Two AI stages:**
- **AI "A"** — Gemini 2.5 Pro: reads brand identity → outputs blueprint.json
- **AI "B"** — Cloudflare Workers AI (Flux 1 Schnell): generates background image only

**Hybrid compositor:**
- Flux generates ONLY the background image
- Puppeteer renders ALL text, logos, CTAs as HTML/CSS
- The image model NEVER renders text

---

## Frozen Schema 1: `brand.json`

```json
{
  "brand_id": "uuid-v4",
  "brand_name": "string",
  "tagline": "string (English)",
  "tagline_bn": "string (Bengali) | null",
  "industry": "string",
  "target_audience": "string",
  "brand_personality": ["string", "string", "string"],
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "palette": ["#hex", "#hex", "#hex", "#hex", "#hex"]
  },
  "typography": {
    "heading_font": "Google Font name (Latin)",
    "heading_font_bn": "Hind Siliguri | Noto Sans Bengali",
    "body_font": "Google Font name (Latin)",
    "body_font_bn": "Hind Siliguri | Noto Sans Bengali"
  },
  "logo_url": "string (Supabase Storage URL or local path)",
  "product_image_url": "string | null",
  "voice": {
    "tone": "string",
    "language": "en | bn | both",
    "formality": "Formal | Semi-formal | Informal | Street"
  },
  "do_not_use": ["string", "string"],
  "created_at": "ISO 8601 timestamp"
}
```

---

## Frozen Schema 2: `blueprint.json`

```json
{
  "blueprint_id": "uuid-v4",
  "brand_id": "uuid-v4",
  "campaign_name": "string",
  "campaign_strategy": "string (2-3 sentences)",
  "format": {
    "name": "string",
    "width": "number (pixels)",
    "height": "number (pixels)",
    "aspect_ratio": "1:1 | 9:16 | 16:9"
  },
  "background": {
    "source": "generated",
    "prompt": "string (Flux image prompt — NO TEXT)",
    "fallback_color": "#hex"
  },
  "layers": [
    {
      "id": "string (unique kebab-case)",
      "type": "overlay | text | image",
      "source": "generated | rendered | uploaded",
      "content": "string (text layers only)",
      "font_family": "string (text layers only)",
      "font_size": "number (text layers only)",
      "font_weight": "number (text layers only)",
      "color": "#hex (text layers only)",
      "text_transform": "none | uppercase | lowercase",
      "background_color": "#hex (CTA buttons only)",
      "padding": { "top": "number", "right": "number", "bottom": "number", "left": "number" },
      "border_radius": "number",
      "position": "top-left | top-center | top-right | center-left | center | center-right | bottom-left | bottom-center | bottom-right",
      "size": { "width": "number", "height": "number | auto" },
      "margin": { "top": "number", "right": "number", "bottom": "number", "left": "number" },
      "max_width": "number",
      "line_height": "number",
      "asset_key": "logo_url | product_image_url (uploaded images only)",
      "style": { "CSS key": "CSS value (overlay layers only)" },
      "z_index": "number",
      "optional": "boolean"
    }
  ],
  "metadata": {
    "adherence_level": "strict | moderate | creative",
    "language": "en | bn | both",
    "generated_at": "ISO 8601",
    "model_used": "gemini-2.5-pro | gemini-2.5-flash",
    "retry_count": "number"
  }
}
```

---

## Source Field Rules

Every layer has a `source` field — this single field drives the entire compositor:

| `source` | Meaning | Who handles it |
|---|---|---|
| `"generated"` | Background image from Flux | Cloudflare Workers AI |
| `"rendered"` | Text, CTAs, overlays | Puppeteer (HTML/CSS) |
| `"uploaded"` | Logo, product images | User asset (direct placement) |

---

## Three Output Formats

| Name | Dimensions | Aspect Ratio | Use Case |
|---|---|---|---|
| Instagram Post | 1080 × 1080 px | 1:1 | Instagram feed |
| Instagram Story | 1080 × 1920 px | 9:16 | Instagram / TikTok stories |
| Facebook Cover | 1920 × 1080 px | 16:9 | Facebook / YouTube |

---

## Demo Brand: Volt BD

- **Type**: Fictional Bangladeshi energy drink
- **Colors**: `#FF4B00` (primary orange), `#0D0D0D` (black), `#FFFFFF` (white)
- **English font**: Anton (headings), Inter (body)
- **Bengali font**: Hind Siliguri (headings), Noto Sans Bengali (body)
- **Demo campaign**: Eid Special Edition Launch
- **Demo copy**: ভোল্ট দিয়ে ঈদ জমাও! / LIGHT UP EID WITH VOLT
