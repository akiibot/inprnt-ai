/**
 * Imprnt AI — API Client
 * Typed fetch wrappers for all FastAPI endpoints.
 * All requests go through Next.js /api/* rewrite → FastAPI :8000.
 */

import type {
  HealthResponse,
  Brand,
  BrandSummary,
  Blueprint,
  AdherenceLevel,
  CampaignPlanRequest,
  CampaignPlanResponse,
  CampaignGenerateResponse,
  GenerateAllResponse,
  PosterEngine,
  ExportCampaignResponse,
  AspectRatio,
  ManualBrandPayload,
  VeoPlan,
  VeoPlanResponse,
  VideoGenerateResponse,
} from "./types";


// Always use relative path — requests go through Next.js rewrite → Railway backend.
// NEXT_PUBLIC_API_URL is only needed in next.config.js (server-side rewrite destination).
const API_BASE = `/api`;

// Long-running endpoints (Veo video generation can take up to 6 min) go direct to
// Railway to bypass Vercel's 60s proxy timeout. Falls back to relative in dev.
const DIRECT_API_BASE = `${process.env.NEXT_PUBLIC_API_URL || ""}/api`;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    throw new ApiError(res.status, `API error ${res.status}`, detail);
  }

  return res.json() as Promise<T>;
}

// ── Health ────────────────────────────────────────────────────

export async function checkHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

// ── Brands ────────────────────────────────────────────────────

export async function uploadBrand(
  pdf: File,
  logo: File
): Promise<{ brand_id: string; brand: Brand; message: string }> {
  const form = new FormData();
  form.append("pdf", pdf);
  form.append("logo", logo);

  const res = await fetch(`${API_BASE}/brands/upload`, {
    method: "POST",
    body: form,
    // Note: do NOT set Content-Type — browser sets multipart/form-data + boundary
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(res.status, `Brand upload failed`, detail);
  }

  return res.json();
}

export async function uploadProductImage(
  brandId: string,
  productImage: File
): Promise<{ product_image_url: string; message: string }> {
  const form = new FormData();
  form.append("product_image", productImage);

  const res = await fetch(`${API_BASE}/brands/${brandId}/product`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(res.status, `Product upload failed`, detail);
  }

  return res.json();
}

export async function getBrand(brandId: string): Promise<Brand> {
  return request<Brand>(`/brands/${brandId}`);
}

export async function listBrands(): Promise<BrandSummary[]> {
  return request<BrandSummary[]>("/brands");
}

export async function deleteBrand(brandId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/brands/${brandId}`, { method: "DELETE" });
}

export async function renameBrand(
  brandId: string,
  brandName: string,
): Promise<{ id: string; brand_name: string }> {
  return request(`/brands/${brandId}`, {
    method: "PATCH",
    body: JSON.stringify({ brand_name: brandName }),
  });
}

export async function loadDemoBrand(brand = "volt-bd"): Promise<{ brand_id: string; brand: Brand; prompt: string }> {
  return request("/brands/load-demo", {
    method: "POST",
    body: JSON.stringify({ brand }),
  });
}

export async function submitManualBrand(
  data: ManualBrandPayload,
): Promise<{ brand_id: string; brand: Brand; message: string }> {
  return request("/brands/manual", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCampaign(campaignId: string): Promise<Record<string, unknown>> {
  return request(`/campaigns/${campaignId}`);
}

export async function runDemoGenerate(
  brandId: string,
  prompt: string,
  adherenceLevel: AdherenceLevel = "moderate",
  engine: PosterEngine = "postergen",
): Promise<GenerateAllResponse> {
  return request<GenerateAllResponse>("/campaigns/generate-all", {
    method: "POST",
    body: JSON.stringify({
      brand_id: brandId,
      prompt,
      adherence_level: adherenceLevel,
      product_image_available: true,
      engine,
    }),
  });
}

// ── Campaign Plan ─────────────────────────────────────────────
// These go direct to Railway — Gemini + Flux + Playwright can exceed Vercel's 60s proxy timeout.

async function directRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${DIRECT_API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(`API error ${res.status}: ${JSON.stringify(detail)}`);
  }
  return res.json();
}

export async function planCampaign(
  data: CampaignPlanRequest
): Promise<CampaignPlanResponse> {
  return directRequest<CampaignPlanResponse>("/campaigns/plan", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Campaign Generate ─────────────────────────────────────────

export async function generateCampaign(
  blueprint: Blueprint
): Promise<CampaignGenerateResponse> {
  return directRequest<CampaignGenerateResponse>("/campaigns/generate", {
    method: "POST",
    body: JSON.stringify(blueprint),
  });
}

export async function generateAllFormats(data: {
  brand_id: string;
  prompt: string;
  adherence_level: string;
  product_image_available: boolean;
  engine?: PosterEngine;
}): Promise<GenerateAllResponse> {
  return directRequest<GenerateAllResponse>("/campaigns/generate-all", {
    method: "POST",
    body: JSON.stringify({ engine: "postergen", ...data }),
  });
}

// ── Video ─────────────────────────────────────────────────────

export async function planCampaignVideo(
  campaignId: string,
  aspectRatio: AspectRatio = "1:1",
): Promise<VeoPlanResponse> {
  // Direct to Railway — Gemini call can exceed Vercel's 60s proxy timeout
  const res = await fetch(`${DIRECT_API_BASE}/campaigns/${campaignId}/plan-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aspect_ratio: aspectRatio }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(`Plan video failed: ${res.status} ${JSON.stringify(detail)}`);
  }
  return res.json();
}

export async function generateCampaignVideo(
  campaignId: string,
  veoPlan: VeoPlan,
  aspectRatio: AspectRatio = "1:1",
): Promise<VideoGenerateResponse> {
  // Call Railway directly — Veo polls for up to 6 min, Vercel proxy times out at 60s.
  const res = await fetch(`${DIRECT_API_BASE}/campaigns/${campaignId}/generate-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ veo_plan: veoPlan, aspect_ratio: aspectRatio }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(`Video generation failed: ${res.status} ${JSON.stringify(detail)}`);
  }
  return res.json();
}

// ── Editor ────────────────────────────────────────────────────

export async function saveEditorExport(
  campaignId: string,
  imageData: string,
  format: AspectRatio
): Promise<{ url: string; format: string }> {
  return request(`/campaigns/${campaignId}/save-edit`, {
    method: "POST",
    body: JSON.stringify({ image_data: imageData, format }),
  });
}

// ── Export ────────────────────────────────────────────────────

export async function exportCampaignFormats(data: {
  campaign_id: string;
  formats: { name: string; width: number; height: number; aspect_ratio: AspectRatio }[];
}): Promise<ExportCampaignResponse> {
  return directRequest<ExportCampaignResponse>("/export", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
