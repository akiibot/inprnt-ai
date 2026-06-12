"use client";

import { useState } from "react";
import Image from "next/image";
import { BookOpen, Trash2, Check, X, Loader2, Pencil } from "lucide-react";
import { useBrandLibrary } from "@/lib/useBrandLibrary";
import styles from "./BrandLibrary.module.css";

interface Props {
  onSelect: (brandId: string) => void;
}

export function BrandLibrary({ onSelect }: Props) {
  const { brands, loading, error, deleteBrand, renameBrand } = useBrandLibrary();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setRenameValue(current);
    setDeletingId(null);
  };

  const confirmRename = async (id: string) => {
    if (!renameValue.trim()) return;
    setActionLoading(id);
    try { await renameBrand(id, renameValue.trim()); }
    finally { setActionLoading(null); setRenamingId(null); }
  };

  const confirmDelete = async (id: string) => {
    setActionLoading(id);
    try { await deleteBrand(id); }
    finally { setActionLoading(null); setDeletingId(null); }
  };

  if (loading) {
    return (
      <div className={styles.emptyState}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
        <p>Loading saved brands…</p>
      </div>
    );
  }

  if (error) {
    return <div className={styles.errorState}>Failed to load brands: {error}</div>;
  }

  if (brands.length === 0) {
    return (
      <div className={styles.emptyState}>
        <BookOpen size={40} strokeWidth={1.5} />
        <p>No saved brands yet.</p>
        <p className={styles.emptyHint}>
          Upload a PDF or build a brand manually — it will appear here for future campaigns.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {brands.map((brand) => {
        const isRenaming = renamingId === brand.id;
        const isDeleting = deletingId === brand.id;
        const isLoading = actionLoading === brand.id;

        return (
          <div key={brand.id} className={styles.card}>
            {/* Thumbnail */}
            <div className={styles.thumbnail}>
              {brand.logo_url ? (
                <Image
                  src={brand.logo_url}
                  alt={brand.brand_name}
                  fill
                  className={styles.thumbnailImg}
                  unoptimized
                />
              ) : (
                <div className={styles.thumbnailPlaceholder}>
                  {brand.brand_name[0]?.toUpperCase() ?? "?"}
                </div>
              )}
            </div>

            {/* Card body */}
            <div className={styles.cardBody}>
              {isRenaming ? (
                <div className={styles.renameRow}>
                  <input
                    className={styles.renameInput}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename(brand.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    autoFocus
                  />
                  <button className={styles.iconBtn} onClick={() => confirmRename(brand.id)} disabled={isLoading || !renameValue.trim()}>
                    {isLoading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={12} />}
                  </button>
                  <button className={styles.iconBtn} onClick={() => setRenamingId(null)}><X size={12} /></button>
                </div>
              ) : (
                <div className={styles.nameRow}>
                  <span className={styles.brandName}>{brand.brand_name}</span>
                  <button className={styles.renameBtn} onClick={() => startRename(brand.id, brand.brand_name)} aria-label="Rename">
                    <Pencil size={11} />
                  </button>
                </div>
              )}

              <span className={styles.cardDate}>
                {new Date(brand.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>

            {/* Footer: Use button + delete */}
            <div className={styles.cardFooter}>
              {isDeleting ? (
                <div className={styles.deleteConfirm}>
                  <span className={styles.deleteQuestion}>Delete?</span>
                  <button className={styles.deleteBtnYes} onClick={() => confirmDelete(brand.id)} disabled={isLoading}>
                    {isLoading ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : "Yes"}
                  </button>
                  <button className={styles.iconBtn} onClick={() => setDeletingId(null)}>No</button>
                </div>
              ) : (
                <>
                  <button className={styles.useBtn} onClick={() => onSelect(brand.id)}>
                    Use this Brand
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => { setDeletingId(brand.id); setRenamingId(null); }}
                    aria-label="Delete brand"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
