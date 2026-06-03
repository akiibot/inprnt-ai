"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listBrands,
  deleteBrand as apiDeleteBrand,
  renameBrand as apiRenameBrand,
} from "@/lib/api";
import type { BrandSummary } from "@/lib/types";

const LS_KEY = "imprnt_selected_brand_id";

export function useBrandLibrary() {
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setSelectedBrandId(saved);
  }, []);

  useEffect(() => {
    listBrands()
      .then(setBrands)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const selectBrand = useCallback((id: string) => {
    setSelectedBrandId(id);
    localStorage.setItem(LS_KEY, id);
  }, []);

  const deleteBrand = useCallback(async (id: string) => {
    await apiDeleteBrand(id);
    setBrands((prev) => prev.filter((b) => b.id !== id));
    setSelectedBrandId((current) => {
      if (current === id) {
        localStorage.removeItem(LS_KEY);
        return null;
      }
      return current;
    });
  }, []);

  const renameBrand = useCallback(async (id: string, name: string) => {
    await apiRenameBrand(id, name);
    setBrands((prev) =>
      prev.map((b) => (b.id === id ? { ...b, brand_name: name } : b))
    );
  }, []);

  return { brands, loading, error, selectedBrandId, selectBrand, deleteBrand, renameBrand };
}
