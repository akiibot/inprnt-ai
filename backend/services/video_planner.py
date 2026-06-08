"""
Imprnt AI — Video Planner Service
Calls Gemini to generate Veo 3.1 motion + audio prompts from a brand profile.
"""
import json

from google.genai import types

from models.video import VeoPlan
from prompts.video_planning import VIDEO_PLANNING_SYSTEM_PROMPT
from services.gemini import _call_gemini_with_fallback

# Maps app aspect ratios to Veo-supported values (Veo has no 1:1 option)
_VEO_AR_MAP = {"1:1": "9:16", "9:16": "9:16", "16:9": "16:9"}


def plan_video(brand: dict, aspect_ratio: str = "1:1") -> VeoPlan:
    """
    Ask Gemini to write a cinematic motion + audio prompt pair for Veo 3.1.
    Returns a validated VeoPlan.
    """
    veo_ar = _VEO_AR_MAP.get(aspect_ratio, "9:16")

    input_text = f"""
Brand Profile:
{json.dumps(brand, indent=2)}

Aspect Ratio: {aspect_ratio}
"""

    contents = [types.Part.from_text(text=input_text)]

    MAX_RETRIES = 2
    last_error = None

    for attempt in range(MAX_RETRIES + 1):
        response_text = ""
        try:
            response_text, _ = _call_gemini_with_fallback(
                system_instruction=VIDEO_PLANNING_SYSTEM_PROMPT,
                contents=contents,
                thinking_budget=1024,
            )

            # Strip accidental markdown fences
            cleaned = (
                response_text.strip()
                .removeprefix("```json")
                .removeprefix("```")
                .removesuffix("```")
                .strip()
            )

            plan_dict = json.loads(cleaned)

            motion_prompt = plan_dict.get("motion_prompt", "").strip()
            audio_prompt = plan_dict.get("audio_prompt", "").strip() or None

            if len(motion_prompt) < 20:
                last_error = f"motion_prompt too short: {motion_prompt!r}"
                continue

            return VeoPlan(
                motion_prompt=motion_prompt,
                audio_prompt=audio_prompt,
                aspect_ratio=veo_ar,
                duration_seconds=6,
            )

        except json.JSONDecodeError as e:
            last_error = f"Invalid JSON: {e}. Raw: {response_text[:300]}"
        except Exception as e:
            raise  # Propagate quota / permission errors immediately

    raise Exception(
        f"Video planning failed after {MAX_RETRIES + 1} attempts. Last: {last_error}"
    )
