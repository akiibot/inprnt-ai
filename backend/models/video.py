"""
Imprnt AI — Video Plan Pydantic Models
Veo 3.1 image-to-video pipeline.
"""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class VeoPlan(BaseModel):
    motion_prompt: str = Field(..., min_length=20, max_length=1000)
    audio_prompt: Optional[str] = Field(default=None, max_length=500)
    aspect_ratio: Literal["16:9", "9:16"] = "9:16"
    duration_seconds: int = Field(default=6)


class VideoGenerateResponse(BaseModel):
    video_id: str
    video_url: str
    generation_time_seconds: float
