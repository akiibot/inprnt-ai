"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EditorToolbar } from "./EditorToolbar";
import { EditorPropertiesPanel } from "./EditorPropertiesPanel";
import { EditorLayersPanel } from "./EditorLayersPanel";
import { useFabricEditor } from "./useFabricEditor";
import { getCampaign, getBrand } from "@/lib/api";
import type { AspectRatio, Blueprint, Brand, BlueprintLayer } from "@/lib/types";
import styles from "./ImageEditor.module.css";

interface Props {
  campaignId: string;
  aspectRatio: AspectRatio;
  posterUrl: string;
}

const NATIVE: Record<AspectRatio, [number, number]> = {
  "1:1": [1080, 1080], "9:16": [1080, 1920], "16:9": [1920, 1080],
};

/**
 * Port of backend `_adapt_blueprint_to_format` (export.py): reflow a blueprint
 * designed for one canvas onto another aspect ratio so editable layers land in
 * roughly the same place the rendered poster shows them.
 */
function reflowLayers(layers: BlueprintLayer[], srcW: number, srcH: number, tW: number, tH: number): BlueprintLayer[] {
  const wRatio = tW / srcW;
  const hRatio = tH / srcH;
  const scale = Math.min(wRatio, hRatio);
  return layers.map((l) => {
    const next: BlueprintLayer = { ...l };
    if (l.margin) {
      next.margin = {
        top: typeof l.margin.top === "number" ? Math.round(l.margin.top * hRatio) : l.margin.top,
        bottom: typeof l.margin.bottom === "number" ? Math.round(l.margin.bottom * hRatio) : l.margin.bottom,
        left: typeof l.margin.left === "number" ? Math.round(l.margin.left * wRatio) : l.margin.left,
        right: typeof l.margin.right === "number" ? Math.round(l.margin.right * wRatio) : l.margin.right,
      };
    }
    if (typeof l.font_size === "number") next.font_size = Math.max(12, Math.round(l.font_size * scale));
    if (typeof l.max_width === "number") next.max_width = Math.round(l.max_width * wRatio);
    if (l.size) {
      next.size = {
        width: typeof l.size.width === "number" ? Math.round(l.size.width * scale) : l.size.width,
        height: typeof l.size.height === "number" ? Math.round(l.size.height * scale) : l.size.height,
      };
    }
    return next;
  });
}

export default function ImageEditor({ campaignId, aspectRatio, posterUrl }: Props) {
  const ed = useFabricEditor({ campaignId, aspectRatio, posterUrl });
  const [blueprintStatus, setBlueprintStatus] = useState<"idle" | "loading" | "loaded" | "failed">("idle");

  // Auto-load + reconstruct blueprint layers once the canvas is ready.
  useEffect(() => {
    if (!ed.isReady || blueprintStatus !== "idle") return;
    setBlueprintStatus("loading");

    getCampaign(campaignId)
      .then(async (campaign) => {
        const blueprint = campaign.blueprint as Blueprint | undefined;
        const backgroundUrl = (campaign.background_url as string | undefined) ?? "";
        if (!blueprint?.layers?.length || !backgroundUrl) {
          setBlueprintStatus("failed");
          return;
        }

        let brand: Brand | null = null;
        try { brand = await getBrand(campaign.brand_id as string); } catch { /* image layers skipped */ }
        const brandAssets: Record<string, string> = {};
        if (brand?.logo_url) brandAssets["logo_url"] = brand.logo_url;
        if (brand?.product_image_url) brandAssets["product_image_url"] = brand.product_image_url;

        // Reflow layers when editing a format the blueprint wasn't designed for.
        const [tW, tH] = NATIVE[aspectRatio];
        const srcW = blueprint.format?.width ?? tW;
        const srcH = blueprint.format?.height ?? tH;
        const layers = (blueprint.format?.aspect_ratio === aspectRatio)
          ? blueprint.layers
          : reflowLayers(blueprint.layers, srcW, srcH, tW, tH);

        await ed.loadBlueprint(layers, brandAssets, backgroundUrl);
        setBlueprintStatus("loaded");
      })
      .catch(() => setBlueprintStatus("failed"));
  }, [ed.isReady, blueprintStatus, campaignId, aspectRatio, ed]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); ed.undo(); return; }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); ed.redo(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); ed.duplicateSelected(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); ed.deleteSelected(); return; }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") { e.preventDefault(); ed.nudgeSelected(-step, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); ed.nudgeSelected(step, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); ed.nudgeSelected(0, -step); }
      else if (e.key === "ArrowDown") { e.preventDefault(); ed.nudgeSelected(0, step); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ed]);

  return (
    <div className={styles.editorRoot}>
      <EditorToolbar
        onUndo={ed.undo}
        onRedo={ed.redo}
        canUndo={ed.canUndo}
        canRedo={ed.canRedo}
        onAddText={ed.addText}
        onAddImage={ed.addImageFromFile}
        onAddShape={ed.addShape}
        onDuplicate={ed.duplicateSelected}
        onDelete={ed.deleteSelected}
        onBringForward={ed.bringForward}
        onSendBackward={ed.sendBackward}
        onReplaceImage={ed.replaceImage}
        zoom={ed.zoom}
        onZoomIn={() => ed.zoomBy(1.2)}
        onZoomOut={() => ed.zoomBy(1 / 1.2)}
        onZoomFit={ed.zoomFit}
        onReset={ed.resetToBaseline}
        onDownload={ed.downloadPng}
        onSave={ed.saveToServer}
        isSaving={ed.isSaving}
        saveError={ed.saveError}
      />

      <div className={styles.editorMain}>
        <EditorLayersPanel
          objects={ed.objects}
          onSelect={ed.selectObject}
          onToggleVisible={ed.toggleVisible}
          onToggleLock={ed.toggleLock}
          onRename={ed.renameObject}
        />

        <div className={styles.canvasArea}>
          {!ed.isReady && (
            <div className={styles.loadingOverlay}>
              <div className={styles.spinner} />
              <span>Loading canvas…</span>
            </div>
          )}
          {ed.isReady && blueprintStatus === "loading" && (
            <div className={styles.blueprintBadge}>Loading layers…</div>
          )}
          <div ref={ed.containerRef} className={styles.canvasMount} />
        </div>

        <EditorPropertiesPanel
          selectedType={ed.selectedType}
          activeText={ed.activeText}
          activeObject={ed.activeObject}
          onTextChange={ed.updateText}
          onObjectChange={ed.updateObjectProp}
          onReplaceImage={ed.replaceImage}
          onAlign={ed.alignSelection}
        />
      </div>

      <AnimatePresence>
        {ed.hasDraft && (
          <motion.div
            className={styles.draftBanner}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <span>You have an unsaved draft for this poster.</span>
            <div className={styles.draftActions}>
              <button className={styles.draftRestore} onClick={ed.restoreDraft}>Restore</button>
              <button className={styles.draftDismiss} onClick={ed.dismissDraft}>Discard</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
