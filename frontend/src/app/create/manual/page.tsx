"use client";

import React, { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  Loader2,
  Check,
  UploadCloud,
} from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { motion, AnimatePresence } from "framer-motion";
import styles from "../create.module.css";
import { submitManualBrand } from "@/lib/api";
import type { ManualBrandPayload } from "@/lib/types";

/* ───────────────────── Constants ───────────────────── */

const STEP_TITLES = [
  "Brand Info",
  "Colors",
  "Typography",
  "Font Preview",
  "Voice & Personality",
  "Review & Logo",
];

const PERSONALITY_PRESETS = [
  "Bold", "Energetic", "Youthful", "Rebellious", "Elegant",
  "Playful", "Minimal", "Luxurious", "Friendly", "Professional",
  "Trustworthy", "Innovative", "Edgy", "Warm", "Sophisticated",
];

const HEADING_FONTS_EN = [
  "Anton", "Bebas Neue", "Oswald", "Poppins", "Montserrat",
  "Playfair Display", "Raleway", "Roboto Slab", "DM Sans",
];

const BODY_FONTS_EN = [
  "Inter", "Roboto", "Open Sans", "Lato", "Nunito Sans",
  "Source Sans 3", "DM Sans", "Work Sans",
];

const HEADING_FONTS_BN = ["Hind Siliguri", "Noto Sans Bengali"];
const BODY_FONTS_BN = ["Hind Siliguri", "Noto Sans Bengali"];

const FORMALITY_OPTIONS = ["Formal", "Semi-formal", "Informal", "Street"];
const LANGUAGE_OPTIONS: { value: "en" | "bn" | "both"; label: string }[] = [
  { value: "en", label: "English" },
  { value: "bn", label: "Bengali" },
  { value: "both", label: "Both" },
];

/* ───────────────────── Types ───────────────────── */

interface FormState {
  brand_name: string;
  tagline: string;
  tagline_bn: string;
  industry: string;
  target_audience: string;
  primary: string;
  secondary: string;
  accent: string;
  palette: string[];
  heading_font: string;
  heading_font_bn: string;
  body_font: string;
  body_font_bn: string;
  tone: string;
  language: "en" | "bn" | "both";
  formality: string;
  brand_personality: string[];
  do_not_use: string[];
  logo_file: File | null;
  logo_base64: string | null;
  logo_content_type: string;
}

const INITIAL_FORM: FormState = {
  brand_name: "",
  tagline: "",
  tagline_bn: "",
  industry: "",
  target_audience: "",
  primary: "#FF4B00",
  secondary: "#0D0D0D",
  accent: "#FFFFFF",
  palette: ["#FF4B00", "#0D0D0D", "#FFFFFF"],
  heading_font: "Anton",
  heading_font_bn: "Hind Siliguri",
  body_font: "Inter",
  body_font_bn: "Noto Sans Bengali",
  tone: "",
  language: "both",
  formality: "Informal",
  brand_personality: [],
  do_not_use: [""],
  logo_file: null,
  logo_base64: null,
  logo_content_type: "image/png",
};

/* ───────────────────── Helpers ───────────────────── */

const isValidHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s);

/* ───────────────────── Component ───────────────────── */

