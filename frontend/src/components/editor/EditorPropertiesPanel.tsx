"use client";

import { HexColorPicker } from "react-colorful";
import { useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd } from "lucide-react";
import { EDITOR_FONTS } from "./useFabricEditor";
import type { ActiveTextState, ActiveObjectState, EditorAlign } from "@/lib/types";
import styles from "./EditorPropertiesPanel.module.css";

interface Props {
  selectedType: "text" | "image" | "shape" | "multi" | null;
  activeText: ActiveTextState;
  activeObject: ActiveObjectState;
  onTextChange: (key: keyof ActiveTextState, value: string | number | boolean) => void;
  onObjectChange: (key: keyof ActiveObjectState, value: number | string) => void;
  onReplaceImage: (file: File) => void;
  onAlign: (align: EditorAlign) => void;
}

function OpacityRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Opacity</span>
      <div className={styles.sliderRow}>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(value * 100)}
          className={styles.slider}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
        />
        <span className={styles.sliderValue}>{Math.round(value * 100)}</span>
      </div>
    </div>
  );
}

export function EditorPropertiesPanel({
  selectedType, activeText, activeObject, onTextChange, onObjectChange, onReplaceImage, onAlign,
}: Props) {
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showShadowPicker, setShowShadowPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showShapeFill, setShowShapeFill] = useState(false);

  if (selectedType === "multi") {
    return (
      <aside className={styles.panel}>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Align (in selection)</span>
          <div className={styles.toggleGroup}>
            <button className={styles.toggleBtn} onClick={() => onAlign("left")} title="Align left"><AlignLeft size={14} /></button>
            <button className={styles.toggleBtn} onClick={() => onAlign("center-h")} title="Center horizontally"><AlignCenter size={14} /></button>
            <button className={styles.toggleBtn} onClick={() => onAlign("right")} title="Align right"><AlignRight size={14} /></button>
          </div>
          <div className={styles.toggleGroup} style={{ marginTop: "var(--space-2)" }}>
            <button className={styles.toggleBtn} onClick={() => onAlign("top")} title="Align top"><AlignVerticalJustifyStart size={14} /></button>
            <button className={styles.toggleBtn} onClick={() => onAlign("center-v")} title="Center vertically"><AlignVerticalJustifyCenter size={14} /></button>
            <button className={styles.toggleBtn} onClick={() => onAlign("bottom")} title="Align bottom"><AlignVerticalJustifyEnd size={14} /></button>
          </div>
        </div>
        <OpacityRow value={activeObject.opacity} onChange={(v) => onObjectChange("opacity", v)} />
        <p className={styles.hint}>{`Multiple objects selected. Drag to move them together.`}</p>
      </aside>
    );
  }

  if (selectedType === "text") {
    return (
      <aside className={styles.panel}>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Font</span>
          <select
            className={styles.select}
            value={activeText.fontFamily}
            onChange={(e) => onTextChange("fontFamily", e.target.value)}
          >
            {EDITOR_FONTS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Size</span>
          <input
            type="number"
            min={6}
            max={400}
            className={styles.numberInput}
            value={activeText.fontSize}
            onChange={(e) => onTextChange("fontSize", Number(e.target.value))}
          />
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Style</span>
          <div className={styles.toggleGroup}>
            {(["400", "600", "700"] as const).map((w) => (
              <button
                key={w}
                className={`${styles.toggleBtn} ${activeText.fontWeight === w ? styles.active : ""}`}
                onClick={() => onTextChange("fontWeight", w)}
                style={{ fontWeight: w }}
              >
                {w === "400" ? "Reg" : w === "600" ? "Sem" : "Bold"}
              </button>
            ))}
            <button
              className={`${styles.toggleBtn} ${activeText.fontStyle === "italic" ? styles.active : ""}`}
              style={{ fontStyle: "italic" }}
              onClick={() => onTextChange("fontStyle", activeText.fontStyle === "italic" ? "normal" : "italic")}
            >
              I
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Align</span>
          <div className={styles.toggleGroup}>
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                className={`${styles.toggleBtn} ${activeText.textAlign === a ? styles.active : ""}`}
                onClick={() => onTextChange("textAlign", a)}
              >
                {a === "left" ? "L" : a === "center" ? "C" : "R"}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Color</span>
          <div className={styles.colorRow}>
            <button
              className={styles.colorSwatch}
              style={{ background: activeText.fill }}
              onClick={() => setShowFillPicker((v) => !v)}
              aria-label="Pick text color"
            />
            <span className={styles.colorHex}>{activeText.fill}</span>
          </div>
          {showFillPicker && (
            <div className={styles.pickerWrap}>
              <HexColorPicker color={activeText.fill} onChange={(c) => onTextChange("fill", c)} />
            </div>
          )}
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Highlight</span>
          <div className={styles.colorRow}>
            <button
              className={styles.colorSwatch}
              style={{ background: activeText.textBackgroundColor || "transparent", backgroundImage: activeText.textBackgroundColor ? "none" : "repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50% / 10px 10px" }}
              onClick={() => setShowHighlightPicker((v) => !v)}
              aria-label="Pick highlight color"
            />
            <span className={styles.colorHex}>{activeText.textBackgroundColor || "none"}</span>
            {activeText.textBackgroundColor && (
              <button className={styles.clearBtn} onClick={() => onTextChange("textBackgroundColor", "")}>clear</button>
            )}
          </div>
          {showHighlightPicker && (
            <div className={styles.pickerWrap}>
              <HexColorPicker color={activeText.textBackgroundColor || "#000000"} onChange={(c) => onTextChange("textBackgroundColor", c)} />
            </div>
          )}
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Letter spacing</span>
          <div className={styles.sliderRow}>
            <input type="range" min={-100} max={800} value={activeText.charSpacing} className={styles.slider}
              onChange={(e) => onTextChange("charSpacing", Number(e.target.value))} />
            <span className={styles.sliderValue}>{activeText.charSpacing}</span>
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Line height</span>
          <div className={styles.sliderRow}>
            <input type="range" min={0.6} max={3} step={0.05} value={activeText.lineHeight} className={styles.slider}
              onChange={(e) => onTextChange("lineHeight", Number(e.target.value))} />
            <span className={styles.sliderValue}>{activeText.lineHeight.toFixed(2)}</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.shadowHeader}>
            <span className={styles.sectionLabel}>Shadow</span>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={activeText.shadowEnabled}
                onChange={(e) => onTextChange("shadowEnabled", e.target.checked)}
              />
              <span className={styles.switchTrack} />
            </label>
          </div>
          {activeText.shadowEnabled && (
            <>
              <div className={styles.colorRow} style={{ marginTop: "var(--space-2)" }}>
                <button
                  className={styles.colorSwatch}
                  style={{ background: activeText.shadowColor }}
                  onClick={() => setShowShadowPicker((v) => !v)}
                  aria-label="Pick shadow color"
                />
                <span className={styles.colorHex}>{activeText.shadowColor}</span>
              </div>
              {showShadowPicker && (
                <div className={styles.pickerWrap}>
                  <HexColorPicker color={activeText.shadowColor} onChange={(c) => onTextChange("shadowColor", c)} />
                </div>
              )}
              <div className={styles.sliderRow}>
                <span className={styles.sliderLabel}>Blur</span>
                <input type="range" min={0} max={30} value={activeText.shadowBlur} className={styles.slider}
                  onChange={(e) => onTextChange("shadowBlur", Number(e.target.value))} />
                <span className={styles.sliderValue}>{activeText.shadowBlur}</span>
              </div>
            </>
          )}
        </div>

        <OpacityRow value={activeObject.opacity} onChange={(v) => onObjectChange("opacity", v)} />
      </aside>
    );
  }

  if (selectedType === "shape") {
    return (
      <aside className={styles.panel}>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Fill</span>
          <div className={styles.colorRow}>
            <button className={styles.colorSwatch} style={{ background: activeObject.fill }} onClick={() => setShowShapeFill((v) => !v)} aria-label="Pick shape color" />
            <span className={styles.colorHex}>{activeObject.fill}</span>
          </div>
          {showShapeFill && (
            <div className={styles.pickerWrap}>
              <HexColorPicker color={activeObject.fill} onChange={(c) => onObjectChange("fill", c)} />
            </div>
          )}
        </div>
        <OpacityRow value={activeObject.opacity} onChange={(v) => onObjectChange("opacity", v)} />
        <p className={styles.hint}>Drag to move. Use corner handles to resize.</p>
      </aside>
    );
  }

  if (selectedType === "image") {
    return (
      <aside className={styles.panel}>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Image</span>
          <label className={styles.replaceBtn}>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onReplaceImage(file);
                e.target.value = "";
              }}
            />
            Replace Image
          </label>
        </div>
        <OpacityRow value={activeObject.opacity} onChange={(v) => onObjectChange("opacity", v)} />
        <p className={styles.hint}>Drag the image to reposition. Use corner handles to resize.</p>
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      <p className={styles.hint}>Select an object on the canvas to edit its properties.</p>
      <p className={styles.hint} style={{ marginTop: "var(--space-3)" }}>Double-click text to edit inline.</p>
    </aside>
  );
}
