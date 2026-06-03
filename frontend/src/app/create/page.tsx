"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  UploadCloud, Check, ChevronRight, Loader2,
  Play, Download, Zap, ArrowLeft, BookMarked,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./create.module.css";
import { BrandLibrary } from "./BrandLibrary";
import {
  uploadBrand, uploadProductImage, planCampaign,
  generateCampaign, exportCampaignFormats,
  loadDemoBrand, runDemoGenerate,
} from "@/lib/api";
import type { AdherenceLevel, Blueprint, ExportResult } from "@/lib/types";

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
  const isDemo = searchParams.get("demo") === "1";
  const urlBrandId = searchParams.get("brand_id");

  const [currentStep, setCurrentStep] = useState<Step>(urlBrandId ? "PROMPT" : "UPLOAD_BRAND");
  const [brandInputMode, setBrandInputMode] = useState<"upload" | "manual" | "library">("upload");
  const [libraryBrandId, setLibraryBrandId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [demoBrandId, setDemoBrandId] = useState<string | null>(null);
  const [demoLoadError, setDemoLoadError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const [brandPdf, setBrandPdf] = useState<File | null>(null);
  const [brandLogo, setBrandLogo] = useState<File | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [adherenceLevel, setAdherenceLevel] = useState<AdherenceLevel>("moderate");
  const [results, setResults] = useState<ExportResult[]>([]);
  const [lastBlueprint, setLastBlueprint] = useState<Blueprint | null>(null);

  const [heartbeatSecs, setHeartbeatSecs] = useState(0);
  const lastLogTimeRef = useRef<number>(Date.now());

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

  useEffect(() => {
    if (!isDemo) return;
    loadDemoBrand()
      .then(({ brand_id, prompt: demoPrompt }) => {
        setDemoBrandId(brand_id);
        setPrompt(demoPrompt);
        setCurrentStep("PROMPT");
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
    setCurrentStep("GENERATING");
    setIsProcessing(true);
    setLogs([]);
    setResults([]);
    try {
      addLog("Demo mode: loading Volt BD brand from mock data...");
      addLog("Calling campaigns/generate-all (serving cached demo posters)...");
      const res = await runDemoGenerate(demoBrandId, prompt, adherenceLevel);
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
    } catch (err: unknown) {
      addLog("ERROR: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
      setCurrentStep("RESULTS");
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const effectiveBrandId = urlBrandId || libraryBrandId;
    if (!effectiveBrandId && (!brandPdf || !brandLogo)) return;

    setCurrentStep("GENERATING");
    setIsProcessing(true);
    setLogs([]);
    setResults([]);
    setLastBlueprint(null);

    try {
      let brandId = effectiveBrandId;

      if (!brandId) {
        addLog("Phase 1/5: Uploading brand guidelines and logo...");
        const brandRes = await uploadBrand(brandPdf!, brandLogo!);
        brandId = brandRes.brand_id;
        addLog(`✅ Brand extracted via Gemini: ${brandRes.brand.brand_name}`);
      } else if (urlBrandId) {
        addLog("Phase 1/5: Using manually created brand profile...");
      } else {
        addLog("Phase 1/5: Loading saved brand from library...");
      }

      if (productImage) {
        addLog("Phase 2/5: Stripping background from product image via Remove.bg...");
        await uploadProductImage(brandId, productImage);
        addLog("✅ Product background removed & saved.");
      } else {
        addLog("Phase 2/5: Skipped (no product image).");
      }

      addLog(`Phase 3/5: Gemini designing blueprint [adherence: ${adherenceLevel}]...`);
      const planRes = await planCampaign({
        brand_id: brandId,
        prompt,
        adherence_level: adherenceLevel,
        product_image_available: !!productImage,
        format: { name: "1:1 Post", width: 1080, height: 1080, aspect_ratio: "1:1" },
      });
      setLastBlueprint(planRes.blueprint);
      addLog(`✅ Blueprint: "${planRes.blueprint.campaign_name}"`);

      addLog("Phase 4/5: Generating Flux background and rendering poster...");
      const genRes = await generateCampaign(planRes.blueprint);
      setCampaignId(genRes.campaign_id);
      addLog("✅ 1:1 poster rendered.");

      addLog("Phase 5/5: Rendering 9:16 and 16:9 formats...");
      const exportRes = await exportCampaignFormats({
        campaign_id: genRes.campaign_id,
        formats: [
          { name: "1:1 Post", width: 1080, height: 1080, aspect_ratio: "1:1" },
          { name: "9:16 Story", width: 1080, height: 1920, aspect_ratio: "9:16" },
          { name: "16:9 Cover", width: 1920, height: 1080, aspect_ratio: "16:9" },
        ],
      });
      setResults(exportRes.exports);
      addLog("✅ Pipeline complete!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addLog("ERROR: " + message);
    } finally {
      setIsProcessing(false);
      setCurrentStep("RESULTS");
    }
  };

  const handleStartNew = () => {
    setResults([]);
    setLogs([]);
    setCampaignId(null);
    setLibraryBrandId(null);
    if (isDemo) {
      setCurrentStep("PROMPT");
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
        <h1 className={styles.title}>{isDemo ? "Volt BD Demo" : "New Campaign"}</h1>
        <p className={styles.subtitle}>
          {isDemo
            ? "Pre-loaded Volt BD Eid campaign — no upload needed."
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
          {currentStep === "UPLOAD_BRAND" && (
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

          {currentStep === "UPLOAD_PRODUCT" && (
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
                <Loader2 className="animate-spin" size={24} style={{ color: "var(--color-primary)" }} />
                Processing Pipeline...
              </h2>
              <div className={styles.terminal}>
                {logs.map((log, i) => (
                  <div key={i} className={styles.logLine}>{log}</div>
                ))}
                {isProcessing && heartbeatSecs >= 3 && (
                  <div className={styles.logLine} style={{ color: "#ffaa00", opacity: 0.85 }}>
                    ⏳ {lastLogLabel}... {heartbeatSecs}s
                  </div>
                )}
                {isProcessing && heartbeatSecs < 3 && (
                  <div className={styles.logLine} style={{ opacity: 0.5 }}>
                    <span className="animate-pulse">▋</span>
                  </div>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {currentStep === "RESULTS" && (
            <div>
              <h2 className={styles.cardTitle} style={{ color: "var(--color-primary)" }}>
                <Check size={28} /> Campaign Generated!
              </h2>
              <p className={styles.stepDescription}>
                Gemini designed the blueprint. Flux generated the background. Playwright rendered Bangla + English typography perfectly.
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
                ))}
                {results.length === 0 && (
                  <div className={styles.errorState}>Pipeline failed. Check logs above.</div>
                )}
              </div>

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
                  <Link href={`/campaign/${campaignId}`} className={styles.button}>
                    View Details
                  </Link>
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