export default function ManualBrandPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM });
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const totalSteps = STEP_TITLES.length;

  /* ── Form setters ── */
  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /* ── Color picker toggle ── */
  const togglePicker = useCallback(
    (id: string) => setOpenPicker((p) => (p === id ? null : id)),
    [],
  );

  /* ── Logo handler ── */
  const handleLogoFile = useCallback(
    (file: File) => {
      set("logo_file", file);
      set("logo_content_type", file.type || "image/png");
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Strip the data:image/...;base64, prefix
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
        set("logo_base64", base64);
      };
      reader.readAsDataURL(file);
    },
    [set],
  );

  /* ── Submit ── */
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: ManualBrandPayload = {
        brand_name: form.brand_name,
        tagline: form.tagline,
        tagline_bn: form.tagline_bn || null,
        industry: form.industry,
        target_audience: form.target_audience,
        brand_personality: form.brand_personality,
        colors: {
          primary: form.primary,
          secondary: form.secondary,
          accent: form.accent,
          palette:
            form.palette.length > 0
              ? form.palette.filter(isValidHex)
              : [form.primary, form.secondary, form.accent],
        },
        typography: {
          heading_font: form.heading_font,
          heading_font_bn: form.heading_font_bn,
          body_font: form.body_font,
          body_font_bn: form.body_font_bn,
        },
        voice: {
          tone: form.tone,
          language: form.language,
          formality: form.formality,
        },
        do_not_use: form.do_not_use.filter((s) => s.trim() !== ""),
        logo_base64: form.logo_base64,
        logo_content_type: form.logo_content_type,
        product_image_url: null,
      };

      const res = await submitManualBrand(payload);
      setBrandId(res.brand_id);
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Navigation helpers ── */
  const canGoNext = (): boolean => {
    switch (step) {
      case 0:
        return !!(
          form.brand_name.trim() &&
          form.tagline.trim() &&
          form.industry.trim() &&
          form.target_audience.trim()
        );
      case 1:
        return isValidHex(form.primary) && isValidHex(form.secondary) && isValidHex(form.accent);
      case 2:
        return !!(form.heading_font && form.body_font && form.heading_font_bn && form.body_font_bn);
      case 3:
        return true; // preview only
      case 4:
        return !!(
          form.tone.trim() &&
          form.brand_personality.length >= 3 &&
          form.do_not_use.filter((s) => s.trim()).length >= 2
        );
      case 5:
        return true; // logo is optional
      default:
        return false;
    }
  };

  const goNext = () => {
    if (step < totalSteps - 1) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  /* ── Render success ── */
  if (submitted && brandId) {
    return (
      <div className={styles.container}>
        <nav className={styles.backNav}>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={15} /> Imprnt AI
          </Link>
        </nav>
        <header className={styles.header}>
          <h1 className={styles.title}>Brand Created!</h1>
          <p className={styles.subtitle}>
            Your brand profile is ready. Start creating campaigns.
          </p>
        </header>
        <div className={`${styles.content} ${styles.successPulse}`}>
          <h2 className={styles.cardTitle} style={{ color: "var(--color-primary)" }}>
            <Check size={28} /> {form.brand_name}
          </h2>
          <p className={styles.stepDescription}>
            Brand ID: <code style={{ color: "var(--color-accent)" }}>{brandId}</code>
          </p>
          <div className={styles.actions}>
            <Link href="/create" className={styles.button}>
              Back to Create
            </Link>
            <Link
              href={`/create?brand_id=${brandId}`}
              className={`${styles.button} ${styles.buttonPrimary}`}
            >
              Start Campaign <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── Render stepper ── */
  const renderStepper = () => (
    <div className={styles.manualStepper}>
      {STEP_TITLES.map((title, idx) => (
        <React.Fragment key={title}>
          {idx > 0 && (
            <div
              className={`${styles.manualStepConnector} ${
                idx <= step ? styles.manualStepConnectorDone : ""
              }`}
            />
          )}
          <button
            className={`${styles.manualStepDot} ${
              idx === step
                ? styles.manualStepDotActive
                : idx < step
                ? styles.manualStepDotCompleted
                : ""
            }`}
            onClick={() => idx <= step && setStep(idx)}
            title={title}
            aria-label={`Step ${idx + 1}: ${title}`}
          />
        </React.Fragment>
      ))}
    </div>
  );

  /* ── Color field helper ── */
  const renderColorField = (label: string, colorKey: "primary" | "secondary" | "accent") => (
    <div className={styles.colorPickerGroup}>
      <label className={styles.label}>{label}</label>
      <div
        className={styles.colorSwatchRow}
        onClick={() => togglePicker(colorKey)}
      >
        <div
          className={`${styles.colorSwatch} ${
            openPicker === colorKey ? styles.colorSwatchActive : ""
          }`}
          style={{ background: form[colorKey] }}
        />
        <input
          className={styles.colorHexInput}
          value={form[colorKey]}
          onChange={(e) => {
            let v = e.target.value;
            if (!v.startsWith("#")) v = "#" + v;
            set(colorKey, v.slice(0, 7));
          }}
          onClick={(e) => e.stopPropagation()}
          maxLength={7}
        />
      </div>
      {openPicker === colorKey && (
        <div className={styles.colorPopover}>
          <HexColorPicker
            color={form[colorKey]}
            onChange={(c) => set(colorKey, c)}
          />
        </div>
      )}
    </div>
  );

  /* ── Steps ── */
  const renderStep = () => {
    switch (step) {
      /* ── Step 1: Brand Info ── */
      case 0:
        return (
          <div>
            <h2 className={styles.cardTitle}>1. Brand Info</h2>
            <p className={styles.stepDescription}>
              Tell us about your brand — name, tagline, industry, and target audience.
            </p>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Brand Name *</label>
              <input
                className={styles.textInput}
                value={form.brand_name}
                onChange={(e) => set("brand_name", e.target.value)}
                placeholder="e.g. Volt BD"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Tagline (English) *</label>
                <input
                  className={styles.textInput}
                  value={form.tagline}
                  onChange={(e) => set("tagline", e.target.value)}
                  placeholder="e.g. Stay Focused. Recharge."
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>
                  Tagline (Bengali){" "}
                  <span className={styles.optionalTag}>Optional</span>
                </label>
                <input
                  className={styles.textInput}
                  value={form.tagline_bn}
                  onChange={(e) => set("tagline_bn", e.target.value)}
                  placeholder="e.g. মনোযোগ রাখো। রিচার্জ হও।"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Industry *</label>
                <input
                  className={styles.textInput}
                  value={form.industry}
                  onChange={(e) => set("industry", e.target.value)}
                  placeholder="e.g. Beverages / Energy Drink"
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Target Audience *</label>
                <input
                  className={styles.textInput}
                  value={form.target_audience}
                  onChange={(e) => set("target_audience", e.target.value)}
                  placeholder="e.g. Young adults 18-30, urban Bangladesh"
                />
              </div>
            </div>
          </div>
        );

      /* ── Step 2: Colors ── */
      case 1:
        return (
          <div>
            <h2 className={styles.cardTitle}>2. Brand Colors</h2>
            <p className={styles.stepDescription}>
              Define your brand&apos;s primary, secondary, and accent colors.
              Click a swatch to open the color picker.
            </p>

            <div className={styles.colorGrid}>
              {renderColorField("Primary Color", "primary")}
              {renderColorField("Secondary Color", "secondary")}
              {renderColorField("Accent Color", "accent")}
            </div>

            <div className={styles.inputGroup} style={{ marginTop: "var(--space-8)" }}>
              <label className={styles.label}>Color Palette</label>
              <div className={styles.paletteRow}>
                {form.palette.map((color, idx) => (
                  <div
                    key={idx}
                    className={styles.paletteSwatch}
                    style={{ background: color }}
                    title={color}
                  >
                    {form.palette.length > 1 && (
                      <button
                        className={styles.paletteSwatchRemove}
                        onClick={() => {
                          const next = form.palette.filter((_, i) => i !== idx);
                          set("palette", next);
                        }}
                        aria-label={`Remove ${color}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className={styles.addButton}
                  onClick={() => {
                    set("palette", [...form.palette, "#888888"]);
                  }}
                >
                  <Plus size={14} /> Add color
                </button>
              </div>
            </div>
          </div>
        );

      /* ── Step 3: Typography ── */
      case 2:
        return (
          <div>
            <h2 className={styles.cardTitle}>3. Typography</h2>
            <p className={styles.stepDescription}>
              Choose fonts for headings and body text in English and Bengali.
            </p>

            <div className={styles.formRow}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Heading Font (English)</label>
                <select
                  className={styles.selectInput}
                  value={form.heading_font}
                  onChange={(e) => set("heading_font", e.target.value)}
                >
                  {HEADING_FONTS_EN.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Heading Font (Bengali)</label>
                <select
                  className={styles.selectInput}
                  value={form.heading_font_bn}
                  onChange={(e) => set("heading_font_bn", e.target.value)}
                >
                  {HEADING_FONTS_BN.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Body Font (English)</label>
                <select
                  className={styles.selectInput}
                  value={form.body_font}
                  onChange={(e) => set("body_font", e.target.value)}
                >
                  {BODY_FONTS_EN.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Body Font (Bengali)</label>
                <select
                  className={styles.selectInput}
                  value={form.body_font_bn}
                  onChange={(e) => set("body_font_bn", e.target.value)}
                >
                  {BODY_FONTS_BN.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );

      /* ── Step 4: Font Preview ── */
      case 3:
        return (
          <div>
            <h2 className={styles.cardTitle}>4. Font Preview</h2>
            <p className={styles.stepDescription}>
              See how your selected fonts look with sample text.
            </p>

            <div className={styles.fontPreviewGrid}>
              <div className={styles.fontPreviewCard}>
                <span className={styles.fontPreviewLabel}>
                  Heading — English ({form.heading_font})
                </span>
                <p
                  className={styles.fontPreviewText}
                  style={{ fontFamily: `var(--font-heading-en)` }}
                >
                  {form.brand_name || "Brand Name"}
                </p>
              </div>

              <div className={styles.fontPreviewCard}>
                <span className={styles.fontPreviewLabel}>
                  Heading — Bengali ({form.heading_font_bn})
                </span>
                <p
                  className={styles.fontPreviewText}
                  style={{ fontFamily: `var(--font-heading-bn)` }}
                >
                  {form.tagline_bn || "মনোযোগ রাখো। রিচার্জ হও।"}
                </p>
              </div>

              <div className={styles.fontPreviewCard}>
                <span className={styles.fontPreviewLabel}>
                  Body — English ({form.body_font})
                </span>
                <p
                  className={styles.fontPreviewTextSmall}
                  style={{ fontFamily: `var(--font-body-en)` }}
                >
                  {form.tagline || "The quick brown fox jumps over the lazy dog."}
                </p>
              </div>

              <div className={styles.fontPreviewCard}>
                <span className={styles.fontPreviewLabel}>
                  Body — Bengali ({form.body_font_bn})
                </span>
                <p
                  className={styles.fontPreviewTextSmall}
                  style={{ fontFamily: `var(--font-body-bn)` }}
                >
                  দ্রুত বাদামী শিয়াল অলস কুকুরের উপর দিয়ে লাফ দিলো।
                </p>
              </div>
            </div>
          </div>
        );

      /* ── Step 5: Voice & Personality ── */
      case 4:
        return (
          <div>
            <h2 className={styles.cardTitle}>5. Voice &amp; Personality</h2>
            <p className={styles.stepDescription}>
              Define your brand&apos;s voice, personality traits, and visual guardrails.
            </p>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Brand Tone *</label>
              <input
                className={styles.textInput}
                value={form.tone}
                onChange={(e) => set("tone", e.target.value)}
                placeholder="e.g. High-energy, direct, motivational"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Language</label>
                <div className={styles.adherenceToggle}>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`${styles.adherenceBtn} ${
                        form.language === opt.value ? styles.adherenceBtnActive : ""
                      }`}
                      onClick={() => set("language", opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Formality</label>
                <div className={styles.adherenceToggle}>
                  {FORMALITY_OPTIONS.map((f) => (
                    <button
                      key={f}
                      className={`${styles.adherenceBtn} ${
                        form.formality === f ? styles.adherenceBtnActive : ""
                      }`}
                      onClick={() => set("formality", f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>
                Brand Personality * <span className={styles.reviewValueMuted}>(select 3–5)</span>
              </label>
              <div className={styles.chipGrid}>
                {PERSONALITY_PRESETS.map((trait) => (
                  <button
                    key={trait}
                    className={`${styles.tagChip} ${
                      form.brand_personality.includes(trait) ? styles.tagChipActive : ""
                    }`}
                    onClick={() => {
                      if (form.brand_personality.includes(trait)) {
                        set(
                          "brand_personality",
                          form.brand_personality.filter((t) => t !== trait),
                        );
                      } else if (form.brand_personality.length < 5) {
                        set("brand_personality", [...form.brand_personality, trait]);
                      }
                    }}
                  >
                    {trait}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>
                Do Not Use * <span className={styles.reviewValueMuted}>(at least 2)</span>
              </label>
              <div className={styles.doNotUseList}>
                {form.do_not_use.map((item, idx) => (
                  <div key={idx} className={styles.doNotUseRow}>
                    <input
                      className={styles.textInput}
                      value={item}
                      onChange={(e) => {
                        const next = [...form.do_not_use];
                        next[idx] = e.target.value;
                        set("do_not_use", next);
                      }}
                      placeholder={`e.g. ${
                        idx === 0 ? "Pastel colors" : idx === 1 ? "Cursive fonts" : "..."
                      }`}
                    />
                    {form.do_not_use.length > 1 && (
                      <button
                        className={styles.removeButton}
                        onClick={() =>
                          set(
                            "do_not_use",
                            form.do_not_use.filter((_, i) => i !== idx),
                          )
                        }
                        aria-label="Remove item"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className={styles.addButton}
                  onClick={() => set("do_not_use", [...form.do_not_use, ""])}
                >
                  <Plus size={14} /> Add more
                </button>
              </div>
            </div>
          </div>
        );

      /* ── Step 6: Review & Logo ── */
      case 5:
        return (
          <div>
            <h2 className={styles.cardTitle}>6. Review &amp; Logo</h2>
            <p className={styles.stepDescription}>
              Upload your logo (optional) and review everything before submitting.
            </p>

            {/* Logo upload */}
            <div className={styles.inputGroup}>
              <label className={styles.label}>
                Brand Logo <span className={styles.optionalTag}>Optional</span>
              </label>
              <div
                className={styles.uploadZone}
                onClick={() => logoInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") logoInputRef.current?.click();
                }}
                role="button"
                tabIndex={0}
                aria-label="Upload brand logo"
                style={{ padding: "var(--space-6)" }}
              >
                <UploadCloud
                  className={`${styles.uploadIcon} ${
                    form.logo_file ? styles.uploadIconDone : ""
                  }`}
                />
                <p>
                  {form.logo_file
                    ? `✓ ${form.logo_file.name}`
                    : "Click or drag to upload transparent logo (PNG)"}
                </p>
              </div>
              <input
                type="file"
                ref={logoInputRef}
                className={styles.fileInput}
                accept="image/png, image/svg+xml, image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoFile(f);
                }}
              />
              {form.logo_base64 && (
                <img
                  src={`data:${form.logo_content_type};base64,${form.logo_base64}`}
                  alt="Logo preview"
                  className={styles.logoPreview}
                  style={{ marginTop: "var(--space-3)" }}
                />
              )}
            </div>

            {/* Review grid */}
            <div className={styles.reviewGrid}>
              <div className={styles.reviewSection}>
                <div className={styles.reviewSectionTitle}>Brand</div>
                <div className={styles.reviewValue}>{form.brand_name}</div>
                <div className={styles.reviewValueMuted}>{form.industry}</div>
                <div className={styles.reviewValueMuted}>{form.tagline}</div>
                {form.tagline_bn && (
                  <div className={styles.reviewValueMuted}>{form.tagline_bn}</div>
                )}
              </div>

              <div className={styles.reviewSection}>
                <div className={styles.reviewSectionTitle}>Colors</div>
                <div className={styles.reviewColorRow}>
                  <div className={styles.reviewColorDot} style={{ background: form.primary }} title={`Primary: ${form.primary}`} />
                  <div className={styles.reviewColorDot} style={{ background: form.secondary }} title={`Secondary: ${form.secondary}`} />
                  <div className={styles.reviewColorDot} style={{ background: form.accent }} title={`Accent: ${form.accent}`} />
                  {form.palette
                    .filter(
                      (c) =>
                        c !== form.primary && c !== form.secondary && c !== form.accent,
                    )
                    .map((c, i) => (
                      <div key={i} className={styles.reviewColorDot} style={{ background: c }} title={c} />
                    ))}
                </div>
              </div>

              <div className={styles.reviewSection}>
                <div className={styles.reviewSectionTitle}>Typography</div>
                <div className={styles.reviewValue}>
                  {form.heading_font} / {form.heading_font_bn}
                </div>
                <div className={styles.reviewValueMuted}>
                  {form.body_font} / {form.body_font_bn}
                </div>
              </div>

              <div className={styles.reviewSection}>
                <div className={styles.reviewSectionTitle}>Voice</div>
                <div className={styles.reviewValue}>{form.tone}</div>
                <div className={styles.reviewValueMuted}>
                  {form.formality} · {form.language}
                </div>
              </div>

              <div className={`${styles.reviewSection} ${styles.reviewSectionFull}`}>
                <div className={styles.reviewSectionTitle}>Personality</div>
                <div className={styles.chipGrid}>
                  {form.brand_personality.map((p) => (
                    <span key={p} className={`${styles.tagChip} ${styles.tagChipActive}`}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className={`${styles.reviewSection} ${styles.reviewSectionFull}`}>
                <div className={styles.reviewSectionTitle}>Do Not Use</div>
                <div className={styles.reviewValueMuted}>
                  {form.do_not_use.filter((s) => s.trim()).join(" · ") || "—"}
                </div>
              </div>
            </div>

            {submitError && (
              <div className={styles.errorState} style={{ marginTop: "var(--space-4)" }}>
                {submitError}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  /* ── Main render ── */
  return (
    <div className={styles.container}>
      <nav className={styles.backNav}>
        <Link href="/create" className={styles.backLink}>
          <ArrowLeft size={15} /> Back to Create
        </Link>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>Build Manually</h1>
        <p className={styles.subtitle}>
          Define your brand profile step by step — no PDF required.
        </p>
      </header>

      {renderStepper()}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.25 }}
          className={styles.content}
        >
          {renderStep()}

          <div className={styles.actions}>
            {step > 0 && (
              <button className={styles.button} onClick={goBack}>
                <ChevronLeft size={18} /> Back
              </button>
            )}

            {step < totalSteps - 1 ? (
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={goNext}
                disabled={!canGoNext()}
              >
                Next Step <ChevronRight size={18} />
              </button>
            ) : (
              <button
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Check size={18} /> Create Brand
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
