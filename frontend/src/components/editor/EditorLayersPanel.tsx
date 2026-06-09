"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, Unlock, Type, ImageIcon, Square, Layers as LayersIcon } from "lucide-react";
import type { EditorObjectSummary, EditorLayerType } from "@/lib/types";
import styles from "./EditorLayersPanel.module.css";

interface Props {
  objects: EditorObjectSummary[];
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function typeIcon(type: EditorLayerType) {
  if (type === "text") return <Type size={13} />;
  if (type === "image") return <ImageIcon size={13} />;
  if (type === "shape") return <Square size={13} />;
  if (type === "overlay") return <LayersIcon size={13} />;
  return <ImageIcon size={13} />;
}

export function EditorLayersPanel({ objects, onSelect, onToggleVisible, onToggleLock, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <LayersIcon size={14} />
        <span>Layers</span>
      </div>
      <div className={styles.list}>
        {objects.length === 0 && <p className={styles.empty}>No layers yet.</p>}
        {objects.map((o) => {
          const isBg = o.type === "background";
          return (
            <div
              key={o.id}
              className={`${styles.row} ${o.isSelected ? styles.selected : ""}`}
              onClick={() => !isBg && onSelect(o.id)}
              tabIndex={isBg ? -1 : 0}
              role="row"
              aria-selected={o.isSelected}
              onKeyDown={(e) => {
                if (isBg) return;
                if (e.key === "Enter") { e.preventDefault(); onSelect(o.id); }
                if (e.key === "F2") { e.preventDefault(); setEditingId(o.id); setDraft(o.name); }
              }}
            >
              <span className={styles.icon}>{typeIcon(o.type)}</span>

              {editingId === o.id ? (
                <input
                  className={styles.renameInput}
                  value={draft}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => { onRename(o.id, draft.trim() || o.name); setEditingId(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { onRename(o.id, draft.trim() || o.name); setEditingId(null); } }}
                />
              ) : (
                <span
                  className={styles.name}
                  onDoubleClick={(e) => { e.stopPropagation(); if (!isBg) { setEditingId(o.id); setDraft(o.name); } }}
                  title={o.name}
                >
                  {o.name}
                </span>
              )}

              <button
                className={styles.iconBtn}
                onClick={(e) => { e.stopPropagation(); onToggleVisible(o.id); }}
                title={o.visible ? "Hide" : "Show"}
              >
                {o.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              {!isBg && (
                <button
                  className={styles.iconBtn}
                  onClick={(e) => { e.stopPropagation(); onToggleLock(o.id); }}
                  title={o.locked ? "Unlock" : "Lock"}
                >
                  {o.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
