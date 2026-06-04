"""
Imprnt AI — Video Planner Service
Calls Gemini to generate a video_plan.json from a brand + blueprint.
"""
import json

from google.genai import types
from pydantic import ValidationError

from models.video import VideoPlan
from prompts.video_planning import VIDEO_PLANNING_SYSTEM_PROMPT
from services.gemini import _call_gemini_with_fallback


def plan_video(brand: dict, blueprint: dict, aspect_ratio: str = "1:1") -> VideoPlan:
    """
    Ask Gemini to choreograph GSAP entrance animations for every blueprint layer.
    Returns a validated VideoPlan.
    """
    # Canvas dimensions from the blueprint format
    fmt = blueprint.get("format", {})
    width = fmt.get("width", 1080)
    height = fmt.get("height", 1080)

    input_text = f"""
Brand Profile:
{json.dumps(brand, indent=2)}

Blueprint (layers with IDs):
{json.dumps(blueprint, indent=2)}

Aspect Ratio: {aspect_ratio}
Canvas: {width}x{height}
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
                thinking_budget=0,
            )
            plan_dict = json.loads(response_text)

            # Patch canvas from blueprint dimensions in case Gemini gets them wrong
            plan_dict.setdefault("canvas", {})
            plan_dict["canvas"]["width"] = width
            plan_dict["canvas"]["height"] = height

            return VideoPlan(**plan_dict)

        except json.JSONDecodeError as e:
            last_error = f"Invalid JSON: {e}. Raw: {response_text[:300]}"
        except ValidationError as e:
            last_error = f"Schema error: {e}"
        except Exception as e:
            raise  # Propagate quota / permission errors immediately

    raise Exception(f"Video planning failed after {MAX_RETRIES + 1} attempts. Last: {last_error}")
