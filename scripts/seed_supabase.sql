-- Imprnt AI — Supabase SQL Migrations
-- Run this in Supabase SQL Editor to create all required tables.
-- Created: Phase 2

-- ── Brands table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_name      TEXT NOT NULL,
    tagline         TEXT,
    tagline_bn      TEXT,
    industry        TEXT,
    target_audience TEXT,
    brand_personality JSONB,        -- string[]
    colors          JSONB NOT NULL, -- { primary, secondary, accent, palette[] }
    typography      JSONB NOT NULL, -- { heading_font, heading_font_bn, body_font, body_font_bn }
    logo_url        TEXT,
    product_image_url TEXT,
    voice           JSONB,          -- { tone, language, formality }
    do_not_use      JSONB,          -- string[]
    raw_data        JSONB,          -- full brand.json blob
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Campaigns table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    campaign_name   TEXT NOT NULL,
    campaign_strategy TEXT,
    adherence_level TEXT CHECK (adherence_level IN ('strict', 'moderate', 'creative')),
    language        TEXT CHECK (language IN ('en', 'bn', 'both')),
    blueprint       JSONB,          -- full blueprint.json blob
    -- Output poster URLs per format
    poster_1x1_url  TEXT,
    poster_9x16_url TEXT,
    poster_16x9_url TEXT,
    -- Background image URL
    background_url  TEXT,
    generation_time_seconds FLOAT,
    model_used      TEXT,
    retry_count     INT DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_campaigns_brand_id ON campaigns(brand_id);
CREATE INDEX IF NOT EXISTS idx_brands_created_at ON brands(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- ── Updated-at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_brands_updated_at ON brands;
CREATE TRIGGER update_brands_updated_at
    BEFORE UPDATE ON brands
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
