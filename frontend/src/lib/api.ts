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
  ExportCampaignResponse,
  AspectRatio,
  ManualBrandPayload,
} from "./types";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api`;

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

export async function loadDemoBrand(): Promise<{ brand_id: string; brand: Brand; prompt: string }> {
  return request("/brands/load-demo", { method: "POST" });
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
): Promise<GenerateAllResponse> {
  return request<GenerateAllResponse>("/campaigns/generate-all", {
    method: "POST",
    body: JSON.stringify({
      brand_id: brandId,
      prompt,
      adherence_level: adherenceLevel,
      product_image_available: true,
    }),
  });
}

// ── Campaign Plan ─────────────────────────────────────────────

export async function planCampaign(
  data: CampaignPlanRequest
): Promise<CampaignPlanResponse> {
  return request<CampaignPlanResponse>("/campaigns/plan", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Campaign Generate ─────────────────────────────────────────

export async function generateCampaign(
  blueprint: Blueprint
): Promise<CampaignGenerateResponse> {
  return request<CampaignGenerateResponse>("/campaigns/generate", {
    method: "POST",
    body: JSON.stringify(blueprint),
  });
}

export async function generateAllFormats(data: {
  brand_id: string;
  prompt: string;
  adherence_level: string;
  product_image_available: boolean;
}): Promise<GenerateAllResponse> {
  return request<GenerateAllResponse>("/campaigns/generate-all", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Export ────────────────────────────────────────────────────

export async function exportCampaignFormats(data: {
  campaign_id: string;
  formats: { name: string; width: number; height: number; aspect_ratio: AspectRatio }[];
}): Promise<ExportCampaignResponse> {
  return request<ExportCampaignResponse>("/export", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
