"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type {
  AspectRatio, ActiveTextState, ActiveObjectState, BlueprintLayer, FabricObjectData,
  EditorObjectSummary, EditorShapeKind, EditorAlign,
} from "@/lib/types";
import { saveEditorExport } from "@/lib/api";

// Native poster dimensions per aspect ratio
const NATIVE_DIMS: Record<AspectRatio, [number, number]> = {
  "1:1":  [1080, 1080],
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
};

// Font families available in the compositor (mirrors compositor/template.py)
export const EDITOR_FONTS = [
  "Anton", "Bebas Neue", "Oswald", "Montserrat", "Poppins", "Inter",
  "Hind Siliguri", "Noto Sans Bengali",
];

// next/font loads these under hashed family names (e.g. __Anton_ec6dc7), so the
// literal names Fabric draws with ("Anton") don't resolve and the canvas falls
// back to a system font. Load the real-named web fonts ourselves and wait for them
// to be ready before rendering canvas text.
const EDITOR_FONTS_HREF =
  "https://fonts.googleapis.com/css2" +
  "?family=Anton" +
  "&family=Bebas+Neue" +
  "&family=Oswald:wght@400;600;700" +
  "&family=Montserrat:wght@400;600;700" +
  "&family=Poppins:wght@400;600;700" +
  "&family=Inter:wght@400;600;700" +
  "&family=Hind+Siliguri:wght@400;600;700" +
  "&family=Noto+Sans+Bengali:wght@400;600;700" +
  "&display=swap";

let editorFontsPromise: Promise<void> | null = null;

/** Inject the editor font stylesheet (once) and resolve when all faces are ready. */
function ensureEditorFontsLoaded(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (editorFontsPromise) return editorFontsPromise;

  const id = "imprnt-editor-fonts";
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = EDITOR_FONTS_HREF;
    document.head.appendChild(link);
  }

  editorFontsPromise = Promise.all(
    EDITOR_FONTS.flatMap((f) => [
      document.fonts.load(`400 48px "${f}"`),
      document.fonts.load(`700 48px "${f}"`),
    ])
  )
    .then(() => undefined)
    .catch(() => undefined);

  return editorFontsPromise;
}

/** Split a comma-separated CSS list at top level only (ignores commas inside rgba(...)). */
function splitTopLevel(str: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Convert a CSS `background` value into something Fabric's Rect.fill accepts:
 * a solid color string, a fabric Gradient instance, or null (skip — don't draw a
 * black box). Fabric's color parser falls back to opaque black on any string it
 * can't parse (e.g. "linear-gradient(...)"), which is what produced the black overlay.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cssBackgroundToFabricFill(GradientCtor: any, bg: string | undefined, w: number, h: number): string | object | null {
  if (!bg) return null;
  const s = bg.trim();
  if (!s || s === "transparent" || s === "none") return null;

  // Solid color / rgba / hsl — Fabric handles these directly (alpha preserved).
  if (!/gradient/i.test(s)) return s;

  // Only linear gradients are converted; others are skipped to avoid artefacts.
  const m = s.match(/linear-gradient\((.*)\)$/i);
  if (!m) return null;

  const parts = splitTopLevel(m[1]);
  if (parts.length < 2) return null;

  // Optional leading direction (angle or "to <side>").
  let angleDeg = 180; // CSS default is "to bottom"
  let stops = parts;
  const head = parts[0];
  if (/deg$/i.test(head) || /^to\s/i.test(head)) {
    const deg = head.match(/(-?\d+(?:\.\d+)?)deg/i);
    if (deg) angleDeg = parseFloat(deg[1]);
    else if (/to\s+top$/i.test(head)) angleDeg = 0;
    else if (/to\s+bottom$/i.test(head)) angleDeg = 180;
    else if (/to\s+right$/i.test(head)) angleDeg = 90;
    else if (/to\s+left$/i.test(head)) angleDeg = 270;
    else if (/to\s+bottom\s+right$/i.test(head)) angleDeg = 135;
    else if (/to\s+bottom\s+left$/i.test(head)) angleDeg = 225;
    else if (/to\s+top\s+right$/i.test(head)) angleDeg = 45;
    else if (/to\s+top\s+left$/i.test(head)) angleDeg = 315;
    stops = parts.slice(1);
  }
  if (stops.length < 2) return null;

  const colorStops = stops.map((p, i) => {
    const pct = p.match(/(-?\d+(?:\.\d+)?)%\s*$/);
    const color = p.replace(/\s+-?\d+(?:\.\d+)?%\s*$/, "").trim();
    const offset = pct ? Math.min(1, Math.max(0, parseFloat(pct[1]) / 100)) : i / (stops.length - 1);
    return { offset, color };
  });

  // CSS angle → direction vector (0deg points up / "to top").
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const coords = {
    x1: w / 2 - (dx * w) / 2,
    y1: h / 2 - (dy * h) / 2,
    x2: w / 2 + (dx * w) / 2,
    y2: h / 2 + (dy * h) / 2,
  };

  try {
    return new GradientCtor({ type: "linear", coords, colorStops });
  } catch {
    return null;
  }
}

const HISTORY_MAX = 50;
const SNAP_TOLERANCE = 7; // px (in canvas/native units)

interface GuideLine { x1: number; y1: number; x2: number; y2: number; }

