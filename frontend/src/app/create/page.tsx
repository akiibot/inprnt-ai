"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  UploadCloud, Check, ChevronRight, Loader2,
  Play, Download, Zap, ArrowLeft, BookMarked, Pencil,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./create.module.css";
import { BrandLibrary } from "./BrandLibrary";
import { CaptionPanel } from "./CaptionPanel";
import {
  uploadBrand, uploadProductImage,
  generateAllFormats, loadDemoBrand, runDemoGenerate,
} from "@/lib/api";
import type { AdherenceLevel, Blueprint, Brand, CampaignCaptions, ExportResult, PosterEngine } from "@/lib/types";

type Step = "UPLOAD_BRAND" | "UPLOAD_PRODUCT" | "PROMPT" | "GENERATING" | "RESULTS";

const STEP_LABELS = ["Brand", "Product", "Prompt", "Generating", "Results"];

function UploadZone({
  label,
  file,
  accept,
  inputRef,
  onFile,
  hint,
}: {
  label: string;
  file: File | null;
  accept: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
  hint: string;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div className={styles.inputGroup}>
      <label className={styles.label}>{label}</label>
      <div
        className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneDragOver : ""}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label={hint}
      >
        <UploadCloud className={`${styles.uploadIcon} ${file ? styles.uploadIconDone : ""}`} />
        <p>{file ? `✓ ${file.name}` : hint}</p>
      </div>
      <input
        type="file"
        ref={inputRef}
        className={styles.fileInput}
        accept={accept}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}

