"use client";

import {
  Undo2, Redo2, Trash2, BringToFront, SendToBack, ImagePlus, Save, Check,
  Type, Copy, Square, Circle, Minus, ZoomIn, ZoomOut, Maximize, Download, RotateCcw,
} from "lucide-react";
import { useRef, useState } from "react";
import type { EditorShapeKind } from "@/lib/types";
import styles from "./EditorToolbar.module.css";

interface Props {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddText: () => void;
  onAddImage: (file: File) => void;
  onAddShape: (kind: EditorShapeKind) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onReplaceImage: (file: File) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onReset: () => void;
  onDownload: () => void;
  onSave: () => Promise<string | null>;
  isSaving: boolean;
  saveError: string | null;
}

export function EditorToolbar(props: Props) {
  const {
    onUndo, onRedo, canUndo, canRedo,
    onAddText, onAddImage, onAddShape, onDuplicate,
    onDelete, onBringForward, onSendBackward,
    zoom, onZoomIn, onZoomOut, onZoomFit, onReset, onDownload,
    onSave, isSaving, saveError,
  } = props;

  const addImgRef = useRef<HTMLInputElement>(null);
  const [shapeOpen, setShapeOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const url = await onSave();
    if (url) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <button className={styles.btn} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
        <button className={styles.btn} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"><Redo2 size={16} /></button>
      </div>

      <div className={styles.divider} />

      <div className={styles.group}>
        <button className={styles.btnAdd} onClick={onAddText} title="Add text layer">
          <Type size={16} /><span>Text</span>
        </button>
        <button className={styles.btnAdd} onClick={() => addImgRef.current?.click()} title="Add image">
          <ImagePlus size={16} /><span>Image</span>
        </button>
        <input ref={addImgRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddImage(f); e.target.value = ""; }} />

        <div className={styles.shapeWrap}>
          <button className={styles.btnAdd} onClick={() => setShapeOpen((v) => !v)} title="Add shape">
            <Square size={16} /><span>Shape</span>
          </button>
          {shapeOpen && (
            <div className={styles.shapeMenu} onMouseLeave={() => setShapeOpen(false)}>
              <button onClick={() => { onAddShape("rect"); setShapeOpen(false); }}><Square size={14} /> Rectangle</button>
              <button onClick={() => { onAddShape("circle"); setShapeOpen(false); }}><Circle size={14} /> Circle</button>
              <button onClick={() => { onAddShape("line"); setShapeOpen(false); }}><Minus size={14} /> Line</button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.group}>
        <button className={styles.btn} onClick={onDuplicate} title="Duplicate (Ctrl+D)"><Copy size={16} /></button>
        <button className={styles.btn} onClick={onDelete} title="Delete (Del)"><Trash2 size={16} /></button>
        <button className={styles.btn} onClick={onBringForward} title="Bring forward"><BringToFront size={16} /></button>
        <button className={styles.btn} onClick={onSendBackward} title="Send backward"><SendToBack size={16} /></button>
      </div>

      <div className={styles.divider} />

      <div className={styles.group}>
        <button className={styles.btn} onClick={onZoomOut} title="Zoom out"><ZoomOut size={16} /></button>
        <button className={styles.zoomLabel} onClick={onZoomFit} title="Fit to screen">{Math.round(zoom * 100)}%</button>
        <button className={styles.btn} onClick={onZoomIn} title="Zoom in"><ZoomIn size={16} /></button>
        <button className={styles.btn} onClick={onZoomFit} title="Fit to screen"><Maximize size={16} /></button>
      </div>

      <div className={styles.spacer} />

      {saveError && <span className={styles.saveError}>{saveError}</span>}

      <div className={styles.group}>
        <button className={styles.btn} onClick={onReset} title="Reset to original"><RotateCcw size={16} /></button>
        <button className={styles.btn} onClick={onDownload} title="Download PNG"><Download size={16} /></button>
      </div>

      <button className={`${styles.btnPrimary} ${saved ? styles.btnSaved : ""}`} onClick={handleSave} disabled={isSaving} title="Save edited poster">
        {saved ? <Check size={16} /> : <Save size={16} />}
        <span>{isSaving ? "Saving…" : saved ? "Saved!" : "Save"}</span>
      </button>
    </div>
  );
}
