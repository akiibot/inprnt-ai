"""
Imprnt AI — Blueprint Pydantic Model
Validates the blueprint.json schema. Schema is FROZEN — see CONTEXT.md.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional, Union
from uuid import uuid4

from pydantic import BaseModel, Field


# ── Sub-models ────────────────────────────────────────────────────────────────

class BlueprintFormat(BaseModel):
    name: str
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)
    aspect_ratio: str  # "1:1" | "9:16" | "16:9"


class BlueprintBackground(BaseModel):
    source: Literal["generated"]
    prompt: str  # Flux image prompt — must NOT contain text
    fallback_color: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")


class LayerSize(BaseModel):
    width: Optional[Union[int, str]] = None   # int or "auto"
    height: Optional[Union[int, str]] = None  # int or "auto"


class LayerMargin(BaseModel):
    top: Optional[Union[int, str]] = 0
    right: Optional[Union[int, str]] = 0
    bottom: Optional[Union[int, str]] = 0
    left: Optional[Union[int, str]] = 0


class LayerPadding(BaseModel):
    top: Optional[Union[int, str]] = 0
    right: Optional[Union[int, str]] = 0
    bottom: Optional[Union[int, str]] = 0
    left: Optional[Union[int, str]] = 0


class BlueprintLayer(BaseModel):
    id: str
    type: Literal["overlay", "text", "image"]
    source: Literal["generated", "rendered", "uploaded"]

    # Text layer fields
    content: Optional[str] = None
    font_family: Optional[str] = None
    font_size: Optional[int] = None
    font_weight: Optional[int] = None
    color: Optional[str] = None
    text_transform: Optional[Literal["none", "uppercase", "lowercase"]] = "none"
    text_align: Optional[Literal["left", "center", "right"]] = None
    letter_spacing: Optional[float] = None  # px, e.g. -2.0 for tight display

    # CTA button fields
    background_color: Optional[str] = None
    padding: Optional[LayerPadding] = None
    border_radius: Optional[int] = None

    # Layout
    position: Optional[str] = None  # One of the 9 position keywords
    size: Optional[LayerSize] = None
    margin: Optional[LayerMargin] = None
    max_width: Optional[int] = None
    line_height: Optional[float] = None

    # Image layer fields
    asset_key: Optional[str] = None  # "logo_url" | "product_image_url"

    # Overlay layer fields
    style: Optional[dict[str, Any]] = None

    z_index: int = 0
    optional: bool = False


class BlueprintMetadata(BaseModel):
    adherence_level: Literal["strict", "moderate", "creative"]
    language: Literal["en", "bn", "both"]
    prompt: Optional[str] = None  # Original user campaign brief, persisted in the blueprint
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    model_used: str = "gemini-2.5-pro"
    retry_count: int = 0


# ── Root Blueprint model ──────────────────────────────────────────────────────

class Blueprint(BaseModel):
    blueprint_id: str = Field(default_factory=lambda: str(uuid4()))
    brand_id: str
    campaign_name: str
    campaign_strategy: str
    format: BlueprintFormat
    background: BlueprintBackground
    layers: list[BlueprintLayer] = Field(..., min_length=1)
    metadata: BlueprintMetadata


# ── Request / Response shapes ─────────────────────────────────────────────────

class CampaignPlanRequest(BaseModel):
    brand_id: str
    prompt: str
    format: BlueprintFormat
    adherence_level: Literal["strict", "moderate", "creative"] = "strict"
    product_image_available: bool = False


class CampaignPlanResponse(BaseModel):
    blueprint: Blueprint
    retries_used: int = 0


class CampaignGenerateResponse(BaseModel):
    campaign_id: str
    poster_url: str
    background_url: Optional[str] = None
    generation_time_seconds: float