function CreateCampaignInner() {
  const searchParams = useSearchParams();
  const demoParam = searchParams.get("demo"); // "1" | "livana" | "aether" | "volt-bd" | null
  const isDemo = !!demoParam;
  const urlBrandId = searchParams.get("brand_id");

  const [currentStep, setCurrentStep] = useState<Step>(urlBrandId ? "PROMPT" : "UPLOAD_BRAND");
  const [brandInputMode, setBrandInputMode] = useState<"upload" | "manual" | "library">("upload");
  const [libraryBrandId, setLibraryBrandId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [demoBrandId, setDemoBrandId] = useState<string | null>(null);
  const [demoBrand, setDemoBrand] = useState<Brand | null>(null);
  const [demoLoadError, setDemoLoadError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const [brandPdf, setBrandPdf] = useState<File | null>(null);
  const [brandLogo, setBrandLogo] = useState<File | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [adherenceLevel, setAdherenceLevel] = useState<AdherenceLevel>("moderate");
  const [engine, setEngine] = useState<PosterEngine>("postergen");
  const [results, setResults] = useState<ExportResult[]>([]);
  const [lastBlueprint, setLastBlueprint] = useState<Blueprint | null>(null);
  const [captions, setCaptions] = useState<CampaignCaptions | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [heartbeatSecs, setHeartbeatSecs] = useState(0);
  const lastLogTimeRef = useRef<number>(Date.now());
  const abortRef = useRef(false);

  const brandInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (logs.length > 0) {
      lastLogTimeRef.current = Date.now();
      setHeartbeatSecs(0);
    }
  }, [logs]);

  useEffect(() => {
    if (!isProcessing) { setHeartbeatSecs(0); return; }
    const timer = setInterval(() => {
      setHeartbeatSecs(Math.floor((Date.now() - lastLogTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isProcessing]);

  // Restore results when arriving back via browser Back from the campaign page.
  // The "View Details" / "Generate Video" links set a '_resume_results' flag in
  // sessionStorage before navigating; we consume it here on remount.
  useEffect(() => {
    if (isDemo || urlBrandId) return;
    if (sessionStorage.getItem("_resume_results") !== "1") return;
    sessionStorage.removeItem("_resume_results");
    try {
      const raw = sessionStorage.getItem("imprnt_results");
      if (!raw) return;
      const { campaignId: savedId, results: savedResults } = JSON.parse(raw) as {
        campaignId: string;
        results: ExportResult[];
      };
      if (savedId && savedResults?.length > 0) {
        setCampaignId(savedId);
        setResults(savedResults);
        setCurrentStep("RESULTS");
      }
    } catch (_) { /* ignore malformed storage */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isDemo) return;
    const brandSlug = !demoParam || demoParam === "1" ? "volt-bd" : demoParam;
    loadDemoBrand(brandSlug)
      .then(({ brand_id, brand, prompt: demoPrompt }) => {
        setDemoBrandId(brand_id);
        setDemoBrand(brand);
        setPrompt(demoPrompt);
        // Stay on UPLOAD_BRAND — let user walk through all steps
      })
      .catch((err) => setDemoLoadError(String(err)));
  }, [isDemo]);

  useEffect(() => {
    if (urlBrandId) {
      setCurrentStep("PROMPT");
    }
  }, [urlBrandId]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const handleNext = () => {
    if (currentStep === "UPLOAD_BRAND") {
      if (brandInputMode === "upload" && (!brandPdf || !brandLogo)) return;
      setCurrentStep("UPLOAD_PRODUCT");
    } else if (currentStep === "UPLOAD_PRODUCT") {
      setCurrentStep("PROMPT");
    } else if (currentStep === "PROMPT") {
      if (isDemo && demoBrandId) {
        handleDemoGenerate();
      } else {
        handleGenerate();
      }
    }
  };

  const handleDemoGenerate = async () => {
    if (!demoBrandId || !prompt.trim()) return;
    abortRef.current = false;
    setErrorMessage(null);
    setCurrentStep("GENERATING");
    setIsProcessing(true);
    setLogs([]);
    setResults([]);
    try {
      addLog(`Demo mode: loading ${demoBrand?.brand_name ?? demoBrandId} brand from mock data...`);
      addLog("Calling campaigns/generate-all (serving cached demo posters)...");
      const res = await runDemoGenerate(demoBrandId, prompt, adherenceLevel, engine);
      if (abortRef.current) return;
      setCampaignId(res.campaign_id);
      const mapped: ExportResult[] = res.formats.map((f) => ({
        format_name: f.name,
        url: f.poster_url,
        width: f.aspect_ratio === "16:9" ? 1200 : 1080,
        height: f.aspect_ratio === "9:16" ? 1920 : f.aspect_ratio === "16:9" ? 675 : 1080,
        aspect_ratio: f.aspect_ratio,
      }));
      setResults(mapped);
      addLog(`✅ Demo complete in ${res.total_generation_time_seconds.toFixed(1)}s`);
      setCurrentStep("RESULTS");
      try {
        sessionStorage.setItem("imprnt_results", JSON.stringify({ campaignId: res.campaign_id, results: mapped }));
      } catch (_) { /* storage unavailable */ }
    } catch (err: unknown) {
      if (!abortRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog("ERROR: " + msg);
        setErrorMessage(msg);
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = false;
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const effectiveBrandId = urlBrandId || libraryBrandId;
    if (!effectiveBrandId && (!brandPdf || !brandLogo)) return;

    abortRef.current = false;
    setErrorMessage(null);
    setCurrentStep("GENERATING");
    setIsProcessing(true);
    setLogs([]);
    setResults([]);
    setLastBlueprint(null);

    try {
      let brandId = effectiveBrandId;

      if (!brandId) {
        addLog("Phase 1/4: Uploading brand guidelines and logo...");
        const brandRes = await uploadBrand(brandPdf!, brandLogo!);
        if (abortRef.current) return;
        brandId = brandRes.brand_id;
        addLog(`✅ Brand extracted via Gemini: ${brandRes.brand.brand_name}`);
      } else if (urlBrandId) {
        addLog("Phase 1/4: Using manually created brand profile...");
      } else {
        addLog("Phase 1/4: Loading saved brand from library...");
      }

      if (productImage) {
        addLog("Phase 2/4: Stripping background from product image via Remove.bg...");
        await uploadProductImage(brandId, productImage);
        if (abortRef.current) return;
        addLog("✅ Product background removed & saved.");
      } else {
        addLog("Phase 2/4: Skipped (no product image).");
      }

      addLog(
        engine === "postergen"
          ? "Phase 3/4: Gemini brain is writing the Imagen poster prompt..."
          : `Phase 3/4: Gemini designing editable blueprint [adherence: ${adherenceLevel}]...`,
      );
      addLog(
        engine === "postergen"
          ? "Phase 4/4: Imagen rendering all 3 formats + compositing logo/product..."
          : "Phase 4/4: Generating backgrounds and rendering all 3 formats...",
      );
      const genRes = await generateAllFormats({
        brand_id: brandId,
        prompt,
        adherence_level: adherenceLevel,
        product_image_available: !!productImage,
        engine,
      });
      if (abortRef.current) return;
      setCampaignId(genRes.campaign_id);
      setCaptions(genRes.captions ?? null);
      const mapped: ExportResult[] = genRes.formats.map((f) => ({
        format_name: f.name,
        url: f.poster_url,
        width: f.aspect_ratio === "16:9" ? 1920 : 1080,
        height: f.aspect_ratio === "9:16" ? 1920 : f.aspect_ratio === "16:9" ? 1080 : 1080,
        aspect_ratio: f.aspect_ratio,
      }));
      setResults(mapped);
      addLog(`✅ Pipeline complete in ${genRes.total_generation_time_seconds.toFixed(1)}s`);
      setCurrentStep("RESULTS");
      try {
        sessionStorage.setItem("imprnt_results", JSON.stringify({ campaignId: genRes.campaign_id, results: mapped }));
      } catch (_) { /* storage unavailable */ }
    } catch (err: unknown) {
      if (!abortRef.current) {
        const message = err instanceof Error ? err.message : String(err);
        addLog("ERROR: " + message);
        setErrorMessage(message);
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = false;
    }
  };

  const handleStartNew = () => {
    try { sessionStorage.removeItem("imprnt_results"); sessionStorage.removeItem("_resume_results"); } catch (_) {}
    setResults([]);
    setLogs([]);
    setErrorMessage(null);
    setCampaignId(null);
    setCaptions(null);
    setLibraryBrandId(null);
    if (isDemo) {
      setCurrentStep("UPLOAD_BRAND");
    } else {
      setCurrentStep("UPLOAD_BRAND");
      setBrandPdf(null);
      setBrandLogo(null);
      setProductImage(null);
      setPrompt("");
      setDemoBrandId(null);
      setLastBlueprint(null);
      setBrandInputMode("upload");
    }
  };

  const steps = ["UPLOAD_BRAND", "UPLOAD_PRODUCT", "PROMPT", "GENERATING", "RESULTS"];
  const stepIndex = steps.indexOf(currentStep);

  const lastLogLabel = (() => {
    const last = logs[logs.length - 1] ?? "";
    const m = last.match(/\] (.+)/);
    return m ? m[1] : "Working";
  })();

  if (isDemo && demoLoadError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>Demo load failed: {demoLoadError}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <nav className={styles.backNav}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={15} />
          Imprnt AI
        </Link>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>
          {isDemo ? `${demoBrand?.brand_name ?? "Demo"} Demo` : "New Campaign"}
        </h1>
        <p className={styles.subtitle}>
          {isDemo
            ? `Pre-loaded ${demoBrand?.brand_name ?? "demo"} campaign — results served instantly.`
            : "AI-powered creative direction and execution."}
        </p>
      </header>

      {/* Stepper */}
      <div
        className={styles.stepper}
        style={{ "--step-progress": `${(stepIndex / (steps.length - 1)) * 100}%` } as React.CSSProperties}
      >
        {STEP_LABELS.map((label, idx) => (
          <div
            key={label}
            className={`${styles.stepWrapper} ${stepIndex === idx ? styles.stepWrapperActive : ""} ${stepIndex > idx ? styles.stepWrapperCompleted : ""}`}
          >
            <div
              className={`${styles.step} ${stepIndex === idx ? styles.stepActive : ""} ${stepIndex > idx ? styles.stepCompleted : ""}`}
            >
              {stepIndex > idx ? <Check size={16} /> : idx + 1}
            </div>
            <span className={styles.stepLabel}>{label}</span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className={styles.content}
        >
          {currentStep === "UPLOAD_BRAND" && isDemo && (
            <div>
              <h2 className={styles.cardTitle}>1. Brand Identity</h2>
              <p className={styles.stepDescription}>
                This demo uses a pre-loaded brand profile — no PDF upload required.
              </p>
              {demoBrand ? (
                <div className={styles.demoBrandCard}>
                  <div
                    className={styles.demoBrandCardAccent}
                    style={{ background: demoBrand.colors.primary }}
                  />
                  <div className={styles.demoBrandCardInfo}>
                    <div className={styles.demoBrandCardName}>{demoBrand.brand_name}</div>
                    <div className={styles.demoBrandCardTagline}>{demoBrand.tagline}</div>
                    <div className={styles.demoBrandCardIndustry}>{demoBrand.industry}</div>
                  </div>
                  <span className={styles.demoReadyBadge}>Pre-loaded</span>
                </div>
              ) : (
                <div className={styles.stepDescription}>Loading demo brand…</div>
              )}
              <div className={styles.actions}>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={() => setCurrentStep("UPLOAD_PRODUCT")}
                  disabled={!demoBrand}
                >
                  Next Step <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {currentStep === "UPLOAD_BRAND" && !isDemo && (
            <div>
              <h2 className={styles.cardTitle}>1. Brand Identity</h2>

              {/* Mode tabs */}
              <div className={styles.brandOptionTabs}>
                <button
                  className={`${styles.brandOptionTab} ${brandInputMode === "upload" ? styles.brandOptionTabActive : ""}`}
                  onClick={() => setBrandInputMode("upload")}
                >
                  Upload PDF
                </button>
                <button
                  className={`${styles.brandOptionTab} ${brandInputMode === "manual" ? styles.brandOptionTabActive : ""}`}
                  onClick={() => setBrandInputMode("manual")}
                >
                  Build Manually
                </button>
                <button
                  className={`${styles.brandOptionTab} ${brandInputMode === "library" ? styles.brandOptionTabActive : ""}`}
                  onClick={() => setBrandInputMode("library")}
                >
                  <BookMarked size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                  My Brands
                </button>
              </div>

              {/* Upload PDF */}
              {brandInputMode === "upload" && (
                <div>
                  <UploadZone
                    label="Brand Guidelines (PDF)"
                    file={brandPdf}
                    accept=".pdf"
                    inputRef={brandInputRef}
                    onFile={setBrandPdf}
                    hint="Click or drag to upload brand_guidelines.pdf"
                  />
                  <UploadZone
                    label="Brand Logo (PNG/SVG)"
                    file={brandLogo}
                    accept="image/png, image/svg+xml"
                    inputRef={logoInputRef}
                    onFile={setBrandLogo}
                    hint="Click or drag to upload transparent logo"
                  />
                  <div className={styles.actions} style={{ marginTop: "var(--space-4)" }}>
                    <button
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      onClick={handleNext}
                      disabled={!brandPdf || !brandLogo}
                    >
                      Next Step <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              )}

              {/* Build Manually */}
              {brandInputMode === "manual" && (
                <div className={styles.manualPanel}>
                  <div className={styles.uploadIcon} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Zap size={36} />
                  </div>
                  <p>No PDF? No problem. Define your brand identity step by step.</p>
                  <Link href="/create/manual" className={`${styles.button} ${styles.buttonPrimary}`}>
                    Open Manual Setup <ChevronRight size={16} />
                  </Link>
                </div>
              )}

              {/* My Brands library */}
              {brandInputMode === "library" && (
                <BrandLibrary
                  onSelect={(id) => {
                    setLibraryBrandId(id);
                    setCurrentStep("UPLOAD_PRODUCT");
                  }}
                />
              )}
            </div>
          )}

          {currentStep === "UPLOAD_PRODUCT" && isDemo && (
            <div>
              <h2 className={styles.cardTitle}>
                2. Product Focus <span className={styles.optionalTag}>Demo</span>
              </h2>
              <p className={styles.stepDescription}>
                This demo uses a pre-loaded product image — background already removed.
              </p>
              <div className={styles.demoBrandCard}>
                <div
                  className={styles.demoBrandCardAccent}
                  style={{ background: demoBrand?.colors.primary ?? "var(--color-primary)" }}
                />
                <div className={styles.demoBrandCardInfo}>
                  <div className={styles.demoBrandCardName}>Product image ready</div>
                  <div className={styles.demoBrandCardTagline}>
                    Pre-loaded for {demoBrand?.brand_name ?? "this demo brand"}
                  </div>
                </div>
                <span className={styles.demoReadyBadge}>Pre-loaded</span>
              </div>
              <div className={styles.actions}>
                <button className={styles.button} onClick={() => setCurrentStep("UPLOAD_BRAND")}>Back</button>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={() => setCurrentStep("PROMPT")}
                >
                  Next Step <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {currentStep === "UPLOAD_PRODUCT" && !isDemo && (
            <div>
              <h2 className={styles.cardTitle}>
                2. Product Focus <span className={styles.optionalTag}>Optional</span>
              </h2>
              <p className={styles.stepDescription}>
                Upload an image of the product. Our AI will automatically remove the background.
              </p>
              <UploadZone
                label="Product Image"
                file={productImage}
                accept="image/*"
                inputRef={productInputRef}
                onFile={setProductImage}
                hint="Click or drag to upload product image"
              />
              <div className={styles.actions}>
                <button className={styles.button} onClick={() => setCurrentStep("UPLOAD_BRAND")}>Back</button>
                <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleNext}>
                  Next Step <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {currentStep === "PROMPT" && (
            <div>
              <h2 className={styles.cardTitle}>3. Campaign Prompt</h2>
              <p className={styles.stepDescription}>
                Describe the campaign goals, vibe, and any specific requirements.
              </p>

              <div className={styles.inputGroup}>
                <textarea
                  className={styles.textarea}
                  placeholder="e.g. Design an Eid Special Edition Launch. Use bold Eid motifs — crescents, stars, warm gold — against the brand palette..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Poster Engine</label>
                <p className={styles.adherenceDescription}>
                  How should the poster be rendered?
                </p>
                <div className={styles.adherenceToggle}>
                  {(["postergen", "blueprint"] as const).map((eng) => (
                    <button
                      key={eng}
                      className={`${styles.adherenceBtn} ${engine === eng ? styles.adherenceBtnActive : ""}`}
                      onClick={() => setEngine(eng)}
                    >
                      {eng === "postergen" ? "AI Poster" : "Editable Layers"}
                    </button>
                  ))}
                </div>
                <p className={styles.adherenceHint}>
                  {engine === "postergen"
                    ? "Imagen renders the whole poster — richest, most designed look. Text is part of the image."
                    : "Gemini plans editable text layers rendered over an AI background — fully editable, guaranteed-correct Bangla."}
                </p>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Creative Adherence</label>
                <p className={styles.adherenceDescription}>
                  How closely should the AI follow your brand guidelines?
                </p>
                <div className={styles.adherenceToggle}>
                  {(["creative", "moderate", "strict"] as const).map((level) => (
                    <button
                      key={level}
                      className={`${styles.adherenceBtn} ${adherenceLevel === level ? styles.adherenceBtnActive : ""}`}
                      onClick={() => setAdherenceLevel(level)}
                    >
                      {level === "creative" ? "Creative" : level === "moderate" ? "Balanced" : "Strict"}
                    </button>
                  ))}
                </div>
                <p className={styles.adherenceHint}>
                  {adherenceLevel === "creative"
                    ? "AI takes liberties — unexpected layouts, bold copy, colour play."
                    : adherenceLevel === "moderate"
                    ? "Respects brand guidelines but allows creative interpretation."
                    : "Pixel-perfect brand adherence — exact colors, fonts, and tone."}
                </p>
              </div>

              <div className={styles.actions}>
                {!isDemo && (
                  <button className={styles.button} onClick={() => setCurrentStep("UPLOAD_PRODUCT")}>Back</button>
                )}
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={handleNext}
                  disabled={!prompt.trim()}
                >
                  {isDemo ? <Zap size={18} /> : <Play size={18} />}
                  {isDemo ? "Generate Demo" : "Generate Campaign"}
                </button>
              </div>
            </div>
          )}

          {currentStep === "GENERATING" && (
            <div>
              <h2 className={styles.cardTitle}>
                <Loader2 className={styles.spinIcon} size={24} style={{ color: "var(--color-primary)" }} />
                Processing Pipeline...
              </h2>
              <div className={styles.terminal}>
                {logs.map((log, i) => (
                  <div key={i} className={styles.logLine}>{log}</div>
                ))}
                {isProcessing && heartbeatSecs >= 3 && (
                  <div className={`${styles.logLine} ${styles.logLineWarning}`}>
                    ⏳ {lastLogLabel}... {heartbeatSecs}s
                  </div>
                )}
                {isProcessing && heartbeatSecs < 3 && (
                  <div className={styles.logLine} style={{ opacity: 0.5 }}>▋</div>
                )}
                <div ref={logsEndRef} />
              </div>
              {isProcessing && (
                <div className={styles.actions} style={{ marginTop: "var(--space-6)" }}>
                  <button
                    className={styles.button}
                    onClick={() => {
                      abortRef.current = true;
                      setIsProcessing(false);
                      addLog("⚠ Generation cancelled.");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {errorMessage && (
                <div className={styles.errorState} style={{ marginTop: "var(--space-4)" }}>
                  <p style={{ marginBottom: "var(--space-4)" }}>{errorMessage}</p>
                  <button className={styles.button} onClick={handleStartNew}>
                    Start Over
                  </button>
                </div>
              )}
            </div>
          )}

          {currentStep === "RESULTS" && (
            <div>
              <h2 className={styles.cardTitle} style={{ color: "var(--color-primary)" }}>
                <Check size={28} /> Campaign Generated!
              </h2>
              <p className={styles.stepDescription}>
                {engine === "postergen"
                  ? "Gemini's brain wrote the prompt. Imagen rendered each format. Your real logo and product were composited on top."
                  : "Gemini designed the blueprint. Imagen generated the background. Playwright rendered Bangla + English typography perfectly."}
              </p>

              <div className={styles.resultsGrid}>
                {results.map((res, i) => (
                  <div key={i} className={styles.resultCard}>
                    <div
                      className={`${styles.resultImageWrapper} ${
                        res.aspect_ratio === "9:16"
                          ? styles.resultImageWrapper9x16
                          : res.aspect_ratio === "16:9"
                          ? styles.resultImageWrapper16x9
                          : styles.resultImageWrapper1x1
                      }`}
                    >
                      <Image
                        src={res.url}
                        alt={res.format_name}
                        fill
                        className={styles.resultImage}
                        unoptimized
                      />
                    </div>
                    <div className={styles.resultFooter}>
                      <span className={styles.resultFormat}>{res.format_name}</span>
                      <div className={styles.resultActions}>
                        {campaignId && (
                          <Link
                            href={`/campaign/${campaignId}/editor?ar=${
                              res.aspect_ratio ??
                              (res.width === res.height ? "1:1" : res.height > res.width ? "9:16" : "16:9")
                            }&url=${encodeURIComponent(res.url)}`}
                            className={styles.editBtn}
                            aria-label={`Edit ${res.format_name}`}
                          >
                            <Pencil size={14} />
                          </Link>
                        )}
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.downloadBtn}
                          aria-label={`Download ${res.format_name}`}
                        >
                          <Download size={16} />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
                {results.length === 0 && (
                  <div className={styles.errorState}>Pipeline failed. Check logs above.</div>
                )}
              </div>

              {captions && <CaptionPanel captions={captions} />}

              {lastBlueprint && (
                <details className={styles.blueprintCard}>
                  <summary className={styles.blueprintSummary}>
                    🧠 AI Blueprint — {lastBlueprint.campaign_name}
                  </summary>
                  <div className={styles.blueprintBody}>
                    <p className={styles.blueprintStrategy}>{lastBlueprint.campaign_strategy}</p>
                    {lastBlueprint.background?.prompt && (
                      <div className={styles.blueprintSection}>
                        <span className={styles.blueprintLabel}>Flux Background Prompt</span>
                        <p className={styles.blueprintValue}>{lastBlueprint.background.prompt}</p>
                      </div>
                    )}
                    <div className={styles.blueprintSection}>
                      <span className={styles.blueprintLabel}>
                        Design Elements ({lastBlueprint.layers?.length ?? 0} layers)
                      </span>
                      <ul className={styles.blueprintLayers}>
                        {lastBlueprint.layers?.map((layer) => (
                          <li key={layer.id} className={styles.blueprintLayer}>
                            <span className={styles.layerType}>{layer.type}</span>
                            {layer.content && (
                              <span className={styles.layerContent}>{layer.content}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
              )}

              <div className={styles.actions} style={{ marginTop: "var(--space-10)" }}>
                {campaignId && (
                  <>
                    <Link
                      href={`/campaign/${campaignId}`}
                      className={styles.button}
                      onClick={() => {
                        try { sessionStorage.setItem("_resume_results", "1"); } catch (_) {}
                      }}
                    >
                      View Details
                    </Link>
                    <Link
                      href={`/campaign/${campaignId}#video`}
                      className={styles.button}
                      style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}
                      onClick={() => {
                        try { sessionStorage.setItem("_resume_results", "1"); } catch (_) {}
                      }}
                    >
                      <Play size={16} />
                      Generate Video
                    </Link>
                  </>
                )}
                <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleStartNew}>
                  {isDemo ? "Generate Again" : "Start New Campaign"}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function CreateCampaign() {
  return (
    <Suspense fallback={<div style={{ color: "var(--color-grey-400)", padding: "2rem" }}>Loading…</div>}>
      <CreateCampaignInner />
    </Suspense>
  );
}