/**
 * Snap the moving object's center/edges to canvas center, canvas edges, and other
 * objects' centers. Records guide lines (in canvas coords) for drawGuides to paint.
 */
function snapMoving(
  canvas: import("fabric").Canvas,
  obj: import("fabric").FabricObject,
  nW: number,
  nH: number,
  guideRef: { current: GuideLine[] },
): void {
  if (!obj) return;
  const guides: GuideLine[] = [];
  const r = obj.getBoundingRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  // Candidate vertical snap lines (x): canvas center, left/right edges, other centers.
  const vXs: number[] = [nW / 2, 0, nW];
  const hYs: number[] = [nH / 2, 0, nH];
  canvas.getObjects().forEach((o) => {
    if (o === obj) return;
    const d = (o as { data?: FabricObjectData }).data;
    if (d?.layerType === "background") return;
    const br = o.getBoundingRect();
    vXs.push(br.left + br.width / 2);
    hYs.push(br.top + br.height / 2);
  });

  for (const vx of vXs) {
    if (Math.abs(cx - vx) <= SNAP_TOLERANCE) {
      obj.set("left", (obj.left ?? 0) + (vx - cx));
      obj.setCoords();
      guides.push({ x1: vx, y1: 0, x2: vx, y2: nH });
      break;
    }
  }
  for (const hy of hYs) {
    if (Math.abs(cy - hy) <= SNAP_TOLERANCE) {
      obj.set("top", (obj.top ?? 0) + (hy - cy));
      obj.setCoords();
      guides.push({ x1: 0, y1: hy, x2: nW, y2: hy });
      break;
    }
  }
  guideRef.current = guides;
}

