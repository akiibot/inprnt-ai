"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { UploadCloud, Check, ChevronRight, Loader2, Play, Download, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./create.module.css";
import {
  uploadBrand, uploadProductImage, planCampaign,
  generateCampaign, exportCampaignFormats,
  loadDemoBrand, runDemoGenerate,
} from "@/lib/api";
import type { AdherenceLevel, Blueprint, ExportResult } from "@/lib/types";

type Step = "UPLOAD_BRAND" | "UPLOAD_PRODUCT" | "PROMPT" | "GENERATING" | "RESULTS";

function CreateCampaignInner() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const [currentStep, setCurrentStep] = useState<Step>("UPLOAD_BRAND");
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [demoBrandId, setDemoBrandId] = useState<string | null>(null);
  const [demoLoadError, setDemoLoadError] = useState<string | null>(null);

  // Files
  const [brandPdf, setBrandPdf] = useState<File | null>(null);
  const [brandLogo, setBrandLogo] = useState<File | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [adherenceLevel, setAdherenceLevel] = useState<AdherenceLevel>("moderate");
  const [results, setResults] = useState<ExportResult[]>([]);
  const [lastBlueprint, setLastBlueprint] = useState<Blueprint | null>(null);

  // Heartbeat
  const [heartbeatSecs, setHeartbeatSecs] = useState(0);
  const lastLogTimeRef = useRef<number>(Date.now());

  const brandInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Reset heartbeat timer whenever a new log line arrives
  useEffect(() => {
    if (logs.length > 0) {
      lastLogTimeRef.current = Date.now();
      setHeartbeatSecs(0);
    }
  }, [logs]);

  // Tick heartbeat every second while pipeline is running
  useEffect(() => {
    if (!isProcessing) { setHeartbeatSecs(0); return; }
    const timer = setInterval(() => {
      setHeartbeatSecs(Math.floor((Date.now() - lastLogTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isProcessing]);

  // Demo mode: load brand on mount and skip to PROMPT step
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

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const handleNext = () => {
    if (currentStep === "UPLOAD_BRAND") setCurrentStep("UPLOAD_PRODUCT");
    else if (currentStep === "UPLOAD_PRODUCT") setCurrentStep("PROMPT");
    else if (currentStep === "PROMPT") isDemo && demoBrandId ? handleDemoGenerate() : handleGenerate();
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
    if (!brandPdf || !brandLogo || !prompt.trim()) return;
    setCurrentStep("GENERATING");
    setIsProcessing(true);
    setLogs([]);
    setResults([]);
    setLastBlueprint(null);

    try {
      addLog("Phase 1/5: Uploading brand guidelines and logo...");
      const brandRes = await uploadBrand(brandPdf, brandLogo);
      const brandId = brandRes.brand_id;
      addLog(`✅ Brand extracted via Gemini: ${brandRes.brand.brand_name}`);

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

  const steps = ["UPLOAD_BRAND", "UPLOAD_PRODUCT", "PROMPT", "GENERATING", "RESULTS"];
  const stepIndex = steps.indexOf(currentStep);

  // Last log line label for heartbeat display
  const lastLogLabel = (() => {
    const last = logs[logs.length - 1] ?? "";
    const m = last.match(/\] (.+)/);
    return m ? m[1] : "Working";
  })();

  if (isDemo && demoLoadError) {
    return (
      <div className={styles.container}>
        <p style={{ color: "red", padding: "2rem" }}>Demo load failed: {demoLoadError}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{isDemo ? "Volt BD Demo" : "New Campaign"}</h1>
        <p className={styles.subtitle}>
          {isDemo
            ? "Pre-loaded Volt BD Eid campaign — no upload needed."
            : "AI-powered creative direction and execution."}
        </p>
      </header>

      {/* Stepper */}
      <div className={styles.stepper}>
        {[1, 2, 3, 4, 5].map((step, idx) => (
          <div
            key={step}
            className={`${styles.step} ${stepIndex === idx ? styles.stepActive : ""} ${stepIndex > idx ? styles.stepCompleted : ""}`}
          >
            {stepIndex > idx ? <Check size={20} /> : step}
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
          {/* STEP 1 — Upload Brand */}
          {currentStep === "UPLOAD_BRAND" && (
            <div>
              <h2 className={styles.cardTitle}>1. Brand Identity</h2>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Brand Guidelines (PDF)</label>
                <div className={styles.uploadZone} onClick={() => brandInputRef.current?.click()}>
                  <UploadCloud className={styles.uploadIcon} />
                  <p>{brandPdf ? brandPdf.name : "Click to upload brand_guidelines.pdf"}</p>
                </div>
                <input type="file" ref={brandInputRef} className={styles.fileInput} accept=".pdf"
                  onChange={(e) => setBrandPdf(e.target.files?.[0] || null)} />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Brand Logo (PNG/SVG)</label>
                <div className={styles.uploadZone} onClick={() => logoInputRef.current?.click()}>
                  <UploadCloud className={styles.uploadIcon} />
                  <p>{brandLogo ? brandLogo.name : "Click to upload transparent logo"}</p>
                </div>
                <input type="file" ref={logoInputRef} className={styles.fileInput} accept="image/png, image/svg+xml"
                  onChange={(e) => setBrandLogo(e.target.files?.[0] || null)} />
              </div>
              <div className={styles.actions}>
                <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleNext}
                  disabled={!brandPdf || !brandLogo}>
                  Next Step <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — Upload Product */}
          {currentStep === "UPLOAD_PRODUCT" && (
            <div>
              <h2 className={styles.cardTitle}>2. Product Focus (Optional)</h2>
              <p style={{ color: "var(--color-grey-400)", marginBottom: "var(--space-6)" }}>
                Upload an image of the product. Our AI will automatically remove the background.
              </p>
              <div className={styles.inputGroup}>
                <div className={styles.uploadZone} onClick={() => productInputRef.current?.click()}>
                  <UploadCloud className={styles.uploadIcon} />
                  <p>{productImage ? productImage.name : "Click to upload product image"}</p>
                </div>
                <input type="file" ref={productInputRef} className={styles.fileInput} accept="image/*"
                  onChange={(e) => setProductImage(e.target.files?.[0] || null)} />
              </div>
              <div className={styles.actions}>
                <button className={styles.button} onClick={() => setCurrentStep("UPLOAD_BRAND")}>Back</button>
                <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleNext}>
                  Next Step <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Prompt + Adherence */}
          {currentStep === "PROMPT" && (
            <div>
              <h2 className={styles.cardTitle}>3. Campaign Prompt</h2>
              <p style={{ color: "var(--color-grey-400)", marginBottom: "var(--space-4)" }}>
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

              {/* Adherence slider */}
              <div className={styles.inputGroup}>
                <label className={styles.label}>Creative Adherence</label>
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
                <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleNext}
                  disabled={!prompt.trim()}>
                  {isDemo ? <Zap size={18} /> : <Play size={18} />}
                  {isDemo ? "Generate Demo" : "Generate Campaign"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 — Generating */}
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
                {/* Heartbeat: shows elapsed seconds if no new log for >3s */}
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

          {/* STEP 5 — Results */}
          {currentStep === "RESULTS" && (
            <div>
              <h2 className={styles.cardTitle} style={{ color: "var(--color-primary)" }}>
                <Check size={28} /> Campaign Generated!
              </h2>
              <p style={{ color: "var(--color-grey-400)", marginBottom: "var(--space-6)" }}>
                Gemini designed the blueprint. Flux generated the background. Playwright rendered Bangla + English typography perfectly.
              </p>

              <div className={styles.resultsGrid}>
                {results.map((res, i) => (
                  <div key={i} className={styles.resultCard}>
                    <div className={`${styles.resultImageWrapper} ${
                      res.aspect_ratio === "9:16" ? styles.resultImageWrapper9x16 :
                      res.aspect_ratio === "16:9" ? styles.resultImageWrapper16x9 :
                      styles.resultImageWrapper1x1
                    }`}>
                      <Image src={res.url} alt={res.format_name} fill className={styles.resultImage} unoptimized />
                    </div>
                    <div className={styles.resultFooter}>
                      <span className={styles.resultFormat}>{res.format_name}</span>
                      <a href={res.url} target="_blank" rel="noreferrer"
                        className={styles.button} style={{ padding: "var(--space-2)" }}>
                        <Download size={16} />
                      </a>
                    </div>
                  </div>
                ))}
                {results.length === 0 && (
                  <div style={{ color: "red" }}>Pipeline failed. Check logs above.</div>
                )}
              </div>

              {/* Blueprint insight card */}
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
                <button className={styles.button} onClick={() => {
                  setCurrentStep("UPLOAD_BRAND");
                  setBrandPdf(null); setBrandLogo(null); setProductImage(null);
                  setPrompt(""); setDemoBrandId(null); setLastBlueprint(null);
                }}>
                  Start New Campaign
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
