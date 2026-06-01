/**
 * Imprnt AI — TypeScript Types
 * Mirrors the frozen JSON schemas from CONTEXT.md.
 */

// ── Brand ─────────────────────────────────────────────────────

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  palette: string[];
}

export interface BrandTypography {
  heading_font: string;
  heading_font_bn: string;
  body_font: string;
  body_font_bn: string;
}

export interface BrandVoice {
  tone: string;
  language: "en" | "bn" | "both";
  formality: string;
}

export interface Brand {
  brand_id: string;
  brand_name: string;
  tagline: string;
  tagline_bn: string | null;
  industry: string;
  target_audience: string;
  brand_personality: string[];
  colors: BrandColors;
  typography: BrandTypography;
  logo_url: string | null;
  product_image_url: string | null;
  voice: BrandVoice;
  do_not_use: string[];
  created_at: string;
}

// ── Blueprint ─────────────────────────────────────────────────

export type SourceType = "generated" | "rendered" | "uploaded";
export type LayerType = "overlay" | "text" | "image";
export type PositionKeyword =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";
export type AdherenceLevel = "strict" | "moderate" | "creative";
export type AspectRatio = "1:1" | "9:16" | "16:9";

export interface BlueprintFormat {
  name: string;
  width: number;
  height: number;
  aspect_ratio: AspectRatio;
}

export interface BlueprintBackground {
  source: "generated";
  prompt: string;
  fallback_color: string;
}

export interface LayerSize {
  width?: number | "auto";
  height?: number | "auto";
}

export interface LayerSpacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface BlueprintLayer {
  id: string;
  type: LayerType;
  source: SourceType;
  content?: string;
  font_family?: string;
  font_size?: number;
  font_weight?: number;
  color?: string;
  text_transform?: "none" | "uppercase" | "lowercase";
  background_color?: string;
  padding?: LayerSpacing;
  border_radius?: number;
  position?: PositionKeyword;
  size?: LayerSize;
  margin?: LayerSpacing;
  max_width?: number;
  line_height?: number;
  asset_key?: "logo_url" | "product_image_url";
  style?: Record<string, string>;
  z_index: number;
  optional?: boolean;
}

export interface BlueprintMetadata {
  adherence_level: AdherenceLevel;
  language: "en" | "bn" | "both";
  generated_at: string;
  model_used: string;
  retry_count: number;
}

export interface Blueprint {
  blueprint_id: string;
  brand_id: string;
  campaign_name: string;
  campaign_strategy: string;
  format: BlueprintFormat;
  background: BlueprintBackground;
  layers: BlueprintLayer[];
  metadata: BlueprintMetadata;
}

// ── API Request / Response shapes ────────────────────────────

export interface CampaignPlanRequest {
  brand_id: string;
  prompt: string;
  format: BlueprintFormat;
  adherence_level: AdherenceLevel;
  product_image_available: boolean;
}

export interface CampaignPlanResponse {
  blueprint: Blueprint;
  retries_used: number;
}

export interface CampaignGenerateResponse {
  campaign_id: string;
  poster_url: string;
  background_url?: string;
  generation_time_seconds: number;
}

export interface GenerateAllResponse {
  campaign_id: string;
  formats: Array<{
    name: string;
    aspect_ratio: AspectRatio;
    poster_url: string;
  }>;
  total_generation_time_seconds: number;
}

export interface ExportResult {
  format_name: string;
  url: string;
  width: number;
  height: number;
  aspect_ratio?: AspectRatio;
}

export interface ExportCampaignResponse {
  campaign_id: string;
  exports: ExportResult[];
}

export interface HealthResponse {
  status: "ok";
  version: string;
  environment: string;
}