/** Paint snap guides on the top context (cleared & redrawn every frame). */
function drawGuides(canvas: import("fabric").Canvas, guides: GuideLine[]): void {
  if (!guides.length) return;
  const ctx = canvas.getSelectionContext?.() ?? (canvas as unknown as { contextTop: CanvasRenderingContext2D }).contextTop;
  if (!ctx) return;
  const vpt = canvas.viewportTransform;
  if (!vpt) return;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#FF4B00";
  ctx.setLineDash([4, 4]);
  for (const g of guides) {
    // transform canvas coords → screen coords via viewport transform
    const x1 = g.x1 * vpt[0] + vpt[4];
    const y1 = g.y1 * vpt[3] + vpt[5];
    const x2 = g.x2 * vpt[0] + vpt[4];
    const y2 = g.y2 * vpt[3] + vpt[5];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

const draftKey = (campaignId: string, ar: string) =>
  `imprnt_editor_draft_${campaignId}_${ar}`;

export interface UseFabricEditorOptions {
  campaignId: string;
  aspectRatio: AspectRatio;
  posterUrl: string;
}

export interface UseFabricEditorReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  isReady: boolean;
  hasDraft: boolean;
  selectedType: "text" | "image" | "shape" | "multi" | null;
  activeText: ActiveTextState;
  activeObject: ActiveObjectState;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  restoreDraft: () => void;
  dismissDraft: () => void;
  updateText: (key: keyof ActiveTextState, value: string | number | boolean) => void;
  updateObjectProp: (key: keyof ActiveObjectState, value: number | string) => void;
  addText: () => void;
  addImageFromFile: (file: File) => void;
  addShape: (kind: EditorShapeKind) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  nudgeSelected: (dx: number, dy: number) => void;
  bringForward: () => void;
  sendBackward: () => void;
  replaceImage: (file: File) => void;
  alignSelection: (align: EditorAlign) => void;
  // Zoom / pan
  zoom: number;
  zoomBy: (factor: number) => void;
  zoomFit: () => void;
  // Layers
  objects: EditorObjectSummary[];
  selectObject: (id: string) => void;
  toggleVisible: (id: string) => void;
  toggleLock: (id: string) => void;
  renameObject: (id: string, name: string) => void;
  // Reset / save / download
  resetToBaseline: () => void;
  isSaving: boolean;
  saveError: string | null;
  saveToServer: () => Promise<string | null>;
  downloadPng: () => void;
  loadBlueprint: (layers: BlueprintLayer[], brandAssets: Record<string, string>, backgroundUrl?: string) => Promise<void>;
}

const DEFAULT_TEXT_STATE: ActiveTextState = {
  content: "",
  fontFamily: "Inter",
  fontWeight: "400",
  fontStyle: "normal",
  fill: "#FFFFFF",
  fontSize: 24,
  textAlign: "left",
  shadowEnabled: false,
  shadowColor: "#000000",
  shadowBlur: 4,
  textBackgroundColor: "",
  charSpacing: 0,
  lineHeight: 1.16,
};

const DEFAULT_OBJECT_STATE: ActiveObjectState = {
  opacity: 1,
  fill: "#FF4B00",
};

let layerIdCounter = 0;
const nextLayerId = (prefix: string) => `${prefix}_${Date.now()}_${layerIdCounter++}`;

function defaultLayerName(type: FabricObjectData["layerType"], obj: import("fabric").FabricObject): string {
  if (type === "text") {
    const t = (obj as import("fabric").IText).text ?? "";
    return t.trim() ? (t.length > 22 ? t.slice(0, 22) + "…" : t) : "Text";
  }
  if (type === "background") return "Background";
  if (type === "overlay") return "Overlay";
  if (type === "image") return "Image";
  if (type === "shape") return "Shape";
  return "Layer";
}

export function useFabricEditor({
  campaignId,
  aspectRatio,
  posterUrl,
}: UseFabricEditorOptions): UseFabricEditorReturn {
  // No <canvas> in JSX — we create it programmatically so Fabric can wrap it freely
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const scaleRef = useRef(1);                 // fit-to-viewport scale (zoom baseline)
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const isPausedRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baselineRef = useRef<string | null>(null);   // first clean snapshot for "Reset"
  const isPanningRef = useRef(false);
  const guideLinesRef = useRef<GuideLine[]>([]);

  const [isReady, setIsReady] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [selectedType, setSelectedType] = useState<"text" | "image" | "shape" | "multi" | null>(null);
  const [activeText, setActiveText] = useState<ActiveTextState>(DEFAULT_TEXT_STATE);
  const [activeObject, setActiveObject] = useState<ActiveObjectState>(DEFAULT_OBJECT_STATE);
  const [objects, setObjects] = useState<EditorObjectSummary[]>([]);
  const [zoom, setZoom] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateHistoryButtons = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const pushHistory = useCallback(() => {
    if (isPausedRef.current || !fabricRef.current) return;
    const json = JSON.stringify(fabricRef.current.toObject(["data"]));
    // Truncate future states if we're mid-history
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(json);
    if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
    updateHistoryButtons();
  }, [updateHistoryButtons]);

  const syncTextState = useCallback((obj: import("fabric").IText) => {
    const shadow = obj.shadow as import("fabric").Shadow | null;
    setActiveText({
      content: obj.text ?? "",
      fontFamily: (obj.fontFamily as string) ?? "Inter",
      fontWeight: String(obj.fontWeight ?? "400"),
      fontStyle: (obj.fontStyle as "normal" | "italic") ?? "normal",
      fill: (typeof obj.fill === "string" ? obj.fill : "#FFFFFF"),
      fontSize: (obj.fontSize as number) ?? 24,
      textAlign: (obj.textAlign as "left" | "center" | "right") ?? "left",
      shadowEnabled: !!shadow,
      shadowColor: shadow?.color ?? "#000000",
      shadowBlur: shadow?.blur ?? 4,
      textBackgroundColor: (obj.textBackgroundColor as string) ?? "",
      charSpacing: (obj.charSpacing as number) ?? 0,
      lineHeight: (obj.lineHeight as number) ?? 1.16,
    });
  }, []);

  const syncObjectState = useCallback((obj: import("fabric").FabricObject) => {
    setActiveObject({
      opacity: typeof obj.opacity === "number" ? obj.opacity : 1,
      fill: typeof obj.fill === "string" ? obj.fill : "#FF4B00",
    });
  }, []);

  /** Rebuild the layers-panel list from current canvas objects (top layer first). */
  const refreshObjects = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    const list: EditorObjectSummary[] = [];
    canvas.getObjects().forEach((o) => {
      const d = (o as { data?: FabricObjectData }).data;
      if (!d) return;
      list.push({
        id: d.layerId ?? "",
        name: d.name ?? defaultLayerName(d.layerType, o),
        type: d.layerType,
        visible: o.visible !== false,
        locked: !!d.locked,
        isSelected: active.includes(o),
      });
    });
    list.reverse(); // show top-most layer first
    setObjects(list);
  }, []);

  /** Classify the current selection and sync the property panels. */
  const syncSelection = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length === 0) { setSelectedType(null); refreshObjects(); return; }
    if (active.length > 1) {
      setSelectedType("multi");
      syncObjectState(active[0]);
      refreshObjects();
      return;
    }
    const obj = active[0];
    const d = (obj as { data?: FabricObjectData }).data;
    syncObjectState(obj);
    if (d?.layerType === "text" || obj.type === "i-text") {
      setSelectedType("text");
      syncTextState(obj as import("fabric").IText);
    } else if (d?.layerType === "image" || obj.type === "image") {
      setSelectedType("image");
    } else if (d?.layerType === "shape") {
      setSelectedType("shape");
    } else {
      setSelectedType(null);
    }
    refreshObjects();
  }, [refreshObjects, syncObjectState, syncTextState]);

  // ── Canvas initialization ─────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    import("fabric").then(({ Canvas, Image: FabricImage }) => {
      if (disposed || !containerRef.current) return;

      const container = containerRef.current;
      // Measure the parent .canvasArea (guaranteed flex dimensions); the mount node
      // itself may collapse to 0 before the canvas is appended.
      const measureEl = container.parentElement ?? container;
      const [nW, nH] = NATIVE_DIMS[aspectRatio];
      const containerW = measureEl.clientWidth || window.innerWidth - 360;
      const containerH = measureEl.clientHeight || window.innerHeight - 100;
      const scale = Math.min((containerW - 40) / nW, (containerH - 40) / nH, 1);
      scaleRef.current = scale;

      // Create canvas element programmatically — Fabric wraps it in a div which
      // conflicts with React's DOM reconciliation if we render <canvas> in JSX.
      const canvasEl = document.createElement("canvas");
      container.appendChild(canvasEl);

      const canvas = new Canvas(canvasEl, {
        selection: true,
        preserveObjectStacking: true,
        width: nW * scale,
        height: nH * scale,
      });
      canvas.setZoom(scale);
      setZoom(scale); // keep the toolbar indicator in sync with the fit zoom
      fabricRef.current = canvas;

      // Load real-named web fonts, then redraw so canvas text uses them.
      ensureEditorFontsLoaded().then(() => {
        if (!disposed) canvas.requestRenderAll();
      });

      // Attach event listeners
      const onChange = () => { pushHistory(); refreshObjects(); };
      canvas.on("object:modified", onChange);
      canvas.on("object:added", onChange);
      canvas.on("object:removed", onChange);

      canvas.on("selection:created", syncSelection);
      canvas.on("selection:updated", syncSelection);
      canvas.on("selection:cleared", () => { setSelectedType(null); refreshObjects(); });

      canvas.on("text:changed", (e) => {
        const obj = e.target as import("fabric").IText;
        if (obj) syncTextState(obj);
      });

      // Crisp text resize: convert scale handles into fontSize changes for IText.
      canvas.on("object:scaling", (e) => {
        const obj = e.target as import("fabric").IText | undefined;
        if (!obj || obj.type !== "i-text") return;
        const newSize = Math.max(6, Math.round((obj.fontSize ?? 24) * (obj.scaleX ?? 1)));
        obj.set({ fontSize: newSize, scaleX: 1, scaleY: 1 });
        syncTextState(obj);
      });

      // ── Zoom (wheel) ──────────────────────────────────────────────────────
      canvas.on("mouse:wheel", (opt) => {
        const ev = opt.e as WheelEvent;
        ev.preventDefault();
        ev.stopPropagation();
        const next = Math.min(4, Math.max(0.2, canvas.getZoom() * 0.999 ** ev.deltaY));
        canvas.zoomToPoint({ x: ev.offsetX, y: ev.offsetY } as import("fabric").Point, next);
        setZoom(next);
      });

      // ── Pan (alt-drag or space-drag) ──────────────────────────────────────
      canvas.on("mouse:down", (opt) => {
        const ev = opt.e as MouseEvent;
        if (ev.altKey || isPanningRef.current) {
          canvas.selection = false;
          (canvas as unknown as { _isDragging: boolean; _lastX: number; _lastY: number })._isDragging = true;
          (canvas as unknown as { _lastX: number })._lastX = ev.clientX;
          (canvas as unknown as { _lastY: number })._lastY = ev.clientY;
        }
      });
      canvas.on("mouse:move", (opt) => {
        const c = canvas as unknown as { _isDragging?: boolean; _lastX: number; _lastY: number };
        if (!c._isDragging) return;
        const ev = opt.e as MouseEvent;
        canvas.relativePan({ x: ev.clientX - c._lastX, y: ev.clientY - c._lastY } as import("fabric").Point);
        c._lastX = ev.clientX;
        c._lastY = ev.clientY;
      });
      canvas.on("mouse:up", () => {
        (canvas as unknown as { _isDragging: boolean })._isDragging = false;
        canvas.selection = true;
      });

      // ── Snapping + alignment guides ───────────────────────────────────────
      canvas.on("object:moving", (e) => snapMoving(canvas, e.target as import("fabric").FabricObject, nW, nH, guideLinesRef));
      canvas.on("after:render", () => drawGuides(canvas, guideLinesRef.current));
      canvas.on("mouse:up", () => { guideLinesRef.current = []; canvas.requestRenderAll(); });

      // Load background poster
      FabricImage.fromURL(posterUrl, { crossOrigin: "anonymous" }).then((img) => {
        if (disposed) return;
        img.set({
          left: 0, top: 0,
          originX: "left", originY: "top",
          selectable: false,
          evented: false,
          data: { layerType: "background", layerId: nextLayerId("bg"), name: "Background" } as FabricObjectData,
        });
        img.scaleToWidth(nW); // zoom handles visual scaling — don't multiply by scale
        canvas.add(img);
        canvas.sendObjectToBack(img);
        canvas.renderAll();

        // Check for draft
        const saved = localStorage.getItem(draftKey(campaignId, aspectRatio));
        if (saved) setHasDraft(true);

        // Push initial state + record reset baseline
        isPausedRef.current = false;
        pushHistory();
        baselineRef.current = JSON.stringify(canvas.toObject(["data"]));
        refreshObjects();
        setIsReady(true);
      }).catch((err) => {
        if (disposed) return;
        console.error("Failed to load poster image:", err);
        // Still mark ready even if image fails
        isPausedRef.current = false;
        pushHistory();
        baselineRef.current = JSON.stringify(canvas.toObject(["data"]));
        setIsReady(true);
      });

      // Auto-save draft every 30s
      draftTimerRef.current = setInterval(() => {
        if (fabricRef.current) {
          localStorage.setItem(
            draftKey(campaignId, aspectRatio),
            JSON.stringify(fabricRef.current.toObject(["data"]))
          );
        }
      }, 30_000);
    });

    return () => {
      disposed = true;
      if (draftTimerRef.current) clearInterval(draftTimerRef.current);
      const c = fabricRef.current;
      fabricRef.current = null;
      const mount = containerRef.current;
      // Fabric v6 dispose() is async and tears down the DOM itself; wait for it to
      // settle before wiping the mount node so the two don't race.
      if (c) {
        Promise.resolve(c.dispose())
          .catch(() => {})
          .finally(() => { if (mount) mount.innerHTML = ""; });
      } else if (mount) {
        mount.innerHTML = "";
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── History ───────────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (!fabricRef.current || historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    isPausedRef.current = true;
    fabricRef.current.loadFromJSON(historyRef.current[historyIndexRef.current]).then(() => {
      fabricRef.current!.renderAll();
      isPausedRef.current = false;
      updateHistoryButtons();
    });
  }, [updateHistoryButtons]);

  const redo = useCallback(() => {
    if (!fabricRef.current || historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    isPausedRef.current = true;
    fabricRef.current.loadFromJSON(historyRef.current[historyIndexRef.current]).then(() => {
      fabricRef.current!.renderAll();
      isPausedRef.current = false;
      updateHistoryButtons();
    });
  }, [updateHistoryButtons]);

  // ── Draft ─────────────────────────────────────────────────────────────────

  const restoreDraft = useCallback(() => {
    const saved = localStorage.getItem(draftKey(campaignId, aspectRatio));
    if (!saved || !fabricRef.current) return;
    isPausedRef.current = true;
    fabricRef.current.loadFromJSON(JSON.parse(saved)).then(() => {
      fabricRef.current!.renderAll();
      isPausedRef.current = false;
      setHasDraft(false);
      pushHistory();
    });
  }, [campaignId, aspectRatio, pushHistory]);

  const dismissDraft = useCallback(() => {
    localStorage.removeItem(draftKey(campaignId, aspectRatio));
    setHasDraft(false);
  }, [campaignId, aspectRatio]);

  // ── Text updates ──────────────────────────────────────────────────────────

  const updateText = useCallback((key: keyof ActiveTextState, value: string | number | boolean) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject() as import("fabric").IText | null;
    if (!obj || obj.type !== "i-text") return;

    if (key === "shadowEnabled" || key === "shadowColor" || key === "shadowBlur") {
      const current = obj.shadow as import("fabric").Shadow | null;
      const enabled = key === "shadowEnabled" ? (value as boolean) : (!!current);
      if (!enabled) {
        obj.set("shadow", null);
      } else {
        obj.set("shadow", {
          color: key === "shadowColor" ? (value as string) : (current?.color ?? "#000000"),
          blur: key === "shadowBlur" ? (value as number) : (current?.blur ?? 4),
          offsetX: 2,
          offsetY: 2,
        });
      }
    } else if (key === "content") {
      obj.set("text", value as string);
    } else if (key === "textAlign") {
      obj.set("textAlign", value as string);
    } else if (key === "fill") {
      obj.set("fill", value as string);
    } else if (key === "fontFamily") {
      obj.set("fontFamily", value as string);
      // The face may not be cached yet — load it, then redraw so it actually applies.
      const weight = obj.fontWeight ?? 400;
      document.fonts.load(`${weight} 48px "${value as string}"`).then(() => {
        fabricRef.current?.requestRenderAll();
      });
    } else if (key === "fontWeight") {
      obj.set("fontWeight", value as string);
    } else if (key === "fontStyle") {
      obj.set("fontStyle", value as string);
    } else if (key === "fontSize") {
      obj.set("fontSize", value as number);
    } else if (key === "textBackgroundColor") {
      obj.set("textBackgroundColor", value as string);
    } else if (key === "charSpacing") {
      obj.set("charSpacing", value as number);
    } else if (key === "lineHeight") {
      obj.set("lineHeight", value as number);
    }

    canvas.renderAll();
    setActiveText((prev) => ({ ...prev, [key]: value }));
    pushHistory();
  }, [pushHistory]);

  /** Update a property common to any object type (opacity, shape fill). */
  const updateObjectProp = useCallback((key: keyof ActiveObjectState, value: number | string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const targets = canvas.getActiveObjects();
    if (!targets.length) return;
    targets.forEach((obj) => {
      const data = (obj as { data?: FabricObjectData }).data;
      if (key === "opacity") obj.set("opacity", value as number);
      if (key === "fill" && data?.layerType !== "image") obj.set("fill", value as string);
    });
    canvas.renderAll();
    setActiveObject((prev) => ({ ...prev, [key]: value }));
    pushHistory();
  }, [pushHistory]);

  // ── Object commands ───────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const targets = canvas.getActiveObjects();
    if (!targets.length) return;
    targets.forEach((obj) => {
      const data = (obj as { data?: FabricObjectData }).data;
      if (data?.layerType === "background") return; // never delete the background
      if (data?.locked) return;
      canvas.remove(obj);
    });
    canvas.discardActiveObject();
    canvas.renderAll();
  }, []);

  const duplicateSelected = useCallback(async () => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj || !canvas) return;
    const data = (obj as { data?: FabricObjectData }).data;
    if (data?.layerType === "background") return;
    const cloned = await obj.clone(["data"]);
    cloned.set({ left: (obj.left ?? 0) + 20, top: (obj.top ?? 0) + 20 });
    (cloned as unknown as { data: FabricObjectData }).data = {
      ...(data ?? { layerType: "shape" }),
      layerId: nextLayerId("dup"),
    } as FabricObjectData;
    canvas.add(cloned);
    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
  }, []);

  const nudgeSelected = useCallback((dx: number, dy: number) => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj || !canvas) return;
    obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy });
    obj.setCoords();
    canvas.requestRenderAll();
    pushHistory();
  }, [pushHistory]);

  const bringForward = useCallback(() => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj) return;
    canvas!.bringObjectForward(obj);
    canvas!.renderAll();
    pushHistory();
  }, [pushHistory]);

  const sendBackward = useCallback(() => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj) return;
    canvas!.sendObjectBackwards(obj);
    canvas!.renderAll();
    pushHistory();
  }, [pushHistory]);

  const replaceImage = useCallback((file: File) => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj || !canvas) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      import("fabric").then(({ Image: FabricImage }) => {
        FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" }).then((img) => {
          img.set({
            left: obj.left,
            top: obj.top,
            scaleX: obj.scaleX,
            scaleY: obj.scaleY,
            angle: obj.angle,
            originX: obj.originX,
            originY: obj.originY,
            data: (obj as { data?: FabricObjectData }).data,
          });
          canvas.remove(obj);
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.renderAll();
          pushHistory();
        });
      });
    };
    reader.readAsDataURL(file);
  }, [pushHistory]);

  // ── Add new text ──────────────────────────────────────────────────────────

  const addText = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    import("fabric").then(({ IText }) => {
      const [nW, nH] = NATIVE_DIMS[aspectRatio];
      const obj = new IText("Double-click to edit", {
        left: nW / 2,
        top: nH / 2,
        originX: "center",
        originY: "center",
        fontFamily: "Inter",
        fontSize: 48,
        fontWeight: "700",
        fill: "#FFFFFF",
        textAlign: "center",
      });
      (obj as unknown as { data: FabricObjectData }).data = {
        layerId: nextLayerId("text"),
        layerType: "text",
      };
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.renderAll();
      // Redraw once fonts are ready in case "Inter" wasn't cached yet.
      ensureEditorFontsLoaded().then(() => canvas.requestRenderAll());
    });
  }, [aspectRatio]);

  // ── Add image / shapes ──────────────────────────────────────────────────────

  const addImageFromFile = useCallback((file: File) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const [nW, nH] = NATIVE_DIMS[aspectRatio];
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      import("fabric").then(({ Image: FabricImage }) => {
        FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" }).then((img) => {
          img.scaleToWidth(nW * 0.3);
          img.set({ left: nW / 2, top: nH / 2, originX: "center", originY: "center" });
          (img as unknown as { data: FabricObjectData }).data = {
            layerId: nextLayerId("img"),
            layerType: "image",
          };
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.requestRenderAll();
        });
      });
    };
    reader.readAsDataURL(file);
  }, [aspectRatio]);

  const addShape = useCallback((kind: EditorShapeKind) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const [nW, nH] = NATIVE_DIMS[aspectRatio];
    import("fabric").then(({ Rect, Circle, Line }) => {
      let shape: import("fabric").FabricObject;
      const common = { left: nW / 2, top: nH / 2, originX: "center" as const, originY: "center" as const, fill: "#FF4B00" };
      if (kind === "rect") {
        shape = new Rect({ ...common, width: nW * 0.25, height: nW * 0.15 });
      } else if (kind === "circle") {
        shape = new Circle({ ...common, radius: nW * 0.12 });
      } else {
        shape = new Line([nW * 0.35, nH / 2, nH * 0.65, nH / 2], { stroke: "#FF4B00", strokeWidth: 8, originX: "center", originY: "center" });
      }
      (shape as unknown as { data: FabricObjectData }).data = { layerId: nextLayerId("shape"), layerType: "shape" };
      canvas.add(shape);
      canvas.setActiveObject(shape);
      canvas.requestRenderAll();
    });
  }, [aspectRatio]);

  // ── Multi-select align ───────────────────────────────────────────────────────

  const alignSelection = useCallback((align: EditorAlign) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const sel = canvas.getActiveObject() as import("fabric").ActiveSelection | null;
    if (!sel || canvas.getActiveObjects().length < 2) return;
    const w = sel.width ?? 0;
    const h = sel.height ?? 0;
    // Objects inside an ActiveSelection use coords relative to the selection center.
    sel.getObjects().forEach((o) => {
      const r = o.getBoundingRect();
      if (align === "left") o.set("left", -w / 2 + r.width / 2);
      else if (align === "right") o.set("left", w / 2 - r.width / 2);
      else if (align === "center-h") o.set("left", 0);
      else if (align === "top") o.set("top", -h / 2 + r.height / 2);
      else if (align === "bottom") o.set("top", h / 2 - r.height / 2);
      else if (align === "center-v") o.set("top", 0);
      o.setCoords();
    });
    canvas.requestRenderAll();
    pushHistory();
  }, [pushHistory]);

  // ── Zoom ─────────────────────────────────────────────────────────────────────

  const zoomBy = useCallback((factor: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const next = Math.min(4, Math.max(0.2, canvas.getZoom() * factor));
    const center = { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 } as import("fabric").Point;
    canvas.zoomToPoint(center, next);
    setZoom(next);
  }, []);

  const zoomFit = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setZoom(scaleRef.current);
    setZoom(scaleRef.current);
    canvas.requestRenderAll();
  }, []);

  // ── Layers panel ops ─────────────────────────────────────────────────────────

  const findById = useCallback((id: string) => {
    const canvas = fabricRef.current;
    return canvas?.getObjects().find((o) => (o as { data?: FabricObjectData }).data?.layerId === id) ?? null;
  }, []);

  const selectObject = useCallback((id: string) => {
    const canvas = fabricRef.current;
    const obj = findById(id);
    if (!canvas || !obj) return;
    const d = (obj as { data?: FabricObjectData }).data;
    if (d?.locked || d?.layerType === "background") return;
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    syncSelection();
  }, [findById, syncSelection]);

  const toggleVisible = useCallback((id: string) => {
    const canvas = fabricRef.current;
    const obj = findById(id);
    if (!canvas || !obj) return;
    obj.visible = !obj.visible;
    canvas.requestRenderAll();
    refreshObjects();
    pushHistory();
  }, [findById, refreshObjects, pushHistory]);

  const toggleLock = useCallback((id: string) => {
    const canvas = fabricRef.current;
    const obj = findById(id);
    if (!canvas || !obj) return;
    const d = (obj as { data?: FabricObjectData }).data;
    if (!d) return;
    d.locked = !d.locked;
    obj.selectable = !d.locked;
    obj.evented = !d.locked;
    if (d.locked && canvas.getActiveObjects().includes(obj)) canvas.discardActiveObject();
    canvas.requestRenderAll();
    refreshObjects();
  }, [findById, refreshObjects]);

  const renameObject = useCallback((id: string, name: string) => {
    const obj = findById(id);
    const d = obj && (obj as { data?: FabricObjectData }).data;
    if (!d) return;
    d.name = name;
    refreshObjects();
  }, [findById, refreshObjects]);

  // ── Reset ─────────────────────────────────────────────────────────────────────

  const resetToBaseline = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !baselineRef.current) return;
    isPausedRef.current = true;
    canvas.loadFromJSON(baselineRef.current).then(() => {
      canvas.renderAll();
      isPausedRef.current = false;
      // Reset history to the baseline as the single state.
      historyRef.current = [];
      historyIndexRef.current = -1;
      pushHistory();
      refreshObjects();
      setSelectedType(null);
    });
  }, [pushHistory, refreshObjects]);

  // ── Blueprint loader ──────────────────────────────────────────────────────

  const loadBlueprint = useCallback(async (
    layers: BlueprintLayer[],
    brandAssets: Record<string, string>,
    backgroundUrl?: string
  ) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const [nW, nH] = NATIVE_DIMS[aspectRatio];

    const { IText, Image: FabricImage, Rect, Gradient } = await import("fabric");

    // Make sure the real-named web fonts are ready before we draw text layers.
    await ensureEditorFontsLoaded();

    // Suppress per-object history during the bulk load — we set a single clean
    // baseline at the end instead of a snapshot per added object.
    isPausedRef.current = true;

    // Swap the composited poster (text baked in) for the clean Flux background so
    // the reconstructed editable text doesn't visually duplicate the baked text.
    if (backgroundUrl) {
      const existingBg = canvas.getObjects().find(
        (o) => (o as { data?: FabricObjectData }).data?.layerType === "background"
      );
      try {
        const bg = await FabricImage.fromURL(backgroundUrl, { crossOrigin: "anonymous" });
        // Cover the whole canvas (handles non-square 9:16 / 16:9 from a square bg).
        const coverScale = Math.max(nW / (bg.width ?? nW), nH / (bg.height ?? nH));
        bg.scale(coverScale);
        bg.set({
          left: nW / 2, top: nH / 2,
          originX: "center", originY: "center",
          selectable: false, evented: false,
          data: { layerType: "background", layerId: nextLayerId("bg"), name: "Background" } as FabricObjectData,
        });
        if (existingBg) canvas.remove(existingBg);
        canvas.add(bg);
        canvas.sendObjectToBack(bg);
      } catch {
        // keep the composited poster if the clean background fails to load
      }
    }

    const sorted = [...layers].sort((a, b) => a.z_index - b.z_index);

    for (const layer of sorted) {
      const ml = layer.margin?.left ?? 0;
      const mt = layer.margin?.top ?? 0;
      const mr = layer.margin?.right ?? 0;
      const mb = layer.margin?.bottom ?? 0;

      type PosEntry = { left: number; top: number; originX: "left" | "right" | "center"; originY: "top" | "bottom" | "center" };
      const posMap: Record<string, PosEntry> = {
        "top-left":      { left: ml,      top: mt,      originX: "left",   originY: "top"    },
        "top-center":    { left: nW / 2,  top: mt,      originX: "center", originY: "top"    },
        "top-right":     { left: nW - mr, top: mt,      originX: "right",  originY: "top"    },
        "center-left":   { left: ml,      top: nH / 2,  originX: "left",   originY: "center" },
        "center":        { left: nW / 2,  top: nH / 2,  originX: "center", originY: "center" },
        "center-right":  { left: nW - mr, top: nH / 2,  originX: "right",  originY: "center" },
        "bottom-left":   { left: ml,      top: nH - mb, originX: "left",   originY: "bottom" },
        "bottom-center": { left: nW / 2,  top: nH - mb, originX: "center", originY: "bottom" },
        "bottom-right":  { left: nW - mr, top: nH - mb, originX: "right",  originY: "bottom" },
      };

      const pos = posMap[layer.position ?? "center"] ?? posMap["center"];
      const data: FabricObjectData = { layerId: layer.id, layerType: layer.type };

      if (layer.type === "text" && layer.content) {
        let text = layer.content;
        if (layer.text_transform === "uppercase") text = text.toUpperCase();
        if (layer.text_transform === "lowercase") text = text.toLowerCase();

        const obj = new IText(text, {
          left: pos.left,
          top: pos.top,
          originX: pos.originX,
          originY: pos.originY,
          fontFamily: layer.font_family ?? "Inter",
          fontSize: layer.font_size ?? 24,
          fontWeight: String(layer.font_weight ?? 400),
          fill: layer.color ?? "#FFFFFF",
          textAlign: (layer.style?.textAlign ?? "left") as "left" | "center" | "right",
        });
        (obj as unknown as { data: FabricObjectData }).data = data;
        canvas.add(obj);

      } else if (layer.type === "image" && layer.asset_key) {
        const assetUrl = brandAssets[layer.asset_key];
        if (!assetUrl) continue;
        try {
          const img = await FabricImage.fromURL(assetUrl, { crossOrigin: "anonymous" });
          const targetW = (layer.size?.width && layer.size.width !== "auto")
            ? Number(layer.size.width)
            : nW * 0.3;
          img.scaleToWidth(targetW);
          img.set({
            left: pos.left,
            top: pos.top,
            originX: pos.originX,
            originY: pos.originY,
          });
          (img as unknown as { data: FabricObjectData }).data = { ...data, assetKey: layer.asset_key };
          canvas.add(img);
        } catch {
          // skip failed asset
        }

      } else if (layer.type === "overlay") {
        // The overlay's darkness lives in its CSS background (usually a gradient).
        // Convert it to a real Fabric fill; skip entirely if it isn't parseable so
        // we never draw an opaque black box.
        const fill = cssBackgroundToFabricFill(
          Gradient,
          layer.style?.background ?? layer.background_color,
          nW,
          nH
        );
        if (!fill) continue;

        const rect = new Rect({
          left: 0, top: 0,
          width: nW,
          height: nH,
          fill: fill as string,
          opacity: layer.style?.opacity ? parseFloat(layer.style.opacity) : 1,
        });
        (rect as unknown as { data: FabricObjectData }).data = data;
        canvas.add(rect);
        // Sit just above the background image, beneath text/image layers.
        const bg = canvas.getObjects().find(
          (o) => (o as { data?: FabricObjectData }).data?.layerType === "background"
        );
        canvas.sendObjectToBack(rect);
        if (bg) canvas.sendObjectToBack(bg);
      }
    }

    canvas.renderAll();

    // The fully-reconstructed poster is the clean undo + reset baseline.
    historyRef.current = [];
    historyIndexRef.current = -1;
    isPausedRef.current = false;
    pushHistory();
    baselineRef.current = JSON.stringify(canvas.toObject(["data"]));
    refreshObjects();
  }, [aspectRatio, pushHistory, refreshObjects]);

  // ── Export / save / download ───────────────────────────────────────────────

  /** Export at native resolution regardless of current zoom/pan, then restore view. */
  const exportNativePng = useCallback((): string | null => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    const savedVpt = canvas.viewportTransform ? [...canvas.viewportTransform] : null;
    const savedZoom = canvas.getZoom();
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setZoom(scaleRef.current);
    // At fit-zoom the on-screen canvas equals nW*scale; multiplier 1/scale → native px.
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 / scaleRef.current });
    if (savedVpt) canvas.setViewportTransform(savedVpt as import("fabric").TMat2D);
    canvas.setZoom(savedZoom);
    canvas.requestRenderAll();
    return dataUrl;
  }, []);

  const saveToServer = useCallback(async (): Promise<string | null> => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    setIsSaving(true);
    setSaveError(null);
    try {
      const dataUrl = exportNativePng();
      if (!dataUrl) return null;
      const { url } = await saveEditorExport(campaignId, dataUrl, aspectRatio);
      localStorage.removeItem(draftKey(campaignId, aspectRatio));
      return url;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [campaignId, aspectRatio, exportNativePng]);

  const downloadPng = useCallback(() => {
    const dataUrl = exportNativePng();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `imprnt_${campaignId}_${aspectRatio.replace(":", "x")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [campaignId, aspectRatio, exportNativePng]);

  return {
    containerRef,
    isReady,
    hasDraft,
    selectedType,
    activeText,
    activeObject,
    canUndo,
    canRedo,
    undo,
    redo,
    restoreDraft,
    dismissDraft,
    updateText,
    updateObjectProp,
    addText,
    addImageFromFile,
    addShape,
    deleteSelected,
    duplicateSelected,
    nudgeSelected,
    bringForward,
    sendBackward,
    replaceImage,
    alignSelection,
    zoom,
    zoomBy,
    zoomFit,
    objects,
    selectObject,
    toggleVisible,
    toggleLock,
    renameObject,
    resetToBaseline,
    isSaving,
    saveError,
    saveToServer,
    downloadPng,
    loadBlueprint,
  };
}
