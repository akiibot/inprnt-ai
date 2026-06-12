"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  UploadCloud, Check, ChevronRight, Loader2,
  Play, Download, Zap, RotateCcw, Pencil,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./create.module.css";
import { BrandLibrary } from "./BrandLibrary";
import { CaptionPanel } from "./CaptionPanel";
import {
  uploadBrand, uploadProductImage, checkHealth,
  generateAllFormats, loadDemoBrand, runDemoGenerate,
} from "@/lib/api";
import type { AdherenceLevel, Blueprint, Brand, CampaignCaptions, ExportResult, PosterEngine, HealthResponse } from "@/lib/types";

type Step = "UPLOAD_BRAND" | "UPLOAD_PRODUCT" | "PROMPT" | "GENERATING" | "RESULTS";

const STEP_LABELS = ["Brand", "Product", "Prompt", "Generation", "Result"];
const STEPS: Step[] = ["UPLOAD_BRAND", "UPLOAD_PRODUCT", "PROMPT", "GENERATING", "RESULTS"];

/* ── Upload Zone ─────────────────────────────────────────────── */
function UploadZone({
  label,
  pills,
  file,
  accept,
  inputRef,
  onFile,
  hint,
}: {
  label: string;
  pills?: string[];
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>{label}</span>
        {pills?.map((p) => (
          <span key={p} className={styles.pill}>{p}</span>
        ))}
      </div>
      <div
        className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneDragOver : ""} ${file ? styles.uploadZoneDone : ""}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label={hint}
      >
        <UploadCloud size={22} className={styles.uploadZoneIcon} />
        <p className={styles.uploadZoneText}>
          {file ? `✓ ${file.name}` : hint}
        </p>
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

/* ── Main component ──────────────────────────────────────────── */
function CreateCampaignInner() {
  const searchParams = useSearchParams();
  const demoParam = searchParams.get("demo");
  const isDemoUpload = demoParam === "upload";
  const isDemo = !!demoParam && !isDemoUpload;
  const urlBrandId = searchParams.get("brand_id");

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);

  const [currentStep, setCurrentStep] = useState<Step>(urlBrandId ? "PROMPT" : "UPLOAD_BRAND");
  const [brandInputMode, setBrandInputMode] = useState<"upload" | "manual" | "library">("upload");
  const [libraryBrandId, setLibraryBrandId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [demoBrandId, setDemoBrandId] = useState<string | null>(null);
  const [demoBrand, setDemoBrand] = useState<Brand | null>(null);
  const [demoLoadError, setDemoLoadError] = useState<string | null>(null);
  const [brandUploadResult, setBrandUploadResult] = useState<{
    brand_id: string; brand: Brand; message: string; colors_source?: string; suggested_prompt?: string;
  } | null>(null);
  const [isBrandUploading, setIsBrandUploading] = useState(false);
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
    let cancelled = false;
    checkHealth()
      .then((d) => { if (!cancelled) setHealth(d); })
      .catch(() => { if (!cancelled) setHealthError(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  useEffect(() => {
    if (logs.length > 0) { lastLogTimeRef.current = Date.now(); setHeartbeatSecs(0); }
  }, [logs]);

  useEffect(() => {
    if (!isProcessing) { setHeartbeatSecs(0); return; }
    const t = setInterval(() => setHeartbeatSecs(Math.floor((Date.now() - lastLogTimeRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isProcessing]);

  useEffect(() => {
    if (isDemo || urlBrandId) return;
    if (sessionStorage.getItem("_resume_results") !== "1") return;
    sessionStorage.removeItem("_resume_results");
    try {
      const raw = sessionStorage.getItem("imprnt_results");
      if (!raw) return;
      const { campaignId: savedId, results: savedResults } = JSON.parse(raw) as { campaignId: string; results: ExportResult[] };
      if (savedId && savedResults?.length > 0) {
        setCampaignId(savedId); setResults(savedResults); setCurrentStep("RESULTS");
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isDemo) return;
    const brandSlug = !demoParam || demoParam === "1" ? "volt-bd" : demoParam;
    loadDemoBrand(brandSlug)
      .then(({ brand_id, brand, prompt: p }) => { setDemoBrandId(brand_id); setDemoBrand(brand); setPrompt(p); })
      .catch((e) => setDemoLoadError(String(e)));
  }, [isDemo, demoParam]);

  useEffect(() => { if (urlBrandId) setCurrentStep("PROMPT"); }, [urlBrandId]);

  const addLog = (msg: string) => {
    const t = new Date().toLocaleTimeString([], { hour12: false });
    setLogs((p) => [...p, `[${t}] ${msg}`]);
  };

  const handleNext = () => {
    if (currentStep === "UPLOAD_BRAND") {
      if (isDemoUpload) return;
      if (brandInputMode === "upload" && (!brandPdf || !brandLogo)) return;
      setCurrentStep("UPLOAD_PRODUCT");
    } else if (currentStep === "UPLOAD_PRODUCT") {
      setCurrentStep("PROMPT");
    } else if (currentStep === "PROMPT") {
      demoBrandId ? handleDemoGenerate() : handleGenerate();
    }
  };

  const handleDemoGenerate = async () => {
    if (!demoBrandId || !prompt.trim()) return;
    abortRef.current = false; setErrorMessage(null);
    setCurrentStep("GENERATING"); setIsProcessing(true); setLogs([]); setResults([]);
    const startTime = Date.now();
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    try {
      const apiPromise = runDemoGenerate(demoBrandId, prompt, adherenceLevel, engine);
      addLog(`Analysing ${demoBrand?.brand_name ?? "brand"} identity — colours, fonts, tone of voice...`);
      await sleep(1200 + Math.random() * 300); if (abortRef.current) return;
      addLog("Gemini 2.5 Pro writing poster compositions for all 3 formats...");
      await sleep(1600 + Math.random() * 400); if (abortRef.current) return;
      addLog("Rendering Bangla + English typography and compositing brand assets...");
      await sleep(1200 + Math.random() * 300); if (abortRef.current) return;
      const res = await apiPromise; if (abortRef.current) return;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      addLog(`✅ All 3 formats ready — ${elapsed}s`);
      setCampaignId(res.campaign_id); setCaptions(res.captions ?? null);
      const mapped: ExportResult[] = res.formats.map((f) => ({
        format_name: f.name, url: f.poster_url,
        width: f.aspect_ratio === "16:9" ? 1200 : 1080,
        height: f.aspect_ratio === "9:16" ? 1920 : f.aspect_ratio === "16:9" ? 675 : 1080,
        aspect_ratio: f.aspect_ratio,
      }));
      setResults(mapped);
      await sleep(450); if (abortRef.current) return;
      setCurrentStep("RESULTS");
      try { sessionStorage.setItem("imprnt_results", JSON.stringify({ campaignId: res.campaign_id, results: mapped })); } catch { /* ignore */ }
    } catch (err: unknown) {
      if (!abortRef.current) { const msg = err instanceof Error ? err.message : String(err); addLog("ERROR: " + msg); setErrorMessage(msg); }
    } finally { setIsProcessing(false); abortRef.current = false; }
  };

  const handleBrandUploadNext = async () => {
    if (!brandPdf || !brandLogo || isBrandUploading) return;
    setIsBrandUploading(true); setErrorMessage(null);
    try {
      const res = await uploadBrand(brandPdf, brandLogo);
      setBrandUploadResult(res);
      if (res.colors_source === "demo-preloaded") {
        setDemoBrandId(res.brand_id); setDemoBrand(res.brand);
        if (res.suggested_prompt) setPrompt(res.suggested_prompt);
      }
      setCurrentStep("UPLOAD_PRODUCT");
    } catch (err: unknown) { setErrorMessage(err instanceof Error ? err.message : String(err)); }
    finally { setIsBrandUploading(false); }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const effectiveBrandId = urlBrandId || libraryBrandId || brandUploadResult?.brand_id || null;
    if (!effectiveBrandId && (!brandPdf || !brandLogo)) return;
    abortRef.current = false; setErrorMessage(null);
    setCurrentStep("GENERATING"); setIsProcessing(true); setLogs([]); setResults([]); setLastBlueprint(null);
    try {
      let brandId = effectiveBrandId;
      if (!brandId) {
        addLog("Phase 1/4: Uploading brand guidelines and logo...");
        const brandRes = await uploadBrand(brandPdf!, brandLogo!); if (abortRef.current) return;
        brandId = brandRes.brand_id;
        addLog(`✅ Brand extracted via Gemini: ${brandRes.brand.brand_name}`);
      } else if (brandUploadResult?.brand_id === brandId) {
        addLog(`Phase 1/4: Brand recognized: ${brandUploadResult.brand.brand_name}`);
      } else if (urlBrandId) {
        addLog("Phase 1/4: Using manually created brand profile...");
      } else {
        addLog("Phase 1/4: Loading saved brand from library...");
      }
      if (productImage) {
        addLog("Phase 2/4: Stripping background from product image via Remove.bg...");
        await uploadProductImage(brandId, productImage); if (abortRef.current) return;
        addLog("✅ Product background removed & saved.");
      } else {
        addLog("Phase 2/4: Skipped (no product image).");
      }
      addLog(engine === "postergen"
        ? "Phase 3/4: Gemini brain is writing the Imagen poster prompt..."
        : `Phase 3/4: Gemini designing editable blueprint [adherence: ${adherenceLevel}]...`);
      addLog(engine === "postergen"
        ? "Phase 4/4: Imagen rendering all 3 formats + compositing logo/product..."
        : "Phase 4/4: Generating backgrounds and rendering all 3 formats...");
      const genRes = await generateAllFormats({ brand_id: brandId, prompt, adherence_level: adherenceLevel, product_image_available: !!productImage, engine });
      if (abortRef.current) return;
      setCampaignId(genRes.campaign_id); setCaptions(genRes.captions ?? null);
      const mapped: ExportResult[] = genRes.formats.map((f) => ({
        format_name: f.name, url: f.poster_url,
        width: f.aspect_ratio === "16:9" ? 1920 : 1080,
        height: f.aspect_ratio === "9:16" ? 1920 : f.aspect_ratio === "16:9" ? 1080 : 1080,
        aspect_ratio: f.aspect_ratio,
      }));
      setResults(mapped);
      addLog(`✅ Pipeline complete in ${genRes.total_generation_time_seconds.toFixed(1)}s`);
      setCurrentStep("RESULTS");
      try { sessionStorage.setItem("imprnt_results", JSON.stringify({ campaignId: genRes.campaign_id, results: mapped })); } catch { /* ignore */ }
    } catch (err: unknown) {
      if (!abortRef.current) { const message = err instanceof Error ? err.message : String(err); addLog("ERROR: " + message); setErrorMessage(message); }
    } finally { setIsProcessing(false); abortRef.current = false; }
  };

  const handleStartNew = () => {
    try { sessionStorage.removeItem("imprnt_results"); sessionStorage.removeItem("_resume_results"); } catch {}
    setResults([]); setLogs([]); setErrorMessage(null); setCampaignId(null); setCaptions(null); setLibraryBrandId(null);
    setCurrentStep("UPLOAD_BRAND");
    if (!isDemo) {
      setBrandPdf(null); setBrandLogo(null); setProductImage(null); setPrompt("");
      setDemoBrandId(null); setDemoBrand(null); setLastBlueprint(null);
      setBrandInputMode("upload"); setBrandUploadResult(null);
    }
  };

  const stepIndex = STEPS.indexOf(currentStep);
  const apiStatus = healthError ? "offline" : health ? "online" : "connecting";

  const lastLogLabel = (() => {
    const last = logs[logs.length - 1] ?? "";
    const m = last.match(/\] (.+)/);
    return m ? m[1] : "Working";
  })();

  if (isDemo && demoLoadError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState} style={{ margin: "2rem" }}>Demo load failed: {demoLoadError}</div>
      </div>
    );
  }

  const pageTitle = (isDemo || (isDemoUpload && !!demoBrandId))
    ? `${demoBrand?.brand_name ?? "Demo"} Demo`
    : "New Campaign";

  return (
    <div className={styles.container}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span className={styles.topBarTitle}>{pageTitle}</span>
        </Link>
        <div className={styles.apiBadge} data-status={apiStatus}>
          <span className={styles.apiBadgeDot} />
          API {healthError ? "Offline" : health ? "Online" : "…"}
        </div>
      </div>

      {/* ── Main scroll area ── */}
      <div className={styles.main}>
        {/* Step indicator */}
        <div className={styles.stepper}>
          {STEP_LABELS.map((label, idx) => {
            const isActive = stepIndex === idx;
            const isCompleted = stepIndex > idx;
            return (
              <div key={label} className={styles.stepWrapper}>
                <div className={`${styles.stepPill} ${isActive ? styles.stepPillActive : ""} ${isCompleted ? styles.stepPillCompleted : ""}`}>
                  {isCompleted ? <Check size={14} /> : idx + 1}
                </div>
                <span className={`${styles.stepLabel} ${isActive ? styles.stepLabelActive : ""}`}>{label}</span>
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
          >
            {/* ────────────────── STEP 1: UPLOAD BRAND ────────────────── */}
            {currentStep === "UPLOAD_BRAND" && isDemo && (
              <div className={styles.card}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Brand Identity</span>
                  <span className={styles.optionalTag}>Demo</span>
                </div>
                <p className={styles.sectionDesc}>This demo uses a pre-loaded brand profile — no PDF upload required.</p>
                {demoBrand ? (
                  <div className={styles.demoBrandCard}>
                    <div className={styles.demoBrandCardAccent} style={{ background: demoBrand.colors.primary }} />
                    <div className={styles.demoBrandCardInfo}>
                      <div className={styles.demoBrandCardName}>{demoBrand.brand_name}</div>
                      <div className={styles.demoBrandCardTagline}>{demoBrand.tagline}</div>
                      <div className={styles.demoBrandCardIndustry}>{demoBrand.industry}</div>
                    </div>
                    <span className={styles.demoReadyBadge}>Pre-loaded</span>
                  </div>
                ) : (
                  <p className={styles.sectionDesc}>Loading demo brand…</p>
                )}
                <button className={styles.btnNext} onClick={() => setCurrentStep("UPLOAD_PRODUCT")} disabled={!demoBrand}>
                  Next
                </button>
              </div>
            )}

            {currentStep === "UPLOAD_BRAND" && isDemoUpload && (
              <div className={styles.card}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Brand Identity</span>
                  <span className={styles.optionalTag}>Demo Upload</span>
                </div>
                <div className={styles.demoUploadHint}>
                  <Zap size={13} style={{ flexShrink: 0, color: "var(--color-primary)" }} />
                  Demo brand files are recognized instantly.
                </div>
                <UploadZone label="Brand Guidelines" pills={["PDF"]} file={brandPdf} accept=".pdf" inputRef={brandInputRef} onFile={setBrandPdf} hint="Click or drag to upload brand guideline" />
                <UploadZone label="Brand Logo" pills={["PNG", "SVG"]} file={brandLogo} accept="image/png, image/svg+xml" inputRef={logoInputRef} onFile={setBrandLogo} hint="Click or drag to upload brand logo" />
                {errorMessage && <p style={{ color: "#ef4444", fontSize: "0.875rem" }}>{errorMessage}</p>}
                <button className={styles.btnNext} onClick={handleBrandUploadNext} disabled={!brandPdf || !brandLogo || isBrandUploading}>
                  {isBrandUploading ? <><Loader2 className={styles.spinIcon} size={16} /> Reading brand…</> : "Next"}
                </button>
              </div>
            )}

            {currentStep === "UPLOAD_BRAND" && !isDemo && !isDemoUpload && (
              <>
                {/* Tab switcher */}
                <div className={styles.tabs}>
                  <button className={`${styles.tab} ${brandInputMode === "upload" ? styles.tabActive : ""}`} onClick={() => setBrandInputMode("upload")}>Upload PDF</button>
                  <button className={`${styles.tab} ${brandInputMode === "manual" ? styles.tabActive : ""}`} onClick={() => setBrandInputMode("manual")}>Build Manually</button>
                  <button className={`${styles.tab} ${brandInputMode === "library" ? styles.tabActive : ""}`} onClick={() => setBrandInputMode("library")}>My Brands</button>
                </div>

                {brandInputMode === "upload" && (
                  <div className={styles.card}>
                    <UploadZone label="Brand Guideline" pills={["PDF"]} file={brandPdf} accept=".pdf" inputRef={brandInputRef} onFile={setBrandPdf} hint="Click or drag to upload brand guideline" />
                    <UploadZone label="Brand Logo" pills={["PNG", "SVG"]} file={brandLogo} accept="image/png, image/svg+xml" inputRef={logoInputRef} onFile={setBrandLogo} hint="Click or drag to upload brand logo" />
                    <button className={styles.btnNext} onClick={handleNext} disabled={!brandPdf || !brandLogo}>
                      Next
                    </button>
                  </div>
                )}

                {brandInputMode === "manual" && (
                  <div className={styles.card}>
                    <div className={styles.manualPanel}>
                      <Zap size={36} color="var(--color-primary)" />
                      <p className={styles.manualPanelText}>No PDF? No problem. Define your brand identity step by step.</p>
                      <Link href="/create/manual" className={styles.btnNext} style={{ marginTop: 8 }}>
                        Open Manual Setup <ChevronRight size={16} />
                      </Link>
                    </div>
                  </div>
                )}

                {brandInputMode === "library" && (
                  <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
                    <BrandLibrary
                      onSelect={(id) => {
                        setLibraryBrandId(id);
                        setCurrentStep("UPLOAD_PRODUCT");
                      }}
                    />
                  </div>
                )}
              </>
            )}

            {/* ────────────────── STEP 2: UPLOAD PRODUCT ────────────────── */}
            {currentStep === "UPLOAD_PRODUCT" && isDemo && (
              <div className={styles.card}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Product Focus</span>
                  <span className={styles.optionalTag}>Demo</span>
                </div>
                <p className={styles.sectionDesc}>This demo uses a pre-loaded product image — background already removed.</p>
                <div className={styles.demoBrandCard}>
                  <div className={styles.demoBrandCardAccent} style={{ background: demoBrand?.colors.primary ?? "var(--color-primary)" }} />
                  <div className={styles.demoBrandCardInfo}>
                    <div className={styles.demoBrandCardName}>Product image ready</div>
                    <div className={styles.demoBrandCardTagline}>Pre-loaded for {demoBrand?.brand_name ?? "this demo brand"}</div>
                  </div>
                  <span className={styles.demoReadyBadge}>Pre-loaded</span>
                </div>
                <div className={styles.actions}>
                  <button className={styles.btnSecondary} onClick={() => setCurrentStep("UPLOAD_BRAND")}>Back</button>
                  <button className={styles.btnNext} style={{ flex: 1 }} onClick={() => setCurrentStep("PROMPT")}>Next</button>
                </div>
              </div>
            )}

            {currentStep === "UPLOAD_PRODUCT" && isDemoUpload && !!demoBrandId && (
              <div className={styles.card}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Product Focus</span>
                  <span className={styles.optionalTag}>Demo</span>
                </div>
                <p className={styles.sectionDesc}>Brand recognized — product image is pre-loaded and your prompt is pre-filled.</p>
                <div className={styles.demoBrandCard}>
                  <div className={styles.demoBrandCardAccent} style={{ background: demoBrand?.colors.primary ?? "var(--color-primary)" }} />
                  <div className={styles.demoBrandCardInfo}>
                    <div className={styles.demoBrandCardName}>✓ {demoBrand?.brand_name} detected</div>
                    <div className={styles.demoBrandCardTagline}>{demoBrand?.tagline}</div>
                    <div className={styles.demoBrandCardIndustry}>{demoBrand?.industry}</div>
                  </div>
                  <span className={styles.demoReadyBadge}>Pre-loaded</span>
                </div>
                <div className={styles.actions}>
                  <button className={styles.btnSecondary} onClick={() => { setBrandUploadResult(null); setDemoBrandId(null); setDemoBrand(null); setPrompt(""); setCurrentStep("UPLOAD_BRAND"); }}>Back</button>
                  <button className={styles.btnNext} style={{ flex: 1 }} onClick={() => setCurrentStep("PROMPT")}>Next</button>
                </div>
              </div>
            )}

            {currentStep === "UPLOAD_PRODUCT" && (isDemoUpload ? !demoBrandId : !isDemo) && (
              <div className={styles.card}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Brand Guideline</span>
                  <span className={styles.optionalTag}>Optional</span>
                </div>
                <p className={styles.sectionDesc}>Upload an image of the product. Our AI will automatically remove the background.</p>
                <UploadZone label="Product Image" file={productImage} accept="image/*" inputRef={productInputRef} onFile={setProductImage} hint="Click or drag to upload product image" />
                <div className={styles.actions}>
                  <button className={styles.btnSecondary} onClick={() => setCurrentStep("UPLOAD_BRAND")}>Back</button>
                  <button className={styles.btnNext} style={{ flex: 1 }} onClick={handleNext}>Next</button>
                </div>
              </div>
            )}

            {/* ────────────────── STEP 3: PROMPT ────────────────── */}
            {currentStep === "PROMPT" && (
              <div className={styles.cardStack}>
                {/* Campaign Prompt */}
                <div className={styles.card}>
                  <div>
                    <div className={styles.sectionTitle}>Campaign Prompt</div>
                    <p className={styles.sectionDesc} style={{ marginTop: 4 }}>Describe the campaign goals, vibe, and any specific requirements.</p>
                  </div>
                  <textarea
                    className={styles.textarea}
                    placeholder="Describe an Eid Special Edition Launch..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </div>

                {/* Poster Engine */}
                <div className={styles.card}>
                  <div>
                    <div className={styles.sectionTitle}>Poster Engine</div>
                    <p className={styles.sectionDesc} style={{ marginTop: 4 }}>
                      How should the poster be rendered? AI poster is the final output with more better quality but no independence in post image edit whereas editable layers ensures manual edits on typography and elements placement.
                    </p>
                  </div>
                  <div className={styles.toggleGroup} style={{ marginTop: 8 }}>
                    {(["postergen", "blueprint"] as const).map((eng) => (
                      <button
                        key={eng}
                        className={`${styles.toggleBtn} ${engine === eng ? styles.toggleBtnActive : ""}`}
                        onClick={() => setEngine(eng)}
                        style={{ position: "relative" }}
                      >
                        {eng === "postergen" && <span className={styles.recommendedBadge}>recommended</span>}
                        {eng === "postergen" ? "AI Posters" : "Editable Layers"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Creative Adherence */}
                <div className={styles.card}>
                  <div>
                    <div className={styles.sectionTitle}>Creative Adherence</div>
                    <p className={styles.sectionDesc} style={{ marginTop: 4 }}>How closely should the AI follow your brand guidelines?</p>
                  </div>
                  <div className={styles.toggleGroup}>
                    {(["creative", "moderate", "strict"] as const).map((level) => (
                      <button
                        key={level}
                        className={`${styles.toggleBtn} ${adherenceLevel === level ? styles.toggleBtnActive : ""}`}
                        onClick={() => setAdherenceLevel(level)}
                      >
                        {level === "creative" ? "Creative" : level === "moderate" ? "Balanced" : "Strict"}
                      </button>
                    ))}
                  </div>
                  <p className={styles.toggleHint}>
                    {adherenceLevel === "creative"
                      ? "AI takes liberties — unexpected layouts, bold copy, colour play."
                      : adherenceLevel === "moderate"
                      ? "Respects brand guidelines but allows creative interpretation."
                      : "Pixel-perfect brand adherence — exact colors, fonts, and tone."}
                  </p>
                  <button className={styles.btnNext} onClick={handleNext} disabled={!prompt.trim()} style={{ marginTop: 4 }}>
                    {isDemo ? <><Zap size={16} /> Generate Demo</> : <><Play size={16} /> Generate Campaign</>}
                  </button>
                </div>
              </div>
            )}

            {/* ────────────────── STEP 4: GENERATING ────────────────── */}
            {currentStep === "GENERATING" && (
              <div className={styles.card}>
                <div>
                  <div className={styles.sectionTitle}>Processing Pipeline</div>
                  <p className={styles.sectionDesc} style={{ marginTop: 4 }}>It will take some time as we are working on your campaign</p>
                </div>
                <div className={styles.terminal} style={{ minHeight: 100 }}>
                  {logs.map((log, i) => (
                    <div key={i} className={styles.logLine}>{log}</div>
                  ))}
                  {isProcessing && heartbeatSecs >= 3 && (
                    <div className={`${styles.logLine} ${styles.logLineWarning}`}>⏳ {lastLogLabel}... {heartbeatSecs}s</div>
                  )}
                  {isProcessing && heartbeatSecs < 3 && (
                    <div className={styles.logLine}><span className={styles.cursor} /></div>
                  )}
                  <div ref={logsEndRef} />
                </div>
                {isProcessing && (
                  <button className={styles.btnSecondary} onClick={() => { abortRef.current = true; setIsProcessing(false); addLog("⚠ Generation cancelled."); }}>
                    Cancel
                  </button>
                )}
                {errorMessage && (
                  <div className={styles.errorState}>
                    <p style={{ marginBottom: 12 }}>{errorMessage}</p>
                    <button className={styles.btnSecondary} onClick={handleStartNew}>Start Over</button>
                  </div>
                )}
              </div>
            )}

            {/* ────────────────── STEP 5: RESULTS ────────────────── */}
            {currentStep === "RESULTS" && (
              <div className={styles.card} style={{ maxWidth: 760 }}>
                <div className={styles.sectionHeader}>
                  <Check size={22} color="var(--color-primary)" />
                  <span className={styles.sectionTitle} style={{ color: "var(--color-primary)" }}>Campaign Generated!</span>
                </div>
                <p className={styles.sectionDesc}>
                  {engine === "postergen"
                    ? "Gemini's brain wrote the prompt. Imagen rendered each format. Your real logo and product were composited on top."
                    : "Gemini designed the blueprint. Imagen generated the background. Playwright rendered Bangla + English typography perfectly."}
                </p>

                <div className={styles.resultsGrid}>
                  {results.map((res, i) => (
                    <div key={i} className={styles.resultCard}>
                      <div className={`${styles.resultImageWrapper} ${
                        res.aspect_ratio === "9:16" ? styles.resultImageWrapper9x16
                        : res.aspect_ratio === "16:9" ? styles.resultImageWrapper16x9
                        : styles.resultImageWrapper1x1
                      }`}>
                        <Image src={res.url} alt={res.format_name} fill className={styles.resultImage} unoptimized />
                      </div>
                      <div className={styles.resultFooter}>
                        <span className={styles.resultFormat}>{res.format_name}</span>
                        <div className={styles.resultActions}>
                          {campaignId && (
                            <Link
                              href={`/campaign/${campaignId}/editor?ar=${res.aspect_ratio ?? (res.width === res.height ? "1:1" : res.height > res.width ? "9:16" : "16:9")}&url=${encodeURIComponent(res.url)}`}
                              className={styles.editBtn}
                            >
                              <Pencil size={14} />
                            </Link>
                          )}
                          <a href={res.url} target="_blank" rel="noreferrer" className={styles.downloadBtn}>
                            <Download size={16} />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                  {results.length === 0 && <div className={styles.errorState}>Pipeline failed. Check logs above.</div>}
                </div>

                {captions && <CaptionPanel captions={captions} />}

                {lastBlueprint && (
                  <details className={styles.blueprintCard}>
                    <summary className={styles.blueprintSummary}>🧠 AI Blueprint — {lastBlueprint.campaign_name}</summary>
                    <div className={styles.blueprintBody}>
                      <p className={styles.blueprintStrategy}>{lastBlueprint.campaign_strategy}</p>
                      {lastBlueprint.background?.prompt && (
                        <div className={styles.blueprintSection}>
                          <span className={styles.blueprintLabel}>Flux Background Prompt</span>
                          <p className={styles.blueprintValue}>{lastBlueprint.background.prompt}</p>
                        </div>
                      )}
                      <div className={styles.blueprintSection}>
                        <span className={styles.blueprintLabel}>Design Elements ({lastBlueprint.layers?.length ?? 0} layers)</span>
                        <ul className={styles.blueprintLayers}>
                          {lastBlueprint.layers?.map((layer) => (
                            <li key={layer.id} className={styles.blueprintLayer}>
                              <span className={styles.layerType}>{layer.type}</span>
                              {layer.content && <span className={styles.layerContent}>{layer.content}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                )}

                <div className={styles.actions} style={{ marginTop: 24 }}>
                  {campaignId && (
                    <>
                      <Link href={`/campaign/${campaignId}`} className={styles.btnSecondary} onClick={() => { try { sessionStorage.setItem("_resume_results", "1"); } catch {} }}>
                        View Details
                      </Link>
                      <Link href={`/campaign/${campaignId}#video`} className={styles.btnSecondary} onClick={() => { try { sessionStorage.setItem("_resume_results", "1"); } catch {} }}>
                        <Play size={14} /> Generate Video
                      </Link>
                    </>
                  )}
                  <button className={styles.btnNext} style={{ flex: 1 }} onClick={handleStartNew}>
                    {(isDemo || isDemoUpload) ? "Try Again" : "Start New Campaign"}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom-left back button ── */}
      <button className={styles.backBtn} onClick={() => window.history.back()} aria-label="Go back">
        <RotateCcw size={18} />
      </button>
    </div>
  );
}

export default function CreateCampaign() {
  return (
    <Suspense fallback={<div style={{ color: "var(--color-text-muted)", padding: "2rem" }}>Loading…</div>}>
      <CreateCampaignInner />
    </Suspense>
  );
}
