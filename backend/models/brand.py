"""
Imprnt AI — Brand Pydantic Model
Validates the brand.json schema. Schema is FROZEN — see CONTEXT.md.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class BrandColors(BaseModel):
    primary: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    accent: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    palette: list[str] = Field(..., min_length=1, max_length=10)


class BrandTypography(BaseModel):
    heading_font: str
    heading_font_bn: str
    body_font: str
    body_font_bn: str


class BrandVoice(BaseModel):
    tone: str
    language: str = Field(..., pattern=r"^(en|bn|both)$")
    formality: str


class Brand(BaseModel):
    brand_id: str = Field(default_factory=lambda: str(uuid4()))
    brand_name: str
    tagline: str
    tagline_bn: Optional[str] = None
    industry: str
    target_audience: str
    brand_personality: list[str] = Field(..., min_length=3, max_length=5)
    colors: BrandColors
    typography: BrandTypography
    logo_url: Optional[str] = None
    product_image_url: Optional[str] = None
    voice: BrandVoice
    do_not_use: list[str] = Field(..., min_length=2)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BrandUploadResponse(BaseModel):
    brand_id: str
    brand: Brand
    colors_source: str = "colorthief"
    message: str = "Brand identity extracted successfully"
