"""
Imprnt AI — Video Plan Pydantic Model
Validates the video_plan.json schema produced by the AI Video Director.
"""
from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class AnimationEntry(BaseModel):
    layer_id: str
    gsap_from: dict[str, Any]
    gsap_to: dict[str, Any]
    start_sec: float = Field(..., ge=0.0)


class VideoCanvas(BaseModel):
    width: int = Field(default=1080, gt=0)
    height: int = Field(default=1080, gt=0)


class VideoPlan(BaseModel):
    duration_sec: float = Field(default=6.0, ge=1.0, le=60.0)
    fps: int = Field(default=30, ge=12, le=60)
    canvas: VideoCanvas = Field(default_factory=VideoCanvas)
    animations: list[AnimationEntry] = Field(..., min_length=1)


class VideoGenerateResponse(BaseModel):
    video_id: str
    video_url: str
    generation_time_seconds: float
