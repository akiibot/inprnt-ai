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

// ── Captions ──────────────────────────────────────────────────

export interface CampaignCaptions {
  instagram: string;
  facebook: string;
  tiktok: string;
  caption_bn: string;
  hashtags: string[];
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
  captions?: CampaignCaptions;
}

export interface GenerateAllResponse {
  campaign_id: string;
  formats: Array<{
    name: string;
    aspect_ratio: AspectRatio;
    poster_url: string;
  }>;
  total_generation_time_seconds: number;
  captions?: CampaignCaptions;
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

// ── Video ─────────────────────────────────────────────────────

export interface AnimationEntry {
  layer_id: string;
  gsap_from: Record<string, unknown>;
  gsap_to: Record<string, unknown>;
  start_sec: number;
}

export interface VideoPlan {
  duration_sec: number;
  fps: number;
  canvas: { width: number; height: number };
  animations: AnimationEntry[];
}

export interface VideoPlanResponse {
  video_plan: VideoPlan;
}

export interface VideoGenerateResponse {
  video_id: string;
  video_url: string;
  generation_time_seconds: number;
}

// ── Brand Library ─────────────────────────────────────────────

export interface BrandSummary {
  id: string;
  brand_name: string;
  logo_url: string | null;
  colors: BrandColors;
  created_at: string;
}

// ── Editor ────────────────────────────────────────────────────

export type EditorLayerType = "text" | "image" | "overlay" | "background" | "shape";

export interface FabricObjectData {
  layerId: string;
  layerType: EditorLayerType;
  assetKey?: "logo_url" | "product_image_url";
  name?: string;
  locked?: boolean;
}

export interface ActiveTextState {
  content: string;
  fontFamily: string;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  fill: string;
  fontSize: number;
  textAlign: "left" | "center" | "right";
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  textBackgroundColor: string;
  charSpacing: number;
  lineHeight: number;
}

/** Common props editable on any selected object (text, image, shape). */
export interface ActiveObjectState {
  opacity: number;
  fill: string;          // shape fill (ignored for image)
}

/** One row in the layers panel. */
export interface EditorObjectSummary {
  id: string;
  name: string;
  type: EditorLayerType;
  visible: boolean;
  locked: boolean;
  isSelected: boolean;
}

export type EditorShapeKind = "rect" | "circle" | "line";
export type EditorAlign = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";

// ── Manual Brand Creation ────────────────────────────────────

export interface ManualBrandPayload {
  brand_name: string;
  tagline: string;
  tagline_bn: string | null;
  industry: string;
  target_audience: string;
  brand_personality: string[];
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    palette: string[];
  };
  typography: {
    heading_font: string;
    heading_font_bn: string;
    body_font: string;
    body_font_bn: string;
  };
  voice: {
    tone: string;
    language: "en" | "bn" | "both";
    formality: string;
  };
  do_not_use: string[];
  logo_base64: string | null;
  logo_content_type: string;
  product_image_url: string | null;
}
