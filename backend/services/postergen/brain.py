"""
Imprnt AI — PosterGen Engine: Brain

Gemini studies real-world poster prompt templates, then writes ONE rich Imagen 3
prompt that renders the entire poster (background + baked-in text), plus placement
hints for the logo and product that the PIL compositor uses afterwards.

Reuses Imprnt's shared Gemini client (services.gemini.get_gemini) so it inherits
the same Vertex AI / AI Studio credential handling.
"""
import json

from google.genai import types

from services.gemini import get_gemini
from .schemas import PosterBrandDetails, BrainOutput
from .poster_prompts import TEMPLATES

# Brain quality matters for prompt richness — prefer Pro, fall back to Flash.
PRIMARY_MODEL = "gemini-2.5-pro"
FALLBACK_MODEL = "gemini-2.5-flash"

_SYSTEM_PROMPT = """You are an expert advertising creative director and AI image prompt engineer specializing in commercial poster generation.

Your job is to write a highly detailed, visually rich prompt for generating a commercial advertising poster using Google Imagen 3.

=== TEMPLATE EXAMPLES ===
Study these {n} real-world poster prompts carefully. Learn their level of detail, composition language, lighting descriptions, text placement instructions, and visual effects language. Do NOT copy them — use them as inspiration for your own custom prompt.

{templates}
=== END TEMPLATES ===

You will receive:
- Brand details (JSON): exact colors, name, tagline, tone, industry, target audience, personality, palette, things to avoid
- A campaign brief (text): the creative direction for this specific campaign
- The brand logo image: understand its colors, style, and visual weight
- Product image (optional): the hero product to feature prominently

Output a JSON object with exactly these keys:
{{
  "imagen_prompt": "...",
  "logo_placement": "...",
  "logo_zone_hint": "...",
  "product_placement": "...",
  "product_size_ratio": 0.55,
  "campaign_name": "...",
  "campaign_strategy": "..."
}}

Rules for "imagen_prompt":
- 300-500 words, single paragraph or short structured description
- Include: background & composition, lighting & shadows, color palette (use the brand's exact colors as natural-language descriptors), dynamic effects (splashes, glows, floating elements), all text elements with exact wording + position + font style, overall style qualifier (photorealistic commercial photography / bold graphic design / illustrated vector art)
- Match visual style to brand tone: bold=high contrast dynamic, luxury=minimal elegant, playful=vibrant illustrated, energetic=explosive effects
- Honor the brand's "do_not_use" list as hard exclusions
- IMPORTANT: The real product image will be composited on top after generation. Describe the background and scene composition for where the product will sit, but tell Imagen to show a generic placeholder or neutral shape in the product zone — do NOT describe the product in detail, as the actual product will be placed there programmatically.
- Always instruct Imagen to leave a clean, empty rectangular area for the logo (e.g., "leave a clean rectangular zone in the bottom-left corner, approximately 15% of the poster width, for logo placement — this area must be completely clear of other visual elements")

TEXT QUALITY RULES — follow every one of these precisely:
- Include the brand name and tagline as baked-in text. Keep each text element to 4 words or fewer — Imagen renders short text far more accurately than long phrases. If the tagline is long, abbreviate to its punchiest 2-3 words.
- ALWAYS write text in UPPERCASE in the imagen_prompt (e.g. "VOLT", "CHARGE UP"). Imagen renders uppercase Latin characters significantly more reliably than mixed case.
- Repeat the exact text string at least 3 times in the prompt to reinforce accuracy, e.g.: "the text reads exactly 'VOLT' — the word V-O-L-T in large bold white letters — 'VOLT' is spelled V-O-L-T"
- Spell out the brand name letter-by-letter in the prompt once (e.g. "V-O-L-T B-D") so Imagen locks onto the exact character sequence.
- Place each text element on a solid, high-contrast background zone: e.g. "bold uppercase white letters on a solid deep navy rectangle", or "white text sits on a dark gradient band". Never float text over complex imagery with no backing.
- Specify the exact hex color for text and its backing: e.g. "pure white (#FFFFFF) letters on a solid #0A0A2E rectangle".
- After all text instructions, append: "All text must be crisp, sharp, perfectly legible, with clean edges — absolutely no blurring, distortion, garbling, or letter-order errors."
- If language is "bengali" or "bilingual": you MAY attempt Bengali script for the tagline using tagline_bn spelled EXACTLY as given, but ALSO include the English uppercase version as a fallback text element. Place Bengali text on a solid-color background zone. Acknowledge that Bengali script rendering by Imagen may be imperfect.

Rules for "logo_placement":
- Must be one of: "bottom-left", "bottom-right", "top-left", "top-right", "center-bottom", "center-top"
- Choose based on what looks best given the composition you described

Rules for "logo_zone_hint":
- Short description of the logo area for reference (e.g., "bottom-left corner, approximately 15% of poster width, with 3% padding from edges")

Rules for "product_placement":
- Where the product hero sits in the composition
- Must be one of: "center", "left-center", "right-center", "center-top", "center-bottom"

Rules for "product_size_ratio":
- How tall the product should be as a fraction of the poster height (0.3 to 0.8)
- Typical: 0.55 for a can/bottle, 0.45 for a box, 0.65 for a hero food shot

Rules for "campaign_name":
- A short, punchy 2-5 word campaign title

Rules for "campaign_strategy":
- A 2-3 sentence explanation of the creative strategy behind this poster
"""


def _format_templates() -> str:
    lines = []
    for i, t in enumerate(TEMPLATES, 1):
        lines.append(f"[{i}] {t['label']} ({t['category']}):")
        lines.append(t["prompt"])
        lines.append("")
    return "\n".join(lines)


def _read_image_part(path: str, mime_type: str = "image/png") -> types.Part:
    with open(path, "rb") as f:
        data = f.read()
    return types.Part.from_bytes(data=data, mime_type=mime_type)


def _guess_mime(path: str) -> str:
    import mimetypes
    mime, _ = mimetypes.guess_type(path)
    return mime or "image/png"


def generate_prompt(
    brand: PosterBrandDetails,
    campaign_prompt: str,
    logo_path: str,
    product_path: str | None = None,
) -> BrainOutput:
    """Write the Imagen prompt + placement plan for a campaign (once per campaign)."""
    client = get_gemini()

    system = _SYSTEM_PROMPT.format(n=len(TEMPLATES), templates=_format_templates())

    brand_block = json.dumps(brand.model_dump(exclude_none=True), indent=2)
    user_text = (
        f"Brand Details:\n{brand_block}\n\n"
        f"Campaign Brief:\n{campaign_prompt}\n\n"
        "The logo image is attached first"
        + (", followed by the product image." if product_path else ".")
    )

    parts: list[types.Part] = [_read_image_part(logo_path, _guess_mime(logo_path))]
    if product_path:
        parts.append(_read_image_part(product_path, _guess_mime(product_path)))
    parts.append(types.Part.from_text(text=user_text))

    gen_config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        temperature=1.0,
    )
    contents = [types.Content(role="user", parts=parts)]

    try:
        response = client.models.generate_content(
            model=PRIMARY_MODEL, contents=contents, config=gen_config
        )
    except Exception as e:
        print(f"[postergen.brain] {PRIMARY_MODEL} failed ({e}); falling back to {FALLBACK_MODEL}.")
        response = client.models.generate_content(
            model=FALLBACK_MODEL, contents=contents, config=gen_config
        )

    raw = (response.text or "").strip()
    data = json.loads(raw)
    return BrainOutput(**data)
